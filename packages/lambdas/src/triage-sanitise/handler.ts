/**
 * Triage Sanitise Lambda
 *
 * First stage of triage: Strip/neutralise untrusted content from signals.
 * This is a SECURITY function - this Lambda has NO access to integration credentials.
 *
 * Defence Layer 2: Two-stage triage architecture
 * Reference: solution-design/06-prompt-library.md Section 6.2
 */

import { sanitiseSignalBatch, detectThreats } from '@agentic-pm/core/triage';
import type { Context } from 'aws-lambda';

import { logger } from '../shared/context.js';
import type { NormaliseOutput, TriageSanitiseOutput } from '../shared/types.js';

export async function handler(
  event: NormaliseOutput,
  context: Context
): Promise<TriageSanitiseOutput> {
  logger.setContext(context);

  logger.info('Triage sanitisation started', {
    signalCount: event.signals.length,
  });

  // Sanitise all signals in batch
  const result = sanitiseSignalBatch(event.signals);

  // Log threat detection statistics
  if (result.stats.threatsDetected > 0) {
    logger.warn('Potential injection threats detected', {
      threatsDetected: result.stats.threatsDetected,
      requiresReview: result.stats.requiresReview,
    });
  }

  // Log any signals requiring human review
  for (const signal of result.signals) {
    const threatCheck = detectThreats(signal.sanitisedSummary);
    if (threatCheck.requiresHumanReview) {
      logger.warn('Signal flagged for human review', {
        signalId: signal.id,
        reason: threatCheck.reviewReason,
      });
    }
  }

  logger.info('Triage sanitisation completed', {
    total: result.stats.total,
    modified: result.stats.modified,
    threatsDetected: result.stats.threatsDetected,
    requiresReview: result.stats.requiresReview,
  });

  return {
    signals: result.signals,
  };
}
