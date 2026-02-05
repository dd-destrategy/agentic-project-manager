/**
 * Execution module types
 */

import type { ActionType, AutonomyLevel, ConfidenceScore } from '../types/index.js';

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
  /** Whether an escalation is required for this action */
  escalationRequired?: boolean;
  /** Reason for the result (e.g., why it was held) */
  reason?: string;
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

/**
 * Configuration for action execution
 */
export interface ExecutionConfig {
  /** Current autonomy level */
  autonomyLevel: AutonomyLevel;
  /** Whether dry-run mode is enabled */
  dryRun: boolean;
  /** Hold queue duration in minutes (default: 30) */
  holdQueueMinutes?: number;
}
