/**
 * StatusReportRepository Tests
 *
 * Tests create, retrieve, and status update operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatusReportRepository } from '../repository.js';
import type { DynamoDBClient } from '../../db/client.js';
import type { StatusReport } from '../types.js';

function createMockDbClient(): DynamoDBClient {
  return {
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
    queryGSI1: vi.fn(),
    queryWithExpression: vi.fn(),
  } as unknown as DynamoDBClient;
}

function createSampleReport(overrides?: Partial<StatusReport>): StatusReport {
  return {
    id: 'report-123',
    projectId: 'proj-1',
    template: 'executive',
    title: 'Executive Status Report — 15 January 2026',
    content: {
      summary: 'Project is on track.',
      healthStatus: 'green',
      keyHighlights: ['Sprint 70% complete'],
      risksAndBlockers: [],
      decisionsNeeded: [],
      upcomingMilestones: ['MVP Launch — 15 Feb'],
      metricsSnapshot: { overallStatus: 'green', openBlockers: 0 },
    },
    generatedAt: '2026-01-15T10:00:00.000Z',
    status: 'draft',
    ...overrides,
  };
}

describe('StatusReportRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: StatusReportRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new StatusReportRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should store a report with correct PK and SK', async () => {
      const report = createSampleReport();
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.create(report);

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'PROJECT#proj-1',
          SK: 'REPORT#2026-01-15T10:00:00.000Z',
          id: 'report-123',
          projectId: 'proj-1',
          template: 'executive',
          status: 'draft',
        })
      );
    });
  });

  describe('getByProject', () => {
    it('should query reports for a project with default limit', async () => {
      const reports = [createSampleReport()];
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: reports });

      const result = await repo.getByProject('proj-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('report-123');
      expect(mockDb.query).toHaveBeenCalledWith(
        'PROJECT#proj-1',
        'REPORT#',
        { limit: 20, ascending: false }
      );
    });

    it('should respect custom limit', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      await repo.getByProject('proj-1', 5);

      expect(mockDb.query).toHaveBeenCalledWith(
        'PROJECT#proj-1',
        'REPORT#',
        { limit: 5, ascending: false }
      );
    });
  });

  describe('getById', () => {
    it('should retrieve a report by projectId and reportId', async () => {
      const report = createSampleReport();
      vi.mocked(mockDb.get).mockResolvedValueOnce(report);

      const result = await repo.getById('proj-1', '2026-01-15T10:00:00.000Z');

      expect(result).toEqual(report);
      expect(mockDb.get).toHaveBeenCalledWith(
        'PROJECT#proj-1',
        'REPORT#2026-01-15T10:00:00.000Z'
      );
    });

    it('should return null when report does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getById('proj-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status only', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.updateStatus(
        'proj-1',
        '2026-01-15T10:00:00.000Z',
        'archived'
      );

      expect(mockDb.update).toHaveBeenCalledWith(
        'PROJECT#proj-1',
        'REPORT#2026-01-15T10:00:00.000Z',
        'SET #status = :status',
        { ':status': 'archived' },
        { '#status': 'status' }
      );
    });

    it('should update status with sentAt and sentTo', async () => {
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.updateStatus(
        'proj-1',
        '2026-01-15T10:00:00.000Z',
        'sent',
        {
          sentAt: '2026-01-15T12:00:00.000Z',
          sentTo: ['alice@example.com', 'bob@example.com'],
        }
      );

      expect(mockDb.update).toHaveBeenCalledWith(
        'PROJECT#proj-1',
        'REPORT#2026-01-15T10:00:00.000Z',
        'SET #status = :status, sentAt = :sentAt, sentTo = :sentTo',
        {
          ':status': 'sent',
          ':sentAt': '2026-01-15T12:00:00.000Z',
          ':sentTo': ['alice@example.com', 'bob@example.com'],
        },
        { '#status': 'status' }
      );
    });
  });
});
