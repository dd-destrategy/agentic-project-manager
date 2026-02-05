/**
 * Normalise Lambda
 *
 * Converts raw API responses from integrations into NormalisedSignal objects.
 */

import type { Context } from 'aws-lambda';
import { logger } from '../shared/context.js';
import type { ChangeDetectionOutput, NormaliseOutput } from '../shared/types.js';

export async function handler(
  event: ChangeDetectionOutput,
  context: Context
): Promise<NormaliseOutput> {
  logger.setContext(context);

  logger.info('Normalisation started', {
    signalBatches: event.signals.length,
  });

  // TODO: Implement in Sprint 3
  // 1. For each raw signal batch:
  //    a. Identify source (Jira, Outlook)
  //    b. Apply appropriate normaliser
  //    c. Generate ULID for each signal
  // 2. Return array of NormalisedSignal objects

  const signals: NormaliseOutput['signals'] = [];

  logger.info('Normalisation completed', {
    normalisedCount: signals.length,
  });

  return {
    signals,
  };
}
