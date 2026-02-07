/**
 * Normalise Lambda
 *
 * Converts raw API responses from integrations into NormalisedSignal objects.
 * This step transforms vendor-specific formats into a common schema for triage.
 *
 * Sprint 1: Passthrough implementation (no signals to normalise).
 * Sprint 3: Full normalisation with Jira and Outlook transformers.
 */

import type {
  NormalisedSignal,
  IntegrationSource,
  SignalType,
  RawSignal,
} from '@agentic-pm/core';
import { normaliseJiraSignal } from '@agentic-pm/core/signals/jira';
import type { Context } from 'aws-lambda';
import { ulid } from 'ulid';

import { logger } from '../shared/context.js';
import type {
  ChangeDetectionOutput,
  NormaliseOutput,
  RawSignalBatch,
} from '../shared/types.js';

/**
 * Normalise a single raw signal from any integration source.
 * Dispatches to source-specific normalisers where available,
 * falling back to a generic stub for unknown sources.
 */
function normaliseSignal(
  raw: unknown,
  source: IntegrationSource,
  projectId: string
): NormalisedSignal {
  const timestamp = new Date().toISOString();

  // Dispatch to source-specific normalisers
  if (source === 'jira') {
    const rawSignal: RawSignal = {
      source: 'jira',
      timestamp,
      rawPayload: raw,
    };
    return normaliseJiraSignal(rawSignal, projectId);
  }

  // Generic fallback for sources without a dedicated normaliser
  const id = ulid();
  return {
    id,
    source,
    timestamp,
    type: 'unknown' as SignalType,
    summary: 'Signal detected',
    raw: raw as Record<string, unknown>,
    projectId,
  };
}

/**
 * Process a batch of raw signals from a single source
 */
function processBatch(batch: RawSignalBatch): NormalisedSignal[] {
  const source = batch.source as IntegrationSource;

  return batch.signals.map((rawSignal) =>
    normaliseSignal(rawSignal, source, batch.projectId)
  );
}

export async function handler(
  event: ChangeDetectionOutput,
  context: Context
): Promise<NormaliseOutput> {
  logger.setContext(context);

  logger.info('Normalisation started', {
    signalBatches: event.signals.length,
    hasChanges: event.hasChanges,
  });

  // Sprint 1: Passthrough implementation
  // When hasChanges is false, we receive empty signals array
  // This Lambda will only be invoked when hasChanges is true
  //
  // Sprint 3 will implement:
  // 1. For each raw signal batch:
  //    a. Identify source (Jira, Outlook)
  //    b. Apply source-specific normaliser (jira.ts, outlook.ts)
  //    c. Generate ULID for each signal
  //    d. Extract metadata (priority, participants, related tickets)
  // 2. Return array of NormalisedSignal objects

  const signals: NormalisedSignal[] = [];

  // Process each batch of signals
  for (const batch of event.signals) {
    const normalisedBatch = processBatch(batch);
    signals.push(...normalisedBatch);

    logger.info('Batch normalised', {
      source: batch.source,
      projectId: batch.projectId,
      rawCount: batch.signals.length,
      normalisedCount: normalisedBatch.length,
    });
  }

  logger.info('Normalisation completed', {
    totalBatches: event.signals.length,
    normalisedCount: signals.length,
  });

  return {
    signals,
  };
}
