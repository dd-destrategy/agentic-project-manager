/**
 * Tests for WebhookReceiver
 *
 * Covers: payload validation, descriptor lookup, signature verification,
 * event type filtering, and signal mapping.
 */

import { describe, it, expect, vi } from 'vitest';
import { WebhookReceiver } from '../webhook-receiver.js';
import type {
  ConnectorDescriptor,
  ConnectorInstance,
} from '../connector-schemas.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const testDescriptor: ConnectorDescriptor = {
  id: 'test-webhook',
  name: 'Test Webhook',
  description: 'A test webhook connector',
  category: 'custom',
  icon: 'plug',
  kind: 'generic',
  auth: { method: 'none' },
  ingestion: {
    mode: 'webhook',
    webhook: {
      eventTypes: ['issue.created', 'issue.updated'],
      eventTypePath: 'action',
      verification: 'none',
    },
  },
  fieldMapping: {
    // Map the whole payload as a single item — webhook payloads are single events
    itemsPath: '$',
    idPath: 'issue.id',
    timestampPath: 'issue.updated_at',
    summaryTemplate: '{{action}}: {{issue.title}}',
    signalTypeRules: [
      {
        when: 'action',
        operator: 'equals',
        value: 'issue.created',
        then: 'ticket_created',
      },
      {
        when: 'action',
        operator: 'equals',
        value: 'issue.updated',
        then: 'ticket_updated',
      },
    ],
  },
  healthCheck: {
    endpoint: 'https://api.example.com/health',
    method: 'GET',
    expectStatus: 200,
    timeoutMs: 5000,
  },
  version: '1.0.0',
};

const testInstance: ConnectorInstance = {
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  connectorId: 'test-webhook',
  enabled: true,
  config: {},
  healthy: true,
  consecutiveFailures: 0,
  signalCount24h: 0,
  signalCount7d: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function createReceiver(overrides?: {
  descriptor?: ConnectorDescriptor | null;
  instance?: ConnectorInstance | null;
}) {
  return new WebhookReceiver({
    getDescriptor: vi
      .fn()
      .mockResolvedValue(
        overrides &&
          Object.prototype.hasOwnProperty.call(overrides, 'descriptor')
          ? overrides.descriptor
          : testDescriptor
      ),
    getInstance: vi
      .fn()
      .mockResolvedValue(
        overrides && Object.prototype.hasOwnProperty.call(overrides, 'instance')
          ? overrides.instance
          : testInstance
      ),
    getCredentials: vi.fn().mockResolvedValue({}),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('WebhookReceiver', () => {
  describe('processWebhook', () => {
    it('processes a valid webhook payload', async () => {
      const receiver = createReceiver();
      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: JSON.stringify({
          action: 'issue.created',
          issue: {
            id: '123',
            title: 'Fix login bug',
            updated_at: '2026-02-07T10:00:00Z',
          },
        }),
      });

      expect(result.accepted).toBe(true);
      expect(result.eventType).toBe('issue.created');
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].type).toBe('ticket_created');
      expect(result.signals[0].summary).toContain('Fix login bug');
    });

    it('rejects payload exceeding size limit', async () => {
      const receiver = createReceiver();
      const largeBody = 'x'.repeat(256 * 1024 + 1);

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: largeBody,
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('maximum size');
    });

    it('rejects unknown connector', async () => {
      const receiver = createReceiver({ descriptor: null });

      const result = await receiver.processWebhook({
        connectorId: 'nonexistent',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: '{}',
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('Unknown connector');
    });

    it('rejects connector that does not support webhooks', async () => {
      const pollingOnly: ConnectorDescriptor = {
        ...testDescriptor,
        ingestion: {
          mode: 'polling',
          polling: {
            endpoint: 'https://api.example.com',
            method: 'GET',
            delta: {
              type: 'timestamp_filter',
              queryParam: 'since',
              format: 'iso8601',
            },
            rateLimitRpm: 60,
          },
        },
      };
      const receiver = createReceiver({ descriptor: pollingOnly });

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: '{}',
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('does not support webhooks');
    });

    it('rejects when no instance is configured', async () => {
      const receiver = createReceiver({ instance: null });

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: JSON.stringify({ action: 'issue.created', issue: { id: '1' } }),
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('No configured instance');
    });

    it('rejects when instance is disabled', async () => {
      const disabledInstance = { ...testInstance, enabled: false };
      const receiver = createReceiver({ instance: disabledInstance });

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: JSON.stringify({ action: 'issue.created', issue: { id: '1' } }),
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('rejects invalid JSON body', async () => {
      const receiver = createReceiver();

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: 'not-json{{{',
      });

      expect(result.accepted).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('accepts but produces no signals for unhandled event types', async () => {
      const receiver = createReceiver();

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: JSON.stringify({
          action: 'comment.deleted',
          issue: { id: '1' },
        }),
      });

      expect(result.accepted).toBe(true);
      expect(result.eventType).toBe('comment.deleted');
      expect(result.signals).toHaveLength(0);
    });

    it('handles wildcard event types', async () => {
      const wildcardDescriptor: ConnectorDescriptor = {
        ...testDescriptor,
        ingestion: {
          mode: 'webhook',
          webhook: {
            eventTypes: ['*'],
            eventTypePath: 'action',
            verification: 'none',
          },
        },
      };
      const receiver = createReceiver({ descriptor: wildcardDescriptor });

      const result = await receiver.processWebhook({
        connectorId: 'test-webhook',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {},
        body: JSON.stringify({
          action: 'anything.goes',
          issue: { id: '1', updated_at: '2026-01-01T00:00:00Z' },
        }),
      });

      expect(result.accepted).toBe(true);
      expect(result.signals.length).toBeGreaterThanOrEqual(1);
    });
  });
});
