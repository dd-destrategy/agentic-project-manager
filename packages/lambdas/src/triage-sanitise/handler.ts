/**
 * Triage Sanitise Lambda
 *
 * First stage of triage: Strip/neutralise untrusted content from signals.
 * This is a SECURITY function - this Lambda has NO access to integration credentials.
 */

import type { Context } from 'aws-lambda';
import { sanitiseSignal } from '@agentic-pm/core/triage';
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

  // Sanitise each signal to prevent prompt injection
  const signals = event.signals.map((signal) => sanitiseSignal(signal));

  const sanitisationCount = signals.filter(
    (s) => s.sanitisationNotes && s.sanitisationNotes.length > 0
  ).length;

  logger.info('Triage sanitisation completed', {
    sanitisedCount: signals.length,
    signalsModified: sanitisationCount,
  });

  return {
    signals,
  };
}
