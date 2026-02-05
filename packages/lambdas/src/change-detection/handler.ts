/**
 * Change Detection Lambda
 *
 * Polls Jira and Outlook APIs for changes since last checkpoint.
 * This is the gate that prevents unnecessary LLM calls.
 */

import type { Context } from 'aws-lambda';
import { logger, getEnv } from '../shared/context.js';
import type { HeartbeatOutput, ChangeDetectionOutput } from '../shared/types.js';

export async function handler(
  event: HeartbeatOutput,
  context: Context
): Promise<ChangeDetectionOutput> {
  logger.setContext(context);
  const env = getEnv();

  logger.info('Change detection started', {
    cycleId: event.cycleId,
    activeProjects: event.activeProjects.length,
  });

  // TODO: Implement in Sprint 3
  // 1. For each active project:
  //    a. Get checkpoint from DynamoDB
  //    b. Poll Jira for changes since checkpoint
  //    c. Poll Outlook for changes (if configured)
  // 2. If no changes, return hasChanges: false to skip LLM
  // 3. Store new checkpoint in DynamoDB

  const hasChanges = false;
  const signals: ChangeDetectionOutput['signals'] = [];

  logger.info('Change detection completed', {
    cycleId: event.cycleId,
    hasChanges,
    signalCount: signals.length,
  });

  return {
    hasChanges,
    signals,
  };
}
