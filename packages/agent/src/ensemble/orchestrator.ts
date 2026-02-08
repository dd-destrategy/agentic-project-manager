/**
 * Ensemble Orchestrator
 *
 * Coordinates the six reasoning personas through the deliberation
 * protocol: GATHER → SURFACE → IDENTIFY → WEIGHT → SYNTHESISE →
 * PRESENT → DEFER.
 *
 * The user sees a single copilot voice. This orchestrator runs
 * internally, producing a CopilotResponse that merges all
 * perspectives into coherent output.
 */

import { classifyMode, shouldActivateSceptic } from './mode-classifier.js';
import { ALL_PERSONAS, PERSONA_MAP } from './personas.js';
import type {
  ConversationMode,
  PersonaId,
  Contribution,
  Deliberation,
  Challenge,
  CopilotResponse,
  EnsembleConfig,
  ScepticThresholds,
} from './types.js';
import { MODE_PERSONA_MAP } from './types.js';

// ─── LLM Interface (injected dependency) ───────────────────────

export interface LlmCall {
  /**
   * Call the LLM with a system prompt and user message.
   * Returns the assistant's text response.
   */
  complete(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; model?: 'haiku' | 'sonnet' }
  ): Promise<string>;
}

// ─── Tool Interface (injected dependency) ──────────────────────

export interface ToolResult {
  toolName: string;
  result: unknown;
  error?: string;
}

export interface ToolExecutor {
  /**
   * Execute an MCP tool and return the result.
   */
  execute(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult>;

  /**
   * List available tools for the current context.
   */
  listAvailable(): string[];
}

// ─── Memory Interface (injected dependency) ────────────────────

export interface MemoryStore {
  /**
   * Retrieve relevant long-term memories for a query.
   */
  retrieveRelevant(query: string, limit?: number): Promise<MemoryRecord[]>;

  /**
   * Get the summary of the most recent session.
   */
  getLastSessionSummary(): Promise<string | null>;

  /**
   * Store a new event in short-term memory.
   */
  recordEvent(event: string, metadata?: Record<string, unknown>): Promise<void>;
}

export interface MemoryRecord {
  content: string;
  type: 'semantic' | 'episodic' | 'summary' | 'preference';
  relevanceScore: number;
  createdAt: string;
}

// ─── Session State ─────────────────────────────────────────────

export interface SessionState {
  sessionId: string;
  projectId?: string;
  turns: ConversationTurn[];
  lastChallengeMs?: number;
  pendingDraft?: PendingDraft;
  activeMode?: ConversationMode;
}

export interface ConversationTurn {
  role: 'user' | 'copilot';
  content: string;
  mode?: ConversationMode;
  timestamp: number;
}

export interface PendingDraft {
  type: 'email' | 'jira_comment' | 'jira_transition' | 'artefact_update';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  holdUntil: number;
}

// ─── Default Configuration ─────────────────────────────────────

const DEFAULT_SCEPTIC_THRESHOLDS: ScepticThresholds = {
  velocityGapPercent: 20,
  riskUnderestimateThreshold: 0.3,
  scopeCreepTicketCount: 3,
  staleBlockerDays: 3,
  challengeCooldownMs: 10 * 60 * 1000, // 10 minutes between challenges
};

const DEFAULT_CONFIG: EnsembleConfig = {
  personas: ALL_PERSONAS,
  defaultMode: 'quick_query',
  scepticThresholds: DEFAULT_SCEPTIC_THRESHOLDS,
  maxDeliberationMs: 30_000,
  requireSynthesisForModes: ['decision', 'pre_mortem', 'retrospective'],
};

// ─── Orchestrator ──────────────────────────────────────────────

export class EnsembleOrchestrator {
  private readonly config: EnsembleConfig;
  private readonly llm: LlmCall;
  private readonly tools: ToolExecutor;
  private readonly memory: MemoryStore;
  private session: SessionState;

  constructor(deps: {
    llm: LlmCall;
    tools: ToolExecutor;
    memory: MemoryStore;
    session: SessionState;
    config?: Partial<EnsembleConfig>;
  }) {
    this.llm = deps.llm;
    this.tools = deps.tools;
    this.memory = deps.memory;
    this.session = deps.session;
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
  }

