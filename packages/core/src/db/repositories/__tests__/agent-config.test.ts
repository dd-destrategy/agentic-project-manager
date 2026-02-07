/**
 * Agent Config Repository Tests
 *
 * Comprehensive tests for agent configuration, budget tracking, and autonomy settings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentConfigRepository,
  CONFIG_KEYS,
  DEFAULT_CONFIG,
} from '../agent-config.js';
import type { DynamoDBClient } from '../../client.js';
import { KEY_PREFIX } from '../../../constants.js';
import type {
  BudgetStatus,
  AutonomyLevel,
  AutonomySettings,
  AutonomyChangeAcknowledgement,
  SpotCheckStats,
} from '../../../types/index.js';

// Create a mock DynamoDB client
function createMockDbClient(): DynamoDBClient {
  return {
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    getTableName: vi.fn().mockReturnValue('TestTable'),
    transactWrite: vi.fn(),
    batchWriteAll: vi.fn(),
  } as unknown as DynamoDBClient;
}

describe('AgentConfigRepository', () => {
  let mockDb: DynamoDBClient;
  let repo: AgentConfigRepository;

  beforeEach(() => {
    mockDb = createMockDbClient();
    repo = new AgentConfigRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('getValue', () => {
    it('should retrieve a config value', async () => {
      const mockItem = {
        PK: KEY_PREFIX.AGENT,
        SK: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.POLLING_INTERVAL}`,
        key: CONFIG_KEYS.POLLING_INTERVAL,
        value: 15,
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce(mockItem);

      const result = await repo.getValue<number>(CONFIG_KEYS.POLLING_INTERVAL);

      expect(result).toBe(15);
      expect(mockDb.get).toHaveBeenCalledWith(
        KEY_PREFIX.AGENT,
        `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.POLLING_INTERVAL}`
      );
    });

    it('should return null when config value does not exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getValue<number>(CONFIG_KEYS.POLLING_INTERVAL);

      expect(result).toBeNull();
    });
  });

  describe('setValue', () => {
    it('should set a config value', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.setValue(CONFIG_KEYS.POLLING_INTERVAL, 20);

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: KEY_PREFIX.AGENT,
          SK: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.POLLING_INTERVAL}`,
          key: CONFIG_KEYS.POLLING_INTERVAL,
          value: 20,
          updatedAt: expect.any(String),
        })
      );
    });
  });

  describe('getConfig', () => {
    it('should retrieve all config values with defaults', async () => {
      const mockItems = [
        {
          key: CONFIG_KEYS.POLLING_INTERVAL,
          value: 20,
        },
        {
          key: CONFIG_KEYS.BUDGET_CEILING_DAILY,
          value: 0.3,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: mockItems });

      const result = await repo.getConfig();

      expect(result).toEqual({
        pollingIntervalMinutes: 20,
        budgetCeilingDailyUsd: 0.3,
        holdQueueMinutes: DEFAULT_CONFIG.holdQueueMinutes,
        workingHours: DEFAULT_CONFIG.workingHours,
        llmSplit: DEFAULT_CONFIG.llmSplit,
        autonomyLevel: DEFAULT_CONFIG.autonomyLevel,
        dryRun: DEFAULT_CONFIG.dryRun,
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        KEY_PREFIX.AGENT,
        KEY_PREFIX.CONFIG
      );
    });

    it('should return all defaults when no config exists', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ items: [] });

      const result = await repo.getConfig();

      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('initializeDefaults', () => {
    it('should initialize default config values', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null); // No existing config
      vi.mocked(mockDb.batchWriteAll).mockResolvedValueOnce(undefined);

      await repo.initializeDefaults();

      expect(mockDb.batchWriteAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'put',
            pk: KEY_PREFIX.AGENT,
            sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.POLLING_INTERVAL}`,
          }),
          expect.objectContaining({
            type: 'put',
            pk: KEY_PREFIX.AGENT,
            sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.BUDGET_CEILING_DAILY}`,
          }),
        ])
      );
    });

    it('should not initialize if already initialized', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: 15 });

      await repo.initializeDefaults();

      expect(mockDb.batchWriteAll).not.toHaveBeenCalled();
    });
  });

  describe('getBudgetStatus', () => {
    it('should return current budget status', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      const result = await repo.getBudgetStatus();

      expect(result).toEqual({
        dailySpendUsd: 0.1,
        dailyLimitUsd: 0.23,
        monthlySpendUsd: 2.5,
        monthlyLimitUsd: 8.0,
        degradationTier: 0,
      });
    });

    it('should reset daily spend for new day', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.35 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: yesterday },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 3 },
        };
        return values[key] ?? null;
      });

      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      const result = await repo.getBudgetStatus();

      expect(result.dailySpendUsd).toBe(0);
      expect(result.degradationTier).toBe(0);
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.DAILY_SPEND,
          value: 0,
        })
      );
    });

    it('should reset monthly spend for new month', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const lastMonth = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
        .toISOString()
        .substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 7.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: lastMonth },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      const result = await repo.getBudgetStatus();

      expect(result.monthlySpendUsd).toBe(0);
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.MONTHLY_SPEND,
          value: 0,
        })
      );
    });
  });

  describe('recordSpend', () => {
    it('should record spend and calculate degradation tier', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      vi.mocked(mockDb.transactWrite).mockResolvedValueOnce(undefined);

      const result = await repo.recordSpend(0.15);

      expect(result).toEqual({
        dailySpendUsd: 0.25,
        dailyLimitUsd: 0.23,
        monthlySpendUsd: 2.65,
        monthlyLimitUsd: 8.0,
        degradationTier: 1,
      });

      expect(mockDb.transactWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'update',
            sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DAILY_SPEND}`,
          }),
          expect.objectContaining({
            type: 'update',
            sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.MONTHLY_SPEND}`,
          }),
          expect.objectContaining({
            type: 'put',
            sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DEGRADATION_TIER}`,
          }),
        ])
      );
    });

    it('should set tier 2 when spend reaches $0.27', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.2 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 1 },
        };
        return values[key] ?? null;
      });

      vi.mocked(mockDb.transactWrite).mockResolvedValueOnce(undefined);

      const result = await repo.recordSpend(0.08);

      expect(result.degradationTier).toBe(2);
      expect(result.dailySpendUsd).toBe(0.28);
    });

    it('should set tier 3 when spend reaches $0.30', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.25 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 2 },
        };
        return values[key] ?? null;
      });

      vi.mocked(mockDb.transactWrite).mockResolvedValueOnce(undefined);

      const result = await repo.recordSpend(0.06);

      expect(result.degradationTier).toBe(3);
      expect(result.dailySpendUsd).toBe(0.31);
    });

    it('should throw error when exceeding daily hard ceiling', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.35 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 3 },
        };
        return values[key] ?? null;
      });

      await expect(repo.recordSpend(0.1)).rejects.toThrow(
        'Cannot record spend: would exceed daily hard ceiling'
      );
    });

    it('should throw error when exceeding monthly limit', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 7.95 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      await expect(repo.recordSpend(0.1)).rejects.toThrow(
        'Cannot record spend: would exceed monthly limit'
      );
    });

    it('should handle transaction failure', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      const transactionError = new Error('Transaction failed');
      transactionError.name = 'TransactionCanceledException';
      vi.mocked(mockDb.transactWrite).mockRejectedValueOnce(transactionError);

      await expect(repo.recordSpend(0.05)).rejects.toThrow(
        'Budget update failed: concurrent modification or budget limit exceeded'
      );
    });
  });

  describe('canMakeLlmCall', () => {
    it('should allow LLM calls when under budget', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      const result = await repo.canMakeLlmCall();

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block LLM calls when monthly budget exceeded', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.1 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 8.1 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 0 },
        };
        return values[key] ?? null;
      });

      const result = await repo.canMakeLlmCall();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly budget exceeded');
    });

    it('should block LLM calls when daily hard ceiling reached', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const month = today.substring(0, 7);

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.DAILY_SPEND]: { value: 0.4 },
          [CONFIG_KEYS.DAILY_SPEND_DATE]: { value: today },
          [CONFIG_KEYS.MONTHLY_SPEND]: { value: 2.5 },
          [CONFIG_KEYS.MONTHLY_SPEND_MONTH]: { value: month },
          [CONFIG_KEYS.BUDGET_CEILING_DAILY]: { value: 0.23 },
          [CONFIG_KEYS.BUDGET_CEILING_MONTHLY]: { value: 8.0 },
          [CONFIG_KEYS.DEGRADATION_TIER]: { value: 3 },
        };
        return values[key] ?? null;
      });

      const result = await repo.canMakeLlmCall();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily hard ceiling reached');
    });
  });

  describe('heartbeat management', () => {
    it('should update last heartbeat', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.updateLastHeartbeat();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.LAST_HEARTBEAT,
          value: expect.any(String),
        })
      );
    });

    it('should get last heartbeat', async () => {
      const heartbeatTime = '2024-01-15T10:00:00.000Z';
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: heartbeatTime });

      const result = await repo.getLastHeartbeat();

      expect(result).toBe(heartbeatTime);
    });
  });

  describe('housekeeping management', () => {
    it('should update last housekeeping', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.updateLastHousekeeping();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.LAST_HOUSEKEEPING,
          value: expect.any(String),
        })
      );
    });

    it('should get last housekeeping', async () => {
      const housekeepingTime = '2024-01-15T10:00:00.000Z';
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: housekeepingTime });

      const result = await repo.getLastHousekeeping();

      expect(result).toBe(housekeepingTime);
    });

    it('should return true when housekeeping is due', async () => {
      // Use fake timers to ensure current hour is after 8am (default working hours start)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

      const yesterday = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: yesterday });

      const result = await repo.isHousekeepingDue();

      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('should return false when housekeeping already ran today', async () => {
      const today = new Date().toISOString();
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: today });

      const result = await repo.isHousekeepingDue();

      expect(result).toBe(false);
    });
  });

  describe('autonomy settings', () => {
    it('should get autonomy settings', async () => {
      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        const values: Record<string, unknown> = {
          [CONFIG_KEYS.AUTONOMY_LEVEL]: { value: 'tactical' },
          [CONFIG_KEYS.DRY_RUN]: { value: true },
        };
        return values[key] ?? null;
      });

      const result = await repo.getAutonomySettings();

      expect(result).toEqual({
        autonomyLevel: 'tactical',
        dryRun: true,
        lastLevelChange: undefined,
        pendingAcknowledgement: undefined,
      });
    });

    it('should get current autonomy level', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: 'artefact' });

      const result = await repo.getAutonomyLevel();

      expect(result).toBe('artefact');
    });

    it('should set autonomy level and create pending acknowledgement', async () => {
      vi.mocked(mockDb.get)
        .mockResolvedValueOnce({ value: 'monitoring' }) // getAutonomyLevel() in setAutonomyLevel
        .mockResolvedValueOnce({ value: 'tactical' }) // getAutonomySettings -> AUTONOMY_LEVEL
        .mockResolvedValueOnce(null) // getAutonomySettings -> DRY_RUN
        .mockResolvedValueOnce(null) // getAutonomySettings -> LAST_AUTONOMY_CHANGE
        .mockResolvedValueOnce(null); // getAutonomySettings -> PENDING_ACKNOWLEDGEMENT
      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      const result = await repo.setAutonomyLevel('tactical');

      expect(mockDb.put).toHaveBeenCalledTimes(3); // autonomy level, last change, pending ack
      expect(result.autonomyLevel).toBe('tactical');
    });

    it('should not create acknowledgement when level unchanged', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: 'monitoring' });
      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      await repo.setAutonomyLevel('monitoring');

      expect(mockDb.put).not.toHaveBeenCalled();
    });

    it('should acknowledge autonomy change', async () => {
      const pendingAck: AutonomyChangeAcknowledgement = {
        fromLevel: 'monitoring',
        toLevel: 'tactical',
        requestedAt: '2024-01-15T10:00:00.000Z',
        acknowledged: false,
      };

      vi.mocked(mockDb.get).mockImplementation(async function (pk, sk) {
        const key = (sk as string).replace(KEY_PREFIX.CONFIG, '');
        if (key === CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT) {
          return { value: pendingAck };
        }
        return null;
      });

      vi.mocked(mockDb.put).mockResolvedValue(undefined);

      await repo.acknowledgeAutonomyChange();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT,
          value: expect.objectContaining({
            acknowledged: true,
            acknowledgedAt: expect.any(String),
          }),
        })
      );
    });

    it('should clear pending acknowledgement', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.clearPendingAcknowledgement();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT,
          value: null,
        })
      );
    });

    it('should check if pending acknowledgement exists', async () => {
      const pendingAck: AutonomyChangeAcknowledgement = {
        fromLevel: 'monitoring',
        toLevel: 'tactical',
        requestedAt: '2024-01-15T10:00:00.000Z',
        acknowledged: false,
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: pendingAck });

      const result = await repo.hasPendingAcknowledgement();

      expect(result).toBe(true);
    });
  });

  describe('dry-run mode', () => {
    it('should get dry-run setting', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: true });

      const result = await repo.getDryRun();

      expect(result).toBe(true);
    });

    it('should set dry-run mode', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.setDryRun(true);

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.DRY_RUN,
          value: true,
        })
      );
    });

    it('should toggle dry-run mode', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: false });
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const result = await repo.toggleDryRun();

      expect(result).toBe(true);
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          value: true,
        })
      );
    });
  });

  describe('spot check statistics', () => {
    it('should get spot check stats', async () => {
      const stats: SpotCheckStats = {
        totalChecks: 10,
        correctCount: 9,
        incorrectCount: 1,
        accuracyRate: 0.9,
        lastCheckAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: stats });

      const result = await repo.getSpotCheckStats();

      expect(result).toEqual(stats);
    });

    it('should return empty stats when none exist', async () => {
      vi.mocked(mockDb.get).mockResolvedValueOnce(null);

      const result = await repo.getSpotCheckStats();

      expect(result).toEqual({
        totalChecks: 0,
        correctCount: 0,
        incorrectCount: 0,
        accuracyRate: 0,
        lastCheckAt: null,
      });
    });

    it('should record a correct spot check', async () => {
      const existingStats: SpotCheckStats = {
        totalChecks: 10,
        correctCount: 9,
        incorrectCount: 1,
        accuracyRate: 0.9,
        lastCheckAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: existingStats });
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const result = await repo.recordSpotCheck(true);

      expect(result).toEqual({
        totalChecks: 11,
        correctCount: 10,
        incorrectCount: 1,
        accuracyRate: 10 / 11,
        lastCheckAt: expect.any(String),
      });
    });

    it('should record an incorrect spot check', async () => {
      const existingStats: SpotCheckStats = {
        totalChecks: 10,
        correctCount: 9,
        incorrectCount: 1,
        accuracyRate: 0.9,
        lastCheckAt: '2024-01-15T10:00:00.000Z',
      };

      vi.mocked(mockDb.get).mockResolvedValueOnce({ value: existingStats });
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      const result = await repo.recordSpotCheck(false);

      expect(result).toEqual({
        totalChecks: 11,
        correctCount: 9,
        incorrectCount: 2,
        accuracyRate: 9 / 11,
        lastCheckAt: expect.any(String),
      });
    });

    it('should reset spot check stats', async () => {
      vi.mocked(mockDb.put).mockResolvedValueOnce(undefined);

      await repo.resetSpotCheckStats();

      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          key: CONFIG_KEYS.SPOT_CHECK_STATS,
          value: {
            totalChecks: 0,
            correctCount: 0,
            incorrectCount: 0,
            accuracyRate: 0,
            lastCheckAt: null,
          },
        })
      );
    });
  });
});
