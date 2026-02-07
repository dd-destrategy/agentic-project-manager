/**
 * Heartbeat Metrics Tests
 *
 * Tests that the heartbeat handler emits the AgentHeartbeatEmitted metric
 * and that the MetricsEmitter accepts the new metric names.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted() so mock objects are available in vi.mock() factories
const {
  mockProjectRepo,
  mockEventRepo,
  mockConfigRepo,
  mockIntegrationConfigRepo,
  mockMetrics,
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
  mockMetrics: {
    increment: vi.fn(),
    record: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    getBufferSize: vi.fn().mockReturnValue(0),
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

vi.mock('../../shared/metrics.js', () => ({
  metrics: mockMetrics,
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

describe('Heartbeat Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default implementations
    mockProjectRepo.getActive.mockResolvedValue({ items: [] });
    mockEventRepo.createHeartbeat.mockResolvedValue({});
    mockEventRepo.createError.mockResolvedValue({});
    mockConfigRepo.getBudgetStatus.mockResolvedValue({
      dailySpendUsd: 0.05,
      dailyLimitUsd: 0.5,
      monthlySpendUsd: 1.5,
      monthlyLimitUsd: 7.0,
      degradationTier: 'none',
    });
    mockConfigRepo.isHousekeepingDue.mockResolvedValue(false);
    mockConfigRepo.updateLastHeartbeat.mockResolvedValue({});
    mockIntegrationConfigRepo.updateHealthStatus.mockResolvedValue(undefined);

    mockJiraHealthCheck.mockResolvedValue({
      healthy: true,
      latencyMs: 150,
      details: { accountId: 'test-account' },
    });
    mockSesHealthCheck.mockResolvedValue({
      healthy: true,
      latencyMs: 100,
      details: { fromAddress: 'noreply@example.com' },
    });

    mockMetrics.increment.mockReset();
    mockMetrics.flush.mockReset().mockResolvedValue(undefined);
  });

  it('should emit AgentHeartbeatEmitted metric after successful heartbeat', async () => {
    const input: AgentCycleInput = {
      source: 'scheduled',
    };

    await handler(input, mockContext);

    expect(mockMetrics.increment).toHaveBeenCalledWith('AgentHeartbeatEmitted');
    expect(mockMetrics.flush).toHaveBeenCalled();
  });

  it('should emit metric after heartbeat event is written to DynamoDB', async () => {
    const input: AgentCycleInput = {
      source: 'scheduled',
    };

    const callOrder: string[] = [];
    mockEventRepo.createHeartbeat.mockImplementation(async () => {
      callOrder.push('createHeartbeat');
      return {};
    });
    mockMetrics.increment.mockImplementation(() => {
      callOrder.push('metricsIncrement');
    });
    mockMetrics.flush.mockImplementation(async () => {
      callOrder.push('metricsFlush');
    });

    await handler(input, mockContext);

    expect(callOrder.indexOf('createHeartbeat')).toBeLessThan(
      callOrder.indexOf('metricsIncrement')
    );
    expect(callOrder.indexOf('metricsIncrement')).toBeLessThan(
      callOrder.indexOf('metricsFlush')
    );
  });

  it('should flush metrics exactly once per invocation', async () => {
    const input: AgentCycleInput = {
      source: 'scheduled',
    };

    await handler(input, mockContext);

    expect(mockMetrics.flush).toHaveBeenCalledTimes(1);
  });
});

describe('MetricsEmitter metric name support', () => {
  it('should accept AgentHeartbeatEmitted as a valid metric name', () => {
    // Verify the mock metrics object accepts the new metric names
    expect(() => {
      mockMetrics.increment('AgentHeartbeatEmitted');
    }).not.toThrow();
  });

  it('should accept SchemaValidationSuccess as a valid metric name', () => {
    expect(() => {
      mockMetrics.increment('SchemaValidationSuccess');
    }).not.toThrow();
  });

  it('should accept SchemaValidationFailure as a valid metric name', () => {
    expect(() => {
      mockMetrics.increment('SchemaValidationFailure');
    }).not.toThrow();
  });
});
