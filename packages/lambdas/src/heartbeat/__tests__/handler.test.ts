/**
 * Heartbeat Lambda Tests
 *
 * Tests for the heartbeat handler that initiates agent cycles and checks health.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock dependencies before importing handler
vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    queryGSI1: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
  })),
  ProjectRepository: vi.fn(),
  EventRepository: vi.fn(),
  AgentConfigRepository: vi.fn(),
}));

vi.mock('../../shared/context.js', () => ({
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

import {
  ProjectRepository,
  EventRepository,
  AgentConfigRepository,
} from '@agentic-pm/core/db';

import type { AgentCycleInput } from '../../shared/types.js';

import { handler } from '../handler.js';

// Mock Lambda context
const mockContext: Context = {
  awsRequestId: 'test-request-id',
  functionName: 'heartbeat',
  functionVersion: '1',
  invokedFunctionArn:
    'arn:aws:lambda:ap-southeast-2:123456789:function:heartbeat',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/heartbeat',
  logStreamName: '2024/01/15/[$LATEST]abc123',
  callbackWaitsForEmptyEventLoop: true,
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
};

describe('Heartbeat Handler', () => {
  let mockProjectRepo: {
    getActive: Mock;
    getById: Mock;
  };
  let mockEventRepo: {
    createHeartbeat: Mock;
    createError: Mock;
  };
  let mockConfigRepo: {
    getBudgetStatus: Mock;
    isHousekeepingDue: Mock;
    updateLastHeartbeat: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Get fresh mock instances
    mockProjectRepo = {
      getActive: vi.fn().mockResolvedValue({ items: [] }),
      getById: vi.fn().mockResolvedValue(null),
    };

    mockEventRepo = {
      createHeartbeat: vi.fn().mockResolvedValue({}),
      createError: vi.fn().mockResolvedValue({}),
    };

    mockConfigRepo = {
      getBudgetStatus: vi.fn().mockResolvedValue({
        dailySpendUsd: 0.05,
        dailyLimitUsd: 0.5,
        monthlySpendUsd: 1.5,
        monthlyLimitUsd: 7.0,
        degradationTier: 'none',
      }),
      isHousekeepingDue: vi.fn().mockResolvedValue(false),
      updateLastHeartbeat: vi.fn().mockResolvedValue({}),
    };

    // Configure mocks
    vi.mocked(ProjectRepository).mockImplementation(
      () => mockProjectRepo as unknown as InstanceType<typeof ProjectRepository>
    );
    vi.mocked(EventRepository).mockImplementation(
      () => mockEventRepo as unknown as InstanceType<typeof EventRepository>
    );
    vi.mocked(AgentConfigRepository).mockImplementation(
      () =>
        mockConfigRepo as unknown as InstanceType<typeof AgentConfigRepository>
    );
  });

  describe('Happy Path', () => {
    it('should complete heartbeat with no active projects', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockProjectRepo.getActive.mockResolvedValue({ items: [] });

      const result = await handler(input, mockContext);

      expect(result.cycleId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.activeProjects).toEqual([]);
      expect(result.integrations).toHaveLength(1);
      expect(result.integrations[0].name).toBe('jira');
      expect(result.integrations[0].healthy).toBe(true);
      expect(result.housekeepingDue).toBe(false);

      // Verify heartbeat event was created
      expect(mockEventRepo.createHeartbeat).toHaveBeenCalledWith(
        expect.any(String),
        false,
        expect.objectContaining({
          metrics: expect.any(Object),
          context: expect.any(Object),
        })
      );
    });

    it('should return active projects when present', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockProjectRepo.getActive.mockResolvedValue({
        items: [
          {
            id: 'project-1',
            name: 'Test Project 1',
            source: 'jira',
            sourceProjectKey: 'TEST1',
            status: 'active',
            autonomyLevel: 'artefact',
            config: {},
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
          {
            id: 'project-2',
            name: 'Test Project 2',
            source: 'jira',
            sourceProjectKey: 'TEST2',
            status: 'active',
            autonomyLevel: 'tactical',
            config: {},
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
        ],
      });

      const result = await handler(input, mockContext);

      expect(result.activeProjects).toHaveLength(2);
      expect(result.activeProjects).toContain('project-1');
      expect(result.activeProjects).toContain('project-2');
    });

    it('should indicate when housekeeping is due', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockConfigRepo.isHousekeepingDue.mockResolvedValue(true);

      const result = await handler(input, mockContext);

      expect(result.housekeepingDue).toBe(true);
    });

    it('should handle manual trigger source', async () => {
      const input: AgentCycleInput = {
        source: 'manual',
        projectId: 'test-project',
      };

      const result = await handler(input, mockContext);

      expect(result.cycleId).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Budget Status', () => {
    it('should include budget status in heartbeat', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockConfigRepo.getBudgetStatus.mockResolvedValue({
        dailySpendUsd: 0.3,
        dailyLimitUsd: 0.5,
        monthlySpendUsd: 5.0,
        monthlyLimitUsd: 7.0,
        degradationTier: 'tier1',
      });

      await handler(input, mockContext);

      expect(mockEventRepo.createHeartbeat).toHaveBeenCalledWith(
        expect.any(String),
        false,
        expect.objectContaining({
          context: expect.objectContaining({
            budgetStatus: {
              dailySpendUsd: 0.3,
              degradationTier: 'tier1',
            },
          }),
        })
      );
    });
  });

  describe('Configuration Updates', () => {
    it('should update last heartbeat timestamp', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      await handler(input, mockContext);

      expect(mockConfigRepo.updateLastHeartbeat).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle project repository failure', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const error = new Error('DynamoDB connection failed');
      mockProjectRepo.getActive.mockRejectedValue(error);

      await expect(handler(input, mockContext)).rejects.toThrow(
        'DynamoDB connection failed'
      );

      // Verify error event was attempted
      expect(mockEventRepo.createError).toHaveBeenCalled();
    });

    it('should handle budget status fetch failure', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const error = new Error('Budget fetch failed');
      mockConfigRepo.getBudgetStatus.mockRejectedValue(error);

      await expect(handler(input, mockContext)).rejects.toThrow(
        'Budget fetch failed'
      );
    });

    it('should handle event creation failure gracefully', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockEventRepo.createHeartbeat.mockRejectedValue(
        new Error('Event creation failed')
      );

      await expect(handler(input, mockContext)).rejects.toThrow(
        'Event creation failed'
      );
    });

    it('should continue execution when error logging fails', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockProjectRepo.getActive.mockRejectedValue(new Error('Primary error'));
      mockEventRepo.createError.mockRejectedValue(new Error('Logging error'));

      await expect(handler(input, mockContext)).rejects.toThrow(
        'Primary error'
      );
      // Should not throw the logging error
    });
  });

  describe('Integration Health', () => {
    it('should include integration status in output', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const result = await handler(input, mockContext);

      expect(result.integrations).toBeDefined();
      expect(result.integrations).toHaveLength(1);
      expect(result.integrations[0]).toMatchObject({
        name: 'jira',
        healthy: true,
        lastCheck: expect.any(String),
      });
    });
  });

  describe('Output Validation', () => {
    it('should return all required fields', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const result = await handler(input, mockContext);

      expect(result).toMatchObject({
        cycleId: expect.any(String),
        timestamp: expect.any(String),
        activeProjects: expect.any(Array),
        integrations: expect.any(Array),
        housekeepingDue: expect.any(Boolean),
      });
    });

    it('should generate unique cycle IDs', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const result1 = await handler(input, mockContext);
      const result2 = await handler(input, mockContext);

      expect(result1.cycleId).not.toBe(result2.cycleId);
    });

    it('should use ISO timestamp format', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      const result = await handler(input, mockContext);

      // Verify ISO 8601 format
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
});
