/**
 * Triage Classify Lambda
 *
 * Second stage of triage: Classify signal importance and recommend actions.
 * Uses Claude Haiku for fast, cost-effective classification.
 * This Lambda has NO access to integration credentials.
 */

import type { Context } from 'aws-lambda';
import { classifySignal } from '@agentic-pm/core/triage';
import { logger } from '../shared/context.js';
import type { TriageSanitiseOutput, TriageClassifyOutput } from '../shared/types.js';

export async function handler(
  event: TriageSanitiseOutput,
  context: Context
): Promise<TriageClassifyOutput> {
  logger.setContext(context);

  logger.info('Triage classification started', {
    signalCount: event.signals.length,
  });

  // TODO: Implement in Sprint 2
  // 1. Build classification prompt with signal batch
  // 2. Call Claude Haiku with classify_signal tool
  // 3. Parse tool-use response
  // 4. Track token usage for budget

  // Classify each signal
  const signals = await Promise.all(
    event.signals.map((signal) => classifySignal(signal))
  );

  // Check if any signal needs complex reasoning
  const needsComplexReasoning = signals.some(
    (s) => s.classification.requiresComplexReasoning
  );

  const criticalCount = signals.filter(
    (s) => s.classification.importance === 'critical'
  ).length;

  logger.info('Triage classification completed', {
    classifiedCount: signals.length,
    criticalCount,
    needsComplexReasoning,
  });

  return {
    signals,
    needsComplexReasoning,
  };
}
