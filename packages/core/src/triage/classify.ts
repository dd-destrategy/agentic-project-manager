/**
 * Signal classification
 *
 * Uses Claude Haiku to classify signals and recommend actions.
 * Second stage of the two-pass triage pipeline.
 *
 * Reference: solution-design/06-prompt-library.md Section 2.2
 */

import type { ClaudeClient } from '../llm/client.js';
import { BATCH_CLASSIFY_SIGNALS_TOOL, type ClassifySignalOutput } from '../llm/tools.js';
import type { TokenUsage } from '../llm/types.js';
import type {
  ClassifiedSignal,
  SanitisedSignal,
  SignalClassification,
  SignalCategory,
  RecommendedAction,
} from '../types/index.js';

/**
 * System prompt for triage classification
 *
 * Reference: solution-design/06-prompt-library.md Section 2.2
 */
export const TRIAGE_CLASSIFY_SYSTEM_PROMPT = `You are a signal classifier for a project management automation system.

## Your Role

You analyse sanitised project signals and classify them by importance, category, and recommended action. Your classifications determine what the agent does next.

## Classification Dimensions

For each signal, determine:

### Importance (required)
- \`critical\`: Requires immediate attention. Blockers, security issues, stakeholder escalations.
- \`high\`: Significant impact on delivery. Sprint goal at risk, key dependencies.
- \`medium\`: Notable but not urgent. Status changes, new tickets, routine updates.
- \`low\`: Informational only. Comments, minor updates, metadata changes.

### Category (required)
- \`blocker\`: Something is blocked or blocking others
- \`risk\`: New risk identified or risk status changed
- \`scope_change\`: Scope addition, removal, or modification
- \`deadline_impact\`: Timeline or deadline affected
- \`stakeholder_communication\`: Stakeholder message or request
- \`routine_update\`: Regular progress update, status change
- \`noise\`: Low-value information, can be ignored

### Recommended Action (required)
- \`update_artefact\`: Update one or more PM artefacts (RAID log, delivery state, etc.)
- \`create_escalation\`: Create escalation for user decision
- \`send_notification\`: Send notification to user
- \`hold_for_review\`: Place in hold queue for manual review
- \`ignore\`: Log only, no action needed

## Classification Guidelines

- When in doubt, classify UP in importance (prefer false positives for critical items)
- Multiple signals about the same item should be correlated (note in rationale)
- Scope changes are ALWAYS at least high importance
- External stakeholder messages are ALWAYS at least high importance
- Routine status updates with no anomalies are low importance
- Set \`requires_sonnet: true\` only for genuinely complex multi-factor decisions

## Output Format

Use the batch_classify_signals tool to classify all signals in a single response.

## Language

Use British English spelling throughout.
`;

/**
 * Map tool output categories to internal SignalCategory type
 */
function mapCategory(toolCategory: string): SignalCategory {
  const categoryMap: Record<string, SignalCategory> = {
    blocker: 'blocker',
    risk: 'risk',
    dependency: 'risk', // Map dependency to risk
    progress: 'routine_update',
    stakeholder: 'stakeholder_communication',
    scope: 'scope_change',
    quality: 'risk',
    administrative: 'routine_update',
  };
  return categoryMap[toolCategory] ?? 'routine_update';
}

/**
 * Map tool output actions to internal RecommendedAction type
 */
function mapAction(toolAction: string): RecommendedAction {
  const actionMap: Record<string, RecommendedAction> = {
    update_artefact: 'update_artefact',
    escalate: 'create_escalation',
    draft_communication: 'send_notification',
    add_jira_comment: 'hold_for_review',
    no_action: 'ignore',
    defer_to_sonnet: 'hold_for_review',
  };
  return actionMap[toolAction] ?? 'ignore';
}

/**
 * Convert tool output to internal classification format
 */
