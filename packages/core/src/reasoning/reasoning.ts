/**
 * Complex reasoning implementation
 *
 * Uses Claude Sonnet for signals flagged as requiring complex reasoning.
 * This includes:
 * - Risk assessment across multiple signals
 * - Communication drafting for stakeholders
 * - RAID log synthesis from conflicting information
 * - Strategic decision recommendations
 *
 * Sonnet is invoked only for needsReasoning=true signals (approximately 30% of signals).
 */

import { createSonnetClient, ClaudeClient } from '../llm/client.js';
import type { ToolDefinition, LlmResponse } from '../llm/types.js';
import type {
  ReasoningInput,
  ReasoningOutput,
  ProposedArtefactUpdate,
  ReasoningContext,
  SignalPattern,
} from './types.js';

/**
 * System prompt for complex reasoning
 *
 * Guides Sonnet through multi-source signal analysis and action recommendation.
 */
const REASONING_SYSTEM_PROMPT = `You are a senior project management analyst performing complex reasoning on signals that require deeper analysis than routine triage.

## Your Role

You receive signals that have been flagged as requiring complex reasoning because they:
- Involve conflicting information from multiple sources
- Require risk assessment or strategic thinking
- Need synthesis across RAID log items
- Involve stakeholder communication decisions
- Present novel patterns not seen before

## Analysis Framework

1. **Signal Synthesis**: Identify patterns, conflicts, and relationships between signals
2. **Context Integration**: Consider current artefact state and recent history
3. **Risk Assessment**: Evaluate potential impacts and their likelihood
4. **Action Recommendation**: Propose concrete, actionable steps

## Decision Principles

- **Conservative**: When uncertain, recommend escalation over autonomous action
- **Transparent**: Always explain your reasoning clearly
- **Evidence-based**: Ground recommendations in specific signal data
- **Holistic**: Consider downstream effects on all artefacts

## Output Quality

- Provide a clear, structured rationale
- Identify specific artefacts that should be updated
- Flag any concerns that warrant user attention
- Include confidence level based on evidence strength

## Language

Use British English spelling throughout (e.g., "prioritise" not "prioritize").
`;

/**
 * Tool definition for complex reasoning output
 */
const COMPLEX_REASONING_TOOL: ToolDefinition = {
  name: 'complex_reasoning_result',
  description: 'Output the result of complex multi-source reasoning analysis',
  input_schema: {
    type: 'object',
    properties: {
      recommended_action: {
        type: 'string',
        description: 'The primary recommended action',
        enum: [
          'update_artefact',
          'create_escalation',
          'draft_communication',
          'hold_for_review',
          'no_action',
        ],
      },
      rationale: {
        type: 'string',
        description: 'Detailed explanation of the reasoning process and conclusion',
      },
      should_escalate: {
        type: 'boolean',
        description: 'Whether this should be escalated to the user',
      },
      escalation_reason: {
        type: 'string',
        description: 'Why escalation is recommended (required if should_escalate is true)',
      },
      proposed_artefact_updates: {
        type: 'array',
        description: 'Proposed updates to artefacts',
        items: {
          type: 'object',
          properties: {
            artefact_type: {
              type: 'string',
              enum: ['delivery_state', 'raid_log', 'backlog_summary', 'decision_log'],
            },
            update_type: {
              type: 'string',
              enum: ['add_item', 'modify_item', 'update_status', 'add_note'],
            },
            changes: {
              type: 'object',
              description: 'The specific changes to make',
            },
            rationale: {
              type: 'string',
              description: 'Why this change is recommended',
            },
          },
          required: ['artefact_type', 'update_type', 'changes', 'rationale'],
        },
      },
      identified_patterns: {
        type: 'array',
        description: 'Patterns identified across signals',
        items: {
          type: 'object',
          properties: {
            pattern_type: {
              type: 'string',
              enum: ['escalating_risk', 'recurring_blocker', 'scope_drift', 'communication_gap', 'velocity_trend'],
            },
            description: {
              type: 'string',
            },
            signals_involved: {
              type: 'array',
              items: { type: 'string' },
            },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
          required: ['pattern_type', 'description', 'signals_involved', 'severity'],
        },
      },
      risk_assessment: {
        type: 'object',
        description: 'Overall risk assessment',
        properties: {
          level: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'negligible'],
          },
          factors: {
            type: 'array',
            items: { type: 'string' },
          },
          mitigation_options: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['level', 'factors'],
      },
      confidence: {
        type: 'number',
        description: 'Confidence in the recommendation (0.0-1.0)',
        minimum: 0,
        maximum: 1,
      },
      supporting_evidence: {
        type: 'array',
        description: 'Key evidence supporting the recommendation',
        items: { type: 'string' },
      },
    },
    required: [
      'recommended_action',
      'rationale',
      'should_escalate',
      'confidence',
      'supporting_evidence',
    ],
  },
};

