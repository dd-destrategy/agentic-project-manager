/**
 * Reasoning Lambda
 *
 * Complex multi-source reasoning for signals that require deeper analysis.
 * Uses Claude Sonnet for higher-quality reasoning.
 * This Lambda has NO access to integration credentials.
 */

import type { Context } from 'aws-lambda';
import { logger } from '../shared/context.js';
import type { TriageClassifyOutput, ReasoningOutput } from '../shared/types.js';

export async function handler(
  event: TriageClassifyOutput,
  context: Context
): Promise<ReasoningOutput> {
  logger.setContext(context);

  logger.info('Reasoning started', {
    signalCount: event.signals.length,
    needsComplexReasoning: event.needsComplexReasoning,
  });

  // TODO: Implement in Sprint 2
  // 1. Filter signals that need complex reasoning
  // 2. Fetch relevant artefacts for context
  // 3. Fetch recent signals for pattern detection
  // 4. Call Claude Sonnet with reasoning prompt
  // 5. Parse response for proposed actions
  // 6. Track token usage for budget

  const proposedActions: ReasoningOutput['proposedActions'] = [];

  logger.info('Reasoning completed', {
    proposedActions: proposedActions.length,
  });

  return {
    signals: event.signals,
    proposedActions,
  };
}