  /**
   * Process a user message through the ensemble and produce a response.
   * This is the main entry point for the copilot.
   */
  async processMessage(
    userMessage: string,
    context?: { isBackground?: boolean }
  ): Promise<CopilotResponse> {
    const startMs = Date.now();

    // 1. CLASSIFY — determine conversation mode
    const classification = classifyMode({
      userMessage,
      isBackground: context?.isBackground ?? false,
      pendingEscalations: 0, // TODO: wire to real data
      hasPendingDraft: !!this.session.pendingDraft,
      recentTurns: this.session.turns.length,
    });

    const mode = classification.mode;

    // 2. GATHER — determine which personas participate
    const activePersonaIds = this.resolvePersonas(mode, userMessage);

    // 3. Retrieve relevant memory
    const memories = await this.memory.retrieveRelevant(userMessage, 5);
    const sessionSummary = await this.memory.getLastSessionSummary();

    // 4. Build context for LLM calls
    const memoryContext = this.formatMemoryContext(memories, sessionSummary);
    const conversationContext = this.formatConversationHistory();

    // 5. SURFACE — gather each persona's contribution

    if (activePersonaIds.length === 1 && activePersonaIds[0] === 'operator') {
      // Fast path: Operator-only, no deliberation needed
      const response = await this.runSinglePersona(
        'operator',
        userMessage,
        memoryContext,
        conversationContext
      );

      // Record turn even on fast path
      this.session.turns.push(
        { role: 'user', content: userMessage, timestamp: startMs },
        { role: 'copilot', content: response, mode, timestamp: Date.now() }
      );

      await this.memory.recordEvent(
        `User: ${userMessage.substring(0, 200)} | Mode: ${mode} | Personas: operator`
      );

      return {
        message: response,
        mode,
        showAttribution: false,
        actions: [],
        sources: [],
      };
    }

    // Multi-persona deliberation
    const contributions = await this.gatherContributions(
      activePersonaIds,
      userMessage,
      memoryContext,
      conversationContext
    );

    // 5a. Check if the Sceptic raised a challenge
    const scepticContribution = contributions.find(
      (c) => c.personaId === 'sceptic' && c.dissents
    );
    const challenge = scepticContribution
      ? await this.formulateChallenge(scepticContribution, userMessage)
      : undefined;
    if (scepticContribution) {
      this.session.lastChallengeMs = Date.now();
    }

    // 6. IDENTIFY conflicts between perspectives
    const conflicts = this.identifyConflicts(contributions);

    // 7. SYNTHESISE — if mode requires it, run the Synthesiser
    let synthesisedMessage: string;
    if (this.config.requireSynthesisForModes.includes(mode)) {
      synthesisedMessage = await this.synthesise(
        contributions,
        conflicts,
        userMessage,
        memoryContext,
        conversationContext
      );
    } else {
      // For non-synthesis modes, merge contributions directly
      synthesisedMessage = this.mergeContributions(contributions);
    }

    const durationMs = Date.now() - startMs;

    // 8. Build deliberation record (for transparency)
    const deliberation: Deliberation = {
      mode,
      trigger: userMessage,
      contributions,
      consensusReached: conflicts.length === 0,
      conflicts,
      synthesisedRecommendation: synthesisedMessage,
      durationMs,
    };

    // 9. Record turn
    this.session.turns.push(
      { role: 'user', content: userMessage, timestamp: startMs },
      {
        role: 'copilot',
        content: synthesisedMessage,
        mode,
        timestamp: Date.now(),
      }
    );

    // Record event in memory
    await this.memory.recordEvent(
      `User: ${userMessage.substring(0, 200)} | Mode: ${mode} | Personas: ${activePersonaIds.join(', ')}`
    );

    // 10. PRESENT
    const showAttribution =
      mode === 'decision' || mode === 'pre_mortem' || conflicts.length > 0;

    return {
      message: synthesisedMessage,
      mode,
      deliberation,
      challenge,
      showAttribution,
      actions: [],
      sources: [],
    };
  }

  // ─── Internal Methods ──────────────────────────────────────

  /**
   * Determine which personas participate, including potential
   * Sceptic activation outside its normal modes.
   */
  private resolvePersonas(
    mode: ConversationMode,
    userMessage: string
  ): PersonaId[] {
    const basePersonas = [...MODE_PERSONA_MAP[mode]];

    // Check if Sceptic should activate outside its normal modes
    const scepticTrigger = shouldActivateSceptic({
      userMessage,
      mode,
      lastChallengeMs: this.session.lastChallengeMs,
      challengeCooldownMs: this.config.scepticThresholds.challengeCooldownMs,
      // TODO: wire to real project data
      velocityGapPercent: undefined,
      stalestBlockerDays: undefined,
      scopeAddedWithoutTradeoff: undefined,
    });

    if (scepticTrigger && !basePersonas.includes('sceptic')) {
      basePersonas.push('sceptic');
      // If we're adding the Sceptic, we should also add the Synthesiser
      if (!basePersonas.includes('synthesiser')) {
        basePersonas.push('synthesiser');
      }
    }

    return basePersonas;
  }

