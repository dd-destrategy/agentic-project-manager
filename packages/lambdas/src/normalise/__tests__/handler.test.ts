/**
 * Normalise Lambda Tests
 *
 * Tests for the normalise handler that converts raw API responses to NormalisedSignal objects.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing handler
vi.mock('../../shared/context.js', () => ({
  logger: {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

let jiraNormaliseCallCount = 0;

vi.mock('@agentic-pm/core/signals/jira', () => ({
  normaliseJiraSignal: vi.fn().mockImplementation((raw, projectId) => {
    jiraNormaliseCallCount++;
    const payload = raw.rawPayload as Record<string, unknown>;
    const key = (payload as { key?: string }).key ?? 'UNKNOWN';
    const fields = (
      payload as {
        fields?: { summary?: string; created?: string; updated?: string };
      }
    ).fields;
    const summary = fields?.summary ?? '';
    // Determine type based on created/updated heuristic
    const created = fields?.created ? new Date(fields.created).getTime() : 0;
    const updated = fields?.updated ? new Date(fields.updated).getTime() : 0;
    const isNew = created > 0 && Math.abs(updated - created) < 1000;
    return {
      id: `mock-signal-${jiraNormaliseCallCount}`,
      source: 'jira',
      timestamp: raw.timestamp,
      type: isNew ? 'ticket_created' : 'ticket_updated',
      summary: isNew
        ? `New ticket created: ${key} - ${summary}`
        : `${key} updated: ${summary}`,
      raw: payload,
      projectId,
      metadata: { relatedTickets: [key] },
    };
  }),
}));

import type { Context } from 'aws-lambda';

import type {
  ChangeDetectionOutput,
  RawSignalBatch,
} from '../../shared/types.js';

import { handler } from '../handler.js';

// Mock Lambda context
const mockContext: Context = {
  awsRequestId: 'test-request-id',
  functionName: 'normalise',
  functionVersion: '1',
  invokedFunctionArn:
    'arn:aws:lambda:ap-southeast-2:123456789:function:normalise',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/normalise',
  logStreamName: '2024/01/15/[$LATEST]abc123',
  callbackWaitsForEmptyEventLoop: true,
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
};

describe('Normalise Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty Input', () => {
    it('should handle empty signal array', async () => {
      const input: ChangeDetectionOutput = {
        hasChanges: false,
        signals: [],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toEqual([]);
    });

    it('should handle hasChanges: false with no signals', async () => {
      const input: ChangeDetectionOutput = {
        hasChanges: false,
        signals: [],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(0);
    });
  });

  describe('Single Signal Batch', () => {
    it('should normalise a single Jira signal via the Jira normaliser', async () => {
      const rawJiraIssue = {
        id: '10001',
        key: 'TEST-1',
        fields: {
          summary: 'Test Issue',
          status: { name: 'In Progress', id: '3' },
          updated: '2024-01-15T10:00:00.000Z',
        },
      };

      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [rawJiraIssue],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0]).toMatchObject({
        id: expect.any(String),
        source: 'jira',
        timestamp: expect.any(String),
        type: 'ticket_updated',
        summary: 'TEST-1 updated: Test Issue',
        projectId: 'project-1',
        raw: rawJiraIssue,
        metadata: { relatedTickets: ['TEST-1'] },
      });
    });

    it('should dispatch Jira signals to normaliseJiraSignal', async () => {
      const { normaliseJiraSignal } =
        await import('@agentic-pm/core/signals/jira');

      const rawJiraIssue = {
        id: '10002',
        key: 'TEST-2',
        fields: {
          summary: 'Another Issue',
          status: { name: 'To Do', id: '1' },
          created: '2024-01-15T10:00:00.000Z',
          updated: '2024-01-15T10:00:00.000Z',
        },
      };

      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [rawJiraIssue],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      // Verify normaliseJiraSignal was called
      expect(normaliseJiraSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'jira',
          rawPayload: rawJiraIssue,
        }),
        'project-1'
      );

      // Created === updated within 1s, so mock returns ticket_created
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].type).toBe('ticket_created');
      expect(result.signals[0].summary).toContain('New ticket created');
      expect(result.signals[0].summary).toContain('TEST-2');
    });

    it('should normalise multiple signals in a batch', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [
          { id: '1', key: 'TEST-1' },
          { id: '2', key: 'TEST-2' },
          { id: '3', key: 'TEST-3' },
        ],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(3);
      expect(result.signals[0].projectId).toBe('project-1');
      expect(result.signals[1].projectId).toBe('project-1');
      expect(result.signals[2].projectId).toBe('project-1');
    });
  });

  describe('Multiple Signal Batches', () => {
    it('should normalise signals from multiple batches', async () => {
      const batch1: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1', key: 'TEST-1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const batch2: RawSignalBatch = {
        projectId: 'project-2',
        source: 'jira',
        signals: [{ id: '2', key: 'TEST-2' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch1, batch2],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].projectId).toBe('project-1');
      expect(result.signals[1].projectId).toBe('project-2');
    });

    it('should normalise signals from different sources', async () => {
      const jiraBatch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1', key: 'TEST-1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const outlookBatch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'outlook',
        signals: [{ id: 'msg-1', subject: 'Test Email' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [jiraBatch, outlookBatch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].source).toBe('jira');
      expect(result.signals[1].source).toBe('outlook');
    });
  });

  describe('Signal Properties', () => {
    it('should generate unique IDs for each signal', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1' }, { id: '2' }, { id: '3' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      const ids = result.signals.map((s) => s.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });

    it('should use ISO timestamp format', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should preserve raw payload', async () => {
      const rawPayload = {
        id: '10001',
        key: 'TEST-1',
        custom: { foo: 'bar', nested: { value: 123 } },
      };

      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [rawPayload],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals[0].raw).toEqual(rawPayload);
    });

    it('should set type to unknown for generic fallback (non-jira source)', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'outlook',
        signals: [{ id: '1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals[0].type).toBe('unknown');
    });

    it('should set generic summary for fallback (non-jira source)', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'outlook',
        signals: [{ id: '1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals[0].summary).toBe('Signal detected');
    });
  });

  describe('Large Batches', () => {
    it('should handle large number of signals', async () => {
      const signals = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        key: `TEST-${i}`,
      }));

      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals,
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty batch with signals array', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: false,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toEqual([]);
    });

    it('should handle null values in raw payload', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1', nullable: null, undefined: undefined }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].raw).toBeDefined();
    });
  });

  describe('Output Validation', () => {
    it('should return required output structure', async () => {
      const input: ChangeDetectionOutput = {
        hasChanges: false,
        signals: [],
      };

      const result = await handler(input, mockContext);

      expect(result).toMatchObject({
        signals: expect.any(Array),
      });
    });

    it('should return all normalised signal properties', async () => {
      const batch: RawSignalBatch = {
        projectId: 'project-1',
        source: 'jira',
        signals: [{ id: '1' }],
        checkpoint: '2024-01-15T10:00:00.000Z',
      };

      const input: ChangeDetectionOutput = {
        hasChanges: true,
        signals: [batch],
      };

      const result = await handler(input, mockContext);

      expect(result.signals[0]).toMatchObject({
        id: expect.any(String),
        source: expect.any(String),
        timestamp: expect.any(String),
        type: expect.any(String),
        summary: expect.any(String),
        raw: expect.any(Object),
        projectId: expect.any(String),
      });
    });
  });
});
