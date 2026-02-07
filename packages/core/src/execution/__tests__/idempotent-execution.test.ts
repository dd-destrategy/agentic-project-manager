/**
 * Idempotent Execution Tests
 *
 * Tests for atomic claim-for-execution, duplicate prevention,
 * and stuck-executing detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeldActionRepository } from '../../db/repositories/held-action.js';
import type { HeldAction, HeldActionStatus } from '../../db/repositories/held-action.js';
import type { DynamoDBClient } from '../../db/client.js';
import { KEY_PREFIX } from '../../constants.js';

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

describe('Idempotent Execution', () => {
  let mockDb: DynamoDBClient;
  let repo: HeldActionRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new HeldActionRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('claimForExecution', () => {
    it('should return true on first claim of a pending action', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      const result = await repo.claimForExecution('project-1', 'action-1');

      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'HELD#action-1',
        'SET #status = :executing, #claimedAt = :now, #gsi1pk = :gsi1pk',
        expect.objectContaining({
          ':executing': 'executing',
          ':pending': 'pending',
          ':approved': 'approved',
          ':gsi1pk': 'HELD#EXECUTING',
        }),
        expect.objectContaining({
          '#status': 'status',
          '#claimedAt': 'claimedAt',
          '#gsi1pk': 'GSI1PK',
        }),
        'attribute_exists(PK) AND (#status = :pending OR #status = :approved)'
      );
    });

    it('should return false if action was already claimed by another invocation', async () => {
      const error = new Error('ConditionalCheckFailed: The conditional request failed');
      vi.mocked(mockDb.update).mockRejectedValueOnce(error);

      const result = await repo.claimForExecution('project-1', 'action-1');

      expect(result).toBe(false);
    });

    it('should return false if action is already in executed status', async () => {
      const error = new Error('ConditionalCheckFailed: The conditional request failed');
      vi.mocked(mockDb.update).mockRejectedValueOnce(error);

      const result = await repo.claimForExecution('project-1', 'action-1');

      expect(result).toBe(false);
    });

    it('should return false if action is already in executing status', async () => {
      const error = new Error('ConditionalCheckFailed: status is executing');
      vi.mocked(mockDb.update).mockRejectedValueOnce(error);

      const result = await repo.claimForExecution('project-1', 'action-1');

      expect(result).toBe(false);
    });

    it('should rethrow non-conditional-check errors', async () => {
      const error = new Error('InternalServerError: DynamoDB unavailable');
      vi.mocked(mockDb.update).mockRejectedValueOnce(error);

      await expect(
        repo.claimForExecution('project-1', 'action-1')
      ).rejects.toThrow('InternalServerError');
    });

    it('should set claimedAt timestamp when claiming', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.claimForExecution('project-1', 'action-1');

      const updateCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const expressionAttributeValues = updateCall[3] as Record<string, unknown>;
      const claimedAt = expressionAttributeValues[':now'] as string;

      // Verify it is a valid ISO timestamp
      expect(new Date(claimedAt).toISOString()).toBe(claimedAt);
    });

    it('should update GSI1PK to HELD#EXECUTING', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.claimForExecution('project-1', 'action-1');

      const updateCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const expressionAttributeValues = updateCall[3] as Record<string, unknown>;

      expect(expressionAttributeValues[':gsi1pk']).toBe('HELD#EXECUTING');
    });
  });

  describe('getStuckExecuting', () => {
    it('should return actions stuck beyond the threshold', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({
        items: [
          {
            PK: `${KEY_PREFIX.PROJECT}project-1`,
            SK: 'HELD#action-1',
            GSI1PK: 'HELD#EXECUTING',
            GSI1SK: '2024-01-15T10:00:00.000Z',
            actionId: 'action-1',
            projectId: 'project-1',
            actionType: 'email_stakeholder',
            payload: {
              to: ['test@example.com'],
              subject: 'Test',
              bodyText: 'Test body',
            },
            heldUntil: '2024-01-15T10:30:00.000Z',
            status: 'executing' as HeldActionStatus,
            createdAt: '2024-01-15T10:00:00.000Z',
            claimedAt: tenMinutesAgo,
          },
        ],
      });

      const stuck = await repo.getStuckExecuting(5);

      expect(stuck).toHaveLength(1);
      expect(stuck[0]!.id).toBe('action-1');
      expect(stuck[0]!.status).toBe('executing');
      expect(stuck[0]!.claimedAt).toBe(tenMinutesAgo);
    });

    it('should not return actions that were recently claimed', async () => {
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({
        items: [
          {
            PK: `${KEY_PREFIX.PROJECT}project-1`,
            SK: 'HELD#action-2',
            GSI1PK: 'HELD#EXECUTING',
            GSI1SK: '2024-01-15T10:00:00.000Z',
            actionId: 'action-2',
            projectId: 'project-1',
            actionType: 'email_stakeholder',
            payload: {
              to: ['test@example.com'],
              subject: 'Test',
              bodyText: 'Test body',
            },
            heldUntil: '2024-01-15T10:30:00.000Z',
            status: 'executing' as HeldActionStatus,
            createdAt: '2024-01-15T10:00:00.000Z',
            claimedAt: oneMinuteAgo,
          },
        ],
      });

      const stuck = await repo.getStuckExecuting(5);

      expect(stuck).toHaveLength(0);
    });

    it('should use default threshold of 5 minutes', async () => {
      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: [] });

      await repo.getStuckExecuting();

      expect(mockDb.queryGSI1).toHaveBeenCalledWith('HELD#EXECUTING', {
        limit: 100,
        ascending: true,
      });
    });

    it('should filter out actions without claimedAt', async () => {
      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({
        items: [
          {
            PK: `${KEY_PREFIX.PROJECT}project-1`,
            SK: 'HELD#action-3',
            GSI1PK: 'HELD#EXECUTING',
            GSI1SK: '2024-01-15T10:00:00.000Z',
            actionId: 'action-3',
            projectId: 'project-1',
            actionType: 'jira_status_change',
            payload: {
              issueKey: 'TEST-1',
              transitionId: '1',
              transitionName: 'In Progress',
              fromStatus: 'Open',
              toStatus: 'In Progress',
            },
            heldUntil: '2024-01-15T10:30:00.000Z',
            status: 'executing' as HeldActionStatus,
            createdAt: '2024-01-15T10:00:00.000Z',
            // No claimedAt — should be filtered out
          },
        ],
      });

      const stuck = await repo.getStuckExecuting(5);

      expect(stuck).toHaveLength(0);
    });

    it('should accept custom threshold minutes', async () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({
        items: [
          {
            PK: `${KEY_PREFIX.PROJECT}project-1`,
            SK: 'HELD#action-4',
            GSI1PK: 'HELD#EXECUTING',
            GSI1SK: '2024-01-15T10:00:00.000Z',
            actionId: 'action-4',
            projectId: 'project-1',
            actionType: 'email_stakeholder',
            payload: {
              to: ['test@example.com'],
              subject: 'Test',
              bodyText: 'Test body',
            },
            heldUntil: '2024-01-15T10:30:00.000Z',
            status: 'executing' as HeldActionStatus,
            createdAt: '2024-01-15T10:00:00.000Z',
            claimedAt: threeMinutesAgo,
          },
        ],
      });

      // With 2-minute threshold, a 3-minute-old action is stuck
      const stuck = await repo.getStuckExecuting(2);
      expect(stuck).toHaveLength(1);
    });
  });
});
