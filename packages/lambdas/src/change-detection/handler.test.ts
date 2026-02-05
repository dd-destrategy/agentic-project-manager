/**
 * Change Detection Handler Tests
 *
 * Tests for the change detection Lambda handler with mocked dependencies.
 * Focuses on the change detection gate pattern - skipping LLM when no changes.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock dependencies before importing handler
vi.mock('@agentic-pm/core', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    queryGSI1: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
  })),
}));

vi.mock('@agentic-pm/core/integrations/jira', () => ({
  JiraClient: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(true),
    fetchDelta: vi.fn().mockResolvedValue({ signals: [], newCheckpoint: '2024-01-15T10:00:00.000Z' }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 50 }),
    source: 'jira',
  })),
}));

vi.mock('@agentic-pm/core/db/repositories/checkpoint', () => ({
  CheckpointRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue({}),
    setIfNewer: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@agentic-pm/core/db/repositories/project', () => ({
  ProjectRepository: vi.fn().mockImplementation(() => ({
    getById: vi.fn().mockResolvedValue(null),
    getActive: vi.fn().mockResolvedValue({ items: [] }),
  })),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        baseUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
      }),
    }),
  })),
  GetSecretValueCommand: vi.fn(),
}));

vi.mock('../shared/context.js', () => ({
  logger: {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getEnv: vi.fn().mockReturnValue({
    TABLE_NAME: 'TestTable',
    TABLE_ARN: 'arn:aws:dynamodb:us-east-1:123456789:table/TestTable',
    ENVIRONMENT: 'test',
    LOG_LEVEL: 'INFO',
  }),
}));

import type { Context } from 'aws-lambda';

import { JiraClient } from '@agentic-pm/core/integrations/jira';
import { CheckpointRepository } from '@agentic-pm/core/db/repositories/checkpoint';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';

import type { HeartbeatOutput } from '../shared/types.js';

import { handler } from './handler.js';

// Mock Lambda context
const mockContext: Context = {
  awsRequestId: 'test-request-id',
  functionName: 'change-detection',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:change-detection',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/change-detection',
  logStreamName: '2024/01/15/[$LATEST]abc123',
  callbackWaitsForEmptyEventLoop: true,
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
};

describe('Change Detection Handler', () => {
  let mockJiraClient: {
    authenticate: Mock;
    fetchDelta: Mock;
    healthCheck: Mock;
    source: string;
  };
  let mockCheckpointRepo: {
    get: Mock;
    set: Mock;
    setIfNewer: Mock;
  };
  let mockProjectRepo: {
    getById: Mock;
    getActive: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Get fresh mock instances
    mockJiraClient = {
      authenticate: vi.fn().mockResolvedValue(true),
      fetchDelta: vi.fn().mockResolvedValue({ signals: [], newCheckpoint: '2024-01-15T10:00:00.000Z' }),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 50 }),
      source: 'jira',
    };

    mockCheckpointRepo = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue({}),
      setIfNewer: vi.fn().mockResolvedValue(true),
    };

    mockProjectRepo = {
      getById: vi.fn().mockResolvedValue(null),
      getActive: vi.fn().mockResolvedValue({ items: [] }),
    };

    // Configure mocks
    vi.mocked(JiraClient).mockImplementation(() => mockJiraClient as unknown as InstanceType<typeof JiraClient>);
    vi.mocked(CheckpointRepository).mockImplementation(() => mockCheckpointRepo as unknown as InstanceType<typeof CheckpointRepository>);
    vi.mocked(ProjectRepository).mockImplementation(() => mockProjectRepo as unknown as InstanceType<typeof ProjectRepository>);
  });

  describe('Change Detection Gate', () => {
    it('should return hasChanges: false when no active projects', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: [],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      const result = await handler(input, mockContext);

      expect(result.hasChanges).toBe(false);
      expect(result.signals).toHaveLength(0);
    });

    it('should return hasChanges: false when no changes detected', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue({
        id: 'project-1',
        name: 'Test Project',
        source: 'jira',
        sourceProjectKey: 'TEST',
        status: 'active',
        autonomyLevel: 'artefact',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });

      mockJiraClient.fetchDelta.mockResolvedValue({
        signals: [],
        newCheckpoint: '2024-01-15T10:00:00.000Z',
      });

      const result = await handler(input, mockContext);

      expect(result.hasChanges).toBe(false);
      expect(result.signals).toHaveLength(0);
    });

    it('should return hasChanges: true when changes are detected', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue({
        id: 'project-1',
        name: 'Test Project',
        source: 'jira',
        sourceProjectKey: 'TEST',
        status: 'active',
        autonomyLevel: 'artefact',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });

      const mockIssue = {
        id: '10001',
        key: 'TEST-1',
        fields: {
          summary: 'Test Issue',
          status: { name: 'In Progress', id: '3' },
          updated: '2024-01-15T10:00:00.000Z',
        },
      };

      mockJiraClient.fetchDelta.mockResolvedValue({
        signals: [
          {
            source: 'jira',
            timestamp: '2024-01-15T10:00:00.000Z',
            rawPayload: mockIssue,
          },
        ],
        newCheckpoint: '2024-01-15T10:00:00.000Z',
      });

      const result = await handler(input, mockContext);

      expect(result.hasChanges).toBe(true);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].projectId).toBe('project-1');
      expect(result.signals[0].source).toBe('jira');
    });
  });

  describe('Checkpoint Handling', () => {
    it('should use existing checkpoint for delta detection', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue({
        id: 'project-1',
        name: 'Test Project',
        source: 'jira',
        sourceProjectKey: 'TEST',
        status: 'active',
        autonomyLevel: 'artefact',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });

      mockCheckpointRepo.get.mockResolvedValue({
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-15T09:45:00.000Z',
        updatedAt: '2024-01-15T09:45:00.000Z',
      });

      mockJiraClient.fetchDelta.mockResolvedValue({
        signals: [],
        newCheckpoint: '2024-01-15T10:00:00.000Z',
      });

      await handler(input, mockContext);

      // Verify fetchDelta was called with the checkpoint value
      expect(mockJiraClient.fetchDelta).toHaveBeenCalledWith(
        '2024-01-15T09:45:00.000Z',
        'TEST'
      );
    });

    it('should update checkpoint after successful sync', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue({
        id: 'project-1',
        name: 'Test Project',
        source: 'jira',
        sourceProjectKey: 'TEST',
        status: 'active',
        autonomyLevel: 'artefact',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });

      mockCheckpointRepo.get.mockResolvedValue({
        projectId: 'project-1',
        integration: 'jira',
        checkpointKey: 'last_sync',
        checkpointValue: '2024-01-15T09:45:00.000Z',
        updatedAt: '2024-01-15T09:45:00.000Z',
      });

      mockJiraClient.fetchDelta.mockResolvedValue({
        signals: [],
        newCheckpoint: '2024-01-15T10:00:00.000Z',
      });

      await handler(input, mockContext);

      // Verify checkpoint was updated with new value
      expect(mockCheckpointRepo.setIfNewer).toHaveBeenCalledWith(
        'project-1',
        'jira',
        '2024-01-15T10:00:00.000Z',
        'last_sync'
      );
    });
  });

  describe('Integration Health', () => {
    it('should skip Jira polling when integration is unhealthy', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1'],
        integrations: [{ name: 'jira', healthy: false, lastCheck: '2024-01-15T09:55:00.000Z', error: 'Connection failed' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue({
        id: 'project-1',
        name: 'Test Project',
        source: 'jira',
        sourceProjectKey: 'TEST',
        status: 'active',
        autonomyLevel: 'artefact',
        config: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T00:00:00.000Z',
      });

      const result = await handler(input, mockContext);

      // Should not poll Jira when unhealthy
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle project not found gracefully', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['non-existent-project'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById.mockResolvedValue(null);

      const result = await handler(input, mockContext);

      expect(result.hasChanges).toBe(false);
      expect(result.signals).toHaveLength(0);
    });

    it('should continue processing other projects when one fails', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1', 'project-2'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      // First project succeeds with changes
      const mockIssue = {
        id: '10002',
        key: 'TEST2-1',
        fields: {
          summary: 'Test Issue 2',
          status: { name: 'Done', id: '4' },
          updated: '2024-01-15T10:00:00.000Z',
        },
      };

      mockProjectRepo.getById
        .mockResolvedValueOnce({
          id: 'project-1',
          name: 'Test Project 1',
          source: 'jira',
          sourceProjectKey: 'TEST1',
          status: 'active',
          autonomyLevel: 'artefact',
          config: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'project-2',
          name: 'Test Project 2',
          source: 'jira',
          sourceProjectKey: 'TEST2',
          status: 'active',
          autonomyLevel: 'artefact',
          config: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T00:00:00.000Z',
        });

      // First call fails, second succeeds
      mockJiraClient.fetchDelta
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          signals: [
            {
              source: 'jira',
              timestamp: '2024-01-15T10:00:00.000Z',
              rawPayload: mockIssue,
            },
          ],
          newCheckpoint: '2024-01-15T10:00:00.000Z',
        });

      const result = await handler(input, mockContext);

      // Should still have changes from project-2
      expect(result.hasChanges).toBe(true);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].projectId).toBe('project-2');
    });
  });

  describe('Multiple Projects', () => {
    it('should aggregate signals from multiple projects', async () => {
      const input: HeartbeatOutput = {
        cycleId: 'cycle-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        activeProjects: ['project-1', 'project-2'],
        integrations: [{ name: 'jira', healthy: true, lastCheck: '2024-01-15T09:55:00.000Z' }],
        housekeepingDue: false,
      };

      mockProjectRepo.getById
        .mockResolvedValueOnce({
          id: 'project-1',
          name: 'Test Project 1',
          source: 'jira',
          sourceProjectKey: 'TEST1',
          status: 'active',
          autonomyLevel: 'artefact',
          config: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'project-2',
          name: 'Test Project 2',
          source: 'jira',
          sourceProjectKey: 'TEST2',
          status: 'active',
          autonomyLevel: 'artefact',
          config: {},
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T00:00:00.000Z',
        });

      mockJiraClient.fetchDelta
        .mockResolvedValueOnce({
          signals: [
            {
              source: 'jira',
              timestamp: '2024-01-15T10:00:00.000Z',
              rawPayload: { id: '1', key: 'TEST1-1' },
            },
          ],
          newCheckpoint: '2024-01-15T10:00:00.000Z',
        })
        .mockResolvedValueOnce({
          signals: [
            {
              source: 'jira',
              timestamp: '2024-01-15T10:01:00.000Z',
              rawPayload: { id: '2', key: 'TEST2-1' },
            },
          ],
          newCheckpoint: '2024-01-15T10:01:00.000Z',
        });

      const result = await handler(input, mockContext);

      expect(result.hasChanges).toBe(true);
      expect(result.signals).toHaveLength(2);
      expect(result.signals.map((s) => s.projectId)).toContain('project-1');
      expect(result.signals.map((s) => s.projectId)).toContain('project-2');
    });
  });
});
