/**
 * Atomic Budget Counter Tests
 *
 * Tests that BudgetTracker uses atomic increments for DynamoDB persistence,
 * preventing concurrent Lambda invocations from overwriting each other's totals.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BudgetTracker } from '../budget.js';
import type { DynamoDBClient } from '../../db/client.js';
import { KEY_PREFIX } from '../../constants.js';
import type { TokenUsage, ModelId } from '../types.js';

// Create a mock DynamoDB client
function createMockDbClient(): DynamoDBClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    delete: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    getTableName: vi.fn().mockReturnValue('TestTable'),
    queryGSI1: vi.fn(),
    queryWithExpression: vi.fn(),
  } as unknown as DynamoDBClient;
}

describe('Atomic Budget Counters', () => {
  let mockDb: DynamoDBClient;
  let tracker: BudgetTracker;

  const testUsage: TokenUsage = {
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
  };

  const testModel: ModelId = 'claude-3-5-haiku-20241022';

  beforeEach(() => {
    mockDb = createMockDbClient();
    tracker = new BudgetTracker(mockDb);
    vi.clearAllMocks();
  });

  describe('recordUsage uses atomic increment', () => {
    it('should call db.update instead of db.put for saving', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      // Should use update (atomic), not put (full overwrite)
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.put).not.toHaveBeenCalled();
    });

    it('should make two update calls — one for daily, one for monthly', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('should use ADD expression for atomic increment on daily spend', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      const firstCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const pk = firstCall[0] as string;
      const sk = firstCall[1] as string;
      const updateExpression = firstCall[2] as string;
      const expressionValues = firstCall[3] as Record<string, unknown>;

      expect(pk).toBe(KEY_PREFIX.AGENT);
      expect(sk).toContain(`${KEY_PREFIX.CONFIG}daily_spend_`);
      expect(updateExpression).toContain('ADD dailySpendUsd :cost');
      expect(expressionValues[':cost']).toBe(0.001);
    });

    it('should use ADD expression for atomic increment on monthly spend', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      const secondCall = vi.mocked(mockDb.update).mock.calls[1]!;
      const pk = secondCall[0] as string;
      const sk = secondCall[1] as string;
      const updateExpression = secondCall[2] as string;
      const expressionValues = secondCall[3] as Record<string, unknown>;

      expect(pk).toBe(KEY_PREFIX.AGENT);
      expect(sk).toContain(`${KEY_PREFIX.CONFIG}monthly_spend_`);
      expect(updateExpression).toContain('ADD monthlySpendUsd :cost');
      expect(expressionValues[':cost']).toBe(0.001);
    });
  });

  describe('lastRecordedCost tracks only incremental cost', () => {
    it('should send only the incremental cost per save', async () => {
      // First usage: 0.001
      await tracker.recordUsage(
        { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
        'triage',
        testModel
      );

      const firstDailyCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const firstValues = firstDailyCall[3] as Record<string, unknown>;
      expect(firstValues[':cost']).toBe(0.001);

      vi.mocked(mockDb.update).mockClear();

      // Second usage: 0.002 — should only increment by 0.002, not total 0.003
      await tracker.recordUsage(
        { inputTokens: 200, outputTokens: 100, costUsd: 0.002 },
        'artefact_update',
        testModel
      );

      const secondDailyCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const secondValues = secondDailyCall[3] as Record<string, unknown>;
      expect(secondValues[':cost']).toBe(0.002);
    });

    it('should reset lastRecordedCost after successful save', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      vi.mocked(mockDb.update).mockClear();

      // Second call with different cost
      const secondUsage: TokenUsage = {
        inputTokens: 200,
        outputTokens: 100,
        costUsd: 0.005,
      };

      await tracker.recordUsage(secondUsage, 'artefact_update', testModel);

      // Should only send 0.005 (the second call's cost), not 0.006 (cumulative)
      const dailyCall = vi.mocked(mockDb.update).mock.calls[0]!;
      const values = dailyCall[3] as Record<string, unknown>;
      expect(values[':cost']).toBe(0.005);
    });
  });

  describe('concurrent calls do not overwrite', () => {
    it('should use atomic ADD so concurrent saves accumulate correctly', async () => {
      // Simulate two concurrent invocations — both should use ADD, not SET/PUT
      const tracker1 = new BudgetTracker(mockDb);
      const tracker2 = new BudgetTracker(mockDb);

      await Promise.all([
        tracker1.recordUsage(
          { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
          'triage',
          testModel
        ),
        tracker2.recordUsage(
          { inputTokens: 200, outputTokens: 100, costUsd: 0.002 },
          'artefact_update',
          testModel
        ),
      ]);

      // All 4 update calls should use ADD (not PUT)
      expect(mockDb.update).toHaveBeenCalledTimes(4);
      expect(mockDb.put).not.toHaveBeenCalled();

      // Each call should carry only its own cost
      const allCalls = vi.mocked(mockDb.update).mock.calls;
      const costs = allCalls.map(
        (call) => (call[3] as Record<string, unknown>)[':cost']
      );
      expect(costs).toContain(0.001);
      expect(costs).toContain(0.002);
    });
  });

  describe('date rollover resets properly', () => {
    it('should reset daily spend on date change', async () => {
      // Record initial usage
      await tracker.recordUsage(testUsage, 'triage', testModel);

      const state = tracker.getState();
      expect(state.dailySpendUsd).toBe(0.001);

      // Simulate date rollover by manipulating internal state
      const trackerAny = tracker as any;
      trackerAny.currentDate = '2024-01-14'; // Set to yesterday

      // loadFromDb returns null (no existing record for new date)
      vi.mocked(mockDb.get).mockResolvedValue(null);

      vi.mocked(mockDb.update).mockClear();

      // Record new usage — should trigger date rollover
      await tracker.recordUsage(
        { inputTokens: 50, outputTokens: 25, costUsd: 0.0005 },
        'triage',
        testModel
      );

      // After rollover, daily spend should be only the new usage
      const newState = tracker.getState();
      expect(newState.dailySpendUsd).toBe(0.0005);
    });

    it('should reset monthly spend on month change', async () => {
      await tracker.recordUsage(testUsage, 'triage', testModel);

      const trackerAny = tracker as any;
      trackerAny.currentDate = '2023-12-31';
      trackerAny.currentMonth = '2023-12';

      vi.mocked(mockDb.get).mockResolvedValue(null);
      vi.mocked(mockDb.update).mockClear();

      await tracker.recordUsage(
        { inputTokens: 50, outputTokens: 25, costUsd: 0.0005 },
        'triage',
        testModel
      );

      const newState = tracker.getState();
      expect(newState.monthlySpendUsd).toBe(0.0005);
    });
  });

  describe('error handling', () => {
    it('should not throw when db.update fails', async () => {
      vi.mocked(mockDb.update).mockRejectedValue(
        new Error('DynamoDB unavailable')
      );

      // Should not throw — budget errors must not break the agent
      await expect(
        tracker.recordUsage(testUsage, 'triage', testModel)
      ).resolves.toBeDefined();
    });

    it('should still update in-memory state even when db save fails', async () => {
      vi.mocked(mockDb.update).mockRejectedValue(
        new Error('DynamoDB unavailable')
      );

      await tracker.recordUsage(testUsage, 'triage', testModel);

      const state = tracker.getState();
      expect(state.dailySpendUsd).toBe(0.001);
      expect(state.monthlySpendUsd).toBe(0.001);
    });

    it('should skip db operations when no db client is set', async () => {
      const trackerNoDb = new BudgetTracker();

      await trackerNoDb.recordUsage(testUsage, 'triage', testModel);

      const state = trackerNoDb.getState();
      expect(state.dailySpendUsd).toBe(0.001);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
