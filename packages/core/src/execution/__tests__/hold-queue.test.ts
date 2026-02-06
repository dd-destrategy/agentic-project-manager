/**
 * Unit tests for hold queue service
 *
 * Tests hold queue processing, graduation-aware hold times,
 * action approval/cancellation, and utility functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HoldQueueService,
  formatHoldTime,
  getTimeRemaining,
  getDefaultHoldTime,
  createHoldQueueService,
} from '../hold-queue.js';
import type { ActionExecutor, QueueActionResult } from '../hold-queue.js';
import type { DynamoDBClient } from '../../db/client.js';
import type {
  HeldAction,
  EmailStakeholderPayload,
  JiraStatusChangePayload,
  HeldActionType,
} from '../../db/repositories/held-action.js';

// Mock repositories
vi.mock('../../db/repositories/held-action.js', () => ({
  HeldActionRepository: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.getById = vi.fn();
    this.getReady = vi.fn();
    this.markExecuted = vi.fn();
    this.approve = vi.fn();
    this.cancel = vi.fn();
    this.getByProject = vi.fn();
    this.getPending = vi.fn();
  }),
}));

vi.mock('../../db/repositories/graduation-state.js', () => ({
  GraduationStateRepository: vi.fn(function (this: any) {
    this.getHoldTime = vi.fn();
    this.getOrCreate = vi.fn();
    this.recordApproval = vi.fn();
    this.recordCancellation = vi.fn();
    this.getByProject = vi.fn();
  }),
  DEFAULT_HOLD_TIMES: {
    email_stakeholder: 30,
    jira_status_change: 15,
  },
}));

vi.mock('../../db/repositories/event.js', () => ({
  EventRepository: vi.fn(function (this: any) {
    this.create = vi.fn();
  }),
}));

describe('HoldQueueService', () => {
  let service: HoldQueueService;
  let mockDb: DynamoDBClient;
  let mockExecutor: ActionExecutor;
  let mockHeldActionRepo: any;
  let mockGraduationRepo: any;
  let mockEventRepo: any;

  beforeEach(() => {
    mockDb = {} as DynamoDBClient;
    service = new HoldQueueService(mockDb);

    // Get the mocked repository instances
    mockHeldActionRepo = (service as any).heldActionRepo;
    mockGraduationRepo = (service as any).graduationRepo;
    mockEventRepo = (service as any).eventRepo;

    // Mock executor
    mockExecutor = {
      executeEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
      executeJiraStatusChange: vi.fn().mockResolvedValue(undefined),
    };

    // Default mock implementations
    mockGraduationRepo.getHoldTime.mockResolvedValue(30);
    mockGraduationRepo.getOrCreate.mockResolvedValue({
      projectId: 'test-project',
      actionType: 'email_stakeholder',
      tier: 1,
      consecutiveApprovals: 2,
      lastApprovedAt: new Date().toISOString(),
    });
    mockEventRepo.create.mockResolvedValue({});
  });

  describe('queueAction', () => {
    it('should queue an action with graduation-aware hold time', async () => {
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test email',
      };

      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: emailPayload,
        status: 'pending',
        heldUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.create.mockResolvedValue(mockAction);
      mockGraduationRepo.getHoldTime.mockResolvedValue(30);

      const result = await service.queueAction({
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: emailPayload,
        holdMinutes: 30,
      });

      expect(result.action).toEqual(mockAction);
      expect(result.holdMinutes).toBe(30);
      expect(result.graduationTier).toBe(1);

      expect(mockGraduationRepo.getHoldTime).toHaveBeenCalledWith(
        'test-project',
        'email_stakeholder'
      );
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'action_held',
          projectId: 'test-project',
        })
      );
    });

    it('should use minimum 1 minute for tier 3 (immediate) actions', async () => {
      mockGraduationRepo.getHoldTime.mockResolvedValue(0);
      mockGraduationRepo.getOrCreate.mockResolvedValue({
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        tier: 3,
        consecutiveApprovals: 5,
      });

      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'pending',
        heldUntil: new Date(Date.now() + 1 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.create.mockResolvedValue(mockAction);

      const result = await service.queueAction({
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        holdMinutes: 0,
      });

      expect(result.holdMinutes).toBe(1);
      expect(mockHeldActionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          holdMinutes: 1,
        })
      );
    });

    it('should log action_held event with context', async () => {
      const mockAction: HeldAction = {
        id: 'action-456',
        projectId: 'test-project',
        actionType: 'jira_status_change',
        payload: {},
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.create.mockResolvedValue(mockAction);
      mockGraduationRepo.getHoldTime.mockResolvedValue(15);

      await service.queueAction({
        projectId: 'test-project',
        actionType: 'jira_status_change',
        payload: {},
        holdMinutes: 15,
      });

      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'action_held',
          severity: 'info',
          detail: expect.objectContaining({
            relatedIds: { actionId: 'action-456' },
            context: expect.objectContaining({
              actionType: 'jira_status_change',
              holdMinutes: 15,
            }),
          }),
        })
      );
    });
  });

  describe('processQueue', () => {
    it('should execute all ready actions', async () => {
      const now = new Date().toISOString();
      const readyActions: HeldAction[] = [
        {
          id: 'action-1',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {
            to: ['user1@example.com'],
            subject: 'Test 1',
            bodyText: 'Body 1',
          },
          status: 'pending',
          heldUntil: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'action-2',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {
            to: ['user2@example.com'],
            subject: 'Test 2',
            bodyText: 'Body 2',
          },
          status: 'pending',
          heldUntil: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getReady.mockResolvedValue(readyActions);

      const result = await service.processQueue(mockExecutor);

      expect(result.processed).toBe(2);
      expect(result.executed).toBe(2);
      expect(result.errors).toHaveLength(0);

      expect(mockExecutor.executeEmail).toHaveBeenCalledTimes(2);
      expect(mockHeldActionRepo.markExecuted).toHaveBeenCalledTimes(2);
      expect(mockGraduationRepo.recordApproval).toHaveBeenCalledTimes(2);
    });

    it('should handle execution errors gracefully', async () => {
      const readyActions: HeldAction[] = [
        {
          id: 'action-1',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            bodyText: 'Body',
          },
          status: 'pending',
          heldUntil: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getReady.mockResolvedValue(readyActions);
      mockExecutor.executeEmail.mockRejectedValue(
        new Error('Email send failed')
      );

      const result = await service.processQueue(mockExecutor);

      expect(result.processed).toBe(1);
      expect(result.executed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        actionId: 'action-1',
        error: 'Email send failed',
      });

      // Error event should be logged
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'error',
          severity: 'error',
        })
      );
    });

    it('should handle Jira status change actions', async () => {
      const jiraPayload: JiraStatusChangePayload = {
        issueKey: 'PROJ-123',
        transitionId: '31',
        transitionName: 'Done',
        fromStatus: 'In Progress',
        toStatus: 'Done',
      };

      const readyActions: HeldAction[] = [
        {
          id: 'action-jira',
          projectId: 'test-project',
          actionType: 'jira_status_change',
          payload: jiraPayload,
          status: 'pending',
          heldUntil: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getReady.mockResolvedValue(readyActions);

      const result = await service.processQueue(mockExecutor);

      expect(result.executed).toBe(1);
      expect(mockExecutor.executeJiraStatusChange).toHaveBeenCalledWith(
        jiraPayload
      );
      expect(mockGraduationRepo.recordApproval).toHaveBeenCalledWith(
        'test-project',
        'jira_status_change'
      );
    });

    it('should return empty result when no actions ready', async () => {
      mockHeldActionRepo.getReady.mockResolvedValue([]);

      const result = await service.processQueue(mockExecutor);

      expect(result.processed).toBe(0);
      expect(result.executed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should continue processing after individual failures', async () => {
      const readyActions: HeldAction[] = [
        {
          id: 'action-1',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {
            to: ['test1@example.com'],
            subject: 'Test 1',
            bodyText: 'Body',
          },
          status: 'pending',
          heldUntil: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'action-2',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {
            to: ['test2@example.com'],
            subject: 'Test 2',
            bodyText: 'Body',
          },
          status: 'pending',
          heldUntil: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getReady.mockResolvedValue(readyActions);

      // First succeeds, second fails
      mockExecutor.executeEmail
        .mockResolvedValueOnce({ messageId: 'msg-1' })
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await service.processQueue(mockExecutor);

      expect(result.processed).toBe(2);
      expect(result.executed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('approveAction', () => {
    it('should approve and execute action immediately', async () => {
      const emailPayload: EmailStakeholderPayload = {
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Body',
      };

      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: emailPayload,
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const approvedAction: HeldAction = {
        ...mockAction,
        status: 'approved',
        decidedBy: 'user-1',
        decidedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.approve.mockResolvedValue(approvedAction);
      mockHeldActionRepo.getById
        .mockResolvedValueOnce(mockAction)
        .mockResolvedValueOnce({
          ...approvedAction,
          status: 'executed',
        });

      const result = await service.approveAction(
        'test-project',
        'action-123',
        mockExecutor,
        'user-1'
      );

      expect(result).toBeDefined();
      expect(mockHeldActionRepo.approve).toHaveBeenCalledWith(
        'test-project',
        'action-123',
        'user-1'
      );
      expect(mockExecutor.executeEmail).toHaveBeenCalledWith(emailPayload);
      expect(mockHeldActionRepo.markExecuted).toHaveBeenCalled();
      expect(mockGraduationRepo.recordApproval).toHaveBeenCalled();
    });

    it('should return null for non-existent action', async () => {
      mockHeldActionRepo.getById.mockResolvedValue(null);

      const result = await service.approveAction(
        'test-project',
        'non-existent',
        mockExecutor
      );

      expect(result).toBeNull();
      expect(mockExecutor.executeEmail).not.toHaveBeenCalled();
    });

    it('should return null if action already processed', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'executed', // Already processed
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);

      const result = await service.approveAction(
        'test-project',
        'action-123',
        mockExecutor
      );

      expect(result).toBeNull();
      expect(mockExecutor.executeEmail).not.toHaveBeenCalled();
    });

    it('should handle race condition via atomic approve', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.approve.mockResolvedValue(null); // Race condition detected

      const result = await service.approveAction(
        'test-project',
        'action-123',
        mockExecutor
      );

      expect(result).toBeNull();
      expect(mockExecutor.executeEmail).not.toHaveBeenCalled();
    });

    it('should log error and throw if execution fails', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Body',
        },
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const approvedAction: HeldAction = { ...mockAction, status: 'approved' };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.approve.mockResolvedValue(approvedAction);
      mockExecutor.executeEmail.mockRejectedValue(
        new Error('Execution failed')
      );

      await expect(
        service.approveAction('test-project', 'action-123', mockExecutor)
      ).rejects.toThrow('Execution failed');

      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'error',
          severity: 'error',
        })
      );
    });
  });

  describe('cancelAction', () => {
    it('should cancel a pending action', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cancelledAction: HeldAction = {
        ...mockAction,
        status: 'cancelled',
        cancelReason: 'User requested',
        decidedBy: 'user-1',
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.cancel.mockResolvedValue(cancelledAction);

      const result = await service.cancelAction(
        'test-project',
        'action-123',
        'User requested',
        'user-1'
      );

      expect(result).toEqual(cancelledAction);
      expect(mockHeldActionRepo.cancel).toHaveBeenCalledWith(
        'test-project',
        'action-123',
        'User requested',
        'user-1'
      );
      expect(mockGraduationRepo.recordCancellation).toHaveBeenCalledWith(
        'test-project',
        'email_stakeholder'
      );
    });

    it('should return null for non-existent action', async () => {
      mockHeldActionRepo.getById.mockResolvedValue(null);

      const result = await service.cancelAction('test-project', 'non-existent');

      expect(result).toBeNull();
    });

    it('should return null if action already processed', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'executed',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);

      const result = await service.cancelAction('test-project', 'action-123');

      expect(result).toBeNull();
    });

    it('should handle race condition via atomic cancel', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'email_stakeholder',
        payload: {},
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.cancel.mockResolvedValue(null); // Race condition

      const result = await service.cancelAction('test-project', 'action-123');

      expect(result).toBeNull();
      expect(mockGraduationRepo.recordCancellation).not.toHaveBeenCalled();
    });

    it('should log action_rejected event', async () => {
      const mockAction: HeldAction = {
        id: 'action-123',
        projectId: 'test-project',
        actionType: 'jira_status_change',
        payload: {},
        status: 'pending',
        heldUntil: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockHeldActionRepo.getById.mockResolvedValue(mockAction);
      mockHeldActionRepo.cancel.mockResolvedValue({
        ...mockAction,
        status: 'cancelled',
      });

      await service.cancelAction(
        'test-project',
        'action-123',
        'Not needed',
        'user-1'
      );

      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'action_rejected',
          detail: expect.objectContaining({
            context: expect.objectContaining({
              reason: 'Not needed',
              decidedBy: 'user-1',
            }),
          }),
        })
      );
    });
  });

  describe('getPendingActions', () => {
    it('should return pending actions for a project', async () => {
      const mockActions: HeldAction[] = [
        {
          id: 'action-1',
          projectId: 'test-project',
          actionType: 'email_stakeholder',
          payload: {},
          status: 'pending',
          heldUntil: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getByProject.mockResolvedValue({ items: mockActions });

      const result = await service.getPendingActions('test-project');

      expect(result).toEqual(mockActions);
      expect(mockHeldActionRepo.getByProject).toHaveBeenCalledWith(
        'test-project',
        {
          status: 'pending',
          limit: 50,
        }
      );
    });
  });

  describe('getAllPendingActions', () => {
    it('should return all pending actions across projects', async () => {
      const mockActions: HeldAction[] = [
        {
          id: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          status: 'pending',
          heldUntil: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'action-2',
          projectId: 'project-2',
          actionType: 'jira_status_change',
          payload: {},
          status: 'pending',
          heldUntil: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockHeldActionRepo.getPending.mockResolvedValue({ items: mockActions });

      const result = await service.getAllPendingActions();

      expect(result).toEqual(mockActions);
      expect(mockHeldActionRepo.getPending).toHaveBeenCalledWith({
        limit: 100,
      });
    });
  });

  describe('getGraduationState', () => {
    it('should return graduation state for action type', async () => {
      const mockState = {
        projectId: 'test-project',
        actionType: 'email_stakeholder' as HeldActionType,
        tier: 2,
        consecutiveApprovals: 3,
      };

      mockGraduationRepo.getOrCreate.mockResolvedValue(mockState);

      const result = await service.getGraduationState(
        'test-project',
        'email_stakeholder'
      );

      expect(result).toEqual(mockState);
    });
  });

  describe('getProjectGraduationStates', () => {
    it('should return all graduation states for a project', async () => {
      const mockStates = [
        {
          projectId: 'test-project',
          actionType: 'email_stakeholder' as HeldActionType,
          tier: 1,
          consecutiveApprovals: 2,
        },
        {
          projectId: 'test-project',
          actionType: 'jira_status_change' as HeldActionType,
          tier: 3,
          consecutiveApprovals: 5,
        },
      ];

      mockGraduationRepo.getByProject.mockResolvedValue(mockStates);

      const result = await service.getProjectGraduationStates('test-project');

      expect(result).toEqual(mockStates);
    });
  });
});

describe('Utility functions', () => {
  describe('formatHoldTime', () => {
    it('should format immediate as "Immediate"', () => {
      expect(formatHoldTime(0)).toBe('Immediate');
    });

    it('should format minutes correctly', () => {
      expect(formatHoldTime(1)).toBe('1 minute');
      expect(formatHoldTime(5)).toBe('5 minutes');
      expect(formatHoldTime(30)).toBe('30 minutes');
    });

    it('should format hours correctly', () => {
      expect(formatHoldTime(60)).toBe('1 hour');
      expect(formatHoldTime(120)).toBe('2 hours');
      expect(formatHoldTime(180)).toBe('3 hours');
    });

    it('should format hours and minutes', () => {
      expect(formatHoldTime(90)).toBe('1h 30m');
      expect(formatHoldTime(150)).toBe('2h 30m');
      expect(formatHoldTime(65)).toBe('1h 5m');
    });
  });

  describe('getTimeRemaining', () => {
    it('should calculate remaining time correctly', () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const result = getTimeRemaining(futureTime);

      expect(result.minutes).toBeGreaterThanOrEqual(4);
      expect(result.minutes).toBeLessThanOrEqual(5);
      expect(result.expired).toBe(false);
    });

    it('should return expired for past times', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const result = getTimeRemaining(pastTime);

      expect(result.minutes).toBe(0);
      expect(result.seconds).toBe(0);
      expect(result.expired).toBe(true);
    });

    it('should handle seconds correctly', () => {
      const futureTime = new Date(Date.now() + 90 * 1000).toISOString(); // 90 seconds
      const result = getTimeRemaining(futureTime);

      expect(result.minutes).toBe(1);
      expect(result.seconds).toBeGreaterThanOrEqual(29);
      expect(result.seconds).toBeLessThanOrEqual(30);
    });

    it('should handle exactly now', () => {
      const now = new Date().toISOString();
      const result = getTimeRemaining(now);

      expect(result.expired).toBe(true);
    });
  });

  describe('getDefaultHoldTime', () => {
    it('should return correct default for email_stakeholder', () => {
      expect(getDefaultHoldTime('email_stakeholder')).toBe(30);
    });

    it('should return correct default for jira_status_change', () => {
      expect(getDefaultHoldTime('jira_status_change')).toBe(15);
    });
  });

  describe('createHoldQueueService', () => {
    it('should create a HoldQueueService instance', () => {
      const mockDb = {} as DynamoDBClient;
      const service = createHoldQueueService(mockDb);

      expect(service).toBeInstanceOf(HoldQueueService);
    });
  });
});
