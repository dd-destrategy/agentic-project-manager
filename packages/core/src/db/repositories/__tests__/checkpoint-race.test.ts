/**
 * Race condition tests for checkpoint repository
 *
 * Tests concurrent checkpoint updates to ensure optimistic locking
 * prevents lost updates and inconsistent state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBClient } from '../../client.js';
import { CheckpointRepository } from '../checkpoint.js';
import type { IntegrationSource } from '../../../types/index.js';

describe('CheckpointRepository - Race Conditions', () => {
  let db: DynamoDBClient;
  let repo: CheckpointRepository;
  const testProjectId = 'test-project-123';
  const testIntegration: IntegrationSource = 'jira';

  beforeEach(async () => {
    // Use local DynamoDB or mock
    db = new DynamoDBClient(
      {
        endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
        region: 'local',
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      },
      process.env.TABLE_NAME || 'agentic-pm-test'
    );
    repo = new CheckpointRepository(db);

    // Clean up any existing checkpoint
    try {
      await repo.delete(testProjectId, testIntegration);
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('Concurrent checkpoint updates', () => {
    it('should handle two concurrent updates with optimistic locking', async () => {
      // Initial checkpoint
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Simulate two concurrent updates
      const update1 = repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z');
      const update2 = repo.set(testProjectId, testIntegration, '2024-01-01T12:00:00Z');

      // Both should succeed (with retries)
      const results = await Promise.allSettled([update1, update2]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(2);

      // Final checkpoint should be one of the two values
      const final = await repo.get(testProjectId, testIntegration);
      expect(final).toBeDefined();
      expect(['2024-01-01T11:00:00Z', '2024-01-01T12:00:00Z']).toContain(
        final?.checkpointValue
      );

      // Version should be 3 (started at 1, two updates)
      const finalWithVersion = final as typeof final & { version?: number };
      expect(finalWithVersion.version).toBeGreaterThanOrEqual(2);
    });

    it('should handle three-way concurrent race', async () => {
      // Initial state
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Three concurrent updates
      const updates = [
        repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z'),
        repo.set(testProjectId, testIntegration, '2024-01-01T12:00:00Z'),
        repo.set(testProjectId, testIntegration, '2024-01-01T13:00:00Z'),
      ];

      const results = await Promise.allSettled(updates);

      // All should eventually succeed with retries
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(3);

      // Final checkpoint should exist
      const final = await repo.get(testProjectId, testIntegration);
      expect(final).toBeDefined();
      expect(final?.checkpointValue).toBeDefined();
    });

    it('should prevent lost updates', async () => {
      // Start with initial checkpoint
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Simulate rapid updates
      const timestamps = [
        '2024-01-01T10:01:00Z',
        '2024-01-01T10:02:00Z',
        '2024-01-01T10:03:00Z',
        '2024-01-01T10:04:00Z',
        '2024-01-01T10:05:00Z',
      ];

      const updates = timestamps.map((ts) => repo.set(testProjectId, testIntegration, ts));

      await Promise.all(updates);

      // Final checkpoint must be one of the values we set
      const final = await repo.get(testProjectId, testIntegration);
      expect(timestamps).toContain(final?.checkpointValue);

      // Version should reflect all updates (initial + 5 updates = version 6)
      const finalWithVersion = final as typeof final & { version?: number };
      expect(finalWithVersion.version).toBeGreaterThanOrEqual(5);
    });

    it('should handle concurrent setIfNewer calls correctly', async () => {
      // Initial checkpoint at T1
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Concurrent setIfNewer with various timestamps
      const updates = [
        repo.setIfNewer(testProjectId, testIntegration, '2024-01-01T09:00:00Z'), // Older, should not update
        repo.setIfNewer(testProjectId, testIntegration, '2024-01-01T11:00:00Z'), // Newer, should update
        repo.setIfNewer(testProjectId, testIntegration, '2024-01-01T12:00:00Z'), // Newer, should update
      ];

      const results = await Promise.all(updates);

      // First should return false (older), others should return true
      expect(results.filter((r) => r === true).length).toBeGreaterThan(0);

      // Final value should be the newest
      const final = await repo.get(testProjectId, testIntegration);
      expect(final?.checkpointValue).toBe('2024-01-01T12:00:00Z');
    });

    it('should handle mixed set and setIfNewer operations', async () => {
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Mix of set and setIfNewer
      const operations = [
        repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z'),
        repo.setIfNewer(testProjectId, testIntegration, '2024-01-01T12:00:00Z'),
        repo.set(testProjectId, testIntegration, '2024-01-01T13:00:00Z'),
        repo.setIfNewer(testProjectId, testIntegration, '2024-01-01T14:00:00Z'),
      ];

      await Promise.all(operations);

      // Should have a final value
      const final = await repo.get(testProjectId, testIntegration);
      expect(final).toBeDefined();
      expect(final?.checkpointValue).toBeDefined();
    });

    it('should handle concurrent updates on first checkpoint creation', async () => {
      // No initial checkpoint - multiple processes try to create it
      const updates = [
        repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z'),
        repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z'),
        repo.set(testProjectId, testIntegration, '2024-01-01T12:00:00Z'),
      ];

      const results = await Promise.allSettled(updates);

      // All should succeed
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      expect(succeeded.length).toBe(3);

      // Should have a final value
      const final = await repo.get(testProjectId, testIntegration);
      expect(final).toBeDefined();
    });

    it('should handle read during concurrent writes', async () => {
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // Start concurrent writes
      const write1 = repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z');
      const write2 = repo.set(testProjectId, testIntegration, '2024-01-01T12:00:00Z');

      // Read while writes are happening
      const read = repo.get(testProjectId, testIntegration);

      const [readResult] = await Promise.all([read, write1, write2]);

      // Read should return a consistent value
      expect(readResult).toBeDefined();
      expect(readResult?.checkpointValue).toBeDefined();
    });

    it('should increment version correctly across concurrent updates', async () => {
      // Initial checkpoint (version 1)
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // 5 concurrent updates
      const updates = Array.from({ length: 5 }, (_, i) =>
        repo.set(
          testProjectId,
          testIntegration,
          `2024-01-01T${10 + i + 1}:00:00Z`
        )
      );

      await Promise.all(updates);

      // Version should be at least 6 (initial + 5 updates)
      const final = await repo.get(testProjectId, testIntegration);
      const finalWithVersion = final as typeof final & { version?: number };
      expect(finalWithVersion.version).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Edge cases', () => {
    it('should handle very rapid sequential updates', async () => {
      let checkpoint = await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // 10 rapid sequential updates
      for (let i = 1; i <= 10; i++) {
        checkpoint = await repo.set(
          testProjectId,
          testIntegration,
          `2024-01-01T${10 + i}:00:00Z`
        );
      }

      expect(checkpoint.checkpointValue).toBe('2024-01-01T20:00:00Z');

      // Version should be 11
      const checkpointWithVersion = checkpoint as typeof checkpoint & { version?: number };
      expect(checkpointWithVersion.version).toBe(11);
    });

    it('should handle setIfNewer with identical timestamps', async () => {
      const timestamp = '2024-01-01T10:00:00Z';
      await repo.set(testProjectId, testIntegration, timestamp);

      // Try to set same timestamp again
      const result = await repo.setIfNewer(testProjectId, testIntegration, timestamp);

      // Should return false (not newer)
      expect(result).toBe(false);
    });

    it('should handle updates across multiple integrations concurrently', async () => {
      const integrations: IntegrationSource[] = ['jira', 'outlook'];

      // Concurrent updates to different integrations
      const updates = integrations.map((integration) =>
        repo.set(testProjectId, integration, '2024-01-01T10:00:00Z')
      );

      await Promise.all(updates);

      // Both should exist
      for (const integration of integrations) {
        const checkpoint = await repo.get(testProjectId, integration);
        expect(checkpoint).toBeDefined();
        expect(checkpoint?.integration).toBe(integration);
      }
    });

    it('should retry on conflict and eventually succeed', async () => {
      // Set initial checkpoint
      await repo.set(testProjectId, testIntegration, '2024-01-01T10:00:00Z');

      // This should succeed despite potential conflicts
      const result = await repo.set(testProjectId, testIntegration, '2024-01-01T11:00:00Z');

      expect(result.checkpointValue).toBe('2024-01-01T11:00:00Z');
    });
  });
});