function convertToolOutput(output: ClassifySignalOutput): SignalClassification {
  return {
    importance: output.importance === 'low' ? 'low' : output.importance,
    categories: [mapCategory(output.category)],
    recommendedAction: mapAction(output.recommended_action),
    requiresComplexReasoning: output.requires_sonnet,
    rationale: output.action_rationale,
  };
}

/**
 * Options for signal classification
 */
export interface ClassifyOptions {
  /** Claude client instance (Haiku recommended) */
  client?: ClaudeClient;
  /** Project context for classification */
  projectContext?: {
    projectId: string;
    projectName: string;
    autonomyLevel: 'monitoring' | 'artefact' | 'tactical';
  };
  /** Current artefact state summary */
  artefactSummary?: string;
  /** Skip LLM call and use heuristic classification */
  useHeuristics?: boolean;
}

/**
 * Result of batch classification
 */
export interface ClassifyBatchResult {
  signals: ClassifiedSignal[];
  needsComplexReasoning: boolean;
  usage?: TokenUsage;
  durationMs?: number;
}

/**
 * Heuristic classification for when LLM is unavailable or for budget saving
 *
 * Uses keyword matching and signal metadata to provide basic classification
 */
function classifyWithHeuristics(signal: SanitisedSignal): SignalClassification {
  const content = signal.sanitisedSummary.toLowerCase();

  // Critical keywords
  const criticalKeywords = ['blocked', 'blocking', 'urgent', 'critical', 'emergency', 'down', 'outage'];
  const highKeywords = ['risk', 'deadline', 'delayed', 'scope', 'budget', 'stakeholder'];
  const lowKeywords = ['comment', 'minor', 'typo', 'formatting', 'updated description'];

  // Determine importance
  let importance: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  if (criticalKeywords.some((kw) => content.includes(kw))) {
    importance = 'critical';
  } else if (highKeywords.some((kw) => content.includes(kw))) {
    importance = 'high';
  } else if (lowKeywords.some((kw) => content.includes(kw))) {
    importance = 'low';
  }

  // Determine category based on signal type
  let category: SignalCategory = 'routine_update';
  if (signal.type === 'ticket_status_changed' && content.includes('block')) {
    category = 'blocker';
  } else if (content.includes('risk')) {
    category = 'risk';
  } else if (content.includes('scope') || content.includes('added') || content.includes('removed')) {
    category = 'scope_change';
  } else if (content.includes('deadline') || content.includes('due date')) {
    category = 'deadline_impact';
  } else if (signal.source === 'outlook') {
    category = 'stakeholder_communication';
  }

  // Determine action
  let recommendedAction: RecommendedAction = 'update_artefact';
  if (importance === 'critical' || importance === 'high') {
    recommendedAction = 'create_escalation';
  } else if (importance === 'low') {
    recommendedAction = 'ignore';
  }

  return {
    importance,
    categories: [category],
    recommendedAction,
    requiresComplexReasoning: false,
    rationale: 'Classified using heuristic rules (LLM unavailable or budget saving mode)',
  };
}

/**
 * Build user message for classification prompt
 */
function buildClassificationPrompt(
  signals: SanitisedSignal[],
  projectContext?: ClassifyOptions['projectContext'],
  artefactSummary?: string
): string {
  const parts: string[] = [];

  // Add project context if available
  if (projectContext) {
    parts.push(`## Project Context

**Project:** ${projectContext.projectName} (${projectContext.projectId})
**Autonomy Level:** ${projectContext.autonomyLevel}
`);
  }

  // Add artefact summary if available
  if (artefactSummary) {
    parts.push(`## Current Artefact State Summary

${artefactSummary}
`);
  }

  // Add signals to process
  parts.push(`## Signals to Process

**Signal Count:** ${signals.length}
**Timestamp:** ${new Date().toISOString()}
`);

  signals.forEach((signal, index) => {
    parts.push(`---
### Signal ${index + 1} of ${signals.length}

**ID:** ${signal.id}
**Source:** ${signal.source}
**Type:** ${signal.type}
**Timestamp:** ${signal.timestamp}

<signal_content>
${signal.sanitisedSummary}
</signal_content>
`);
  });

  parts.push(`
Now classify each signal using the batch_classify_signals tool.`);

  return parts.join('\n');
}

