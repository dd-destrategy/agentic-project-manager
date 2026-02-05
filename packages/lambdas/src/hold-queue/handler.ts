/**
 * Hold Queue Lambda
 *
 * Processes held actions past their heldUntil timestamp.
 * Triggered by EventBridge every 1 minute.
 */

import type { Context } from 'aws-lambda';
import { logger } from '../shared/context.js';

interface HoldQueueInput {
  source: 'scheduled';
}

interface HoldQueueOutput {
  processed: number;
  executed: number;
  cancelled: number;
}

export async function handler(
  event: HoldQueueInput,
  context: Context
): Promise<HoldQueueOutput> {
  logger.setContext(context);

  logger.info('Hold queue processing started');

  // TODO: Implement in Phase 3
  // 1. Query GSI1 for ACTIONS#held where GSI1SK <= now
  // 2. For each ready action:
  //    a. Check if action was cancelled by user
  //    b. If not cancelled, execute the action
  //    c. Update action record with executedAt
  //    d. Remove from held GSI
  // 3. Write action_approved/action_rejected events

  let processed = 0;
  let executed = 0;
  let cancelled = 0;

  logger.info('Hold queue processing completed', {
    processed,
    executed,
    cancelled,
  });

  return {
    processed,
    executed,
    cancelled,
  };
}
