/**
 * Decision Boundaries Tests
 *
 * Comprehensive tests for action boundary validation and autonomy levels.
 * Tests all autoExecute, requireHoldQueue, requireApproval, and neverDo actions.
 */

import { describe, it, expect } from 'vitest';
import {
  DECISION_BOUNDARIES,
  AUTONOMY_LEVEL_PERMISSIONS,
  isProhibitedAction,
  canAutoExecute,
  requiresHoldQueue,
  requiresApproval,
  getBoundaryCategory,
  isActionAllowedAtLevel,
  validateAction,
  getMinimumAutonomyLevel,
  getAllowedActionsAtLevel,
  compareAutonomyLevels,
  type BoundaryCategory,
  type BoundaryValidationResult,
} from './boundaries.js';
import type { AutonomyLevel } from '../types/index.js';

// ============================================================================
// Decision Boundaries Structure Tests
// ============================================================================

describe('DECISION_BOUNDARIES structure', () => {
  it('should have all four boundary categories', () => {
    expect(DECISION_BOUNDARIES).toHaveProperty('autoExecute');
    expect(DECISION_BOUNDARIES).toHaveProperty('requireHoldQueue');
    expect(DECISION_BOUNDARIES).toHaveProperty('requireApproval');
    expect(DECISION_BOUNDARIES).toHaveProperty('neverDo');
  });

  it('should have non-empty arrays for each category', () => {
    expect(DECISION_BOUNDARIES.autoExecute.length).toBeGreaterThan(0);
    expect(DECISION_BOUNDARIES.requireHoldQueue.length).toBeGreaterThan(0);
    expect(DECISION_BOUNDARIES.requireApproval.length).toBeGreaterThan(0);
    expect(DECISION_BOUNDARIES.neverDo.length).toBeGreaterThan(0);
  });

  it('should have no duplicate actions across categories', () => {
    const allActions = [
      ...DECISION_BOUNDARIES.autoExecute,
      ...DECISION_BOUNDARIES.requireHoldQueue,
      ...DECISION_BOUNDARIES.requireApproval,
      ...DECISION_BOUNDARIES.neverDo,
    ];

    const uniqueActions = new Set(allActions);
    expect(uniqueActions.size).toBe(allActions.length);
  });
});

// ============================================================================
// Auto Execute Actions Tests
// ============================================================================

describe('autoExecute actions', () => {
  const autoExecuteActions = [
    'artefact_update',
    'heartbeat_log',
    'notification_internal',
    'jira_comment',
  ];

  autoExecuteActions.forEach((action) => {
    it(`should identify "${action}" as auto-executable`, () => {
      expect(canAutoExecute(action)).toBe(true);
    });

    it(`should return "autoExecute" category for "${action}"`, () => {
      expect(getBoundaryCategory(action)).toBe('autoExecute');
    });

    it(`should not require hold queue for "${action}"`, () => {
      expect(requiresHoldQueue(action)).toBe(false);
    });

    it(`should not require approval for "${action}"`, () => {
      expect(requiresApproval(action)).toBe(false);
    });

    it(`should not be prohibited: "${action}"`, () => {
      expect(isProhibitedAction(action)).toBe(false);
    });
  });
});

// ============================================================================
// Require Hold Queue Actions Tests
// ============================================================================

describe('requireHoldQueue actions', () => {
  const holdQueueActions = [
    'email_stakeholder',
    'jira_status_change',
  ];

  holdQueueActions.forEach((action) => {
    it(`should identify "${action}" as requiring hold queue`, () => {
      expect(requiresHoldQueue(action)).toBe(true);
    });

    it(`should return "requireHoldQueue" category for "${action}"`, () => {
      expect(getBoundaryCategory(action)).toBe('requireHoldQueue');
    });

    it(`should not be auto-executable: "${action}"`, () => {
      expect(canAutoExecute(action)).toBe(false);
    });

    it(`should not require approval: "${action}"`, () => {
      expect(requiresApproval(action)).toBe(false);
    });

    it(`should not be prohibited: "${action}"`, () => {
      expect(isProhibitedAction(action)).toBe(false);
    });
  });
});

