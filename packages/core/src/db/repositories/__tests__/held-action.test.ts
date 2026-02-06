/**
 * Held Action Repository Tests
 *
 * Tests for held action lifecycle with conditional write race condition handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeldActionRepository } from '../held-action.js';
import type { DynamoDBClient } from '../../client.js';
import { KEY_PREFIX } from '../../../constants.js';
import type { HeldAction, HeldActionStatus } from '../held-action.js';

// Create a mock DynamoDB client
function createMockDbClient(): DynamoDBClient {
  return {
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
    queryGSI1: vi.fn(),
    queryWithExpression: vi.fn(),
  } as unknown as DynamoDBClient;
}

describe('HeldActionRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: HeldActionRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new HeldActionRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should retrieve a held action by ID', async () => {
      const mockAction = {
        PK: `${KEY_PREFIX.PROJECT}project-1`,
        SK: 'HELD#action-1',
        actionId: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        },
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'pending' as HeldActionStatus,
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockAction);

      const result = await repo.getById('project-1', 'action-1');

      expect(result).toEqual({
        id: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        },
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'pending',
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      expect(mockDb.get).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1'
      );
    });

    it('should return null when action does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getById('project-1', 'action-1');

      expect(result).toBeNull();
    });
  });

  describe('getByProject', () => {
    it('should retrieve held actions for a project', async () => {
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:30:00.000Z',
          status: 'pending' as HeldActionStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          actionId: 'action-2',
          projectId: 'project-1',
          actionType: 'jira_status_change',
          payload: {},
          heldUntil: '2024-01-15T11:00:00.000Z',
          status: 'executed' as HeldActionStatus,
          createdAt: '2024-01-15T10:30:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getByProject('project-1');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe('action-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#',
        expect.objectContaining({
          limit: 50,
          ascending: false,
        })
      );
    });

    it('should filter by status', async () => {
      // Mock returns only items matching the filter (server-side FilterExpression)
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:30:00.000Z',
          status: 'pending' as HeldActionStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getByProject('project-1', {
        status: 'pending',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe('pending');
    });
  });

  describe('getPending', () => {
    it('should retrieve all pending held actions', async () => {
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:30:00.000Z',
          status: 'pending' as HeldActionStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          actionId: 'action-2',
          projectId: 'project-2',
          actionType: 'jira_status_change',
          payload: {},
          heldUntil: '2024-01-15T11:00:00.000Z',
          status: 'pending' as HeldActionStatus,
          createdAt: '2024-01-15T10:30:00.000Z',
        },
      ];

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getPending();

      expect(result.items).toHaveLength(2);
      expect(mockDb.queryGSI1).toHaveBeenCalledWith(
        'HELD#PENDING',
        expect.objectContaining({
          limit: 100,
          ascending: true,
        })
      );
    });
  });

  describe('getReady', () => {
    it('should retrieve actions ready to execute', async () => {
      const now = '2024-01-15T10:30:00.000Z';
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:15:00.000Z',
          status: 'pending' as HeldActionStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.queryWithExpression).mockResolvedValueOnce({
        items: mockItems,
      });

      const result = await repo.getReady(now);

      expect(result).toHaveLength(1);
      expect(mockDb.queryWithExpression).toHaveBeenCalledWith(
        'GSI1PK = :pk AND GSI1SK <= :now',
        {
          ':pk': 'HELD#PENDING',
          ':now': now,
        },
        expect.objectContaining({
          indexName: 'GSI1',
          limit: 50,
          ascending: true,
        })
      );
    });

    it('should return empty array when no actions ready', async () => {
      vi.mocked(mockDb.queryWithExpression).mockResolvedValueOnce({
        items: [],
      });

      const result = await repo.getReady('2024-01-15T10:00:00.000Z');

      expect(result).toHaveLength(0);
    });
  });

  describe('countPending', () => {
    it('should count pending held actions', async () => {
      const mockItems = new Array(5).fill({
        actionId: 'action-1',
        projectId: 'project-1',
        status: 'pending',
      });

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.countPending();

      expect(result).toBe(5);
    });
  });

  describe('countPendingByProject', () => {
    it('should count pending actions for a project', async () => {
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          status: 'pending' as HeldActionStatus,
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:30:00.000Z',
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          actionId: 'action-2',
          projectId: 'project-1',
          status: 'pending' as HeldActionStatus,
          actionType: 'jira_status_change',
          payload: {},
          heldUntil: '2024-01-15T11:00:00.000Z',
          createdAt: '2024-01-15T10:30:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.countPendingByProject('project-1');

      expect(result).toBe(2);
    });
  });

  describe('create', () => {
    it('should create a new held action', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const result = await repo.create({
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {
          to: ['test@example.com'],
          subject: 'Test Email',
          bodyText: 'Test body',
        },
        holdMinutes: 30,
      });

      expect(result.projectId).toBe('project-1');
      expect(result.actionType).toBe('email_stakeholder');
      expect(result.status).toBe('pending');
      expect(result.id).toBeDefined();
      expect(result.heldUntil).toBeDefined();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `${KEY_PREFIX.PROJECT}project-1`,
          SK: expect.stringContaining('HELD#'),
          GSI1PK: 'HELD#PENDING',
          actionType: 'email_stakeholder',
          status: 'pending',
        })
      );
    });

    it('should calculate heldUntil correctly', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const beforeCreate = Date.now();
      const result = await repo.create({
        projectId: 'project-1',
        actionType: 'jira_status_change',
        payload: {
          issueKey: 'TEST-1',
          transitionId: '123',
          transitionName: 'In Progress',
          fromStatus: 'To Do',
          toStatus: 'In Progress',
        },
        holdMinutes: 60,
      });
      const afterCreate = Date.now();

      const heldUntilTime = new Date(result.heldUntil).getTime();
      const expectedMin = beforeCreate + 60 * 60 * 1000;
      const expectedMax = afterCreate + 60 * 60 * 1000;

      expect(heldUntilTime).toBeGreaterThanOrEqual(expectedMin);
      expect(heldUntilTime).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('approve', () => {
    it('should approve a held action', async () => {
      const mockAction = {
        actionId: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {},
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'approved' as HeldActionStatus,
        approvedAt: '2024-01-15T10:15:00.000Z',
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockAction);

      const result = await repo.approve('project-1', 'action-1', 'user-1');

      expect(result?.status).toBe('approved');
      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1',
        expect.stringContaining('SET'),
        expect.objectContaining({
          ':status': 'approved',
          ':decidedBy': 'user-1',
          ':gsi1pk': 'HELD#APPROVED',
          ':pendingStatus': 'pending',
        }),
        expect.any(Object),
        'attribute_exists(PK) AND #status = :pendingStatus'
      );
    });

    it('should return null when action is not pending (race condition)', async () => {
      const conditionalCheckError = new Error('ConditionalCheckFailed');
      conditionalCheckError.message = 'ConditionalCheckFailed';
      vi.mocked(mockDb.update).mockRejectedValueOnce(conditionalCheckError);

      const result = await repo.approve('project-1', 'action-1');

      expect(result).toBeNull();
    });

    it('should propagate non-conditional errors', async () => {
      const otherError = new Error('DynamoDB error');
      vi.mocked(mockDb.update).mockRejectedValueOnce(otherError);

      await expect(repo.approve('project-1', 'action-1')).rejects.toThrow(
        'DynamoDB error'
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a held action', async () => {
      const mockAction = {
        actionId: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {},
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'cancelled' as HeldActionStatus,
        cancelledAt: '2024-01-15T10:15:00.000Z',
        cancelReason: 'No longer needed',
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockAction);

      const result = await repo.cancel(
        'project-1',
        'action-1',
        'No longer needed',
        'user-1'
      );

      expect(result?.status).toBe('cancelled');
      expect(result?.cancelReason).toBe('No longer needed');
      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1',
        expect.stringContaining('SET'),
        expect.objectContaining({
          ':status': 'cancelled',
          ':cancelReason': 'No longer needed',
          ':decidedBy': 'user-1',
          ':gsi1pk': 'HELD#CANCELLED',
          ':pendingStatus': 'pending',
        }),
        expect.any(Object),
        'attribute_exists(PK) AND #status = :pendingStatus'
      );
    });

    it('should return null when action is not pending (race condition)', async () => {
      const conditionalCheckError = new Error('ConditionalCheckFailed');
      conditionalCheckError.message = 'ConditionalCheckFailed';
      vi.mocked(mockDb.update).mockRejectedValueOnce(conditionalCheckError);

      const result = await repo.cancel('project-1', 'action-1');

      expect(result).toBeNull();
    });

    it('should handle optional reason and decidedBy', async () => {
      const mockAction = {
        actionId: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {},
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'cancelled' as HeldActionStatus,
        cancelledAt: '2024-01-15T10:15:00.000Z',
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockAction);

      await repo.cancel('project-1', 'action-1');

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':cancelReason': null,
          ':decidedBy': null,
        }),
        expect.any(Object),
        expect.any(String)
      );
    });
  });

  describe('markExecuted', () => {
    it('should mark a held action as executed', async () => {
      const mockAction = {
        actionId: 'action-1',
        projectId: 'project-1',
        actionType: 'email_stakeholder',
        payload: {},
        heldUntil: '2024-01-15T10:30:00.000Z',
        status: 'executed' as HeldActionStatus,
        executedAt: '2024-01-15T10:45:00.000Z',
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockAction);

      const result = await repo.markExecuted('project-1', 'action-1');

      expect(result?.status).toBe('executed');
      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1',
        'SET #status = :status, #executedAt = :executedAt, #gsi1pk = :gsi1pk',
        expect.objectContaining({
          ':status': 'executed',
          ':gsi1pk': 'HELD#EXECUTED',
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status generically', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.updateStatus('project-1', 'action-1', 'cancelled');

      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1',
        'SET #status = :status, #gsi1pk = :gsi1pk',
        expect.objectContaining({
          ':status': 'cancelled',
          ':gsi1pk': 'HELD#CANCELLED',
        }),
        expect.any(Object)
      );
    });
  });

  describe('getRecentlyExecuted', () => {
    it('should retrieve recently executed actions', async () => {
      const mockItems = [
        {
          actionId: 'action-1',
          projectId: 'project-1',
          actionType: 'email_stakeholder',
          payload: {},
          heldUntil: '2024-01-15T10:30:00.000Z',
          status: 'executed' as HeldActionStatus,
          executedAt: '2024-01-15T10:45:00.000Z',
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getRecentlyExecuted();

      expect(result.items).toHaveLength(1);
      expect(mockDb.queryGSI1).toHaveBeenCalledWith(
        'HELD#EXECUTED',
        expect.objectContaining({
          limit: 50,
          ascending: false,
        })
      );
    });
  });
});