  /**
   * Run a single persona (fast path for Operator-only queries).
   */
  private async runSinglePersona(
    personaId: PersonaId,
    userMessage: string,
    memoryContext: string,
    conversationContext: string
  ): Promise<string> {
    const persona = PERSONA_MAP[personaId];
    const systemPrompt = this.buildPersonaPrompt(
      persona.systemPromptFragment,
      memoryContext,
      conversationContext
    );

    return this.llm.complete(systemPrompt, userMessage, {
      model: 'haiku',
      maxTokens: 1024,
    });
  }

  /**
   * Gather contributions from all active personas in parallel.
   */
  private async gatherContributions(
    personaIds: PersonaId[],
    userMessage: string,
    memoryContext: string,
    conversationContext: string
  ): Promise<Contribution[]> {
    // Run non-synthesiser personas in parallel
    const nonSynthesisers = personaIds.filter((id) => id !== 'synthesiser');

    const contributionPromises = nonSynthesisers.map(async (personaId) => {
      const persona = PERSONA_MAP[personaId];
      const systemPrompt = this.buildPersonaPrompt(
        persona.systemPromptFragment,
        memoryContext,
        conversationContext
      );

      const model = personaId === 'sceptic' ? 'sonnet' : 'haiku';
      const response = await this.llm.complete(systemPrompt, userMessage, {
        model,
        maxTokens: 1500,
      });

      return this.parseContribution(personaId, response);
    });

    return Promise.all(contributionPromises);
  }

  /**
   * Run the Synthesiser with all other contributions as context.
   */
  private async synthesise(
    contributions: Contribution[],
    conflicts: Deliberation['conflicts'],
    userMessage: string,
    memoryContext: string,
    conversationContext: string
  ): Promise<string> {
    const synthesiser = PERSONA_MAP['synthesiser'];
    const contributionSummary = contributions
      .map((c) => {
        const persona = PERSONA_MAP[c.personaId];
        const dissentNote = c.dissents ? ` [DISSENTS: ${c.dissentReason}]` : '';
        return `**${persona.name}** (confidence: ${c.confidence}):${dissentNote}\n${c.perspective}`;
      })
      .join('\n\n');

    const conflictSummary =
      conflicts.length > 0
        ? '\n\nCONFLICTS:\n' +
          conflicts
            .map(
              (c) =>
                `- ${PERSONA_MAP[c.between[0]].name} vs ${PERSONA_MAP[c.between[1]].name}: ${c.topic}`
            )
            .join('\n')
        : '';

    const systemPrompt = this.buildPersonaPrompt(
      synthesiser.systemPromptFragment,
      memoryContext,
      conversationContext
    );

    const synthesisInput = `User asked: "${userMessage}"

PERSPECTIVES GATHERED:

${contributionSummary}${conflictSummary}

Synthesise these perspectives into a single, balanced recommendation.
Show attribution — reference which perspective contributed what.
Be decisive. The user needs a recommendation, not a summary of disagreements.`;

    return this.llm.complete(systemPrompt, synthesisInput, {
      model: 'sonnet',
      maxTokens: 2000,
    });
  }