/**
 * Tool output type for complex reasoning
 */
interface ComplexReasoningToolOutput {
  recommended_action: string;
  rationale: string;
  should_escalate: boolean;
  escalation_reason?: string;
  proposed_artefact_updates?: Array<{
    artefact_type: string;
    update_type: string;
    changes: Record<string, unknown>;
    rationale: string;
  }>;
  identified_patterns?: Array<{
    pattern_type: string;
    description: string;
    signals_involved: string[];
    severity: string;
  }>;
  risk_assessment?: {
    level: string;
    factors: string[];
    mitigation_options?: string[];
  };
  confidence: number;
  supporting_evidence: string[];
}

/**
 * Perform complex reasoning on signals using Claude Sonnet
 *
 * This function is invoked for signals that require deeper analysis than
 * Haiku can provide. It synthesises information from multiple sources,
 * identifies patterns, and recommends actions with detailed rationale.
 *
 * @param input - The reasoning input including signal, artefacts, and context
 * @returns Reasoning output with recommended actions and rationale
 */
export async function performReasoning(
  input: ReasoningInput
): Promise<ReasoningOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      recommendedAction: 'hold_for_review',
      rationale: 'Unable to perform complex reasoning: API key not configured',
      shouldEscalate: true,
      confidence: 0,
    };
  }

  const client = createSonnetClient(apiKey);
  return performReasoningWithClient(client, input);
}

/**
 * Perform complex reasoning with a provided client
 *
 * Allows injection of client for testing and Lambda reuse.
 *
 * @param client - The Claude client to use
 * @param input - The reasoning input
 * @returns Reasoning output
 */
export async function performReasoningWithClient(
  client: ClaudeClient,
  input: ReasoningInput
): Promise<ReasoningOutput> {
  const userMessage = buildReasoningPrompt(input);

  const response = await client.callWithTools<ComplexReasoningToolOutput>(
    REASONING_SYSTEM_PROMPT,
    userMessage,
    [COMPLEX_REASONING_TOOL],
    { forceTool: 'complex_reasoning_result', maxTokens: 4096 }
  );

  if (!response.success || !response.data) {
    return {
      recommendedAction: 'hold_for_review',
      rationale: `Reasoning failed: ${response.error ?? 'Unknown error'}`,
      shouldEscalate: true,
      confidence: 0,
    };
  }

  return mapToolOutputToReasoningOutput(response.data, response);
}

/**
 * Build the user message for reasoning
 */
