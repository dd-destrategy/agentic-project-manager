/**
 * Checkpoint Repository Tests
 *
 * Tests for checkpoint persistence with mocked DynamoDB client.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CheckpointRepository,
  createCheckpointRepository,
} from './checkpoint.js';
import type { DynamoDBClient } from '../client.js';
import type { AgentCheckpoint } from '../../types/index.js';
import { KEY_PREFIX } from '../../constants.js';

// Create a mock DynamoDB client
function createMockDbClient(): DynamoDBClient {
  return {
    get: vi.fn(),
    put: vi.fn(),
    putWithCondition: vi.fn().mockResolvedValue(true),
    query: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
  } as unknown as DynamoDBClient;
}

describe('CheckpointRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: CheckpointRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new CheckpointRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should retrieve a checkpoint by project, integration, and key', async () => {
      const mockCheckpoint: AgentCheckpoint = {
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockCheckpoint);

      const result = await repo.get('project-1', 'jira', 'last_sync');

      expect(result).toEqual(mockCheckpoint);
      expect(mockDb.get).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.CHECKPOINT}jira#last_sync`
      );
    });

    it('should use default checkpoint key when not provided', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      await repo.get('project-1', 'jira');

      expect(mockDb.get).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.CHECKPOINT}jira#last_sync`
      );
    });

    it('should return null when checkpoint does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.get('project-1', 'jira', 'last_sync');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store a checkpoint', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null); // no existing checkpoint
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      const result = await repo.set(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z',
        'last_sync'
      );

      expect(result.projectId).toBe('project-1');
      expect(result.integration).toBe('jira');
      expect(result.checkpointKey).toBe('last_sync');
      expect(result.checkpointValue).toBe('2024-01-15T10:00:00.000Z');
      expect(result.updatedAt).toBeDefined();

      expect((mockDb as any).putWithCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `${KEY_PREFIX.PROJECT}project-1`,
          SK: `${KEY_PREFIX.CHECKPOINT}jira#last_sync`,
          projectId: 'project-1',
          integration: 'jira',
          checkpointKey: 'last_sync',
          checkpointValue: '2024-01-15T10:00:00.000Z',
        }),
        'attribute_not_exists(PK)',
        undefined
      );
    });

    it('should use default checkpoint key when not provided', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null); // no existing checkpoint
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      await repo.set('project-1', 'jira', '2024-01-15T10:00:00.000Z');

      expect((mockDb as any).putWithCondition).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: `${KEY_PREFIX.CHECKPOINT}jira#last_sync`,
          checkpointKey: 'last_sync',
        }),
        'attribute_not_exists(PK)',
        undefined
      );
    });
  });

  describe('setIfNewer', () => {
    it('should update checkpoint when no existing checkpoint', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      const result = await repo.setIfNewer(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z'
      );

      expect(result).toBe(true);
      expect((mockDb as any).putWithCondition).toHaveBeenCalled();
    });

    it('should update checkpoint when new value is more recent', async () => {
      const existingCheckpoint: AgentCheckpoint = {
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-14T10:00:00.000Z',
        updatedAt: '2024-01-14T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(existingCheckpoint);
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      const result = await repo.setIfNewer(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z'
      );

      expect(result).toBe(true);
      expect((mockDb as any).putWithCondition).toHaveBeenCalled();
    });

    it('should not update checkpoint when new value is older', async () => {
      const existingCheckpoint: AgentCheckpoint = {
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-16T10:00:00.000Z',
        updatedAt: '2024-01-16T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(existingCheckpoint);

      const result = await repo.setIfNewer(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z'
      );

      expect(result).toBe(false);
      expect(mockDb.put).not.toHaveBeenCalled();
    });

    it('should not update checkpoint when values are equal', async () => {
      const existingCheckpoint: AgentCheckpoint = {
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(existingCheckpoint);

      const result = await repo.setIfNewer(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z'
      );

      expect(result).toBe(false);
      expect(mockDb.put).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a checkpoint', async () => {
      vi.mocked(mockDb.delete).mockResolvedValueOnce(undefined);

      await repo.delete('project-1', 'jira', 'last_sync');

      expect(mockDb.delete).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.CHECKPOINT}jira#last_sync`
      );
    });
  });

  describe('getAllForProject', () => {
    it('should retrieve all checkpoints for a project', async () => {
      const mockCheckpoints: AgentCheckpoint[] = [
        {
          projectId: 'project-1',
          integration: 'jira',
          checkpointKey: 'last_sync',
          checkpointValue: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          projectId: 'project-1',
          integration: 'outlook',
          checkpointKey: 'last_sync',
          checkpointValue: '2024-01-15T09:00:00.000Z',
          updatedAt: '2024-01-15T09:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockCheckpoints });

      const result = await repo.getAllForProject('project-1');

      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        KEY_PREFIX.CHECKPOINT
      );
    });
  });

  describe('deleteAllForProject', () => {
    it('should delete all checkpoints for a project', async () => {
      const mockCheckpoints: AgentCheckpoint[] = [
        {
          projectId: 'project-1',
          integration: 'jira',
          checkpointKey: 'last_sync',
          checkpointValue: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          projectId: 'project-1',
          integration: 'outlook',
          checkpointKey: 'last_sync',
          checkpointValue: '2024-01-15T09:00:00.000Z',
          updatedAt: '2024-01-15T09:00:00.000Z',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockCheckpoints });
      vi.mocked(mockDb.delete).mockResolvedValue(undefined);

      await repo.deleteAllForProject('project-1');

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(mockDb.delete).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.CHECKPOINT}jira#last_sync`
      );
      expect(mockDb.delete).toHaveBeenCalledWith(
        `${KEY_PREFIX.PROJECT}project-1`,
        `${KEY_PREFIX.CHECKPOINT}outlook#last_sync`
      );
    });
  });

  describe('getLastSyncTime', () => {
    it('should return Date object for existing checkpoint', async () => {
      const mockCheckpoint: AgentCheckpoint = {
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockCheckpoint);

      const result = await repo.getLastSyncTime('project-1', 'jira');

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2024-01-15T10:00:00.000Z');
    });

    it('should return null when no checkpoint exists', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getLastSyncTime('project-1', 'jira');

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTime', () => {
    it('should set checkpoint from Date object', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      const date = new Date('2024-01-15T10:00:00.000Z');
      const result = await repo.setLastSyncTime('project-1', 'jira', date);

      expect(result.checkpointValue).toBe('2024-01-15T10:00:00.000Z');
    });

    it('should set checkpoint from string', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValueOnce(true);

      const result = await repo.setLastSyncTime(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z'
      );

      expect(result.checkpointValue).toBe('2024-01-15T10:00:00.000Z');
    });
  });

  describe('initializeForProject', () => {
    it('should create initial checkpoints for specified integrations', async () => {
      vi.mocked(mockDb.get).mockResolvedValue(null); // no existing checkpoints
      vi.mocked((mockDb as any).putWithCondition).mockResolvedValue(true);

      const result = await repo.initializeForProject('project-1', [
        'jira',
        'outlook',
      ]);

      expect(result).toHaveLength(2);
      expect((mockDb as any).putWithCondition).toHaveBeenCalledTimes(2);

      // Verify checkpoints are set to 24 hours ago
      for (const checkpoint of result) {
        const checkpointDate = new Date(checkpoint.checkpointValue);
        const now = Date.now();
        const diff = now - checkpointDate.getTime();
        // Should be approximately 24 hours ago (within 1 minute tolerance)
        expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 60000);
        expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 60000);
      }
    });
  });
});

describe('createCheckpointRepository', () => {
  it('should create a CheckpointRepository instance', () => {
    const mockDb = createMockDbClient();
    const repo = createCheckpointRepository(mockDb);

    expect(repo).toBeInstanceOf(CheckpointRepository);
  });
});
