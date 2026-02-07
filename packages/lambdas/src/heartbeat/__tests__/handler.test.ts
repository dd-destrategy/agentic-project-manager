/**
 * Heartbeat Lambda Tests
 *
 * Tests for the heartbeat handler that initiates agent cycles and checks health.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted() so mock objects are available in vi.mock() factories.
// The handler caches repositories in module-level singletons, so the same
// mock objects must be returned by the constructor mocks AND used in tests.
const {
  mockProjectRepo,
  mockEventRepo,
  mockConfigRepo,
  mockIntegrationConfigRepo,
} = vi.hoisted(() => ({
  mockProjectRepo: {
    getActive: vi.fn(),
    getById: vi.fn(),
  },
  mockEventRepo: {
    createHeartbeat: vi.fn(),
    createError: vi.fn(),
  },
  mockConfigRepo: {
    getBudgetStatus: vi.fn(),
    isHousekeepingDue: vi.fn(),
    updateLastHeartbeat: vi.fn(),
  },
  mockIntegrationConfigRepo: {
    getByName: vi.fn(),
    getAll: vi.fn(),
    upsert: vi.fn(),
    updateHealthStatus: vi.fn(),
  },
}));

// Mock dependencies before importing handler
vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return {
      get: vi.fn(),
      put: vi.fn(),
      query: vi.fn(),
      queryGSI1: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getTableName: vi.fn().mockReturnValue('TestTable'),
    };
  }),
  ProjectRepository: vi.fn().mockImplementation(function () {
    return mockProjectRepo;
  }),
  EventRepository: vi.fn().mockImplementation(function () {
    return mockEventRepo;
  }),
  AgentConfigRepository: vi.fn().mockImplementation(function () {
    return mockConfigRepo;
  }),
  IntegrationConfigRepository: vi.fn().mockImplementation(function () {
    return mockIntegrationConfigRepo;
  }),
}));

// Mock Jira and SES clients
const mockJiraHealthCheck = vi.fn();
const mockSesHealthCheck = vi.fn();

vi.mock('@agentic-pm/core/integrations/jira', () => ({
  JiraClient: vi.fn().mockImplementation(function () {
    return { healthCheck: mockJiraHealthCheck };
  }),
}));

vi.mock('@agentic-pm/core/integrations/ses', () => ({
  SESClient: vi.fn().mockImplementation(function () {
    return { healthCheck: mockSesHealthCheck };
  }),
}));

vi.mock('@agentic-pm/core/integrations', () => ({}));

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
  getCachedSecret: vi.fn().mockImplementation((secretId: string) => {
    if (secretId === '/agentic-pm/jira/credentials') {
      return Promise.resolve(
        JSON.stringify({
          baseUrl: 'https://test.atlassian.net',
          email: 'test@example.com',
          apiToken: 'test-token',
        })
      );
    }
    if (secretId === '/agentic-pm/ses/config') {
      return Promise.resolve(
        JSON.stringify({
          fromAddress: 'noreply@example.com',
          region: 'ap-southeast-2',
        })
      );
    }
    return Promise.reject(new Error(`Unknown secret: ${secretId}`));
  }),
}));

import type { Context } from 'aws-lambda';

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
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset and set default implementations on stable mock objects
    mockProjectRepo.getActive.mockReset();
    mockProjectRepo.getActive.mockResolvedValue({ items: [] });
    mockProjectRepo.getById.mockReset();
    mockProjectRepo.getById.mockResolvedValue(null);

    mockEventRepo.createHeartbeat.mockReset();
    mockEventRepo.createHeartbeat.mockResolvedValue({});
    mockEventRepo.createError.mockReset();
    mockEventRepo.createError.mockResolvedValue({});

    mockConfigRepo.getBudgetStatus.mockReset();
    mockConfigRepo.getBudgetStatus.mockResolvedValue({
      dailySpendUsd: 0.05,
      dailyLimitUsd: 0.5,
      monthlySpendUsd: 1.5,
      monthlyLimitUsd: 7.0,
      degradationTier: 'none',
    });
    mockConfigRepo.isHousekeepingDue.mockReset();
    mockConfigRepo.isHousekeepingDue.mockResolvedValue(false);
    mockConfigRepo.updateLastHeartbeat.mockReset();
    mockConfigRepo.updateLastHeartbeat.mockResolvedValue({});

    mockIntegrationConfigRepo.updateHealthStatus.mockReset();
    mockIntegrationConfigRepo.updateHealthStatus.mockResolvedValue(undefined);

    // Default healthy responses for integration health checks
    mockJiraHealthCheck.mockReset();
    mockJiraHealthCheck.mockResolvedValue({
      healthy: true,
      latencyMs: 150,
      details: { accountId: 'test-account', displayName: 'Test User' },
    });

    mockSesHealthCheck.mockReset();
    mockSesHealthCheck.mockResolvedValue({
      healthy: true,
      latencyMs: 100,
      details: { fromAddress: 'noreply@example.com', max24HourSend: 50000 },
    });
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
      expect(result.integrations).toHaveLength(2);
      expect(result.integrations[0]!.name).toBe('jira');
      expect(result.integrations[0]!.healthy).toBe(true);
      expect(result.integrations[1]!.name).toBe('ses');
      expect(result.integrations[1]!.healthy).toBe(true);
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
      expect(result.integrations).toHaveLength(2);
      expect(result.integrations[0]).toMatchObject({
        name: 'jira',
        healthy: true,
        lastCheck: expect.any(String),
      });
      expect(result.integrations[1]).toMatchObject({
        name: 'ses',
        healthy: true,
        lastCheck: expect.any(String),
      });
    });

    it('should record health check results in DynamoDB', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      await handler(input, mockContext);

      expect(
        mockIntegrationConfigRepo.updateHealthStatus
      ).toHaveBeenCalledTimes(2);
      expect(mockIntegrationConfigRepo.updateHealthStatus).toHaveBeenCalledWith(
        'jira',
        true,
        expect.objectContaining({ latencyMs: 150 }),
        undefined
      );
      expect(mockIntegrationConfigRepo.updateHealthStatus).toHaveBeenCalledWith(
        'ses',
        true,
        expect.objectContaining({ latencyMs: 100 }),
        undefined
      );
    });

    it('should handle unhealthy integrations gracefully', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      mockJiraHealthCheck.mockResolvedValue({
        healthy: false,
        latencyMs: 200,
        error: 'Authentication failed',
      });

      const result = await handler(input, mockContext);

      expect(result.integrations[0]).toMatchObject({
        name: 'jira',
        healthy: false,
        error: 'Authentication failed',
      });
      // SES should still be healthy
      expect(result.integrations[1]).toMatchObject({
        name: 'ses',
        healthy: true,
      });
    });

    it('should use fallback when all health checks fail catastrophically', async () => {
      const input: AgentCycleInput = {
        source: 'scheduled',
      };

      // Simulate getCachedSecret throwing for both secrets
      const { getCachedSecret: mockGetCachedSecret } =
        await import('../../shared/context.js');
      (mockGetCachedSecret as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Secrets Manager unavailable')
      );

      const result = await handler(input, mockContext);

      // Should fall back to unhealthy defaults
      expect(result.integrations).toHaveLength(2);
      expect(result.integrations[0]).toMatchObject({
        name: 'jira',
        healthy: false,
      });
      expect(result.integrations[1]).toMatchObject({
        name: 'ses',
        healthy: false,
      });

      // Restore mock for other tests
      (mockGetCachedSecret as ReturnType<typeof vi.fn>).mockImplementation(
        (secretId: string) => {
          if (secretId === '/agentic-pm/jira/credentials') {
            return Promise.resolve(
              JSON.stringify({
                baseUrl: 'https://test.atlassian.net',
                email: 'test@example.com',
                apiToken: 'test-token',
              })
            );
          }
          if (secretId === '/agentic-pm/ses/config') {
            return Promise.resolve(
              JSON.stringify({
                fromAddress: 'noreply@example.com',
                region: 'ap-southeast-2',
              })
            );
          }
          return Promise.reject(new Error(`Unknown secret: ${secretId}`));
        }
      );
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
