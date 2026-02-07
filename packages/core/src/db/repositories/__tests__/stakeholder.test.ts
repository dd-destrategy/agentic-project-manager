/**
 * Stakeholder Repository Tests
 *
 * Tests for stakeholder upsert, retrieval, and engagement anomaly detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StakeholderRepository } from '../stakeholder.js';
import type { DynamoDBClient } from '../../client.js';
import { KEY_PREFIX } from '../../../constants.js';
import type { Stakeholder } from '../stakeholder.js';

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

describe('StakeholderRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: StakeholderRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new StakeholderRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should retrieve a stakeholder by project and name', async () => {
      const mockStakeholder: Stakeholder = {
        id: 'stake-1',
        projectId: 'project-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'assignee',
        interactionCount: 5,
        lastSeenAt: '2026-01-15T10:00:00.000Z',
        firstSeenAt: '2026-01-01T10:00:00.000Z',
        sources: ['jira'],
        communicationFrequency: 3,
        lastInteractionTypes: ['assigned'],
        isActive: true,
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockStakeholder);

      const result = await repo.get('project-1', 'Alice Smith');

      expect(result).toEqual(mockStakeholder);
      expect(mockDb.get).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'STAKEHOLDER#Alice Smith'
      );
    });

    it('should return null when stakeholder does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.get('project-1', 'Unknown');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should create a new stakeholder when not existing', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.upsert('project-1', {
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'assignee',
        sources: ['jira'],
        lastInteractionTypes: ['assigned'],
      });

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `${KEY_PREFIX.PROJECT}project-1`,
          SK: 'STAKEHOLDER#Alice Smith',
          name: 'Alice Smith',
          email: 'alice@example.com',
          role: 'assignee',
          interactionCount: 1,
          sources: ['jira'],
          lastInteractionTypes: ['assigned'],
          isActive: true,
        })
      );
    });

    it('should update existing stakeholder interaction count', async () => {
      const existing: Stakeholder = {
        id: 'stake-1',
        projectId: 'project-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'assignee',
        interactionCount: 3,
        lastSeenAt: '2026-01-10T10:00:00.000Z',
        firstSeenAt: '2026-01-01T10:00:00.000Z',
        sources: ['jira'],
        communicationFrequency: 3,
        lastInteractionTypes: ['assigned'],
        isActive: true,
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(existing);
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.upsert('project-1', {
        name: 'Alice Smith',
        sources: ['outlook'],
        lastInteractionTypes: ['emailed'],
      });

      expect(mockDb.update).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'STAKEHOLDER#Alice Smith',
        'SET interactionCount = interactionCount + :one, lastSeenAt = :now, #sources = :sources, lastInteractionTypes = :types',
        expect.objectContaining({
          ':one': 1,
          ':sources': ['jira', 'outlook'],
          ':types': ['emailed'],
        }),
        { '#sources': 'sources' }
      );
    });

    it('should deduplicate sources on update', async () => {
      const existing: Stakeholder = {
        id: 'stake-1',
        projectId: 'project-1',
        name: 'Alice Smith',
        interactionCount: 2,
        lastSeenAt: '2026-01-10T10:00:00.000Z',
        firstSeenAt: '2026-01-01T10:00:00.000Z',
        sources: ['jira', 'outlook'],
        communicationFrequency: 3,
        lastInteractionTypes: ['assigned'],
        isActive: true,
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(existing);
      vi.mocked(mockDb.update).mockResolvedValueOnce(undefined);

      await repo.upsert('project-1', {
        name: 'Alice Smith',
        sources: ['jira'],
      });

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':sources': ['jira', 'outlook'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getAllForProject', () => {
    it('should retrieve all stakeholders for a project', async () => {
      const mockItems: Stakeholder[] = [
        {
          id: 'stake-1',
          projectId: 'project-1',
          name: 'Alice Smith',
          interactionCount: 5,
          lastSeenAt: '2026-01-15T10:00:00.000Z',
          firstSeenAt: '2026-01-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 3,
          lastInteractionTypes: ['assigned'],
          isActive: true,
        },
        {
          id: 'stake-2',
          projectId: 'project-1',
          name: 'Bob Jones',
          interactionCount: 2,
          lastSeenAt: '2026-01-14T10:00:00.000Z',
          firstSeenAt: '2026-01-05T10:00:00.000Z',
          sources: ['outlook'],
          communicationFrequency: 5,
          lastInteractionTypes: ['emailed'],
          isActive: true,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getAllForProject('project-1');

      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        'STAKEHOLDER#',
        { limit: 100 }
      );
    });
  });

  describe('getEngagementAnomalies', () => {
    it('should detect stakeholders who have gone silent', async () => {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const twoDaysAgo = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000
      ).toISOString();

      const mockItems: Stakeholder[] = [
        {
          id: 'stake-1',
          projectId: 'project-1',
          name: 'Silent Sally',
          interactionCount: 10,
          lastSeenAt: thirtyDaysAgo,
          firstSeenAt: '2025-11-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 5, // normally every 5 days, silent for 30
          lastInteractionTypes: ['assigned'],
          isActive: true,
        },
        {
          id: 'stake-2',
          projectId: 'project-1',
          name: 'Active Alice',
          interactionCount: 8,
          lastSeenAt: twoDaysAgo,
          firstSeenAt: '2025-12-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 3, // normally every 3 days, last seen 2 days ago
          lastInteractionTypes: ['commented'],
          isActive: true,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const anomalies = await repo.getEngagementAnomalies('project-1');

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.name).toBe('Silent Sally');
    });

    it('should skip inactive stakeholders', async () => {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const mockItems: Stakeholder[] = [
        {
          id: 'stake-1',
          projectId: 'project-1',
          name: 'Inactive Ian',
          interactionCount: 10,
          lastSeenAt: thirtyDaysAgo,
          firstSeenAt: '2025-11-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 5,
          lastInteractionTypes: ['assigned'],
          isActive: false,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const anomalies = await repo.getEngagementAnomalies('project-1');

      expect(anomalies).toHaveLength(0);
    });

    it('should skip stakeholders with fewer than 3 interactions', async () => {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const mockItems: Stakeholder[] = [
        {
          id: 'stake-1',
          projectId: 'project-1',
          name: 'New Nick',
          interactionCount: 2,
          lastSeenAt: thirtyDaysAgo,
          firstSeenAt: '2026-01-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 5,
          lastInteractionTypes: ['assigned'],
          isActive: true,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const anomalies = await repo.getEngagementAnomalies('project-1');

      expect(anomalies).toHaveLength(0);
    });

    it('should skip stakeholders with no communication frequency set', async () => {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const mockItems: Stakeholder[] = [
        {
          id: 'stake-1',
          projectId: 'project-1',
          name: 'Zero Zara',
          interactionCount: 10,
          lastSeenAt: thirtyDaysAgo,
          firstSeenAt: '2025-11-01T10:00:00.000Z',
          sources: ['jira'],
          communicationFrequency: 0,
          lastInteractionTypes: ['assigned'],
          isActive: true,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const anomalies = await repo.getEngagementAnomalies('project-1');

      expect(anomalies).toHaveLength(0);
    });

    it('should return empty array when no stakeholders exist', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      const anomalies = await repo.getEngagementAnomalies('project-1');

      expect(anomalies).toHaveLength(0);
    });
  });
});
