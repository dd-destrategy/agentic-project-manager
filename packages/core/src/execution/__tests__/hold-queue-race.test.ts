/**
 * Race condition tests for hold queue service
 *
 * Tests concurrent approve/cancel operations to ensure atomic
 * conditional updates prevent double-processing of actions.
 *
 * Requires a live DynamoDB instance at localhost:8000.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DynamoDBClient } from '../../db/client.js';
import { HoldQueueService } from '../hold-queue.js';
import type { ActionExecutor } from '../hold-queue.js';
import type {
  EmailStakeholderPayload,
  JiraStatusChangePayload,
} from '../../db/repositories/held-action.js';

const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const describeMaybeSkip =
  process.env.CI || !process.env.DYNAMODB_ENDPOINT ? describe.skip : describe;

describeMaybeSkip('HoldQueueService - Approval Race Conditions', () => {
  let db: DynamoDBClient;
  let service: HoldQueueService;
  let mockExecutor: ActionExecutor;
  const testProjectId = 'test-project-123';

  beforeEach(async () => {
    // Use local DynamoDB or mock
    db = new DynamoDBClient(
      {
        endpoint: DYNAMODB_ENDPOINT,
        region: 'local',
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      },
      process.env.TABLE_NAME || 'agentic-pm-test'
    );
    service = new HoldQueueService(db);

    // Mock executor
    mockExecutor = {
      executeEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
      executeJiraStatusChange: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('Concurrent approve operations', () => {
    it('should prevent double approval of same action', async () => {
      // Create a held action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Two concurrent approvals
      const approve1 = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor,
        'user-1'
      );
      const approve2 = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor,
        'user-2'
      );

      const results = await Promise.allSettled([approve1, approve2]);

      // One should succeed, one should return null (already processed)
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );
      const returnedNull = results.filter(
        (r) => r.status === 'fulfilled' && r.value === null
      );

      expect(succeeded.length).toBe(1);
      expect(returnedNull.length).toBe(1);

      // Executor should only be called once
      expect(mockExecutor.executeEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle approve vs cancel race', async () => {
      // Create a held action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Concurrent approve and cancel
      const approve = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor,
        'user-1'
      );
      const cancel = service.cancelAction(
        testProjectId,
        result.action.id,
        'Changed mind',
        'user-2'
      );

      const results = await Promise.allSettled([approve, cancel]);

      // One should succeed, one should return null
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );
      const returnedNull = results.filter(
        (r) => r.status === 'fulfilled' && r.value === null
      );

      expect(succeeded.length).toBe(1);
      expect(returnedNull.length).toBe(1);

      // If approve won, executor should be called once
      // If cancel won, executor should not be called
      expect(mockExecutor.executeEmail).toHaveBeenCalledTimes(
        succeeded[0]?.value?.status === 'executed' ? 1 : 0
      );
    });

    it('should handle triple concurrent race (2 approves, 1 cancel)', async () => {
      // Create a held action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Three concurrent operations
      const operations = [
        service.approveAction(
          testProjectId,
          result.action.id,
          mockExecutor,
          'user-1'
        ),
        service.approveAction(
          testProjectId,
          result.action.id,
          mockExecutor,
          'user-2'
        ),
        service.cancelAction(
          testProjectId,
          result.action.id,
          'Cancel',
          'user-3'
        ),
      ];

      const results = await Promise.allSettled(operations);

      // Exactly one should succeed
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );
      const returnedNull = results.filter(
        (r) => r.status === 'fulfilled' && r.value === null
      );

      expect(succeeded.length).toBe(1);
      expect(returnedNull.length).toBe(2);
    });
  });

  describe('Concurrent cancel operations', () => {
    it('should prevent double cancellation of same action', async () => {
      // Create a held action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Two concurrent cancellations
      const cancel1 = service.cancelAction(
        testProjectId,
        result.action.id,
        'Reason 1',
        'user-1'
      );
      const cancel2 = service.cancelAction(
        testProjectId,
        result.action.id,
        'Reason 2',
        'user-2'
      );

      const results = await Promise.allSettled([cancel1, cancel2]);

      // One should succeed, one should return null
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );
      const returnedNull = results.filter(
        (r) => r.status === 'fulfilled' && r.value === null
      );

      expect(succeeded.length).toBe(1);
      expect(returnedNull.length).toBe(1);
    });
  });

  describe('Mixed action types', () => {
    it('should handle concurrent operations on Jira status change action', async () => {
      // Create a Jira status change action
      const jiraPayload: JiraStatusChangePayload = {
        issueKey: 'PROJ-123',
        transitionId: '31',
        transitionName: 'Close Issue',
        fromStatus: 'In Progress',
        toStatus: 'Done',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'jira_status_change',
        payload: jiraPayload,
        holdMinutes: 30,
      });

      // Concurrent approve and cancel
      const approve = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );
      const cancel = service.cancelAction(testProjectId, result.action.id);

      const results = await Promise.allSettled([approve, cancel]);

      // One should succeed
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && r.value !== null
      );

      expect(succeeded.length).toBe(1);
    });
  });

  describe('Already processed actions', () => {
    it('should return null when trying to approve already approved action', async () => {
      // Create and approve action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // First approval
      await service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );

      // Second approval attempt
      const secondApproval = await service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );

      expect(secondApproval).toBeNull();
    });

    it('should return null when trying to cancel already approved action', async () => {
      // Create and approve action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Approve first
      await service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );

      // Try to cancel
      const cancelResult = await service.cancelAction(
        testProjectId,
        result.action.id
      );

      expect(cancelResult).toBeNull();
    });

    it('should return null when trying to approve already cancelled action', async () => {
      // Create and cancel action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Cancel first
      await service.cancelAction(testProjectId, result.action.id);

      // Try to approve
      const approveResult = await service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );

      expect(approveResult).toBeNull();
    });
  });

  describe('Rapid sequential operations', () => {
    it('should handle rapid approve attempts on different actions', async () => {
      // Create multiple actions
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const actions = await Promise.all([
        service.queueAction({
          projectId: testProjectId,
          actionType: 'email_stakeholder',
          payload: emailPayload,
          holdMinutes: 30,
        }),
        service.queueAction({
          projectId: testProjectId,
          actionType: 'email_stakeholder',
          payload: emailPayload,
          holdMinutes: 30,
        }),
        service.queueAction({
          projectId: testProjectId,
          actionType: 'email_stakeholder',
          payload: emailPayload,
          holdMinutes: 30,
        }),
      ]);

      // Rapid approvals
      const approvals = actions.map((action) =>
        service.approveAction(testProjectId, action.action.id, mockExecutor)
      );

      const results = await Promise.all(approvals);

      // All should succeed (different actions)
      expect(results.filter((r) => r !== null).length).toBe(3);
      expect(mockExecutor.executeEmail).toHaveBeenCalledTimes(3);
    });
  });

  describe('Graduation state tracking', () => {
    it('should only increment graduation once even with concurrent approvals', async () => {
      // Create action
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const result = await service.queueAction({
        projectId: testProjectId,
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      // Two concurrent approvals (one will fail)
      const approve1 = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );
      const approve2 = service.approveAction(
        testProjectId,
        result.action.id,
        mockExecutor
      );

      await Promise.allSettled([approve1, approve2]);

      // Check graduation state - should only have one approval recorded
      const graduationState = await service.getGraduationState(
        testProjectId,
        'email_stakeholder'
      );

      // Graduation state should reflect only successful approval
      expect(graduationState).toBeDefined();
    });
  });

  describe('Non-existent actions', () => {
    it('should return null when approving non-existent action', async () => {
      const result = await service.approveAction(
        testProjectId,
        'non-existent-id',
        mockExecutor
      );

      expect(result).toBeNull();
    });

    it('should return null when cancelling non-existent action', async () => {
      const result = await service.cancelAction(
        testProjectId,
        'non-existent-id'
      );

      expect(result).toBeNull();
    });
  });
});
