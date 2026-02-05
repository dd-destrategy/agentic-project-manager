/**
 * Action execution
 *
 * Executes approved actions or queues them for hold/approval.
 * Implements dry-run mode and autonomy level enforcement.
 */

import type { ActionType, AutonomyLevel, DryRunResult } from '../types/index.js';
import type { ExecutionInput, ExecutionResult, ExecutionConfig } from './types.js';
import {
  validateAction,
  isProhibitedAction,
  isActionAllowedAtLevel,
} from './boundaries.js';

/**
 * Execute an action based on decision boundaries, autonomy level, and dry-run mode
 *
 * @param input - The action to execute
 * @param config - Execution configuration including autonomy level and dry-run mode
 * @returns Execution result
 */
export async function executeAction(
  input: ExecutionInput,
  config?: ExecutionConfig
): Promise<ExecutionResult | DryRunResult> {
  const { actionType, projectId, details, confidence } = input;
  const autonomyLevel = config?.autonomyLevel ?? 'monitoring';
  const dryRun = config?.dryRun ?? false;

  // Check if action is prohibited (never execute regardless of mode)
  if (isProhibitedAction(actionType)) {
    return {
      success: false,
      actionType,
      held: false,
      error: `Action type "${actionType}" is prohibited and can never be executed`,
    };
  }

  // Validate action against boundaries and autonomy level
  const validation = validateAction(actionType, autonomyLevel);

  // If action is not allowed, return error
  if (!validation.allowed) {
    // If it requires approval, create escalation
    if (validation.requiresApproval) {
      return {
        success: true,
        actionType,
        held: true,
        details: { projectId, ...details, requiresApproval: true },
        escalationRequired: true,
        reason: validation.reason,
      };
    }

    // Otherwise, reject the action
    return {
      success: false,
      actionType,
      held: false,
      error: validation.reason ?? `Action not allowed at autonomy level "${autonomyLevel}"`,
    };
  }

  // Dry-run mode: log but don't execute
  if (dryRun) {
    return createDryRunResult(actionType, projectId, details, validation);
  }

  // If action requires hold queue, queue it
  if (validation.requiresHoldQueue) {
    const holdMinutes = config?.holdQueueMinutes ?? 30;
    const heldUntil = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

    return {
      success: true,
      actionType,
      held: true,
      heldUntil,
      details: { projectId, ...details },
    };
  }

  // Action can be auto-executed
  // TODO: Implement actual execution logic for each action type
  return {
    success: true,
    actionType,
    held: false,
    details: { projectId, ...details },
  };
}

/**
 * Create a dry-run result that logs what would have happened
 */
function createDryRunResult(
  actionType: ActionType,
  projectId: string,
  details: Record<string, unknown>,
  validation: ReturnType<typeof validateAction>
): DryRunResult {
  return {
    actionType,
    executed: false,
    reason: 'dry_run',
    wouldExecute: validation.allowed && !validation.requiresHoldQueue,
    plannedAction: {
      projectId,
      ...details,
      wouldHold: validation.requiresHoldQueue,
      wouldRequireApproval: validation.requiresApproval,
      category: validation.category,
    },
  };
}

/**
 * Check if an action can be executed at the current autonomy level
 * without requiring hold queue or approval
 */
export function canExecuteImmediately(
  actionType: ActionType,
  autonomyLevel: AutonomyLevel
): boolean {
  const validation = validateAction(actionType, autonomyLevel);
  return validation.allowed && !validation.requiresHoldQueue && !validation.requiresApproval;
}

/**
 * Check if an action would be held in the hold queue
 */
export function wouldBeHeld(
  actionType: ActionType,
  autonomyLevel: AutonomyLevel
): boolean {
  const validation = validateAction(actionType, autonomyLevel);
  return validation.allowed && validation.requiresHoldQueue;
}

/**
 * Check if an action would require explicit approval
 */
export function wouldRequireApproval(
  actionType: ActionType,
  autonomyLevel: AutonomyLevel
): boolean {
  const validation = validateAction(actionType, autonomyLevel);
  return validation.requiresApproval;
}

/**
 * Execute multiple actions in sequence, respecting dry-run mode
 */
export async function executeActions(
  inputs: ExecutionInput[],
  config?: ExecutionConfig
): Promise<Array<ExecutionResult | DryRunResult>> {
  const results: Array<ExecutionResult | DryRunResult> = [];

  for (const input of inputs) {
    const result = await executeAction(input, config);
    results.push(result);

    // In dry-run mode, continue processing all actions
    // In normal mode, stop on first failure
    if (!config?.dryRun && 'success' in result && !result.success) {
      break;
    }
  }

  return results;
}

/**
 * Preview what would happen if actions were executed
 * Always runs in dry-run mode regardless of config
 */
export async function previewActions(
  inputs: ExecutionInput[],
  autonomyLevel: AutonomyLevel = 'monitoring'
): Promise<DryRunResult[]> {
  const results = await executeActions(inputs, {
    autonomyLevel,
    dryRun: true,
  });

  // Filter to only DryRunResults (should be all of them in dry-run mode)
  return results.filter((r): r is DryRunResult => 'reason' in r && r.reason === 'dry_run');
}