// ============================================================================
// Require Approval Actions Tests
// ============================================================================

describe('requireApproval actions', () => {
  const approvalActions = [
    'email_external',
    'jira_create_ticket',
    'scope_change',
    'milestone_change',
  ];

  approvalActions.forEach((action) => {
    it(`should identify "${action}" as requiring approval`, () => {
      expect(requiresApproval(action)).toBe(true);
    });

    it(`should return "requireApproval" category for "${action}"`, () => {
      expect(getBoundaryCategory(action)).toBe('requireApproval');
    });

    it(`should not be auto-executable: "${action}"`, () => {
      expect(canAutoExecute(action)).toBe(false);
    });

    it(`should not require hold queue: "${action}"`, () => {
      expect(requiresHoldQueue(action)).toBe(false);
    });

    it(`should not be prohibited: "${action}"`, () => {
      expect(isProhibitedAction(action)).toBe(false);
    });
  });
});

// ============================================================================
// Never Do Actions Tests
// ============================================================================

describe('neverDo actions', () => {
  const prohibitedActions = [
    'delete_data',
    'share_confidential',
    'modify_integration_config',
    'change_own_autonomy_level',
  ];

  prohibitedActions.forEach((action) => {
    it(`should identify "${action}" as prohibited`, () => {
      expect(isProhibitedAction(action)).toBe(true);
    });

    it(`should return "neverDo" category for "${action}"`, () => {
      expect(getBoundaryCategory(action)).toBe('neverDo');
    });

    it(`should not be auto-executable: "${action}"`, () => {
      expect(canAutoExecute(action)).toBe(false);
    });

    it(`should not require hold queue: "${action}"`, () => {
      expect(requiresHoldQueue(action)).toBe(false);
    });

    it(`should not require approval: "${action}"`, () => {
      expect(requiresApproval(action)).toBe(false);
    });
  });
});

// ============================================================================
// Unknown Action Tests
// ============================================================================

describe('unknown actions', () => {
  const unknownActions = [
    'unknown_action',
    'random_operation',
    'undefined_task',
    '',
  ];

  unknownActions.forEach((action) => {
    it(`should return null category for unknown action: "${action}"`, () => {
      expect(getBoundaryCategory(action)).toBeNull();
    });

    it(`should not be auto-executable: "${action}"`, () => {
      expect(canAutoExecute(action)).toBe(false);
    });

    it(`should not require hold queue: "${action}"`, () => {
      expect(requiresHoldQueue(action)).toBe(false);
    });

    it(`should not require approval: "${action}"`, () => {
      expect(requiresApproval(action)).toBe(false);
    });

    it(`should not be prohibited: "${action}"`, () => {
      expect(isProhibitedAction(action)).toBe(false);
    });
  });
});

// ============================================================================
// Autonomy Level Permissions Tests
// ============================================================================

