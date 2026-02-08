/**
 * Agent Ensemble Type Definitions
 *
 * Six reasoning perspectives that deliberate internally to produce
 * balanced, evidence-based recommendations. The user sees a single
 * copilot voice; the ensemble operates as internal reasoning modes.
 */

import { z } from 'zod';

// ─── Persona Identifiers ───────────────────────────────────────

export const PersonaId = z.enum([
  'operator',
  'analyst',
  'sceptic',
  'advocate',
  'historian',
  'synthesiser',
]);
export type PersonaId = z.infer<typeof PersonaId>;

// ─── Conversation Modes ────────────────────────────────────────

export const ConversationMode = z.enum([
  'quick_query',
  'analysis',
  'decision',
  'action',
  'pre_mortem',
  'retrospective',
]);
export type ConversationMode = z.infer<typeof ConversationMode>;

// ─── Persona Contribution ──────────────────────────────────────

export const ContributionSchema = z.object({
  personaId: PersonaId,
  perspective: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  dissents: z.boolean().default(false),
  dissentReason: z.string().optional(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

// ─── Ensemble Deliberation ─────────────────────────────────────

export const DeliberationSchema = z.object({
  mode: ConversationMode,
  trigger: z.string(),
  contributions: z.array(ContributionSchema),
  consensusReached: z.boolean(),
  conflicts: z.array(
    z.object({
      between: z.tuple([PersonaId, PersonaId]),
      topic: z.string(),
      resolution: z.string().optional(),
    })
  ),
  synthesisedRecommendation: z.string().optional(),
  durationMs: z.number(),
});
export type Deliberation = z.infer<typeof DeliberationSchema>;

// ─── Sceptic Challenge ─────────────────────────────────────────

export const ChallengeSchema = z.object({
  trigger: z.enum([
    'timeline_confidence',
    'risk_underestimate',
    'scope_creep',
    'decision_commit',
    'stale_blocker',
    'user_invoked',
  ]),
  claim: z.string(),
  counterEvidence: z.array(
    z.object({
      point: z.string(),
      source: z.string(),
      strength: z.enum(['strong', 'moderate', 'suggestive']),
    })
  ),
  question: z.string(),
  alternativeFraming: z.string().optional(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

// ─── Persona Configuration ─────────────────────────────────────

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  role: string;
  mandate: string;
  voice: string;
  activationModes: ConversationMode[];
  systemPromptFragment: string;
}

// ─── Ensemble Configuration ────────────────────────────────────

export interface EnsembleConfig {
  personas: PersonaConfig[];
  defaultMode: ConversationMode;
  scepticThresholds: ScepticThresholds;
  maxDeliberationMs: number;
  requireSynthesisForModes: ConversationMode[];
}

export interface ScepticThresholds {
  /** Activate when user expresses confidence but velocity gap exceeds this % */
  velocityGapPercent: number;
  /** Activate when a risk is rated below historical severity */
  riskUnderestimateThreshold: number;
  /** Activate when scope added without timeline adjustment (count) */
  scopeCreepTicketCount: number;
  /** Activate when a blocker has been unreviewed for this many days */
  staleBlockerDays: number;
  /** Cooldown between consecutive challenges (ms) */
  challengeCooldownMs: number;
}

// ─── Mode → Persona Routing ────────────────────────────────────

/**
 * Defines which personas participate in each conversation mode.
 * The Synthesiser always participates in multi-persona modes.
 */
export const MODE_PERSONA_MAP: Record<ConversationMode, PersonaId[]> = {
  quick_query: ['operator'],
  analysis: ['analyst', 'historian'],
  decision: ['analyst', 'sceptic', 'advocate', 'historian', 'synthesiser'],
  action: ['operator', 'advocate'],
  pre_mortem: ['sceptic', 'analyst', 'historian', 'synthesiser'],
  retrospective: ['analyst', 'historian', 'synthesiser'],
};

// ─── Copilot Response ──────────────────────────────────────────

export const CopilotResponseSchema = z.object({
  message: z.string(),
  mode: ConversationMode,
  deliberation: DeliberationSchema.optional(),
  challenge: ChallengeSchema.optional(),
  /** Whether persona attributions are shown in the response */
  showAttribution: z.boolean().default(false),
  /** Inline actions the user can take (approve, edit, cancel, etc.) */
  actions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum([
          'approve',
          'edit',
          'cancel',
          'choose_option',
          'discuss_further',
        ]),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .default([]),
  /** Sources cited in the response */
  sources: z
    .array(
      z.object({
        type: z.enum([
          'jira_ticket',
          'email',
          'artefact',
          'memory',
          'trend_data',
        ]),
        reference: z.string(),
        label: z.string(),
      })
    )
    .default([]),
});
export type CopilotResponse = z.infer<typeof CopilotResponseSchema>;
