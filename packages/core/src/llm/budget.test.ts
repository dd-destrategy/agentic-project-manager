/**
 * Budget Tracker Tests
 *
 * Comprehensive tests for LLM budget tracking and degradation ladder.
 * Tests daily tracking, tier transitions, reset at midnight, and persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BudgetTracker,
  createBudgetTracker,
  DEGRADATION_THRESHOLDS,
  DEGRADATION_CONFIGS,
} from './budget.js';
import { DAILY_LLM_BUDGET_USD, MONTHLY_LLM_BUDGET_USD } from '../constants.js';
import type { TokenUsage, DegradationTier } from './types.js';

// ============================================================================
// Mock DynamoDB Client
// ============================================================================

function createMockDbClient() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createTokenUsage(costUsd: number): TokenUsage {
  return {
    inputTokens: Math.floor(costUsd * 100000),
    outputTokens: Math.floor(costUsd * 50000),
    costUsd,
  };
}

// ============================================================================
// DEGRADATION_THRESHOLDS Tests
// ============================================================================

describe('DEGRADATION_THRESHOLDS', () => {
  it('should have correct tier 1 threshold at 70%', () => {
    expect(DEGRADATION_THRESHOLDS.tier1Percent).toBe(0.7);
  });

  it('should have correct tier 2 threshold at 85%', () => {
    expect(DEGRADATION_THRESHOLDS.tier2Percent).toBe(0.85);
  });

  it('should have correct tier 3 threshold at 95%', () => {
    expect(DEGRADATION_THRESHOLDS.tier3Percent).toBe(0.95);
  });

  it('should have correct hard ceiling at 100%', () => {
    expect(DEGRADATION_THRESHOLDS.hardCeilingPercent).toBe(1.0);
  });

  it('should have thresholds in ascending order', () => {
    expect(DEGRADATION_THRESHOLDS.tier1Percent).toBeLessThan(
      DEGRADATION_THRESHOLDS.tier2Percent
    );
    expect(DEGRADATION_THRESHOLDS.tier2Percent).toBeLessThan(
      DEGRADATION_THRESHOLDS.tier3Percent
    );
    expect(DEGRADATION_THRESHOLDS.tier3Percent).toBeLessThanOrEqual(
      DEGRADATION_THRESHOLDS.hardCeilingPercent
    );
  });
});

// ============================================================================
// DEGRADATION_CONFIGS Tests
// ============================================================================

describe('DEGRADATION_CONFIGS', () => {
  it('should have configurations for all 4 tiers', () => {
    expect(DEGRADATION_CONFIGS[0]).toBeDefined();
    expect(DEGRADATION_CONFIGS[1]).toBeDefined();
    expect(DEGRADATION_CONFIGS[2]).toBeDefined();
    expect(DEGRADATION_CONFIGS[3]).toBeDefined();
  });

  describe('Tier 0 (Normal)', () => {
    const config = DEGRADATION_CONFIGS[0];

    it('should have tier 0', () => {
      expect(config.tier).toBe(0);
    });

    it('should be named "Normal"', () => {
      expect(config.name).toBe('Normal');
    });

    it('should allow LLM calls', () => {
      expect(config.allowLlmCalls).toBe(true);
    });

    it('should not skip low priority', () => {
      expect(config.skipLowPriority).toBe(false);
    });

    it('should not batch signals', () => {
      expect(config.batchSignals).toBe(false);
    });

    it('should have 70/30 Haiku/Sonnet split', () => {
      expect(config.haikuPercent).toBe(70);
      expect(config.sonnetPercent).toBe(30);
    });

    it('should have 15-minute polling interval', () => {
      expect(config.pollingIntervalMinutes).toBe(15);
    });
  });

  describe('Tier 1 (Budget Pressure)', () => {
    const config = DEGRADATION_CONFIGS[1];

    it('should have tier 1', () => {
      expect(config.tier).toBe(1);
    });

    it('should allow LLM calls', () => {
      expect(config.allowLlmCalls).toBe(true);
    });

    it('should skip low priority', () => {
      expect(config.skipLowPriority).toBe(true);
    });

    it('should not batch signals', () => {
      expect(config.batchSignals).toBe(false);
    });

    it('should have 85/15 Haiku/Sonnet split', () => {
      expect(config.haikuPercent).toBe(85);
      expect(config.sonnetPercent).toBe(15);
    });
  });

  describe('Tier 2 (High Pressure)', () => {
    const config = DEGRADATION_CONFIGS[2];

    it('should have tier 2', () => {
      expect(config.tier).toBe(2);
    });

    it('should allow LLM calls', () => {
      expect(config.allowLlmCalls).toBe(true);
    });

    it('should skip low priority', () => {
      expect(config.skipLowPriority).toBe(true);
    });

    it('should batch signals', () => {
      expect(config.batchSignals).toBe(true);
    });

    it('should be Haiku-only (100/0)', () => {
      expect(config.haikuPercent).toBe(100);
      expect(config.sonnetPercent).toBe(0);
    });

    it('should have 30-minute polling interval', () => {
      expect(config.pollingIntervalMinutes).toBe(30);
    });
  });

  describe('Tier 3 (Monitoring Only)', () => {
    const config = DEGRADATION_CONFIGS[3];

    it('should have tier 3', () => {
      expect(config.tier).toBe(3);
    });

    it('should NOT allow LLM calls', () => {
      expect(config.allowLlmCalls).toBe(false);
    });

    it('should skip low priority', () => {
      expect(config.skipLowPriority).toBe(true);
    });

    it('should batch signals', () => {
      expect(config.batchSignals).toBe(true);
    });

    it('should have 0/0 Haiku/Sonnet split', () => {
      expect(config.haikuPercent).toBe(0);
      expect(config.sonnetPercent).toBe(0);
    });

    it('should have 60-minute polling interval', () => {
      expect(config.pollingIntervalMinutes).toBe(60);
    });
  });
});

// ============================================================================
// BudgetTracker Basic Tests
// ============================================================================

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker();
  });

  describe('Initial state', () => {
    it('should start with zero daily spend', () => {
      const state = tracker.getState();
      expect(state.dailySpendUsd).toBe(0);
    });

    it('should start with zero monthly spend', () => {
      const state = tracker.getState();
      expect(state.monthlySpendUsd).toBe(0);
    });

    it('should start at tier 0', () => {
      const state = tracker.getState();
      expect(state.degradationTier).toBe(0);
    });

    it('should use correct daily limit from constants', () => {
      const state = tracker.getState();
      expect(state.dailyLimitUsd).toBe(DAILY_LLM_BUDGET_USD);
    });

    it('should use correct monthly limit from constants', () => {
      const state = tracker.getState();
      expect(state.monthlyLimitUsd).toBe(MONTHLY_LLM_BUDGET_USD);
    });

    it('should have current date set', () => {
      const state = tracker.getState();
      expect(state.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('recordUsage', () => {
    it('should update daily spend', async () => {
      const usage = createTokenUsage(0.05);
      await tracker.recordUsage(
        usage,
        'test_operation',
        'claude-3-5-haiku-20241022'
      );

      const state = tracker.getState();
      expect(state.dailySpendUsd).toBe(0.05);
    });

    it('should update monthly spend', async () => {
      const usage = createTokenUsage(0.05);
      await tracker.recordUsage(
        usage,
        'test_operation',
        'claude-3-5-haiku-20241022'
      );

      const state = tracker.getState();
      expect(state.monthlySpendUsd).toBe(0.05);
    });

    it('should accumulate multiple usages', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.03),
        'op1',
        'claude-3-5-haiku-20241022'
      );
      await tracker.recordUsage(
        createTokenUsage(0.04),
        'op2',
        'claude-3-5-haiku-20241022'
      );
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'op3',
        'claude-sonnet-4-5-20250929'
      );

      const state = tracker.getState();
      expect(state.dailySpendUsd).toBeCloseTo(0.12, 5);
    });

    it('should track usage history', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'test_op',
        'claude-3-5-haiku-20241022'
      );

      const history = tracker.getUsageHistory();
      expect(history).toHaveLength(1);
      expect(history[0].operation).toBe('test_op');
      expect(history[0].costUsd).toBe(0.05);
    });

    it('should return updated state', async () => {
      const usage = createTokenUsage(0.1);
      const state = await tracker.recordUsage(
        usage,
        'test',
        'claude-3-5-haiku-20241022'
      );

      expect(state.dailySpendUsd).toBe(0.1);
    });
  });

  describe('calculateDegradationTier', () => {
    it('should return tier 0 at 0% usage', () => {
      expect(tracker.calculateDegradationTier()).toBe(0);
    });

    it('should return tier 0 below 70%', async () => {
      // 69% of $0.23 = ~$0.1587
      await tracker.recordUsage(
        createTokenUsage(0.158),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(0);
    });

    it('should return tier 1 at 70%', async () => {
      // 70% of $0.23 = $0.161
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(1);
    });

    it('should return tier 1 between 70-85%', async () => {
      // 80% of $0.23 = $0.184
      await tracker.recordUsage(
        createTokenUsage(0.184),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(1);
    });

    it('should return tier 2 at 85%', async () => {
      // 85% of $0.23 = $0.1955
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(2);
    });

    it('should return tier 2 between 85-95%', async () => {
      // 90% of $0.23 = $0.207
      await tracker.recordUsage(
        createTokenUsage(0.207),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(2);
    });

    it('should return tier 3 at 95%', async () => {
      // 95% of $0.23 = $0.2185
      await tracker.recordUsage(
        createTokenUsage(0.219),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(3);
    });

    it('should return tier 3 at 100%', async () => {
      await tracker.recordUsage(
        createTokenUsage(DAILY_LLM_BUDGET_USD),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.calculateDegradationTier()).toBe(3);
    });
  });

  describe('canMakeCall', () => {
    it('should return true at tier 0', () => {
      expect(tracker.canMakeCall()).toBe(true);
    });

    it('should return true at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.canMakeCall()).toBe(true);
    });

    it('should return true at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.canMakeCall()).toBe(true);
    });

    it('should return false at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.canMakeCall()).toBe(false);
    });
  });

  describe('isAtHardCeiling', () => {
    it('should return false below ceiling', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.2),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isAtHardCeiling()).toBe(false);
    });

    it('should return true at ceiling', async () => {
      await tracker.recordUsage(
        createTokenUsage(DAILY_LLM_BUDGET_USD),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isAtHardCeiling()).toBe(true);
    });

    it('should return true above ceiling', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.25),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isAtHardCeiling()).toBe(true);
    });
  });

  describe('isHaikuOnly', () => {
    it('should return false at tier 0', () => {
      expect(tracker.isHaikuOnly()).toBe(false);
    });

    it('should return false at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isHaikuOnly()).toBe(false);
    });

    it('should return true at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isHaikuOnly()).toBe(true);
    });

    it('should return true at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.isHaikuOnly()).toBe(true);
    });
  });

  describe('shouldSkipLowPriority', () => {
    it('should return false at tier 0', () => {
      expect(tracker.shouldSkipLowPriority()).toBe(false);
    });

    it('should return true at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldSkipLowPriority()).toBe(true);
    });

    it('should return true at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldSkipLowPriority()).toBe(true);
    });

    it('should return true at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldSkipLowPriority()).toBe(true);
    });
  });

  describe('shouldBatchSignals', () => {
    it('should return false at tier 0', () => {
      expect(tracker.shouldBatchSignals()).toBe(false);
    });

    it('should return false at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldBatchSignals()).toBe(false);
    });

    it('should return true at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldBatchSignals()).toBe(true);
    });

    it('should return true at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.shouldBatchSignals()).toBe(true);
    });
  });

  describe('getPollingIntervalMinutes', () => {
    it('should return 15 at tier 0', () => {
      expect(tracker.getPollingIntervalMinutes()).toBe(15);
    });

    it('should return 15 at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getPollingIntervalMinutes()).toBe(15);
    });

    it('should return 30 at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getPollingIntervalMinutes()).toBe(30);
    });

    it('should return 60 at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getPollingIntervalMinutes()).toBe(60);
    });
  });

  describe('getLlmMix', () => {
    it('should return 70/30 at tier 0', () => {
      const mix = tracker.getLlmMix();
      expect(mix.haikuPercent).toBe(70);
      expect(mix.sonnetPercent).toBe(30);
    });

    it('should return 85/15 at tier 1', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.162),
        'test',
        'claude-3-5-haiku-20241022'
      );
      const mix = tracker.getLlmMix();
      expect(mix.haikuPercent).toBe(85);
      expect(mix.sonnetPercent).toBe(15);
    });

    it('should return 100/0 at tier 2', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.196),
        'test',
        'claude-3-5-haiku-20241022'
      );
      const mix = tracker.getLlmMix();
      expect(mix.haikuPercent).toBe(100);
      expect(mix.sonnetPercent).toBe(0);
    });

    it('should return 0/0 at tier 3', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.22),
        'test',
        'claude-3-5-haiku-20241022'
      );
      const mix = tracker.getLlmMix();
      expect(mix.haikuPercent).toBe(0);
      expect(mix.sonnetPercent).toBe(0);
    });
  });

  describe('wouldExceedBudget', () => {
    it('should return false for small cost when budget is available', () => {
      expect(tracker.wouldExceedBudget(0.05)).toBe(false);
    });

    it('should return false for cost exactly meeting remaining budget', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.13),
        'test',
        'claude-3-5-haiku-20241022'
      );
      // Remaining: $0.23 - $0.13 = $0.10
      expect(tracker.wouldExceedBudget(0.1)).toBe(false);
    });

    it('should return true for cost exceeding remaining budget', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.2),
        'test',
        'claude-3-5-haiku-20241022'
      );
      // Remaining: $0.23 - $0.20 = $0.03
      expect(tracker.wouldExceedBudget(0.05)).toBe(true);
    });

    it('should return true when already at budget', async () => {
      await tracker.recordUsage(
        createTokenUsage(DAILY_LLM_BUDGET_USD),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.wouldExceedBudget(0.01)).toBe(true);
    });
  });

  describe('getRemainingDailyBudget', () => {
    it('should return full budget when nothing spent', () => {
      expect(tracker.getRemainingDailyBudget()).toBe(DAILY_LLM_BUDGET_USD);
    });

    it('should return reduced budget after spending', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.1),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getRemainingDailyBudget()).toBeCloseTo(
        DAILY_LLM_BUDGET_USD - 0.1,
        5
      );
    });

    it('should return 0 when budget exceeded', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.3),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getRemainingDailyBudget()).toBe(0);
    });
  });

  describe('getRemainingMonthlyBudget', () => {
    it('should return full budget when nothing spent', () => {
      expect(tracker.getRemainingMonthlyBudget()).toBe(MONTHLY_LLM_BUDGET_USD);
    });

    it('should return reduced budget after spending', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.5),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getRemainingMonthlyBudget()).toBeCloseTo(
        MONTHLY_LLM_BUDGET_USD - 0.5,
        5
      );
    });
  });

  describe('getDailySpendPercent', () => {
    it('should return 0 when nothing spent', () => {
      expect(tracker.getDailySpendPercent()).toBe(0);
    });

    it('should return correct percentage', async () => {
      // Spend half the daily budget
      await tracker.recordUsage(
        createTokenUsage(DAILY_LLM_BUDGET_USD / 2),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getDailySpendPercent()).toBeCloseTo(50, 1);
    });

    it('should return 100+ when over budget', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.3),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getDailySpendPercent()).toBeGreaterThan(100);
    });
  });

  describe('getMonthlySpendPercent', () => {
    it('should return 0 when nothing spent', () => {
      expect(tracker.getMonthlySpendPercent()).toBe(0);
    });

    it('should return correct percentage', async () => {
      // Spend 10% of monthly budget ($0.80)
      await tracker.recordUsage(
        createTokenUsage(0.8),
        'test',
        'claude-3-5-haiku-20241022'
      );
      expect(tracker.getMonthlySpendPercent()).toBeCloseTo(10, 1);
    });
  });

  describe('getUsageHistory', () => {
    it('should return empty array initially', () => {
      expect(tracker.getUsageHistory()).toHaveLength(0);
    });

    it('should return copy of history', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'test',
        'claude-3-5-haiku-20241022'
      );
      const history1 = tracker.getUsageHistory();
      const history2 = tracker.getUsageHistory();

      expect(history1).not.toBe(history2); // Different array instances
      expect(history1).toEqual(history2);
    });

    it('should include all recorded usages', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.01),
        'op1',
        'claude-3-5-haiku-20241022'
      );
      await tracker.recordUsage(
        createTokenUsage(0.02),
        'op2',
        'claude-sonnet-4-5-20250929'
      );
      await tracker.recordUsage(
        createTokenUsage(0.03),
        'op3',
        'claude-3-5-haiku-20241022'
      );

      const history = tracker.getUsageHistory();
      expect(history).toHaveLength(3);
      expect(history[0].operation).toBe('op1');
      expect(history[1].operation).toBe('op2');
      expect(history[2].operation).toBe('op3');
    });
  });
});

// ============================================================================
// DynamoDB Persistence Tests
// ============================================================================

describe('BudgetTracker with DynamoDB', () => {
  let tracker: BudgetTracker;
  let mockDb: ReturnType<typeof createMockDbClient>;

  beforeEach(() => {
    mockDb = createMockDbClient();
    tracker = new BudgetTracker(mockDb as any);
  });

  describe('setDbClient', () => {
    it('should allow setting DB client after construction', () => {
      const trackerWithoutDb = new BudgetTracker();
      const newMockDb = createMockDbClient();

      trackerWithoutDb.setDbClient(newMockDb as any);

      // Should not throw when recording usage
      expect(async () => {
        await trackerWithoutDb.recordUsage(
          createTokenUsage(0.05),
          'test',
          'claude-3-5-haiku-20241022'
        );
      }).not.toThrow();
    });
  });

  describe('saveToDb', () => {
    it('should save daily record to DynamoDB', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'test',
        'claude-3-5-haiku-20241022'
      );

      expect(mockDb.put).toHaveBeenCalled();
    });

    it('should save monthly record to DynamoDB', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'test',
        'claude-3-5-haiku-20241022'
      );

      // Should be called twice (daily and monthly records)
      expect(mockDb.put).toHaveBeenCalledTimes(2);
    });

    it('should include correct daily spend in record', async () => {
      await tracker.recordUsage(
        createTokenUsage(0.05),
        'test',
        'claude-3-5-haiku-20241022'
      );

      const putCall = mockDb.put.mock.calls[0][0];
      expect(putCall.dailySpendUsd).toBe(0.05);
    });

    it('should limit usage history to 100 entries', async () => {
      // Record 105 usages
      for (let i = 0; i < 105; i++) {
        await tracker.recordUsage(
          createTokenUsage(0.001),
          `op${i}`,
          'claude-3-5-haiku-20241022'
        );
      }

      const lastPutCall =
        mockDb.put.mock.calls[mockDb.put.mock.calls.length - 2][0];
      expect(lastPutCall.usageHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('loadFromDb', () => {
    it('should load existing daily spend from DynamoDB', async () => {
      mockDb.get.mockResolvedValueOnce({
        dailySpendUsd: 0.1,
        usageHistory: [],
      });

      await tracker.loadFromDb();
      const state = tracker.getState();

      expect(state.dailySpendUsd).toBe(0.1);
    });

    it('should load existing monthly spend from DynamoDB', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          dailySpendUsd: 0.1,
          usageHistory: [],
        })
        .mockResolvedValueOnce({
          monthlySpendUsd: 2.5,
        });

      await tracker.loadFromDb();
      const state = tracker.getState();

      expect(state.monthlySpendUsd).toBe(2.5);
    });

    it('should default to 0 if no record exists', async () => {
      mockDb.get.mockResolvedValue(null);

      await tracker.loadFromDb();
      const state = tracker.getState();

      expect(state.dailySpendUsd).toBe(0);
      expect(state.monthlySpendUsd).toBe(0);
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('DynamoDB error'));

      // Should not throw
      await expect(tracker.loadFromDb()).resolves.not.toThrow();
    });
  });

  describe('sync', () => {
    it('should load from DB and return state', async () => {
      mockDb.get
        .mockResolvedValueOnce({
          dailySpendUsd: 0.15,
          usageHistory: [],
        })
        .mockResolvedValueOnce({
          monthlySpendUsd: 3.0,
        });

      const state = await tracker.sync();

      expect(state.dailySpendUsd).toBe(0.15);
      expect(state.monthlySpendUsd).toBe(3.0);
    });
  });
});

// ============================================================================
// Static Utilities Tests
// ============================================================================

describe('BudgetTracker static utilities', () => {
  describe('getDailyThresholdForTier', () => {
    it('should return 0 for tier 0', () => {
      expect(BudgetTracker.getDailyThresholdForTier(0)).toBe(0);
    });

    it('should return correct threshold for tier 1', () => {
      const expected =
        DEGRADATION_THRESHOLDS.tier1Percent * DAILY_LLM_BUDGET_USD;
      expect(BudgetTracker.getDailyThresholdForTier(1)).toBeCloseTo(
        expected,
        5
      );
    });

    it('should return correct threshold for tier 2', () => {
      const expected =
        DEGRADATION_THRESHOLDS.tier2Percent * DAILY_LLM_BUDGET_USD;
      expect(BudgetTracker.getDailyThresholdForTier(2)).toBeCloseTo(
        expected,
        5
      );
    });

    it('should return correct threshold for tier 3', () => {
      const expected =
        DEGRADATION_THRESHOLDS.tier3Percent * DAILY_LLM_BUDGET_USD;
      expect(BudgetTracker.getDailyThresholdForTier(3)).toBeCloseTo(
        expected,
        5
      );
    });
  });

  describe('getTierFromSpend', () => {
    it('should return tier 0 for 0 spend', () => {
      expect(BudgetTracker.getTierFromSpend(0)).toBe(0);
    });

    it('should return tier 0 below 70%', () => {
      expect(BudgetTracker.getTierFromSpend(0.15)).toBe(0);
    });

    it('should return tier 1 at 70%', () => {
      const spend = DAILY_LLM_BUDGET_USD * 0.71;
      expect(BudgetTracker.getTierFromSpend(spend)).toBe(1);
    });

    it('should return tier 2 at 85%', () => {
      const spend = DAILY_LLM_BUDGET_USD * 0.86;
      expect(BudgetTracker.getTierFromSpend(spend)).toBe(2);
    });

    it('should return tier 3 at 95%', () => {
      const spend = DAILY_LLM_BUDGET_USD * 0.96;
      expect(BudgetTracker.getTierFromSpend(spend)).toBe(3);
    });
  });

  describe('formatBudgetState', () => {
    it('should format budget state correctly', () => {
      const state = {
        dailySpendUsd: 0.1,
        dailyLimitUsd: 0.23,
        monthlySpendUsd: 2.5,
        monthlyLimitUsd: 8.0,
        degradationTier: 0 as DegradationTier,
        currentDate: '2024-01-15',
        monthStartDate: '2024-01-01',
      };

      const formatted = BudgetTracker.formatBudgetState(state);

      expect(formatted).toContain('Tier 0');
      expect(formatted).toContain('Normal');
      expect(formatted).toContain('Daily');
      expect(formatted).toContain('Monthly');
    });

    it('should show correct tier name', () => {
      const tiers: DegradationTier[] = [0, 1, 2, 3];
      const tierNames = [
        'Normal',
        'Budget Pressure',
        'High Pressure',
        'Monitoring Only',
      ];

      tiers.forEach((tier, index) => {
        const state = {
          dailySpendUsd: 0,
          dailyLimitUsd: 0.23,
          monthlySpendUsd: 0,
          monthlyLimitUsd: 8.0,
          degradationTier: tier,
          currentDate: '2024-01-15',
          monthStartDate: '2024-01-01',
        };

        const formatted = BudgetTracker.formatBudgetState(state);
        expect(formatted).toContain(tierNames[index]);
      });
    });
  });
});

// ============================================================================
// createBudgetTracker Factory Tests
// ============================================================================

describe('createBudgetTracker', () => {
  it('should create tracker without DB client', () => {
    const tracker = createBudgetTracker();
    expect(tracker).toBeInstanceOf(BudgetTracker);
  });

  it('should create tracker with DB client', () => {
    const mockDb = createMockDbClient();
    const tracker = createBudgetTracker(mockDb as any);
    expect(tracker).toBeInstanceOf(BudgetTracker);
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

describe('Edge cases', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker();
  });

  it('should handle very small costs', async () => {
    await tracker.recordUsage(
      createTokenUsage(0.0001),
      'test',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.getState().dailySpendUsd).toBeCloseTo(0.0001, 6);
  });

  it('should handle zero cost usage', async () => {
    await tracker.recordUsage(
      createTokenUsage(0),
      'test',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.getState().dailySpendUsd).toBe(0);
  });

  it('should handle rapid successive calls', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        tracker.recordUsage(
          createTokenUsage(0.01),
          `op${i}`,
          'claude-3-5-haiku-20241022'
        )
      );
    }

    await Promise.all(promises);

    expect(tracker.getState().dailySpendUsd).toBeCloseTo(0.1, 5);
  });

  it('should transition through all tiers correctly', async () => {
    // Start at tier 0
    expect(tracker.calculateDegradationTier()).toBe(0);

    // Move to tier 1 (70%)
    await tracker.recordUsage(
      createTokenUsage(0.162),
      'test1',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.calculateDegradationTier()).toBe(1);

    // Move to tier 2 (85%)
    await tracker.recordUsage(
      createTokenUsage(0.035),
      'test2',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.calculateDegradationTier()).toBe(2);

    // Move to tier 3 (95%)
    await tracker.recordUsage(
      createTokenUsage(0.023),
      'test3',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.calculateDegradationTier()).toBe(3);
  });

  it('should track both models correctly', async () => {
    await tracker.recordUsage(
      createTokenUsage(0.05),
      'haiku_op',
      'claude-3-5-haiku-20241022'
    );
    await tracker.recordUsage(
      createTokenUsage(0.08),
      'sonnet_op',
      'claude-sonnet-4-5-20250929'
    );

    const history = tracker.getUsageHistory();
    expect(history[0].model).toBe('claude-3-5-haiku-20241022');
    expect(history[1].model).toBe('claude-sonnet-4-5-20250929');
  });
});

describe('Degradation ladder integration', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker();
  });

  it('should provide consistent behavior at each tier', async () => {
    // Tier 0: Full capabilities
    expect(tracker.canMakeCall()).toBe(true);
    expect(tracker.shouldSkipLowPriority()).toBe(false);
    expect(tracker.shouldBatchSignals()).toBe(false);
    expect(tracker.isHaikuOnly()).toBe(false);

    // Move to tier 1
    await tracker.recordUsage(
      createTokenUsage(0.17),
      'test',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.canMakeCall()).toBe(true);
    expect(tracker.shouldSkipLowPriority()).toBe(true);
    expect(tracker.shouldBatchSignals()).toBe(false);
    expect(tracker.isHaikuOnly()).toBe(false);

    // Move to tier 2
    await tracker.recordUsage(
      createTokenUsage(0.03),
      'test',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.canMakeCall()).toBe(true);
    expect(tracker.shouldSkipLowPriority()).toBe(true);
    expect(tracker.shouldBatchSignals()).toBe(true);
    expect(tracker.isHaikuOnly()).toBe(true);

    // Move to tier 3
    await tracker.recordUsage(
      createTokenUsage(0.025),
      'test',
      'claude-3-5-haiku-20241022'
    );
    expect(tracker.canMakeCall()).toBe(false);
    expect(tracker.shouldSkipLowPriority()).toBe(true);
    expect(tracker.shouldBatchSignals()).toBe(true);
    expect(tracker.isHaikuOnly()).toBe(true);
  });
});
