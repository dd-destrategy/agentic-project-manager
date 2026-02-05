/**
 * Decision Boundaries
 *
 * Defines what actions the agent can take based on autonomy level
 * and action classification. Implements the allowlist validation
 * described in SPEC section 5.4.
 */

import type { ActionType, AutonomyLevel } from '../types/index.js';
import { AUTONOMY_LEVEL_VALUE } from '../constants.js';

/**
 * Decision boundary categories
 */
export type BoundaryCategory =
  | 'autoExecute'
  | 'requireHoldQueue'
  | 'requireApproval'
  | 'neverDo';

/**
 * Decision boundaries - what actions the agent can take
 * Based on SPEC section 5.4
 */
export const DECISION_BOUNDARIES = {
  /**
   * Actions that can be auto-executed without user intervention
   * (at appropriate autonomy level)
   */
  autoExecute: [
    'artefact_update',
    'heartbeat_log',
    'notification_internal',
    'jira_comment',
  ] as const,

  /**
   * Actions that require the hold queue (30-minute delay for user review)
   */
  requireHoldQueue: [
    'email_stakeholder',
    'jira_status_change',
  ] as const,

  /**
   * Actions that require explicit user approval via escalation
   */
  requireApproval: [
    'email_external',
    'jira_create_ticket',
    'scope_change',
    'milestone_change',
  ] as const,

  /**
   * Actions the agent must never take autonomously
   */
  neverDo: [
    'delete_data',
    'share_confidential',
    'modify_integration_config',
    'change_own_autonomy_level',
  ] as const,
} as const;

/**
 * Action types available at each autonomy level
 *
 * Level 1 (Monitoring): Observe, log, heartbeat only - all actions escalated
 * Level 2 (Artefact): + update artefacts, send SES notifications
 * Level 3 (Tactical): + stakeholder emails, Jira updates via hold queue
 */
export const AUTONOMY_LEVEL_PERMISSIONS: Record<AutonomyLevel, readonly string[]> = {
  monitoring: [
    'heartbeat_log',
  ],
  artefact: [
    'heartbeat_log',
    'artefact_update',
    'notification_internal',
  ],
  tactical: [
    'heartbeat_log',
    'artefact_update',
    'notification_internal',
    'jira_comment',
    'email_stakeholder',
    'jira_status_change',
  ],
};

/**
 * Extended action types for boundary checking
 */
export type BoundaryActionType =
  | 'artefact_update'
  | 'heartbeat_log'
  | 'notification_internal'
  | 'jira_comment'
  | 'email_stakeholder'
  | 'jira_status_change'
  | 'email_external'
  | 'jira_create_ticket'
  | 'scope_change'
  | 'milestone_change'
  | 'delete_data'
  | 'share_confidential'
  | 'modify_integration_config'
  | 'change_own_autonomy_level';

/**
 * Result of boundary validation
 */
export interface BoundaryValidationResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** The boundary category this action falls into */
  category: BoundaryCategory | null;
  /** Whether the action requires the hold queue */
  requiresHoldQueue: boolean;
  /** Whether the action requires explicit approval */
  requiresApproval: boolean;
  /** Reason why action was blocked (if not allowed) */
  reason?: string;
}

/**
 * Check if an action is prohibited (in the neverDo list)
 */
export function isProhibitedAction(actionType: string): boolean {
  return (DECISION_BOUNDARIES.neverDo as readonly string[]).includes(actionType);
}

/**
 * Check if an action can be auto-executed (no hold queue needed)
 */
export function canAutoExecute(actionType: string): boolean {
  return (DECISION_BOUNDARIES.autoExecute as readonly string[]).includes(actionType);
}

/**
 * Check if an action requires the hold queue
 */
export function requiresHoldQueue(actionType: string): boolean {
  return (DECISION_BOUNDARIES.requireHoldQueue as readonly string[]).includes(actionType);
}

/**
 * Check if an action requires explicit approval
 */
export function requiresApproval(actionType: string): boolean {
  return (DECISION_BOUNDARIES.requireApproval as readonly string[]).includes(actionType);
}

/**
 * Get the boundary category for an action
 */
export function getBoundaryCategory(actionType: string): BoundaryCategory | null {
  if (isProhibitedAction(actionType)) return 'neverDo';
  if (canAutoExecute(actionType)) return 'autoExecute';
  if (requiresHoldQueue(actionType)) return 'requireHoldQueue';
  if (requiresApproval(actionType)) return 'requireApproval';
  return null;
}

/**
 * Check if an action is allowed at the given autonomy level
 */
export function isActionAllowedAtLevel(
  actionType: string,
  autonomyLevel: AutonomyLevel
): boolean {
  const permissions = AUTONOMY_LEVEL_PERMISSIONS[autonomyLevel];
  return permissions.includes(actionType);
}

/**
 * Validate an action against decision boundaries and autonomy level
 *
 * @param actionType - The action to validate
 * @param autonomyLevel - Current autonomy level
 * @returns Validation result with allowed status and categorisation
 */
export function validateAction(
  actionType: string,
  autonomyLevel: AutonomyLevel
): BoundaryValidationResult {
  // Check if action is in the never-do list
  if (isProhibitedAction(actionType)) {
    return {
      allowed: false,
      category: 'neverDo',
      requiresHoldQueue: false,
      requiresApproval: false,
      reason: `Action type "${actionType}" is prohibited and can never be executed`,
    };
  }

  // Check if action requires explicit approval
  if (requiresApproval(actionType)) {
    return {
      allowed: false,
      category: 'requireApproval',
      requiresHoldQueue: false,
      requiresApproval: true,
      reason: `Action type "${actionType}" requires explicit user approval`,
    };
  }

  // Check if action is allowed at current autonomy level
  if (!isActionAllowedAtLevel(actionType, autonomyLevel)) {
    return {
      allowed: false,
      category: getBoundaryCategory(actionType),
      requiresHoldQueue: false,
      requiresApproval: false,
      reason: `Action type "${actionType}" is not permitted at autonomy level "${autonomyLevel}"`,
    };
  }

  // Check if action requires hold queue
  if (requiresHoldQueue(actionType)) {
    return {
      allowed: true,
      category: 'requireHoldQueue',
      requiresHoldQueue: true,
      requiresApproval: false,
    };
  }

  // Action can be auto-executed
  return {
    allowed: true,
    category: 'autoExecute',
    requiresHoldQueue: false,
    requiresApproval: false,
  };
}

/**
 * Get the minimum autonomy level required for an action
 */
export function getMinimumAutonomyLevel(actionType: string): AutonomyLevel | null {
  // Check each level from lowest to highest
  const levels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];

  for (const level of levels) {
    if (isActionAllowedAtLevel(actionType, level)) {
      return level;
    }
  }

  return null; // Action not allowed at any level (requires approval or prohibited)
}

/**
 * Get all actions allowed at a given autonomy level
 */
export function getAllowedActionsAtLevel(autonomyLevel: AutonomyLevel): readonly string[] {
  return AUTONOMY_LEVEL_PERMISSIONS[autonomyLevel];
}

/**
 * Compare two autonomy levels
 * Returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareAutonomyLevels(a: AutonomyLevel, b: AutonomyLevel): number {
  return AUTONOMY_LEVEL_VALUE[a] - AUTONOMY_LEVEL_VALUE[b];
}
