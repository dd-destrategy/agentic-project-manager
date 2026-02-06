/**
 * Unit tests for action execution logic
 *
 * Tests the core execution functions including dry-run mode,
 * autonomy level enforcement, and boundary validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeAction,
  canExecuteImmediately,
  wouldBeHeld,
  wouldRequireApproval,
  executeActions,
  previewActions,
} from '../execute.js';
import type {
  ExecutionInput,
  ExecutionConfig,
  ExecutionResult,
} from '../types.js';
import type {
  DryRunResult,
  AutonomyLevel,
  ActionType,
} from '../../types/index.js';
import * as boundaries from '../boundaries.js';

describe('executeAction', () => {
  describe('Prohibited actions', () => {
    it('should reject prohibited actions regardless of autonomy level', async () => {
      const input: ExecutionInput = {
        actionType: 'delete_data' as ActionType,
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toEqual({
        success: false,
        actionType: 'delete_data',
        held: false,
        error:
          'Action type "delete_data" is prohibited and can never be executed',
      });
    });

    it('should reject prohibited actions even in dry-run mode', async () => {
      const input: ExecutionInput = {
        actionType: 'share_confidential' as ActionType,
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: true,
      };

      const result = await executeAction(input, config);

      expect(result).toEqual({
        success: false,
        actionType: 'share_confidential',
        held: false,
        error:
          'Action type "share_confidential" is prohibited and can never be executed',
      });
    });
  });

  describe('Actions requiring approval', () => {
    it('should create escalation for actions requiring approval', async () => {
      const input: ExecutionInput = {
        actionType: 'email_external' as ActionType,
        projectId: 'test-project',
        details: { recipient: 'external@example.com' },
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: true,
        actionType: 'email_external',
        held: true,
        escalationRequired: true,
        details: expect.objectContaining({
          projectId: 'test-project',
          requiresApproval: true,
        }),
      });
    });

    it('should include reason when creating escalation', async () => {
      const input: ExecutionInput = {
        actionType: 'scope_change' as ActionType,
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toHaveProperty('reason');
      expect(result.reason).toContain('requires explicit user approval');
    });
  });

  describe('Actions not allowed at autonomy level', () => {
    it('should reject actions not allowed at monitoring level', async () => {
      const input: ExecutionInput = {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'monitoring',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: false,
        actionType: 'artefact_update',
        held: false,
        error: expect.stringContaining(
          'not permitted at autonomy level "monitoring"'
        ),
      });
    });

    it('should reject jira_comment at artefact level', async () => {
      const input: ExecutionInput = {
        actionType: 'jira_comment',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'artefact',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: false,
        held: false,
      });
    });
  });

  describe('Dry-run mode', () => {
    it('should return DryRunResult for allowed actions in dry-run mode', async () => {
      const input: ExecutionInput = {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: { field: 'status', value: 'updated' },
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'artefact',
        dryRun: true,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        actionType: 'artefact_update',
        executed: false,
        reason: 'dry_run',
        wouldExecute: true,
        plannedAction: expect.objectContaining({
          projectId: 'test-project',
          field: 'status',
          value: 'updated',
        }),
      });
    });

    it('should indicate would-hold in dry-run for hold-queue actions', async () => {
      const input: ExecutionInput = {
        actionType: 'email_stakeholder',
        projectId: 'test-project',
        details: { to: 'stakeholder@example.com' },
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: true,
      };

      const result = (await executeAction(input, config)) as DryRunResult;

      expect(result.plannedAction?.wouldHold).toBe(true);
      expect(result.wouldExecute).toBe(false);
    });

    it('should include category in dry-run result', async () => {
      const input: ExecutionInput = {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'monitoring',
        dryRun: true,
      };

      const result = (await executeAction(input, config)) as DryRunResult;

      expect(result.plannedAction?.category).toBe('autoExecute');
    });
  });

  describe('Hold queue actions', () => {
    it('should queue actions requiring hold queue', async () => {
      const input: ExecutionInput = {
        actionType: 'email_stakeholder',
        projectId: 'test-project',
        details: { to: 'stakeholder@example.com', subject: 'Update' },
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: true,
        actionType: 'email_stakeholder',
        held: true,
        heldUntil: expect.any(String),
        details: expect.objectContaining({
          projectId: 'test-project',
        }),
      });
    });

    it('should use custom hold queue duration', async () => {
      const input: ExecutionInput = {
        actionType: 'jira_status_change',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
        holdQueueMinutes: 60,
      };

      const beforeExecution = Date.now();
      const result = await executeAction(input, config);
      const afterExecution = Date.now();

      expect(result.held).toBe(true);
      if (result.heldUntil) {
        const heldUntilTime = new Date(result.heldUntil).getTime();
        const expectedMin = beforeExecution + 60 * 60 * 1000;
        const expectedMax = afterExecution + 60 * 60 * 1000;

        expect(heldUntilTime).toBeGreaterThanOrEqual(expectedMin);
        expect(heldUntilTime).toBeLessThanOrEqual(expectedMax);
      }
    });

    it('should use default 30 minute hold when not specified', async () => {
      const input: ExecutionInput = {
        actionType: 'email_stakeholder',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'tactical',
        dryRun: false,
      };

      const beforeExecution = Date.now();
      const result = await executeAction(input, config);

      expect(result.held).toBe(true);
      if (result.heldUntil) {
        const heldUntilTime = new Date(result.heldUntil).getTime();
        const expectedMin = beforeExecution + 30 * 60 * 1000 - 100; // Allow 100ms tolerance
        const expectedMax = beforeExecution + 30 * 60 * 1000 + 100;

        expect(heldUntilTime).toBeGreaterThanOrEqual(expectedMin);
        expect(heldUntilTime).toBeLessThanOrEqual(expectedMax);
      }
    });
  });

  describe('Auto-executable actions', () => {
    it('should execute auto-executable actions immediately', async () => {
      const input: ExecutionInput = {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: { update: 'data' },
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'artefact',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: true,
        actionType: 'artefact_update',
        held: false,
        details: expect.objectContaining({
          projectId: 'test-project',
          update: 'data',
        }),
      });
    });

    it('should allow heartbeat_log at monitoring level', async () => {
      const input: ExecutionInput = {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: {},
      };

      const config: ExecutionConfig = {
        autonomyLevel: 'monitoring',
        dryRun: false,
      };

      const result = await executeAction(input, config);

      expect(result).toMatchObject({
        success: true,
        held: false,
      });
    });
  });

  describe('Default config values', () => {
    it('should default to monitoring autonomy level', async () => {
      const input: ExecutionInput = {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: {},
      };

      const result = await executeAction(input);

      // Should be rejected at monitoring level
      expect(result).toMatchObject({
        success: false,
        held: false,
      });
    });

    it('should default to live mode (not dry-run)', async () => {
      const input: ExecutionInput = {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: {},
      };

      const result = await executeAction(input);

      // Live mode returns ExecutionResult not DryRunResult
      expect(result).not.toHaveProperty('executed');
      expect(result).toHaveProperty('success');
    });
  });
});

describe('canExecuteImmediately', () => {
  it('should return true for auto-executable actions at correct level', () => {
    expect(canExecuteImmediately('artefact_update', 'artefact')).toBe(true);
    expect(canExecuteImmediately('heartbeat_log', 'monitoring')).toBe(true);
    expect(canExecuteImmediately('notification_internal', 'artefact')).toBe(
      true
    );
  });

  it('should return false for hold-queue actions', () => {
    expect(canExecuteImmediately('email_stakeholder', 'tactical')).toBe(false);
    expect(canExecuteImmediately('jira_status_change', 'tactical')).toBe(false);
  });

  it('should return false for actions requiring approval', () => {
    expect(canExecuteImmediately('email_external', 'tactical')).toBe(false);
    expect(canExecuteImmediately('scope_change', 'tactical')).toBe(false);
  });

  it('should return false for prohibited actions', () => {
    expect(canExecuteImmediately('delete_data' as ActionType, 'tactical')).toBe(
      false
    );
  });

  it('should return false when autonomy level is insufficient', () => {
    expect(canExecuteImmediately('artefact_update', 'monitoring')).toBe(false);
    expect(canExecuteImmediately('jira_comment', 'artefact')).toBe(false);
  });
});

describe('wouldBeHeld', () => {
  it('should return true for hold-queue actions at correct level', () => {
    expect(wouldBeHeld('email_stakeholder', 'tactical')).toBe(true);
    expect(wouldBeHeld('jira_status_change', 'tactical')).toBe(true);
  });

  it('should return false for auto-executable actions', () => {
    expect(wouldBeHeld('artefact_update', 'artefact')).toBe(false);
    expect(wouldBeHeld('heartbeat_log', 'monitoring')).toBe(false);
  });

  it('should return false for actions requiring approval', () => {
    expect(wouldBeHeld('email_external', 'tactical')).toBe(false);
  });

  it('should return false when autonomy level is insufficient', () => {
    expect(wouldBeHeld('email_stakeholder', 'artefact')).toBe(false);
  });
});

describe('wouldRequireApproval', () => {
  it('should return true for actions requiring approval', () => {
    expect(wouldRequireApproval('email_external', 'tactical')).toBe(true);
    expect(wouldRequireApproval('jira_create_ticket', 'tactical')).toBe(true);
    expect(wouldRequireApproval('scope_change', 'tactical')).toBe(true);
    expect(wouldRequireApproval('milestone_change', 'tactical')).toBe(true);
  });

  it('should return false for auto-executable actions', () => {
    expect(wouldRequireApproval('artefact_update', 'artefact')).toBe(false);
    expect(wouldRequireApproval('heartbeat_log', 'monitoring')).toBe(false);
  });

  it('should return false for hold-queue actions', () => {
    expect(wouldRequireApproval('email_stakeholder', 'tactical')).toBe(false);
    expect(wouldRequireApproval('jira_status_change', 'tactical')).toBe(false);
  });
});

describe('executeActions', () => {
  it('should execute multiple actions in sequence', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 1 },
      },
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 2 },
      },
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 3 },
      },
    ];

    const config: ExecutionConfig = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    };

    const results = await executeActions(inputs, config);

    expect(results).toHaveLength(3);
    expect(results.every((r) => 'success' in r && r.success)).toBe(true);
  });

  it('should stop on first failure in live mode', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 1 },
      },
      {
        // This will fail at monitoring level
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: { step: 2 },
      },
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 3 },
      },
    ];

    const config: ExecutionConfig = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    };

    const results = await executeActions(inputs, config);

    expect(results).toHaveLength(2); // Should stop after second action
    expect(results[0]).toMatchObject({ success: true });
    expect(results[1]).toMatchObject({ success: false });
  });

  it('should continue processing all actions in dry-run mode', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 1 },
      },
      {
        actionType: 'delete_data' as ActionType, // Prohibited
        projectId: 'test-project',
        details: { step: 2 },
      },
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: { step: 3 },
      },
    ];

    const config: ExecutionConfig = {
      autonomyLevel: 'monitoring',
      dryRun: true,
    };

    const results = await executeActions(inputs, config);

    // All actions should be processed in dry-run
    expect(results).toHaveLength(3);
  });

  it('should handle empty input array', async () => {
    const results = await executeActions([], {
      autonomyLevel: 'monitoring',
      dryRun: false,
    });

    expect(results).toHaveLength(0);
  });

  it('should handle mixed action types', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: {},
      },
      {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: {},
      },
      {
        actionType: 'notification_internal',
        projectId: 'test-project',
        details: {},
      },
    ];

    const config: ExecutionConfig = {
      autonomyLevel: 'artefact',
      dryRun: false,
    };

    const results = await executeActions(inputs, config);

    expect(results).toHaveLength(3);
    expect(results.every((r) => 'success' in r && r.success)).toBe(true);
  });
});

describe('previewActions', () => {
  it('should return DryRunResults for all actions', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: { field: 'status' },
      },
      {
        actionType: 'email_stakeholder',
        projectId: 'test-project',
        details: { to: 'test@example.com' },
      },
    ];

    const results = await previewActions(inputs, 'tactical');

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.reason === 'dry_run')).toBe(true);
    expect(results.every((r) => r.executed === false)).toBe(true);
  });

  it('should use monitoring level by default', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: {},
      },
    ];

    const results = await previewActions(inputs);

    // artefact_update not allowed at monitoring level
    expect(results[0]?.wouldExecute).toBe(false);
  });

  it('should indicate which actions would execute immediately', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'artefact_update',
        projectId: 'test-project',
        details: {},
      },
      {
        actionType: 'email_stakeholder',
        projectId: 'test-project',
        details: {},
      },
    ];

    const results = await previewActions(inputs, 'tactical');

    expect(results[0]?.wouldExecute).toBe(true); // Auto-executable
    expect(results[1]?.wouldExecute).toBe(false); // Hold queue
  });

  it('should handle empty input array', async () => {
    const results = await previewActions([]);
    expect(results).toHaveLength(0);
  });

  it('should show planned action details', async () => {
    const inputs: ExecutionInput[] = [
      {
        actionType: 'artefact_update',
        projectId: 'test-123',
        details: { field: 'delivery_state', update: 'red' },
      },
    ];

    const results = await previewActions(inputs, 'artefact');

    expect(results[0]?.plannedAction).toMatchObject({
      projectId: 'test-123',
      field: 'delivery_state',
      update: 'red',
    });
  });

  it('should filter out non-dry-run results', async () => {
    // This shouldn't happen in practice, but test the filter
    const inputs: ExecutionInput[] = [
      {
        actionType: 'heartbeat_log',
        projectId: 'test-project',
        details: {},
      },
    ];

    const results = await previewActions(inputs, 'monitoring');

    // All results should be DryRunResult with reason='dry_run'
    expect(results.every((r) => r.reason === 'dry_run')).toBe(true);
  });
});

describe('Integration scenarios', () => {
  it('should handle escalation workflow for monitoring level', async () => {
    const input: ExecutionInput = {
      actionType: 'artefact_update',
      projectId: 'test-project',
      details: { change: 'status update' },
    };

    // At monitoring level, this should be rejected
    const result = await executeAction(input, {
      autonomyLevel: 'monitoring',
      dryRun: false,
    });

    expect(result.success).toBe(false);
    expect(result.held).toBe(false);
  });

  it('should progress action through autonomy levels', async () => {
    const input: ExecutionInput = {
      actionType: 'email_stakeholder',
      projectId: 'test-project',
      details: { to: 'stakeholder@example.com' },
    };

    // Monitoring level - should fail
    const monitoringResult = await executeAction(input, {
      autonomyLevel: 'monitoring',
      dryRun: false,
    });
    expect(monitoringResult.success).toBe(false);

    // Artefact level - should fail
    const artefactResult = await executeAction(input, {
      autonomyLevel: 'artefact',
      dryRun: false,
    });
    expect(artefactResult.success).toBe(false);

    // Tactical level - should be held
    const tacticalResult = await executeAction(input, {
      autonomyLevel: 'tactical',
      dryRun: false,
    });
    expect(tacticalResult.success).toBe(true);
    expect(tacticalResult.held).toBe(true);
  });

  it('should maintain consistency between query functions and executeAction', async () => {
    const actionType = 'email_stakeholder';
    const autonomyLevel: AutonomyLevel = 'tactical';

    const canExecute = canExecuteImmediately(actionType, autonomyLevel);
    const willBeHeld = wouldBeHeld(actionType, autonomyLevel);
    const needsApproval = wouldRequireApproval(actionType, autonomyLevel);

    // email_stakeholder at tactical should be held, not immediately executed
    expect(canExecute).toBe(false);
    expect(willBeHeld).toBe(true);
    expect(needsApproval).toBe(false);

    // Verify execution matches the query functions
    const result = await executeAction(
      {
        actionType,
        projectId: 'test',
        details: {},
      },
      { autonomyLevel, dryRun: false }
    );

    expect(result.success).toBe(true);
    expect(result.held).toBe(willBeHeld);
  });
});
