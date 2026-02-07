/**
 * Race condition tests for agent-config repository
 *
 * Tests concurrent budget updates to ensure atomicity and prevent
 * exceeding budget limits under concurrent load.
 *
 * Requires a live DynamoDB instance at localhost:8000.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '../../client.js';
import { AgentConfigRepository } from '../agent-config.js';

const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const describeMaybeSkip =
  process.env.CI || !process.env.DYNAMODB_ENDPOINT ? describe.skip : describe;

describeMaybeSkip('AgentConfigRepository - Budget Race Conditions', () => {
  let db: DynamoDBClient;
  let repo: AgentConfigRepository;

  beforeEach(async () => {
    // Use local DynamoDB or mock
    db = new DynamoDBClient(
      {
        endpoint: DYNAMODB_ENDPOINT,
        region: 'local',
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      },
      process.env.TABLE_NAME || 'agentic-pm-test'
    );
    repo = new AgentConfigRepository(db);

    // Initialize defaults
    await repo.initializeDefaults();
  });

  describe('Concurrent budget updates', () => {
    it('should prevent budget overflow when two concurrent calls would exceed limit', async () => {
      // Set up: Budget at $0.35, limit at $0.40
      // Two concurrent $0.10 calls should result in one succeeding and one failing
      await repo.setValue('daily_spend_usd', 0.35);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      // Simulate two concurrent calls
      const call1 = repo.recordSpend(0.1);
      const call2 = repo.recordSpend(0.1);

      const results = await Promise.allSettled([call1, call2]);

      // One should succeed, one should fail
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify final budget is exactly $0.40 (not $0.45 or $0.50)
      const finalStatus = await repo.getBudgetStatus();
      expect(finalStatus.dailySpendUsd).toBeLessThanOrEqual(0.4);
    });

    it('should handle three-way concurrent race correctly', async () => {
      // Set up: Budget at $0.30, each call is $0.05
      // Only 2 calls should succeed (total $0.40), third should fail
      await repo.setValue('daily_spend_usd', 0.3);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      const calls = [
        repo.recordSpend(0.05),
        repo.recordSpend(0.05),
        repo.recordSpend(0.05),
      ];

      const results = await Promise.allSettled(calls);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      // At most 2 should succeed
      expect(succeeded.length).toBeLessThanOrEqual(2);
      expect(succeeded.length).toBeGreaterThan(0);

      // Verify we didn't exceed the hard ceiling
      const finalStatus = await repo.getBudgetStatus();
      expect(finalStatus.dailySpendUsd).toBeLessThanOrEqual(0.4);
    });

    it('should prevent monthly budget overflow', async () => {
      // Set monthly budget close to limit
      await repo.setValue('monthly_spend_usd', 7.9);
      await repo.setValue(
        'monthly_spend_month',
        new Date().toISOString().substring(0, 7)
      );
      await repo.setValue('budget_ceiling_monthly_usd', 8.0);

      // Two concurrent $0.15 calls
      const call1 = repo.recordSpend(0.15);
      const call2 = repo.recordSpend(0.15);

      const results = await Promise.allSettled([call1, call2]);

      // One should succeed, one should fail
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify monthly budget not exceeded
      const finalStatus = await repo.getBudgetStatus();
      expect(finalStatus.monthlySpendUsd).toBeLessThanOrEqual(8.0);
    });

    it('should correctly update degradation tier under concurrent load', async () => {
      // Start at $0.20, tier 0
      await repo.setValue('daily_spend_usd', 0.2);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );
      await repo.setValue('degradation_tier', 0);

      // Two concurrent $0.05 calls should push to tier 1 ($0.23+)
      const results = await Promise.allSettled([
        repo.recordSpend(0.05),
        repo.recordSpend(0.05),
      ]);

      // Both might succeed since we're under hard ceiling
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);

      // Check that tier was updated correctly
      const finalStatus = await repo.getBudgetStatus();
      if (finalStatus.dailySpendUsd >= 0.3) {
        expect(finalStatus.degradationTier).toBe(3);
      } else if (finalStatus.dailySpendUsd >= 0.27) {
        expect(finalStatus.degradationTier).toBe(2);
      } else if (finalStatus.dailySpendUsd >= 0.23) {
        expect(finalStatus.degradationTier).toBe(1);
      }
    });

    it('should handle rapid sequential updates correctly', async () => {
      // Start fresh
      await repo.setValue('daily_spend_usd', 0);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      // Make 10 rapid $0.02 calls
      const calls = Array.from({ length: 10 }, () => repo.recordSpend(0.02));

      const results = await Promise.allSettled(calls);

      // All should succeed since total is $0.20 (under $0.40 limit)
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(10);

      // Verify final amount is correct
      const finalStatus = await repo.getBudgetStatus();
      expect(finalStatus.dailySpendUsd).toBeCloseTo(0.2, 2);
    });

    it('should reject calls that would exceed limit even with optimistic check', async () => {
      // Set budget at $0.38
      await repo.setValue('daily_spend_usd', 0.38);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      // Try to add $0.05 (would reach $0.43, over $0.40 limit)
      await expect(repo.recordSpend(0.05)).rejects.toThrow(
        /exceed.*hard ceiling/i
      );

      // Verify budget unchanged
      const finalStatus = await repo.getBudgetStatus();
      expect(finalStatus.dailySpendUsd).toBe(0.38);
    });

    it('should handle budget reads during concurrent writes', async () => {
      await repo.setValue('daily_spend_usd', 0.1);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      // Start a write
      const writePromise = repo.recordSpend(0.05);

      // Immediately read (simulating concurrent read during write)
      const readPromise = repo.getBudgetStatus();

      const [writeResult, readResult] = await Promise.all([
        writePromise,
        readPromise,
      ]);

      // Read should return either old or new value, but always consistent
      expect(readResult.dailySpendUsd).toBeGreaterThanOrEqual(0.1);
      expect(readResult.dailySpendUsd).toBeLessThanOrEqual(0.15);

      // Write should have succeeded
      expect(writeResult.dailySpendUsd).toBe(0.15);
    });

    it('should handle daily reset during concurrent updates', async () => {
      // Set yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      await repo.setValue('daily_spend_usd', 0.3);
      await repo.setValue('daily_spend_date', yesterdayStr);

      // One thread gets budget status (should trigger reset)
      const status1Promise = repo.getBudgetStatus();

      // Another thread immediately tries to record spend
      // Small delay to ensure first thread starts reset
      await new Promise((resolve) => setTimeout(resolve, 10));
      const recordPromise = repo.recordSpend(0.05);

      const [status1, recordResult] = await Promise.all([
        status1Promise,
        recordPromise,
      ]);

      // First call should have reset to 0
      expect(status1.dailySpendUsd).toBe(0);

      // Record should succeed with new day's budget
      expect(recordResult.dailySpendUsd).toBeCloseTo(0.05, 2);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small amounts correctly', async () => {
      await repo.setValue('daily_spend_usd', 0);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      // Record very small amount
      await repo.recordSpend(0.001);

      const status = await repo.getBudgetStatus();
      expect(status.dailySpendUsd).toBeCloseTo(0.001, 3);
    });

    it('should handle zero amount', async () => {
      await repo.setValue('daily_spend_usd', 0.1);
      await repo.setValue(
        'daily_spend_date',
        new Date().toISOString().split('T')[0]
      );

      await repo.recordSpend(0);

      const status = await repo.getBudgetStatus();
      expect(status.dailySpendUsd).toBe(0.1);
    });

    it('should reject negative amounts', async () => {
      await expect(repo.recordSpend(-0.05)).rejects.toThrow();
    });
  });
});