function buildReasoningPrompt(input: ReasoningInput): string {
  const { signal, artefacts, recentSignals } = input;

  const sections: string[] = [];

  // Primary signal
  sections.push(`## Primary Signal Requiring Complex Reasoning

**Signal ID**: ${signal.id}
**Source**: ${signal.source}
**Type**: ${signal.type}
**Timestamp**: ${signal.timestamp}

**Summary**: ${signal.sanitisedSummary}

**Classification**:
- Importance: ${signal.classification.importance}
- Categories: ${signal.classification.categories.join(', ')}
- Reasoning Required: ${signal.classification.rationale}
`);

  // Current artefact state
  if (artefacts.length > 0) {
    sections.push(`## Current Artefact State

${artefacts.map((a) => `### ${formatArtefactType(a.type)} (v${a.version})
Last updated: ${a.updatedAt}

\`\`\`json
${JSON.stringify(a.content, null, 2).slice(0, 2000)}
\`\`\`
`).join('\n')}
`);
  }

  // Recent signals for context
  if (recentSignals.length > 0) {
    sections.push(`## Recent Related Signals (for pattern detection)

${recentSignals.slice(0, 10).map((s) => `- **${s.id}** (${s.source}, ${s.type}): ${s.sanitisedSummary.slice(0, 200)}`).join('\n')}
`);
  }

  // Analysis request
  sections.push(`## Analysis Request

Please analyse the primary signal in context of the current artefacts and recent signals. Identify:

1. **Patterns**: Are there recurring themes or escalating issues?
2. **Risks**: What could go wrong if this is not addressed?
3. **Dependencies**: Does this affect or depend on other items?
4. **Recommended Action**: What should the agent do?

Provide your analysis using the complex_reasoning_result tool.
`);

  return sections.join('\n');
}

/**
 * Format artefact type for display
 */
function formatArtefactType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Map tool output to ReasoningOutput
 */
function mapToolOutputToReasoningOutput(
  toolOutput: ComplexReasoningToolOutput,
  response: LlmResponse<ComplexReasoningToolOutput>
): ReasoningOutput {
  const proposedArtefactUpdates: ProposedArtefactUpdate[] | undefined =
    toolOutput.proposed_artefact_updates?.map((update) => ({
      artefactType: update.artefact_type,
      changes: update.changes,
      rationale: update.rationale,
    }));

  return {
    recommendedAction: toolOutput.recommended_action,
    rationale: toolOutput.rationale,
    shouldEscalate: toolOutput.should_escalate,
    escalationReason: toolOutput.escalation_reason,
    proposedArtefactUpdates,
    identifiedPatterns: toolOutput.identified_patterns?.map((p) => ({
      patternType: p.pattern_type as SignalPattern['patternType'],
      description: p.description,
      signalsInvolved: p.signals_involved,
      severity: p.severity as 'critical' | 'high' | 'medium' | 'low',
    })),
    riskAssessment: toolOutput.risk_assessment
      ? {
          level: toolOutput.risk_assessment.level as 'critical' | 'high' | 'medium' | 'low' | 'negligible',
          factors: toolOutput.risk_assessment.factors,
          mitigationOptions: toolOutput.risk_assessment.mitigation_options,
        }
      : undefined,
    confidence: toolOutput.confidence,
    supportingEvidence: toolOutput.supporting_evidence,
    usage: response.usage,
  };
}

/**
 * Perform batch reasoning on multiple signals
 *
 * Groups related signals for more efficient reasoning.
 *
 * @param inputs - Array of reasoning inputs
 * @returns Array of reasoning outputs
 */
export async function performBatchReasoning(
  inputs: ReasoningInput[]
): Promise<ReasoningOutput[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return inputs.map(() => ({
      recommendedAction: 'hold_for_review',
      rationale: 'Unable to perform complex reasoning: API key not configured',
      shouldEscalate: true,
      confidence: 0,
    }));
  }

  const client = createSonnetClient(apiKey);

  // Process sequentially to manage rate limits and token budget
  const results: ReasoningOutput[] = [];
  for (const input of inputs) {
    const result = await performReasoningWithClient(client, input);
    results.push(result);
  }

  return results;
}

/**
 * Check if a signal requires complex reasoning
 *
 * This is typically determined during triage, but can be used
 * for validation or override.
 *
 * @param signal - The classified signal
 * @returns Whether complex reasoning is needed
 */
export function requiresComplexReasoning(
  signal: ReasoningInput['signal']
): boolean {
  // Already flagged during triage
  if (signal.classification.requiresComplexReasoning) {
    return true;
  }

  // Additional heuristics
  const categories = signal.classification.categories;

  // Multi-category signals often need deeper analysis
  if (categories.length >= 3) {
    return true;
  }

  // Critical signals always get complex reasoning
  if (signal.classification.importance === 'critical') {
    return true;
  }

  // Risk + blocker combination
  if (categories.includes('risk') && categories.includes('blocker')) {
    return true;
  }

  return false;
}
