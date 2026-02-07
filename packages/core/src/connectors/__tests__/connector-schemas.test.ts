/**
 * Tests for Connector Schemas
 *
 * Validates that the Zod schemas correctly accept valid descriptors
 * and reject invalid ones.
 */

import { describe, it, expect } from 'vitest';
import {
  ConnectorDescriptorSchema,
  ConnectorInstanceSchema,
  AuthDescriptorSchema,
  IngestionDescriptorSchema,
  FieldMappingDescriptorSchema,
} from '../connector-schemas.js';
import { builtinDescriptors } from '../builtin-descriptors.js';

// ============================================================================
// ConnectorDescriptorSchema
// ============================================================================

describe('ConnectorDescriptorSchema', () => {
  it('validates a minimal valid descriptor', () => {
    const descriptor = {
      id: 'test-connector',
      name: 'Test',
      description: 'A test connector',
      category: 'custom',
      icon: 'plug',
      kind: 'generic',
      auth: { method: 'none' },
      ingestion: {
        mode: 'polling',
        polling: {
          endpoint: 'https://api.example.com/items',
          method: 'GET',
          delta: {
            type: 'timestamp_filter',
            queryParam: 'since',
            format: 'iso8601',
          },
          rateLimitRpm: 60,
        },
      },
      fieldMapping: {
        itemsPath: 'items',
        idPath: 'id',
        timestampPath: 'updated_at',
        summaryTemplate: '{{id}}: {{title}}',
        signalTypeRules: [
          { when: 'id', operator: 'exists', then: 'ticket_updated' },
        ],
      },
      healthCheck: {
        endpoint: 'https://api.example.com/health',
        method: 'GET',
        expectStatus: 200,
        timeoutMs: 10000,
      },
      version: '1.0.0',
    };

    const result = ConnectorDescriptorSchema.safeParse(descriptor);
    expect(result.success).toBe(true);
  });

  it('rejects invalid connector ID format', () => {
    const invalid = {
      id: 'INVALID_ID',
      name: 'Test',
      description: 'A test',
      category: 'custom',
      icon: 'plug',
      kind: 'generic',
      auth: { method: 'none' },
      ingestion: {
        mode: 'polling',
        polling: {
          endpoint: 'https://api.example.com',
          method: 'GET',
          delta: {
            type: 'timestamp_filter',
            queryParam: 's',
            format: 'iso8601',
          },
          rateLimitRpm: 60,
        },
      },
      fieldMapping: {
        itemsPath: '$',
        idPath: 'id',
        timestampPath: 'ts',
        summaryTemplate: '{{id}}',
        signalTypeRules: [{ when: 'id', operator: 'exists', then: 'unknown' }],
      },
      healthCheck: {
        endpoint: 'https://api.example.com',
        method: 'GET',
        expectStatus: 200,
        timeoutMs: 5000,
      },
      version: '1.0.0',
    };

    const result = ConnectorDescriptorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = ConnectorDescriptorSchema.safeParse({
      id: 'test',
      name: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = ConnectorDescriptorSchema.safeParse({
      id: 'test-conn',
      name: 'Test',
      description: 'Desc',
      category: 'invalid_category',
      icon: 'plug',
      kind: 'generic',
      auth: { method: 'none' },
      ingestion: {
        mode: 'polling',
        polling: {
          endpoint: 'https://api.example.com',
          method: 'GET',
          delta: {
            type: 'timestamp_filter',
            queryParam: 's',
            format: 'iso8601',
          },
          rateLimitRpm: 60,
        },
      },
      fieldMapping: {
        itemsPath: '$',
        idPath: 'id',
        timestampPath: 'ts',
        summaryTemplate: '{{id}}',
        signalTypeRules: [{ when: 'id', operator: 'exists', then: 'unknown' }],
      },
      healthCheck: {
        endpoint: 'https://api.example.com',
        method: 'GET',
        expectStatus: 200,
        timeoutMs: 5000,
      },
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// AuthDescriptorSchema
// ============================================================================

describe('AuthDescriptorSchema', () => {
  it('validates oauth2 auth', () => {
    const result = AuthDescriptorSchema.safeParse({
      method: 'oauth2',
      config: {
        authoriseUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        scopes: ['read', 'write'],
        credentialFields: [
          { key: 'clientId', label: 'Client ID', type: 'text', required: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates api_key auth', () => {
    const result = AuthDescriptorSchema.safeParse({
      method: 'api_key',
      config: {
        delivery: 'bearer',
        paramName: 'Authorization',
        credentialFields: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates none auth', () => {
    const result = AuthDescriptorSchema.safeParse({ method: 'none' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown auth method', () => {
    const result = AuthDescriptorSchema.safeParse({
      method: 'unknown_method',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// IngestionDescriptorSchema
// ============================================================================

describe('IngestionDescriptorSchema', () => {
  it('validates polling ingestion', () => {
    const result = IngestionDescriptorSchema.safeParse({
      mode: 'polling',
      polling: {
        endpoint: 'https://api.example.com/data',
        method: 'GET',
        delta: {
          type: 'cursor',
          cursorPath: 'next_cursor',
          cursorParam: 'cursor',
        },
        rateLimitRpm: 30,
        pagination: {
          type: 'cursor',
          nextPath: 'pagination.next',
          nextParam: 'after',
          pageSize: 50,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates webhook ingestion', () => {
    const result = IngestionDescriptorSchema.safeParse({
      mode: 'webhook',
      webhook: {
        eventTypes: ['issue.created', 'issue.updated'],
        eventTypePath: 'action',
        verification: 'signature',
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates polling_and_webhook ingestion', () => {
    const result = IngestionDescriptorSchema.safeParse({
      mode: 'polling_and_webhook',
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
      webhook: {
        eventTypes: ['*'],
        eventTypePath: 'type',
        verification: 'none',
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// FieldMappingDescriptorSchema
// ============================================================================

describe('FieldMappingDescriptorSchema', () => {
  it('validates with all optional fields', () => {
    const result = FieldMappingDescriptorSchema.safeParse({
      itemsPath: 'data.items',
      idPath: 'id',
      timestampPath: 'updated_at',
      summaryTemplate: '{{title}}',
      signalTypeRules: [
        {
          when: 'type',
          operator: 'equals',
          value: 'bug',
          then: 'ticket_created',
        },
      ],
      priorityMapping: [
        { when: 'priority', operator: 'equals', value: 'P1', then: 'critical' },
      ],
      participantsPath: 'assignees[*].email',
      tagsPath: 'labels[*].name',
      relatedItemsPath: 'linked_issues[*].key',
      rawFields: ['id', 'title', 'url'],
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one signal type rule', () => {
    const result = FieldMappingDescriptorSchema.safeParse({
      itemsPath: '$',
      idPath: 'id',
      timestampPath: 'ts',
      summaryTemplate: '{{id}}',
      signalTypeRules: [],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ConnectorInstanceSchema
// ============================================================================

describe('ConnectorInstanceSchema', () => {
  it('validates a full instance', () => {
    const result = ConnectorInstanceSchema.safeParse({
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      connectorId: 'github-issues',
      enabled: true,
      credentialSecretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:gh',
      config: { owner: 'acme', repo: 'app' },
      healthy: true,
      lastHealthCheck: '2026-02-07T10:00:00Z',
      consecutiveFailures: 0,
      signalCount24h: 15,
      signalCount7d: 87,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-07T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Built-in Descriptors Validation
// ============================================================================

describe('builtinDescriptors', () => {
  it('contains at least 10 descriptors', () => {
    expect(builtinDescriptors.length).toBeGreaterThanOrEqual(10);
  });

  it.each(builtinDescriptors.map((d) => [d.id, d]))(
    'validates built-in descriptor: %s',
    (_id, descriptor) => {
      const result = ConnectorDescriptorSchema.safeParse(descriptor);
      if (!result.success) {
        console.error(`Validation errors for ${_id}:`, result.error.issues);
      }
      expect(result.success).toBe(true);
    }
  );

  it('has unique IDs', () => {
    const ids = builtinDescriptors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes native connectors for jira, outlook, ses', () => {
    const nativeIds = builtinDescriptors
      .filter((d) => d.kind === 'native')
      .map((d) => d.id);
    expect(nativeIds).toContain('jira');
    expect(nativeIds).toContain('outlook');
    expect(nativeIds).toContain('ses');
  });

  it('includes generic connectors', () => {
    const genericIds = builtinDescriptors
      .filter((d) => d.kind === 'generic')
      .map((d) => d.id);
    expect(genericIds).toContain('github-issues');
    expect(genericIds).toContain('linear');
    expect(genericIds).toContain('slack');
  });
});
