/**
 * Hold Queue Processing
 *
 * Processes held actions after their hold period expires.
 * Integrates with the graduation system to adjust hold times
 * based on consecutive approval patterns.
 */

import type { DynamoDBClient } from '../db/client.js';
import { EventRepository } from '../db/repositories/event.js';
import {
  GraduationStateRepository,
  DEFAULT_HOLD_TIMES,
  type GraduationState,
} from '../db/repositories/graduation-state.js';
import {
  HeldActionRepository,
  type HeldAction,
  type HeldActionType,
  type CreateHeldActionOptions,
  type EmailStakeholderPayload,
  type JiraStatusChangePayload,
} from '../db/repositories/held-action.js';

/**
 * Result of processing the hold queue
 */
export interface HoldQueueProcessingResult {
  processed: number;
  executed: number;
  cancelled: number;
  errors: Array<{
    actionId: string;
    error: string;
  }>;
}

/**
 * Result of queuing an action
 */
export interface QueueActionResult {
  action: HeldAction;
  holdMinutes: number;
  graduationTier: number;
}

/**
 * Action executor interface
 */
export interface ActionExecutor {
  executeEmail(payload: EmailStakeholderPayload): Promise<{ messageId: string }>;
  executeJiraStatusChange(payload: JiraStatusChangePayload): Promise<void>;
}

/**
 * Hold Queue Service
 *
 * Manages the hold queue lifecycle:
 * - Queue new actions with graduation-aware hold times
 * - Process ready actions
 * - Handle approvals and cancellations
 * - Track graduation state
 */
export class HoldQueueService {
  private heldActionRepo: HeldActionRepository;
  private graduationRepo: GraduationStateRepository;
  private eventRepo: EventRepository;

  constructor(db: DynamoDBClient) {
    this.heldActionRepo = new HeldActionRepository(db);
    this.graduationRepo = new GraduationStateRepository(db);
    this.eventRepo = new EventRepository(db);
  }

  /**
   * Queue a new action with graduation-aware hold time
   */
  async queueAction(options: CreateHeldActionOptions): Promise<QueueActionResult> {
    // Get graduation-aware hold time
    const holdMinutes = await this.graduationRepo.getHoldTime(
      options.projectId,
      options.actionType
    );

    // Get current graduation state
    const graduationState = await this.graduationRepo.getOrCreate(
      options.projectId,
      options.actionType
    );

    // If tier 3 (immediate), we still create the action but it will be
    // processed on the next queue check (within 1 minute)
    const effectiveHoldMinutes = holdMinutes > 0 ? holdMinutes : 1;

    // Create the held action
    const action = await this.heldActionRepo.create({
      ...options,
      holdMinutes: effectiveHoldMinutes,
    });

    // Log the action_held event
    await this.eventRepo.create({
      projectId: options.projectId,
      eventType: 'action_held',
      severity: 'info',
      summary: `Action "${options.actionType}" queued with ${effectiveHoldMinutes} minute hold`,
      detail: {
        relatedIds: {
          actionId: action.id,
        },
        context: {
          actionType: options.actionType,
          holdMinutes: effectiveHoldMinutes,
          graduationTier: graduationState.tier,
          heldUntil: action.heldUntil,
        },
      },
    });

    return {
      action,
      holdMinutes: effectiveHoldMinutes,
      graduationTier: graduationState.tier,
    };
  }