describe('AUTONOMY_LEVEL_PERMISSIONS', () => {
  it('should have all three autonomy levels', () => {
    expect(AUTONOMY_LEVEL_PERMISSIONS).toHaveProperty('monitoring');
    expect(AUTONOMY_LEVEL_PERMISSIONS).toHaveProperty('artefact');
    expect(AUTONOMY_LEVEL_PERMISSIONS).toHaveProperty('tactical');
  });

  describe('monitoring level', () => {
    it('should only allow heartbeat_log', () => {
      const permissions = AUTONOMY_LEVEL_PERMISSIONS.monitoring;
      expect(permissions).toContain('heartbeat_log');
      expect(permissions.length).toBe(1);
    });

    it('should not allow artefact_update', () => {
      expect(isActionAllowedAtLevel('artefact_update', 'monitoring')).toBe(false);
    });

    it('should not allow notification_internal', () => {
      expect(isActionAllowedAtLevel('notification_internal', 'monitoring')).toBe(false);
    });

    it('should not allow jira_comment', () => {
      expect(isActionAllowedAtLevel('jira_comment', 'monitoring')).toBe(false);
    });

    it('should not allow email_stakeholder', () => {
      expect(isActionAllowedAtLevel('email_stakeholder', 'monitoring')).toBe(false);
    });
  });

  describe('artefact level', () => {
    it('should allow heartbeat_log', () => {
      expect(isActionAllowedAtLevel('heartbeat_log', 'artefact')).toBe(true);
    });

    it('should allow artefact_update', () => {
      expect(isActionAllowedAtLevel('artefact_update', 'artefact')).toBe(true);
    });

    it('should allow notification_internal', () => {
      expect(isActionAllowedAtLevel('notification_internal', 'artefact')).toBe(true);
    });

    it('should not allow jira_comment', () => {
      expect(isActionAllowedAtLevel('jira_comment', 'artefact')).toBe(false);
    });

    it('should not allow email_stakeholder', () => {
      expect(isActionAllowedAtLevel('email_stakeholder', 'artefact')).toBe(false);
    });

    it('should have exactly 3 allowed actions', () => {
      expect(AUTONOMY_LEVEL_PERMISSIONS.artefact.length).toBe(3);
    });
  });

  describe('tactical level', () => {
    it('should allow all artefact-level actions', () => {
      expect(isActionAllowedAtLevel('heartbeat_log', 'tactical')).toBe(true);
      expect(isActionAllowedAtLevel('artefact_update', 'tactical')).toBe(true);
      expect(isActionAllowedAtLevel('notification_internal', 'tactical')).toBe(true);
    });

    it('should allow jira_comment', () => {
      expect(isActionAllowedAtLevel('jira_comment', 'tactical')).toBe(true);
    });

    it('should allow email_stakeholder', () => {
      expect(isActionAllowedAtLevel('email_stakeholder', 'tactical')).toBe(true);
    });

    it('should allow jira_status_change', () => {
      expect(isActionAllowedAtLevel('jira_status_change', 'tactical')).toBe(true);
    });

    it('should have exactly 6 allowed actions', () => {
      expect(AUTONOMY_LEVEL_PERMISSIONS.tactical.length).toBe(6);
    });
  });
});

// ============================================================================
// validateAction Tests
// ============================================================================

