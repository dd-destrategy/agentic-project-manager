/**
 * Execution module types
 */

import type { ActionType, ConfidenceScore } from '../types/index.js';

/**
 * Result of executing an action
 */
export interface ExecutionResult {
  /** Whether the action was executed successfully */
  success: boolean;
  /** The action that was executed */
  actionType: ActionType;
  /** Whether the action was held for review */
  held: boolean;
  /** If held, when the action will be released */
  heldUntil?: string;
  /** Error message if execution failed */
  error?: string;
  /** Details about what was done */
  details?: Record<string, unknown>;
}

/**
 * Input for action execution
 */
export interface ExecutionInput {
  actionType: ActionType;
  projectId: string;
  details: Record<string, unknown>;
  confidence?: ConfidenceScore;
}
