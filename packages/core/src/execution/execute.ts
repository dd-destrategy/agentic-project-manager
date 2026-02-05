/**
 * Action execution
 *
 * Executes approved actions or queues them for hold/approval.
 */

import { DECISION_BOUNDARIES } from '../constants.js';
import type { ActionType } from '../types/index.js';
import type { ExecutionInput, ExecutionResult } from './types.js';

/**
 * Execute an action based on decision boundaries and confidence
 *
 * @param input - The action to execute
 * @returns Execution result
 *
 * TODO: Implement full execution logic in Sprint 3-4
 */
export async function executeAction(
  input: ExecutionInput
): Promise<ExecutionResult> {
  const { actionType, projectId, details, confidence } = input;

  // Check if action is in the never-do list
  if (isProhibitedAction(actionType)) {
    return {
      success: false,
      actionType,
      held: false,
      error: `Action type "${actionType}" is prohibited`,
    };
  }

  // Check if action can be auto-executed
  if (canAutoExecute(actionType)) {
    // TODO: Implement actual execution
    return {
      success: true,
      actionType,
      held: false,
      details: { projectId, ...details },
    };
  }

  // Check if action requires hold queue
  if (requiresHoldQueue(actionType)) {
    const holdMinutes = 30; // Default hold time
    const heldUntil = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

    return {
      success: true,
      actionType,
      held: true,
      heldUntil,
      details: { projectId, ...details },
    };
  }

  // Action requires approval - create escalation
  return {
    success: true,
    actionType,
    held: true,
    details: { projectId, ...details, requiresApproval: true },
  };
}

/**
 * Check if an action type is prohibited
 */
function isProhibitedAction(actionType: ActionType): boolean {
  return (DECISION_BOUNDARIES.neverDo as readonly string[]).includes(actionType);
}

/**
 * Check if an action type can be auto-executed
 */
function canAutoExecute(actionType: ActionType): boolean {
  return (DECISION_BOUNDARIES.canAutoExecute as readonly string[]).includes(actionType);
}

/**
 * Check if an action type requires the hold queue
 */
function requiresHoldQueue(actionType: ActionType): boolean {
  return (DECISION_BOUNDARIES.requireHoldQueue as readonly string[]).includes(actionType);
}
