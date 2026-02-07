/**
 * Housekeeping Lambda Tests
 *
 * Tests for the housekeeping handler that performs daily maintenance,
 * sends digest emails, and marks housekeeping as completed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted() so mock objects are available in vi.mock() factories.
const {
  mockProjectRepo,
  mockEventRepo,
  mockConfigRepo,
  mockArtefactRepo,
  mockEscalationRepo,
  mockHeldActionRepo,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockProjectRepo: {
    getActive: vi.fn(),
  },
  mockEventRepo: {
    getByDate: vi.fn(),
  },
  mockConfigRepo: {
    getValue: vi.fn(),
    getBudgetStatus: vi.fn(),
    updateLastHousekeeping: vi.fn(),
  },
  mockArtefactRepo: {
    getAllForProject: vi.fn(),
  },
  mockEscalationRepo: {
    countPending: vi.fn(),
    countPendingByProject: vi.fn(),
  },
  mockHeldActionRepo: {
    countPending: vi.fn(),
    countPendingByProject: vi.fn(),
  },
  mockSendEmail: vi.fn(),
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
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return mockArtefactRepo;
  }),
  EscalationRepository: vi.fn().mockImplementation(function () {
    return mockEscalationRepo;
  }),
  HeldActionRepository: vi.fn().mockImplementation(function () {
    return mockHeldActionRepo;
  }),
  CONFIG_KEYS: {
    DIGEST_EMAIL: 'digest_email',
    DASHBOARD_URL: 'dashboard_url',
    DAILY_BUDGET_LIMIT: 'budget_ceiling_daily_usd',
    MONTHLY_BUDGET_LIMIT: 'budget_ceiling_monthly_usd',
  },
}));

vi.mock('@agentic-pm/core/integrations', () => ({
  SESClient: vi.fn().mockImplementation(function () {
    return {
      sendEmail: mockSendEmail,
    };
  }),
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

import { handler } from '../handler.js';

// Mock Lambda context
const mockContext: Context = {
  awsRequestId: 'test-request-id',
  functionName: 'housekeeping',
  functionVersion: '1',
  invokedFunctionArn:
    'arn:aws:lambda:ap-southeast-2:123456789:function:housekeeping',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/housekeeping',
  logStreamName: '2024/01/15/[$LATEST]abc123',
  callbackWaitsForEmptyEventLoop: true,
  getRemainingTimeInMillis: () => 120000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
};

// Default mock input
const mockInput = { updated: [] };

describe('Housekeeping Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no digest email configured
    mockConfigRepo.getValue.mockImplementation(async (key: string) => {
      switch (key) {
        case 'digest_email':
          return null;
        case 'dashboard_url':
          return 'https://agentic-pm.example.com';
        default:
          return null;
      }
    });

    // Default budget status
    mockConfigRepo.getBudgetStatus.mockResolvedValue({
      dailySpendUsd: 0.12,
      dailyLimitUsd: 0.23,
      monthlySpendUsd: 2.5,
      monthlyLimitUsd: 8.0,
      degradationTier: 0,
    });

    mockConfigRepo.updateLastHousekeeping.mockResolvedValue(undefined);

    // Default: no active projects
    mockProjectRepo.getActive.mockResolvedValue({ items: [] });

    // Default: no events
    mockEventRepo.getByDate.mockResolvedValue({ items: [] });

    // Default: no pending escalations or held actions
    mockEscalationRepo.countPending.mockResolvedValue(0);
    mockEscalationRepo.countPendingByProject.mockResolvedValue(0);
    mockHeldActionRepo.countPending.mockResolvedValue(0);
    mockHeldActionRepo.countPendingByProject.mockResolvedValue(0);

    // Default: no artefacts
    mockArtefactRepo.getAllForProject.mockResolvedValue([]);

    // Default: email sends successfully
    mockSendEmail.mockResolvedValue(undefined);

    // Default env
    process.env.SES_FROM_ADDRESS = 'noreply@test.com';
  });

  describe('updateLastHousekeeping', () => {
    it('should call updateLastHousekeeping on success', async () => {
      await handler(mockInput, mockContext);

      expect(mockConfigRepo.updateLastHousekeeping).toHaveBeenCalledTimes(1);
    });

    it('should not call updateLastHousekeeping when handler throws', async () => {
      mockProjectRepo.getActive.mockRejectedValue(
        new Error('DynamoDB failure')
      );

      await expect(handler(mockInput, mockContext)).rejects.toThrow(
        'DynamoDB failure'
      );

      expect(mockConfigRepo.updateLastHousekeeping).not.toHaveBeenCalled();
    });
  });

  describe('Digest Email', () => {
    it('should send digest when DIGEST_EMAIL is set', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          case 'dashboard_url':
            return 'https://dashboard.example.com';
          default:
            return null;
        }
      });

      const result = await handler(mockInput, mockContext);

      expect(result.digestSent).toBe(true);
      expect(result.digestRecipient).toBe('user@example.com');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user@example.com'],
          subject: expect.stringContaining('[Agentic PM] Daily Digest'),
          bodyText: expect.any(String),
          bodyHtml: expect.any(String),
        })
      );
    });

    it('should not send digest when DIGEST_EMAIL is not set', async () => {
      const result = await handler(mockInput, mockContext);

      expect(result.digestSent).toBe(false);
      expect(result.digestRecipient).toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should still complete if digest email fails to send', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });
      mockSendEmail.mockRejectedValue(new Error('SES error'));

      const result = await handler(mockInput, mockContext);

      expect(result.digestSent).toBe(false);
      // Should still call updateLastHousekeeping
      expect(mockConfigRepo.updateLastHousekeeping).toHaveBeenCalledTimes(1);
    });
  });

  describe('Budget Status', () => {
    it('should use real budget status from configRepo', async () => {
      mockConfigRepo.getBudgetStatus.mockResolvedValue({
        dailySpendUsd: 0.15,
        dailyLimitUsd: 0.23,
        monthlySpendUsd: 3.5,
        monthlyLimitUsd: 8.0,
        degradationTier: 1,
      });

      const result = await handler(mockInput, mockContext);

      expect(mockConfigRepo.getBudgetStatus).toHaveBeenCalledTimes(1);
      expect(result.budgetSummary.dailySpendUsd).toBe(0.15);
      expect(result.budgetSummary.monthlySpendUsd).toBe(3.5);
    });

    it('should include real budget limits in digest email', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });
      mockConfigRepo.getBudgetStatus.mockResolvedValue({
        dailySpendUsd: 0.2,
        dailyLimitUsd: 0.23,
        monthlySpendUsd: 5.0,
        monthlyLimitUsd: 8.0,
        degradationTier: 2,
      });

      await handler(mockInput, mockContext);

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: expect.stringContaining('$0.20 / $0.23'),
          bodyHtml: expect.stringContaining('$0.20 / $0.23'),
        })
      );
    });
  });

  describe('Zero Active Projects', () => {
    it('should handle zero active projects gracefully', async () => {
      mockProjectRepo.getActive.mockResolvedValue({ items: [] });

      const result = await handler(mockInput, mockContext);

      expect(result.digestSent).toBe(false);
      expect(result.storageCheck).toBeDefined();
      expect(result.budgetSummary).toBeDefined();
      expect(result.activitySummary).toBeDefined();
      expect(mockConfigRepo.updateLastHousekeeping).toHaveBeenCalledTimes(1);
    });

    it('should include "No active projects" message in digest text when no projects', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });

      await handler(mockInput, mockContext);

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: expect.stringContaining('No active projects configured'),
        })
      );
    });
  });

  describe('Pending Escalations and Held Actions', () => {
    it('should include pending escalation count from real repo data', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });
      mockEscalationRepo.countPending.mockResolvedValue(3);

      await handler(mockInput, mockContext);

      expect(mockEscalationRepo.countPending).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: expect.stringContaining('3 PENDING ESCALATIONS'),
        })
      );
    });

    it('should include pending held action count in digest', async () => {
      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });
      mockHeldActionRepo.countPending.mockResolvedValue(2);

      await handler(mockInput, mockContext);

      expect(mockHeldActionRepo.countPending).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: expect.stringContaining('2 held actions awaiting review'),
        })
      );
    });

    it('should query per-project escalation and held action counts', async () => {
      mockProjectRepo.getActive.mockResolvedValue({
        items: [
          {
            id: 'project-1',
            name: 'Test Project',
            source: 'jira',
            sourceProjectKey: 'TEST',
            status: 'active',
            autonomyLevel: 'artefact',
            config: {},
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
        ],
      });

      mockEscalationRepo.countPendingByProject.mockResolvedValue(2);
      mockHeldActionRepo.countPendingByProject.mockResolvedValue(1);

      await handler(mockInput, mockContext);

      expect(mockEscalationRepo.countPendingByProject).toHaveBeenCalledWith(
        'project-1'
      );
      expect(mockHeldActionRepo.countPendingByProject).toHaveBeenCalledWith(
        'project-1'
      );
    });
  });

  describe('Artefact Change Tracking', () => {
    it('should query artefacts for each active project', async () => {
      mockProjectRepo.getActive.mockResolvedValue({
        items: [
          {
            id: 'project-1',
            name: 'Test Project',
            source: 'jira',
            sourceProjectKey: 'TEST',
            status: 'active',
            autonomyLevel: 'artefact',
            config: {},
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
        ],
      });

      const recentDate = new Date().toISOString();
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      mockArtefactRepo.getAllForProject.mockResolvedValue([
        {
          id: 'art-1',
          projectId: 'project-1',
          type: 'delivery_state',
          content: {},
          version: 2,
          createdAt: oldDate,
          updatedAt: recentDate,
        },
        {
          id: 'art-2',
          projectId: 'project-1',
          type: 'raid_log',
          content: {},
          version: 1,
          createdAt: oldDate,
          updatedAt: oldDate,
        },
      ]);

      mockConfigRepo.getValue.mockImplementation(async (key: string) => {
        switch (key) {
          case 'digest_email':
            return 'user@example.com';
          default:
            return null;
        }
      });

      await handler(mockInput, mockContext);

      expect(mockArtefactRepo.getAllForProject).toHaveBeenCalledWith(
        'project-1'
      );
      // The recently changed artefact (delivery_state) should appear in the digest
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyText: expect.stringContaining('delivery_state'),
        })
      );
    });
  });

  describe('Activity Statistics', () => {
    it('should calculate activity stats from events', async () => {
      mockEventRepo.getByDate.mockResolvedValue({
        items: [
          { eventType: 'heartbeat', projectId: 'p1' },
          { eventType: 'signal_detected', projectId: 'p1' },
          { eventType: 'action_taken', projectId: 'p1' },
          { eventType: 'artefact_updated', projectId: 'p1' },
          { eventType: 'escalation_created', projectId: 'p1' },
        ],
      });

      const result = await handler(mockInput, mockContext);

      expect(result.activitySummary.cyclesRun).toBe(2); // two calls to getByDate return same items
      expect(result.activitySummary.signalsDetected).toBe(2);
      expect(result.activitySummary.actionsTaken).toBe(2);
      expect(result.activitySummary.artefactsUpdated).toBe(2);
      expect(result.activitySummary.escalationsCreated).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw when project repository fails', async () => {
      mockProjectRepo.getActive.mockRejectedValue(
        new Error('DynamoDB failure')
      );

      await expect(handler(mockInput, mockContext)).rejects.toThrow(
        'DynamoDB failure'
      );
    });

    it('should throw when budget status fetch fails', async () => {
      mockConfigRepo.getBudgetStatus.mockRejectedValue(
        new Error('Budget fetch failed')
      );

      await expect(handler(mockInput, mockContext)).rejects.toThrow(
        'Budget fetch failed'
      );
    });
  });
});
