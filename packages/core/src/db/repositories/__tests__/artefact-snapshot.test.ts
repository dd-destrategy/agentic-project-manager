/**
 * Artefact Snapshot Repository Tests
 *
 * Tests for snapshot creation, trend retrieval, and latest retrieval.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { KEY_PREFIX } from '../../../constants.js';
import type { ArtefactType } from '../../../types/index.js';
import type { DynamoDBClient } from '../../client.js';
import {
  ArtefactSnapshotRepository,
  type ArtefactSnapshot,
  type SnapshotMetrics,
} from '../artefact-snapshot.js';

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

describe('ArtefactSnapshotRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: ArtefactSnapshotRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new ArtefactSnapshotRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a snapshot with correct PK/SK', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const snapshot: ArtefactSnapshot = {
        projectId: 'project-1',
        artefactType: 'delivery_state',
        timestamp: '2024-01-15T10:00:00.000Z',
        metrics: {
          overallStatus: 'green',
          blockerCount: 2,
          milestoneCount: 5,
        },
        contentHash: 'abc123',
        createdAt: '',
      };

      await repo.create(snapshot);

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `${KEY_PREFIX.PROJECT}project-1`,
          SK: 'SNAPSHOT#delivery_state#2024-01-15T10:00:00.000Z',
          projectId: 'project-1',
          artefactType: 'delivery_state',
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: {
            overallStatus: 'green',
            blockerCount: 2,
            milestoneCount: 5,
          },
          contentHash: 'abc123',
          createdAt: expect.any(String),
          ttl: expect.any(Number),
        })
      );
    });

    it('should set TTL to approximately 90 days from now', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const snapshot: ArtefactSnapshot = {
        projectId: 'project-1',
        artefactType: 'raid_log',
        timestamp: '2024-01-15T10:00:00.000Z',
        metrics: { openRisks: 3, openIssues: 1 },
        contentHash: 'def456',
        createdAt: '',
      };

      await repo.create(snapshot);

      const putCall = vi.mocked(mockDb.put).mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const ttl = putCall.ttl as number;
      const nowEpoch = Math.floor(Date.now() / 1000);
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;

      // TTL should be approximately 90 days from now (within 5 seconds tolerance)
      expect(ttl).toBeGreaterThanOrEqual(nowEpoch + ninetyDaysInSeconds - 5);
      expect(ttl).toBeLessThanOrEqual(nowEpoch + ninetyDaysInSeconds + 5);
    });

    it('should create snapshots for different artefact types', async () => {
      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      const types: ArtefactType[] = [
        'delivery_state',
        'raid_log',
        'backlog_summary',
        'decision_log',
      ];

      for (const type of types) {
        await repo.create({
          projectId: 'project-1',
          artefactType: type,
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: {},
          contentHash: `hash-${type}`,
          createdAt: '',
        });
      }

      expect(mockDb.put).toHaveBeenCalledTimes(4);

      // Verify each type has correct SK
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: 'SNAPSHOT#delivery_state#2024-01-15T10:00:00.000Z',
        })
      );
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: 'SNAPSHOT#raid_log#2024-01-15T10:00:00.000Z',
        })
      );
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: 'SNAPSHOT#backlog_summary#2024-01-15T10:00:00.000Z',
        })
      );
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: 'SNAPSHOT#decision_log#2024-01-15T10:00:00.000Z',
        })
      );
    });
  });

  describe('getTrend', () => {
    it('should retrieve trend data with default options', async () => {
      const mockItems = [
        {
          projectId: 'project-1',
          artefactType: 'delivery_state' as ArtefactType,
          timestamp: '2024-01-13T10:00:00.000Z',
          metrics: {
            overallStatus: 'green',
            blockerCount: 0,
          } as SnapshotMetrics,
          contentHash: 'hash1',
          createdAt: '2024-01-13T10:00:00.000Z',
        },
        {
          projectId: 'project-1',
          artefactType: 'delivery_state' as ArtefactType,
          timestamp: '2024-01-14T10:00:00.000Z',
          metrics: {
            overallStatus: 'amber',
            blockerCount: 1,
          } as SnapshotMetrics,
          contentHash: 'hash2',
          createdAt: '2024-01-14T10:00:00.000Z',
        },
        {
          projectId: 'project-1',
          artefactType: 'delivery_state' as ArtefactType,
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: { overallStatus: 'red', blockerCount: 3 } as SnapshotMetrics,
          contentHash: 'hash3',
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getTrend('project-1', 'delivery_state');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        timestamp: '2024-01-13T10:00:00.000Z',
        metrics: { overallStatus: 'green', blockerCount: 0 },
      });
      expect(result[2]).toEqual({
        timestamp: '2024-01-15T10:00:00.000Z',
        metrics: { overallStatus: 'red', blockerCount: 3 },
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'SNAPSHOT#delivery_state#',
        { limit: 30, ascending: true }
      );
    });

    it('should pass limit option to query', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      await repo.getTrend('project-1', 'raid_log', { limit: 10 });

      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'SNAPSHOT#raid_log#',
        { limit: 10, ascending: true }
      );
    });

    it('should use since option in SK prefix', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      await repo.getTrend('project-1', 'backlog_summary', {
        since: '2024-01-10T00:00:00.000Z',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'SNAPSHOT#backlog_summary#2024-01-10T00:00:00.000Z',
        { limit: 30, ascending: true }
      );
    });

    it('should return empty array when no snapshots exist', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      const result = await repo.getTrend('project-1', 'decision_log');

      expect(result).toEqual([]);
    });

    it('should map items to TrendDataPoint format', async () => {
      const mockItems = [
        {
          projectId: 'project-1',
          artefactType: 'raid_log' as ArtefactType,
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: {
            openRisks: 5,
            openIssues: 2,
            totalItems: 12,
          } as SnapshotMetrics,
          contentHash: 'hash1',
          createdAt: '2024-01-15T10:00:00.000Z',
          PK: 'PROJECT#project-1',
          SK: 'SNAPSHOT#raid_log#2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getTrend('project-1', 'raid_log');

      expect(result).toEqual([
        {
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: {
            openRisks: 5,
            openIssues: 2,
            totalItems: 12,
          },
        },
      ]);
    });
  });

  describe('getLatest', () => {
    it('should retrieve the latest snapshot', async () => {
      const mockItems = [
        {
          projectId: 'project-1',
          artefactType: 'delivery_state' as ArtefactType,
          timestamp: '2024-01-15T10:00:00.000Z',
          metrics: { overallStatus: 'green' } as SnapshotMetrics,
          contentHash: 'hash-latest',
          createdAt: '2024-01-15T10:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getLatest('project-1', 'delivery_state');

      expect(result).toEqual({
        projectId: 'project-1',
        artefactType: 'delivery_state',
        timestamp: '2024-01-15T10:00:00.000Z',
        metrics: { overallStatus: 'green' },
        contentHash: 'hash-latest',
        createdAt: '2024-01-15T10:00:00.000Z',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'SNAPSHOT#delivery_state#',
        { limit: 1, ascending: false }
      );
    });

    it('should return null when no snapshot exists', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      const result = await repo.getLatest('project-1', 'delivery_state');

      expect(result).toBeNull();
    });

    it('should query with descending order to get latest first', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      await repo.getLatest('project-1', 'backlog_summary');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ ascending: false })
      );
    });
  });
});