describe('validateAction', () => {
  describe('prohibited actions', () => {
    const prohibitedActions = ['delete_data', 'share_confidential', 'modify_integration_config', 'change_own_autonomy_level'];
    const levels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];

    prohibitedActions.forEach((action) => {
      levels.forEach((level) => {
        it(`should block "${action}" at ${level} level`, () => {
          const result = validateAction(action, level);

          expect(result.allowed).toBe(false);
          expect(result.category).toBe('neverDo');
          expect(result.reason).toContain('prohibited');
          expect(result.reason).toContain(action);
        });
      });
    });
  });

  describe('approval-required actions', () => {
    const approvalActions = ['email_external', 'jira_create_ticket', 'scope_change', 'milestone_change'];
    const levels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];

    approvalActions.forEach((action) => {
      levels.forEach((level) => {
        it(`should require approval for "${action}" at ${level} level`, () => {
          const result = validateAction(action, level);

          expect(result.allowed).toBe(false);
          expect(result.category).toBe('requireApproval');
          expect(result.requiresApproval).toBe(true);
          expect(result.reason).toContain('requires explicit user approval');
        });
      });
    });
  });

  describe('monitoring level validation', () => {
    it('should allow heartbeat_log', () => {
      const result = validateAction('heartbeat_log', 'monitoring');

      expect(result.allowed).toBe(true);
      expect(result.category).toBe('autoExecute');
      expect(result.requiresHoldQueue).toBe(false);
      expect(result.requiresApproval).toBe(false);
    });

    it('should block artefact_update due to autonomy level', () => {
      const result = validateAction('artefact_update', 'monitoring');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted at autonomy level');
      expect(result.reason).toContain('monitoring');
    });

    it('should block notification_internal due to autonomy level', () => {
      const result = validateAction('notification_internal', 'monitoring');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted at autonomy level');
    });
  });

  describe('artefact level validation', () => {
    it('should allow heartbeat_log', () => {
      const result = validateAction('heartbeat_log', 'artefact');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('autoExecute');
    });

    it('should allow artefact_update', () => {
      const result = validateAction('artefact_update', 'artefact');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('autoExecute');
    });

    it('should allow notification_internal', () => {
      const result = validateAction('notification_internal', 'artefact');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('autoExecute');
    });

    it('should block jira_comment due to autonomy level', () => {
      const result = validateAction('jira_comment', 'artefact');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted at autonomy level');
    });

    it('should block email_stakeholder due to autonomy level', () => {
      const result = validateAction('email_stakeholder', 'artefact');
      expect(result.allowed).toBe(false);
    });
  });

  describe('tactical level validation', () => {
    it('should allow all autoExecute actions', () => {
      const autoActions = ['heartbeat_log', 'artefact_update', 'notification_internal', 'jira_comment'];

      autoActions.forEach((action) => {
        const result = validateAction(action, 'tactical');
        expect(result.allowed).toBe(true);
        expect(result.category).toBe('autoExecute');
        expect(result.requiresHoldQueue).toBe(false);
      });
    });

    it('should allow email_stakeholder with hold queue', () => {
      const result = validateAction('email_stakeholder', 'tactical');

      expect(result.allowed).toBe(true);
      expect(result.category).toBe('requireHoldQueue');
      expect(result.requiresHoldQueue).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('should allow jira_status_change with hold queue', () => {
      const result = validateAction('jira_status_change', 'tactical');

      expect(result.allowed).toBe(true);
      expect(result.category).toBe('requireHoldQueue');
      expect(result.requiresHoldQueue).toBe(true);
    });
  });

  describe('unknown actions', () => {
    it('should block unknown actions at all levels', () => {
      const levels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];

      levels.forEach((level) => {
        const result = validateAction('unknown_action', level);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not permitted');
      });
    });
  });
});

// ============================================================================
// BoundaryValidationResult Structure Tests
// ============================================================================