  /**
   * Process the hold queue - execute all ready actions
   */
  async processQueue(executor: ActionExecutor): Promise<HoldQueueProcessingResult> {
    const now = new Date().toISOString();
    const result: HoldQueueProcessingResult = {
      processed: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    };

    // Get all actions ready to execute
    const readyActions = await this.heldActionRepo.getReady(now, { limit: 50 });

    for (const action of readyActions) {
      result.processed++;

      // Atomically claim the action to prevent duplicate execution
      const claimed = await this.heldActionRepo.claimForExecution(
        action.projectId,
        action.id
      );
      if (!claimed) {
        // Another invocation already claimed it — skip
        continue;
      }

      try {
        // Execute the action
        await this.executeAction(action, executor);

        // Mark as executed
        await this.heldActionRepo.markExecuted(action.projectId, action.id);

        // Record approval for graduation (auto-execution counts as implicit approval)
        await this.graduationRepo.recordApproval(action.projectId, action.actionType);

        result.executed++;

        // Log success event
        await this.eventRepo.create({
          projectId: action.projectId,
          eventType: 'action_taken',
          severity: 'info',
          summary: `Executed held action "${action.actionType}"`,
          detail: {
            relatedIds: {
              actionId: action.id,
            },
            context: {
              actionType: action.actionType,
              executedAfterHold: true,
            },
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          actionId: action.id,
          error: errorMessage,
        });

        // Log error event
        await this.eventRepo.create({
          projectId: action.projectId,
          eventType: 'error',
          severity: 'error',
          summary: `Failed to execute held action "${action.actionType}"`,
          detail: {
            relatedIds: {
              actionId: action.id,
            },
            context: {
              actionType: action.actionType,
              error: errorMessage,
            },
          },
        });
      }
    }

    return result;
  }

  /**
   * Approve a held action (executes immediately)
   *
   * Uses atomic conditional update to prevent race conditions.
   * Returns null if action was already processed by another operation.
   */
  async approveAction(
    projectId: string,
    actionId: string,
    executor: ActionExecutor,
    decidedBy?: string
  ): Promise<HeldAction | null> {
    const action = await this.heldActionRepo.getById(projectId, actionId);

    if (!action) {
      return null;
    }

    if (action.status !== 'pending') {
      // Action already processed
      return null;
    }

    try {
      // Atomically mark as approved (with status check)
      // This will return null if status is not 'pending' (race condition detected)
      const approvedAction = await this.heldActionRepo.approve(projectId, actionId, decidedBy);

      if (!approvedAction) {
        // Action was already approved or cancelled by another process
        return null;
      }

      // Execute the action
      await this.executeAction(action, executor);

      // Mark as executed
      await this.heldActionRepo.markExecuted(projectId, actionId);

      // Record approval for graduation
      await this.graduationRepo.recordApproval(projectId, action.actionType);

      // Log approval event
      await this.eventRepo.create({
        projectId,
        eventType: 'action_approved',
        severity: 'info',
        summary: `Approved and executed held action "${action.actionType}"`,
        detail: {
          relatedIds: {
            actionId,
          },
          context: {
            actionType: action.actionType,
            decidedBy,
            approvedEarly: true,
          },
        },
      });

      return this.heldActionRepo.getById(projectId, actionId);
    } catch (error) {
      // Log error but don't throw - mark as error state
      await this.eventRepo.create({
        projectId,
        eventType: 'error',
        severity: 'error',
        summary: `Failed to execute approved action "${action.actionType}"`,
        detail: {
          relatedIds: {
            actionId,
          },
          context: {
            actionType: action.actionType,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });

      throw error;
    }
  }

  /**
   * Cancel a held action
   *
   * Uses atomic conditional update to prevent race conditions.
   * Returns null if action was already processed by another operation.
   */
  async cancelAction(
    projectId: string,
    actionId: string,
    reason?: string,
    decidedBy?: string
  ): Promise<HeldAction | null> {
    const action = await this.heldActionRepo.getById(projectId, actionId);

    if (!action) {
      return null;
    }

    if (action.status !== 'pending') {
      // Action already processed
      return null;
    }

    // Atomically cancel the action (with status check)
    // This will return null if status is not 'pending' (race condition detected)
    const cancelledAction = await this.heldActionRepo.cancel(
      projectId,
      actionId,
      reason,
      decidedBy
    );

    if (!cancelledAction) {
      // Action was already approved or cancelled by another process
      return null;
    }

    // Record cancellation (resets graduation progress)
    await this.graduationRepo.recordCancellation(projectId, action.actionType);

    // Log cancellation event
    await this.eventRepo.create({
      projectId,
      eventType: 'action_rejected',
      severity: 'info',
      summary: `Cancelled held action "${action.actionType}"`,
      detail: {
        relatedIds: {
          actionId,
        },
        context: {
          actionType: action.actionType,
          reason,
          decidedBy,
        },
      },
    });

    return cancelledAction;
  }

  /**
   * Get pending actions for a project
   */
  async getPendingActions(projectId: string): Promise<HeldAction[]> {
    const result = await this.heldActionRepo.getByProject(projectId, {
      status: 'pending',
      limit: 50,
    });
    return result.items;
  }

  /**
   * Get all pending actions across all projects
   */
  async getAllPendingActions(): Promise<HeldAction[]> {
    const result = await this.heldActionRepo.getPending({ limit: 100 });
    return result.items;
  }

  /**
   * Get graduation state for a project and action type
   */
  async getGraduationState(
    projectId: string,
    actionType: HeldActionType
  ): Promise<GraduationState> {
    return this.graduationRepo.getOrCreate(projectId, actionType);
  }

  /**
   * Get all graduation states for a project
   */
  async getProjectGraduationStates(projectId: string): Promise<GraduationState[]> {
    return this.graduationRepo.getByProject(projectId);
  }

  /**
   * Execute an action based on its type
   */
  private async executeAction(
    action: HeldAction,
    executor: ActionExecutor
  ): Promise<void> {
    switch (action.actionType) {
      case 'email_stakeholder':
        await executor.executeEmail(action.payload as EmailStakeholderPayload);
        break;

      case 'jira_status_change':
        await executor.executeJiraStatusChange(
          action.payload as JiraStatusChangePayload
        );
        break;

      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }
  }
}

/**
 * Create a hold queue service instance
 */
export function createHoldQueueService(db: DynamoDBClient): HoldQueueService {
  return new HoldQueueService(db);
}

/**
 * Get the default hold time for an action type
 */
export function getDefaultHoldTime(actionType: HeldActionType): number {
  return DEFAULT_HOLD_TIMES[actionType];
}

/**
 * Format hold time for display
 */
export function formatHoldTime(minutes: number): string {
  if (minutes === 0) {
    return 'Immediate';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Calculate time remaining until action executes
 */
export function getTimeRemaining(heldUntil: string): {
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const now = Date.now();
  const until = new Date(heldUntil).getTime();
  const diffMs = until - now;

  if (diffMs <= 0) {
    return { minutes: 0, seconds: 0, expired: true };
  }

  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  return { minutes, seconds, expired: false };
}
