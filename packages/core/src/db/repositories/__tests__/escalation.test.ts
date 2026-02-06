/**
 * Escalation Repository Tests
 *
 * Tests for escalation lifecycle management and querying.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscalationRepository } from '../escalation.js';
import type { DynamoDBClient } from '../../client.js';
import { KEY_PREFIX, GSI1_PREFIX } from '../../../constants.js';
import type { Escalation, EscalationStatus } from '../../../types/index.js';

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
  } as unknown as DynamoDBClient;
}

describe('EscalationRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: EscalationRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new EscalationRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should retrieve an escalation by ID', async () => {
      const mockEscalation = {
        PK: `${KEY_PREFIX.PROJECT}project-1`,
        SK: `${KEY_PREFIX.ESCALATION}esc-1`,
        escalationId: 'esc-1',
        projectId: 'project-1',
        title: 'Test Escalation',
        context: { situation: 'Test' },
        options: [{ id: '1', label: 'Option 1' }],
        status: 'pending' as EscalationStatus,
        createdAt: '2024-01-15T10:00:00.000Z',
        expiresAt: '2024-01-22T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockEscalation);

      const result = await repo.getById('project-1', 'esc-1');

      expect(result).toEqual({
        id: 'esc-1',
        projectId: 'project-1',
        title: 'Test Escalation',
        context: { situation: 'Test' },
        options: [{ id: '1', label: 'Option 1' }],
        status: 'pending',
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      expect(mockDb.get).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.ESCALATION}esc-1`
      );
    });

    it('should return null when escalation does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getById('project-1', 'esc-1');

      expect(result).toBeNull();
    });
  });

  describe('getByProject', () => {
    it('should retrieve escalations for a project', async () => {
      const mockItems = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Escalation 1',
          context: { situation: 'Test' },
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          escalationId: 'esc-2',
          projectId: 'project-1',
          title: 'Escalation 2',
          context: { situation: 'Test' },
          options: [],
          status: 'decided' as EscalationStatus,
          createdAt: '2024-01-14T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getByProject('project-1');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe('esc-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        KEY_PREFIX.ESCALATION,
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
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Escalation 1',
          context: { situation: 'Test' },
          options: [],
          status: 'pending' as EscalationStatus,
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
    it('should retrieve all pending escalations', async () => {
      const mockItems = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Escalation 1',
          context: { situation: 'Test' },
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          escalationId: 'esc-2',
          projectId: 'project-2',
          title: 'Escalation 2',
          context: { situation: 'Test' },
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-14T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getPending();

      expect(result.items).toHaveLength(2);
      expect(mockDb.queryGSI1).toHaveBeenCalledWith(
        GSI1_PREFIX.ESCALATION_PENDING,
        expect.objectContaining({
          limit: 50,
          ascending: false,
        })
      );
    });

    it('should handle pagination', async () => {
      const mockItems = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Escalation 1',
          context: { situation: 'Test' },
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      const lastKey = { PK: 'test', SK: 'test' };

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({
        items: mockItems,
        lastKey,
      });

      const result = await repo.getPending();

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('countPending', () => {
    it('should count pending escalations', async () => {
      const mockItems = new Array(15).fill({
        escalationId: 'esc-1',
        projectId: 'project-1',
        status: 'pending',
      });

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.countPending();

      expect(result).toBe(15);
    });
  });

  describe('countPendingByProject', () => {
    it('should count pending escalations for a project', async () => {
      // Mock returns only pending items (server-side FilterExpression filters out decided)
      const mockItems = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          status: 'pending' as EscalationStatus,
          context: {},
          options: [],
          createdAt: '2024-01-15T10:00:00.000Z',
        },
        {
          escalationId: 'esc-2',
          projectId: 'project-1',
          status: 'pending' as EscalationStatus,
          context: {},
          options: [],
          createdAt: '2024-01-14T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.countPendingByProject('project-1');

      expect(result).toBe(2);
    });
  });

  describe('create', () => {
    it('should create a new escalation', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const result = await repo.create({
        projectId: 'project-1',
        title: 'Test Escalation',
        context: { situation: 'Test situation' },
        options: [
          { id: '1', label: 'Option 1' },
          { id: '2', label: 'Option 2' },
        ],
        agentRecommendation: 'Option 1',
        agentRationale: 'This is the best option',
      });

      expect(result.projectId).toBe('project-1');
      expect(result.title).toBe('Test Escalation');
      expect(result.status).toBe('pending');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `${KEY_PREFIX.PROJECT}project-1`,
          SK: expect.stringContaining(KEY_PREFIX.ESCALATION),
          GSI1PK: GSI1_PREFIX.ESCALATION_PENDING,
          escalationId: expect.any(String),
          status: 'pending',
          title: 'Test Escalation',
        })
      );
    });

    it('should create with custom expiry', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.create({
        projectId: 'project-1',
        title: 'Test Escalation',
        context: { situation: 'Test' },
        options: [],
        expiresInDays: 3,
      });

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(String),
        })
      );
    });
  });

  describe('recordDecision', () => {
    it('should record a user decision', async () => {
      const mockEscalation = {
        escalationId: 'esc-1',
        projectId: 'project-1',
        title: 'Test Escalation',
        context: { situation: 'Test' },
        options: [],
        status: 'decided' as EscalationStatus,
        userDecision: 'approve',
        userNotes: 'Looks good',
        decidedAt: '2024-01-15T10:00:00.000Z',
        createdAt: '2024-01-14T10:00:00.000Z',
      };

      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockEscalation);

      const result = await repo.recordDecision('project-1', 'esc-1', {
        userDecision: 'approve',
        userNotes: 'Looks good',
      });

      expect(result?.status).toBe('decided');
      expect(result?.userDecision).toBe('approve');

      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.ESCALATION}esc-1`,
        expect.stringContaining('SET'),
        expect.objectContaining({
          ':status': 'decided',
          ':userDecision': 'approve',
          ':userNotes': 'Looks good',
          ':gsi1pk': GSI1_PREFIX.ESCALATION_DECIDED,
        }),
        expect.any(Object)
      );
    });

    it('should handle missing notes', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);
      vi.mocked(mockDb.get).mockResolvedValueOnce({
        escalationId: 'esc-1',
        projectId: 'project-1',
        status: 'decided',
        userDecision: 'reject',
        createdAt: '2024-01-15T10:00:00.000Z',
        context: {},
        options: [],
      });

      await repo.recordDecision('project-1', 'esc-1', {
        userDecision: 'reject',
      });

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':userNotes': null,
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateStatus', () => {
    it('should update escalation status', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.updateStatus('project-1', 'esc-1', 'expired');

      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.ESCALATION}esc-1`,
        'SET #status = :status, #gsi1pk = :gsi1pk',
        expect.objectContaining({
          ':status': 'expired',
          ':gsi1pk': GSI1_PREFIX.ESCALATION_DECIDED,
        }),
        expect.any(Object)
      );
    });
  });

  describe('expireOldEscalations', () => {
    it('should expire escalations past their expiry date', async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      const mockPending = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Old Escalation',
          context: {},
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-01T10:00:00.000Z',
        },
      ];

      const mockItem = {
        escalationId: 'esc-1',
        projectId: 'project-1',
        expiresAt: yesterday,
      };

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockPending });
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockItem);
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      const result = await repo.expireOldEscalations();

      expect(result).toBe(1);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should not expire escalations not yet expired', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const mockPending = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Future Escalation',
          context: {},
          options: [],
          status: 'pending' as EscalationStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      const mockItem = {
        escalationId: 'esc-1',
        projectId: 'project-1',
        expiresAt: tomorrow,
      };

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockPending });
      vi.mocked(mockDb.get).mockResolvedValueOnce(mockItem);

      const result = await repo.expireOldEscalations();

      expect(result).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('supersede', () => {
    it('should supersede an escalation', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.supersede('project-1', 'esc-1');

      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.ESCALATION}esc-1`,
        expect.any(String),
        expect.objectContaining({
          ':status': 'superseded',
        }),
        expect.any(Object)
      );
    });
  });

  describe('getRecentDecided', () => {
    it('should retrieve recently decided escalations', async () => {
      const mockItems = [
        {
          escalationId: 'esc-1',
          projectId: 'project-1',
          title: 'Escalation 1',
          context: {},
          options: [],
          status: 'decided' as EscalationStatus,
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getRecentDecided({ days: 7 });

      expect(result.items).toHaveLength(1);
      expect(mockDb.queryGSI1).toHaveBeenCalledWith(
        GSI1_PREFIX.ESCALATION_DECIDED,
        expect.objectContaining({
          gsi1skPrefix: expect.any(String),
        })
      );
    });

    it('should use default 7 days if not specified', async () => {
      vi.mocked(mockDb.queryGSI1).mockResolvedValueOnce({ items: [] });

      await repo.getRecentDecided();

      expect(mockDb.queryGSI1).toHaveBeenCalled();
    });
  });
});