/**
 * Classify a sanitised signal using Claude Haiku
 *
 * @param signal - The sanitised signal to classify
 * @param options - Classification options including LLM client
 * @returns The classified signal with importance and recommended action
 */
export async function classifySignal(
  signal: SanitisedSignal,
  options: ClassifyOptions = {}
): Promise<ClassifiedSignal> {
  // If no client or useHeuristics is true, use heuristic classification
  if (!options.client || options.useHeuristics) {
    const classification = classifyWithHeuristics(signal);
    return {
      ...signal,
      classification,
    };
  }

  // Use LLM for single signal (less efficient than batch)
  const result = await classifySignalBatch([signal], options);
  const classified = result.signals[0];
  if (!classified) {
    // Fallback if batch returned empty (shouldn't happen)
    return {
      ...signal,
      classification: classifyWithHeuristics(signal),
    };
  }
  return classified;
}

/**
 * Batch classify multiple sanitised signals using Claude Haiku
 *
 * This is more efficient than classifying signals individually as it
 * makes a single LLM call for the entire batch.
 *
 * @param signals - Array of sanitised signals to classify
 * @param options - Classification options including LLM client
 * @returns Batch result with classified signals and metadata
 */
export async function classifySignalBatch(
  signals: SanitisedSignal[],
  options: ClassifyOptions = {}
): Promise<ClassifyBatchResult> {
  // Handle empty input
  if (signals.length === 0) {
    return {
      signals: [],
      needsComplexReasoning: false,
    };
  }

  // If no client or useHeuristics, use heuristic classification
  if (!options.client || options.useHeuristics) {
    const classifiedSignals = signals.map((signal) => ({
      ...signal,
      classification: classifyWithHeuristics(signal),
    }));

    return {
      signals: classifiedSignals,
      needsComplexReasoning: false,
    };
  }

  // Build the classification prompt
  const userMessage = buildClassificationPrompt(
    signals,
    options.projectContext,
    options.artefactSummary
  );

  // Call LLM with batch classification tool
  const response = await options.client.callWithTools<{
    classifications: ClassifySignalOutput[];
  }>(
    TRIAGE_CLASSIFY_SYSTEM_PROMPT,
    userMessage,
    [BATCH_CLASSIFY_SIGNALS_TOOL],
    { forceTool: 'batch_classify_signals' }
  );

  // Handle LLM errors - fall back to heuristics
  if (!response.success || !response.data) {
    console.warn('LLM classification failed, falling back to heuristics:', response.error);
    const classifiedSignals = signals.map((signal) => ({
      ...signal,
      classification: classifyWithHeuristics(signal),
    }));

    return {
      signals: classifiedSignals,
      needsComplexReasoning: false,
      usage: response.usage,
      durationMs: response.durationMs,
    };
  }

  // Map LLM response to classified signals
  const classificationMap = new Map<string, ClassifySignalOutput>();
  for (const classification of response.data.classifications) {
    classificationMap.set(classification.signal_id, classification);
  }

  const classifiedSignals: ClassifiedSignal[] = signals.map((signal) => {
    const toolOutput = classificationMap.get(signal.id);
    if (toolOutput) {
      return {
        ...signal,
        classification: convertToolOutput(toolOutput),
      };
    }
    // Fallback if signal not in response
    return {
      ...signal,
      classification: classifyWithHeuristics(signal),
    };
  });

  // Check if any signal requires complex reasoning
  const needsComplexReasoning = classifiedSignals.some(
    (s) => s.classification.requiresComplexReasoning
  );

  return {
    signals: classifiedSignals,
    needsComplexReasoning,
    usage: response.usage,
    durationMs: response.durationMs,
  };
}