describe('BoundaryValidationResult structure', () => {
  it('should return all required fields for allowed action', () => {
    const result: BoundaryValidationResult = validateAction('heartbeat_log', 'monitoring');

    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('requiresHoldQueue');
    expect(result).toHaveProperty('requiresApproval');
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.requiresHoldQueue).toBe('boolean');
    expect(typeof result.requiresApproval).toBe('boolean');
  });

  it('should include reason for blocked action', () => {
    const result = validateAction('delete_data', 'tactical');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe('string');
  });

  it('should not include reason for allowed action', () => {
    const result = validateAction('heartbeat_log', 'monitoring');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// ============================================================================
// getMinimumAutonomyLevel Tests
// ============================================================================

describe('getMinimumAutonomyLevel', () => {
  it('should return "monitoring" for heartbeat_log', () => {
    expect(getMinimumAutonomyLevel('heartbeat_log')).toBe('monitoring');
  });

  it('should return "artefact" for artefact_update', () => {
    expect(getMinimumAutonomyLevel('artefact_update')).toBe('artefact');
  });

  it('should return "artefact" for notification_internal', () => {
    expect(getMinimumAutonomyLevel('notification_internal')).toBe('artefact');
  });

  it('should return "tactical" for jira_comment', () => {
    expect(getMinimumAutonomyLevel('jira_comment')).toBe('tactical');
  });

  it('should return "tactical" for email_stakeholder', () => {
    expect(getMinimumAutonomyLevel('email_stakeholder')).toBe('tactical');
  });

  it('should return "tactical" for jira_status_change', () => {
    expect(getMinimumAutonomyLevel('jira_status_change')).toBe('tactical');
  });

  it('should return null for prohibited actions', () => {
    expect(getMinimumAutonomyLevel('delete_data')).toBeNull();
    expect(getMinimumAutonomyLevel('share_confidential')).toBeNull();
  });

  it('should return null for approval-required actions', () => {
    expect(getMinimumAutonomyLevel('email_external')).toBeNull();
    expect(getMinimumAutonomyLevel('jira_create_ticket')).toBeNull();
  });

  it('should return null for unknown actions', () => {
    expect(getMinimumAutonomyLevel('unknown_action')).toBeNull();
  });
});

// ============================================================================
// getAllowedActionsAtLevel Tests
// ============================================================================

describe('getAllowedActionsAtLevel', () => {
  it('should return only heartbeat_log for monitoring', () => {
    const actions = getAllowedActionsAtLevel('monitoring');
    expect(actions).toContain('heartbeat_log');
    expect(actions.length).toBe(1);
  });

  it('should return 3 actions for artefact level', () => {
    const actions = getAllowedActionsAtLevel('artefact');
    expect(actions).toContain('heartbeat_log');
    expect(actions).toContain('artefact_update');
    expect(actions).toContain('notification_internal');
    expect(actions.length).toBe(3);
  });

  it('should return 6 actions for tactical level', () => {
    const actions = getAllowedActionsAtLevel('tactical');
    expect(actions).toContain('heartbeat_log');
    expect(actions).toContain('artefact_update');
    expect(actions).toContain('notification_internal');
    expect(actions).toContain('jira_comment');
    expect(actions).toContain('email_stakeholder');
    expect(actions).toContain('jira_status_change');
    expect(actions.length).toBe(6);
  });

  it('should return readonly array', () => {
    const actions = getAllowedActionsAtLevel('tactical');
    // TypeScript readonly arrays don't have push/pop methods
    expect(Array.isArray(actions)).toBe(true);
  });
});

// ============================================================================
// compareAutonomyLevels Tests
// ============================================================================

describe('compareAutonomyLevels', () => {
  it('should return negative when first level is lower', () => {
    expect(compareAutonomyLevels('monitoring', 'artefact')).toBeLessThan(0);
    expect(compareAutonomyLevels('monitoring', 'tactical')).toBeLessThan(0);
    expect(compareAutonomyLevels('artefact', 'tactical')).toBeLessThan(0);
  });

  it('should return zero for equal levels', () => {
    expect(compareAutonomyLevels('monitoring', 'monitoring')).toBe(0);
    expect(compareAutonomyLevels('artefact', 'artefact')).toBe(0);
    expect(compareAutonomyLevels('tactical', 'tactical')).toBe(0);
  });

  it('should return positive when first level is higher', () => {
    expect(compareAutonomyLevels('tactical', 'artefact')).toBeGreaterThan(0);
    expect(compareAutonomyLevels('tactical', 'monitoring')).toBeGreaterThan(0);
    expect(compareAutonomyLevels('artefact', 'monitoring')).toBeGreaterThan(0);
  });

  it('should follow transitivity', () => {
    // If monitoring < artefact and artefact < tactical, then monitoring < tactical
    const monitoringVsArtefact = compareAutonomyLevels('monitoring', 'artefact');
    const artefactVsTactical = compareAutonomyLevels('artefact', 'tactical');
    const monitoringVsTactical = compareAutonomyLevels('monitoring', 'tactical');

    expect(monitoringVsArtefact).toBeLessThan(0);
    expect(artefactVsTactical).toBeLessThan(0);
    expect(monitoringVsTactical).toBeLessThan(0);
  });
});

// ============================================================================
// Hierarchy Tests
// ============================================================================

describe('Autonomy level hierarchy', () => {
  it('should have tactical include all artefact permissions', () => {
    const artefactActions = getAllowedActionsAtLevel('artefact');
    const tacticalActions = getAllowedActionsAtLevel('tactical');

    artefactActions.forEach((action) => {
      expect(tacticalActions).toContain(action);
    });
  });

  it('should have artefact include all monitoring permissions', () => {
    const monitoringActions = getAllowedActionsAtLevel('monitoring');
    const artefactActions = getAllowedActionsAtLevel('artefact');

    monitoringActions.forEach((action) => {
      expect(artefactActions).toContain(action);
    });
  });

  it('should have each level add new capabilities', () => {
    const monitoring = getAllowedActionsAtLevel('monitoring');
    const artefact = getAllowedActionsAtLevel('artefact');
    const tactical = getAllowedActionsAtLevel('tactical');

    expect(artefact.length).toBeGreaterThan(monitoring.length);
    expect(tactical.length).toBeGreaterThan(artefact.length);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge cases', () => {
  it('should handle empty string action type', () => {
    const result = validateAction('', 'tactical');
    expect(result.allowed).toBe(false);
  });

  it('should handle whitespace action type', () => {
    const result = validateAction('   ', 'tactical');
    expect(result.allowed).toBe(false);
  });

  it('should be case sensitive for action types', () => {
    // Action types are case sensitive - uppercase should not match
    expect(canAutoExecute('HEARTBEAT_LOG')).toBe(false);
    expect(canAutoExecute('heartbeat_log')).toBe(true);
  });

  it('should handle action type with extra characters', () => {
    expect(canAutoExecute('heartbeat_log_extra')).toBe(false);
    expect(canAutoExecute('_heartbeat_log')).toBe(false);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration scenarios', () => {
  it('should correctly validate a complete workflow at monitoring level', () => {
    // At monitoring level, only heartbeat is allowed
    const validAction = validateAction('heartbeat_log', 'monitoring');
    expect(validAction.allowed).toBe(true);

    // Everything else should be blocked
    const blockedActions = ['artefact_update', 'notification_internal', 'jira_comment', 'email_stakeholder'];
    blockedActions.forEach((action) => {
      const result = validateAction(action, 'monitoring');
      expect(result.allowed).toBe(false);
    });
  });

  it('should correctly validate a complete workflow at artefact level', () => {
    // Allowed at artefact level
    const allowedActions = ['heartbeat_log', 'artefact_update', 'notification_internal'];
    allowedActions.forEach((action) => {
      const result = validateAction(action, 'artefact');
      expect(result.allowed).toBe(true);
      expect(result.requiresHoldQueue).toBe(false);
    });

    // Blocked at artefact level
    const blockedActions = ['jira_comment', 'email_stakeholder', 'jira_status_change'];
    blockedActions.forEach((action) => {
      const result = validateAction(action, 'artefact');
      expect(result.allowed).toBe(false);
    });
  });

  it('should correctly validate a complete workflow at tactical level', () => {
    // Auto-execute actions
    const autoActions = ['heartbeat_log', 'artefact_update', 'notification_internal', 'jira_comment'];
    autoActions.forEach((action) => {
      const result = validateAction(action, 'tactical');
      expect(result.allowed).toBe(true);
      expect(result.requiresHoldQueue).toBe(false);
    });

    // Hold queue actions
    const holdQueueActions = ['email_stakeholder', 'jira_status_change'];
    holdQueueActions.forEach((action) => {
      const result = validateAction(action, 'tactical');
      expect(result.allowed).toBe(true);
      expect(result.requiresHoldQueue).toBe(true);
    });

    // Always blocked
    const blockedActions = ['delete_data', 'share_confidential', 'email_external', 'scope_change'];
    blockedActions.forEach((action) => {
      const result = validateAction(action, 'tactical');
      expect(result.allowed).toBe(false);
    });
  });

  it('should block neverDo actions regardless of autonomy level', () => {
    const neverDoActions = ['delete_data', 'share_confidential', 'modify_integration_config', 'change_own_autonomy_level'];
    const levels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];

    neverDoActions.forEach((action) => {
      levels.forEach((level) => {
        const result = validateAction(action, level);
        expect(result.allowed).toBe(false);
        expect(result.category).toBe('neverDo');
      });
    });
  });
});