  /**
   * Identify conflicts between persona contributions.
   */
  private identifyConflicts(
    contributions: Contribution[]
  ): Deliberation['conflicts'] {
    const conflicts: Deliberation['conflicts'] = [];

    for (let i = 0; i < contributions.length; i++) {
      for (let j = i + 1; j < contributions.length; j++) {
        const a = contributions[i];
        const b = contributions[j];

        // A dissenting persona conflicts with non-dissenting ones
        if (a.dissents && !b.dissents) {
          conflicts.push({
            between: [a.personaId, b.personaId],
            topic: a.dissentReason || 'Perspective disagreement',
          });
        } else if (b.dissents && !a.dissents) {
          conflicts.push({
            between: [b.personaId, a.personaId],
            topic: b.dissentReason || 'Perspective disagreement',
          });
        }

        // Large confidence gap on the same topic suggests disagreement
        if (Math.abs(a.confidence - b.confidence) > 0.4) {
          conflicts.push({
            between: [a.personaId, b.personaId],
            topic: `Confidence divergence (${a.confidence.toFixed(2)} vs ${b.confidence.toFixed(2)})`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Merge contributions for non-synthesis modes (analysis, action).
   */
  private mergeContributions(contributions: Contribution[]): string {
    if (contributions.length === 1) {
      return contributions[0].perspective;
    }

    return contributions.map((c) => c.perspective).join('\n\n');
  }

  /**
   * Build a full system prompt for a persona, including memory
   * and conversation context.
   */
  private buildPersonaPrompt(
    personaFragment: string,
    memoryContext: string,
    conversationContext: string
  ): string {
    return `You are PM Copilot, a personal project management assistant.

${personaFragment}

IMPORTANT BEHAVIOURAL RULES:
- Use British English spelling (organisation, colour, analyse, etc.)
- Be concise. Every word must earn its place.
- Use active voice: "Velocity declined 15%" not "There has been a decline in velocity"
- Never use first person for stakeholder-facing content
- When citing data, always include the specific number and its source
- Format responses with clear structure: headlines, bullet points, clear sections
- Do not add pleasantries or filler. Start with substance.

${memoryContext ? `MEMORY CONTEXT (relevant knowledge from past sessions):\n${memoryContext}\n` : ''}
${conversationContext ? `CONVERSATION SO FAR:\n${conversationContext}\n` : ''}`;
  }

  /**
   * Format memory records into a prompt-friendly context block.
   */
  private formatMemoryContext(
    memories: MemoryRecord[],
    sessionSummary: string | null
  ): string {
    const parts: string[] = [];

    if (sessionSummary) {
      parts.push(`Last session: ${sessionSummary}`);
    }

    if (memories.length > 0) {
      const memoryLines = memories
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .map((m) => `- [${m.type}] ${m.content}`)
        .join('\n');
      parts.push(`Relevant memories:\n${memoryLines}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Format recent conversation turns for context.
   */
  private formatConversationHistory(): string {
    const recentTurns = this.session.turns.slice(-10); // Last 10 turns
    if (recentTurns.length === 0) return '';

    return recentTurns
      .map(
        (t) =>
          `${t.role === 'user' ? 'User' : 'Copilot'}: ${t.content.substring(0, 500)}`
      )
      .join('\n');
  }

  /**
   * Parse an LLM response into a structured Contribution.
   */
  private parseContribution(
    personaId: PersonaId,
    response: string
  ): Contribution {
    // Detect dissent markers in the response
    const dissents =
      /however|but I (must|need to) (flag|raise|point out)|counter to|against this|risk(s)? (of|with|here)/i.test(
        response
      ) && personaId === 'sceptic';

    return {
      personaId,
      perspective: response,
      evidence: [], // TODO: extract citations from response
      confidence: this.estimateConfidence(response),
      dissents,
      dissentReason: dissents ? this.extractDissentReason(response) : undefined,
    };
  }

  /**
   * Estimate confidence from response language.
   * This is a heuristic — structured confidence scoring from
   * the existing codebase should replace this.
   */
  private estimateConfidence(response: string): number {
    const highConfidence =
      /clearly|strongly|data shows|evidence (supports|confirms)/i;
    const lowConfidence =
      /uncertain|insufficient data|unclear|might|possibly|speculative/i;

    if (highConfidence.test(response)) return 0.85;
    if (lowConfidence.test(response)) return 0.5;
    return 0.7;
  }

  /**
   * Extract a short dissent reason from the Sceptic's response.
   */
  private extractDissentReason(response: string): string {
    // Take the first sentence that contains a challenge marker
    const sentences = response.split(/[.!?]+/).filter(Boolean);
    const challengeSentence = sentences.find((s) =>
      /however|but|risk|concern|challenge|unlikely|gap|miss/i.test(s)
    );
    return (
      challengeSentence?.trim().substring(0, 200) || 'Perspective disagreement'
    );
  }

  /**
   * Formulate a structured challenge from the Sceptic's contribution.
   */
  private async formulateChallenge(
    scepticContribution: Contribution,
    userMessage: string
  ): Promise<Challenge> {
    return {
      trigger: 'user_invoked', // TODO: map from actual trigger
      claim: userMessage.substring(0, 200),
      counterEvidence: [
        {
          point: scepticContribution.perspective.substring(0, 300),
          source: 'sceptic_analysis',
          strength:
            scepticContribution.confidence > 0.7 ? 'strong' : 'moderate',
        },
      ],
      question:
        scepticContribution.dissentReason || 'Have you considered the risks?',
      alternativeFraming: undefined, // TODO: extract from response
    };
  }

  // ─── Session Management ────────────────────────────────────

  getSession(): SessionState {
    return this.session;
  }

  updateSession(updates: Partial<SessionState>): void {
    this.session = { ...this.session, ...updates };
  }
}
