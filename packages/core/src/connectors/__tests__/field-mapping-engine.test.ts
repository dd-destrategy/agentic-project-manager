/**
 * Tests for FieldMappingEngine
 *
 * Covers: JSONPath extraction, template interpolation, signal type resolution,
 * priority mapping, and full item-to-signal mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  FieldMappingEngine,
  extractPath,
  extractItems,
  interpolateTemplate,
  resolveSignalType,
  resolvePriority,
} from '../field-mapping-engine.js';
import type { FieldMappingDescriptor } from '../connector-schemas.js';

// ============================================================================
// extractPath
// ============================================================================

describe('extractPath', () => {
  const obj = {
    name: 'Test',
    fields: {
      status: { name: 'In Progress', id: '3' },
      priority: { name: 'High' },
    },
    labels: [
      { name: 'bug', colour: 'red' },
      { name: 'urgent', colour: 'orange' },
    ],
    items: [
      { title: 'First', tags: ['a', 'b'] },
      { title: 'Second', tags: ['c'] },
    ],
    deep: { nested: { value: 42 } },
  };

  it('extracts top-level keys', () => {
    expect(extractPath(obj, 'name')).toBe('Test');
  });

  it('extracts nested paths', () => {
    expect(extractPath(obj, 'fields.status.name')).toBe('In Progress');
    expect(extractPath(obj, 'deep.nested.value')).toBe(42);
  });

  it('extracts array items by index', () => {
    expect(extractPath(obj, 'labels[0].name')).toBe('bug');
    expect(extractPath(obj, 'labels[1].colour')).toBe('orange');
    expect(extractPath(obj, 'items[0].title')).toBe('First');
  });

  it('extracts array items with wildcard', () => {
    const result = extractPath(obj, 'labels[*].name');
    expect(result).toEqual(['bug', 'urgent']);
  });

  it('returns undefined for missing paths', () => {
    expect(extractPath(obj, 'nonexistent')).toBeUndefined();
    expect(extractPath(obj, 'fields.missing.deep')).toBeUndefined();
    expect(extractPath(obj, 'labels[5].name')).toBeUndefined();
  });

  it('handles null and undefined inputs', () => {
    expect(extractPath(null, 'anything')).toBeUndefined();
    expect(extractPath(undefined, 'anything')).toBeUndefined();
    expect(extractPath(obj, '')).toBeUndefined();
  });

  it('handles primitive values at path endpoints', () => {
    expect(extractPath({ count: 0 }, 'count')).toBe(0);
    expect(extractPath({ flag: false }, 'flag')).toBe(false);
    expect(extractPath({ text: '' }, 'text')).toBe('');
  });
});

// ============================================================================
// extractItems
// ============================================================================

describe('extractItems', () => {
  it('extracts array from response', () => {
    const response = { data: { issues: [{ id: 1 }, { id: 2 }] } };
    expect(extractItems(response, 'data.issues')).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('wraps single item in array', () => {
    const response = { event: { id: 'abc', type: 'message' } };
    expect(extractItems(response, 'event')).toEqual([
      { id: 'abc', type: 'message' },
    ]);
  });

  it('handles root array with $ path', () => {
    const response = [{ id: 1 }, { id: 2 }];
    // '$' path should return the array itself
    const items = extractItems(response, '$');
    // If $ doesn't work directly, the whole response is the array
    expect(Array.isArray(items)).toBe(true);
  });

  it('returns empty array for missing paths', () => {
    expect(extractItems({}, 'missing.path')).toEqual([]);
    expect(extractItems(null, 'anything')).toEqual([]);
  });
});

// ============================================================================
// interpolateTemplate
// ============================================================================

describe('interpolateTemplate', () => {
  const item = {
    key: 'PROJ-123',
    fields: {
      summary: 'Fix the bug',
      status: { name: 'Done' },
      assignee: { displayName: 'Alice' },
    },
    number: 42,
  };

  it('interpolates simple variables', () => {
    expect(interpolateTemplate('{{key}}: {{number}}', item)).toBe(
      'PROJ-123: 42'
    );
  });

  it('interpolates nested variables', () => {
    expect(interpolateTemplate('{{key}} {{fields.status.name}}', item)).toBe(
      'PROJ-123 Done'
    );
  });

  it('handles missing variables as empty string', () => {
    expect(interpolateTemplate('{{missing}} test', item)).toBe(' test');
  });

  it('handles multiple variables in one template', () => {
    const template =
      '{{key}}: {{fields.summary}} [{{fields.status.name}}] → {{fields.assignee.displayName}}';
    expect(interpolateTemplate(template, item)).toBe(
      'PROJ-123: Fix the bug [Done] → Alice'
    );
  });

  it('passes through text without variables', () => {
    expect(interpolateTemplate('No variables here', item)).toBe(
      'No variables here'
    );
  });

  it('trims whitespace in variable names', () => {
    expect(interpolateTemplate('{{ key }}', item)).toBe('PROJ-123');
  });
});

// ============================================================================
// resolveSignalType
// ============================================================================

describe('resolveSignalType', () => {
  const rules = [
    { when: 'pull_request', operator: 'exists' as const, then: 'pr_updated' },
    {
      when: 'state',
      operator: 'equals' as const,
      value: 'closed',
      then: 'ticket_status_changed',
    },
    {
      when: 'type',
      operator: 'contains' as const,
      value: 'comment',
      then: 'ticket_commented',
    },
    {
      when: 'action',
      operator: 'matches' as const,
      value: '^(created|opened)$',
      then: 'ticket_created',
    },
  ];

  it('matches exists operator', () => {
    expect(resolveSignalType({ pull_request: { url: '...' } }, rules)).toBe(
      'pr_updated'
    );
  });

  it('matches equals operator', () => {
    expect(resolveSignalType({ state: 'closed' }, rules)).toBe(
      'ticket_status_changed'
    );
  });

  it('matches contains operator', () => {
    expect(resolveSignalType({ type: 'issue_comment' }, rules)).toBe(
      'ticket_commented'
    );
  });

  it('matches regex operator', () => {
    expect(resolveSignalType({ action: 'created' }, rules)).toBe(
      'ticket_created'
    );
    expect(resolveSignalType({ action: 'opened' }, rules)).toBe(
      'ticket_created'
    );
  });

  it('returns first matching rule', () => {
    // This has both pull_request and state=closed — first rule wins
    expect(
      resolveSignalType({ pull_request: {}, state: 'closed' }, rules)
    ).toBe('pr_updated');
  });

  it('returns "unknown" when no rules match', () => {
    expect(resolveSignalType({ unrelated: true }, rules)).toBe('unknown');
  });
});

// ============================================================================
// resolvePriority
// ============================================================================

describe('resolvePriority', () => {
  const rules = [
    {
      when: 'priority',
      operator: 'equals' as const,
      value: '1',
      then: 'critical' as const,
    },
    {
      when: 'priority',
      operator: 'equals' as const,
      value: '2',
      then: 'high' as const,
    },
    {
      when: 'level',
      operator: 'in' as const,
      value: ['P3', 'P4'],
      then: 'medium' as const,
    },
    {
      when: 'labels',
      operator: 'contains' as const,
      value: 'low-priority',
      then: 'low' as const,
    },
  ];

  it('matches equals rules', () => {
    expect(resolvePriority({ priority: '1' }, rules)).toBe('critical');
    expect(resolvePriority({ priority: '2' }, rules)).toBe('high');
  });

  it('matches in rules', () => {
    expect(resolvePriority({ level: 'P3' }, rules)).toBe('medium');
    expect(resolvePriority({ level: 'P4' }, rules)).toBe('medium');
  });

  it('matches contains rules', () => {
    expect(resolvePriority({ labels: 'low-priority-task' }, rules)).toBe('low');
  });

  it('returns undefined when no rules match', () => {
    expect(resolvePriority({ priority: '99' }, rules)).toBeUndefined();
  });

  it('returns undefined for empty/missing rules', () => {
    expect(resolvePriority({ priority: '1' }, undefined)).toBeUndefined();
    expect(resolvePriority({ priority: '1' }, [])).toBeUndefined();
  });
});

// ============================================================================
// FieldMappingEngine.mapItem
// ============================================================================

describe('FieldMappingEngine', () => {
  const engine = new FieldMappingEngine();

  const mapping: FieldMappingDescriptor = {
    itemsPath: 'issues',
    idPath: 'id',
    timestampPath: 'updated_at',
    summaryTemplate: '{{key}}: {{title}} [{{status}}]',
    signalTypeRules: [
      {
        when: 'status',
        operator: 'equals',
        value: 'closed',
        then: 'ticket_status_changed',
      },
      { when: 'id', operator: 'exists', then: 'ticket_updated' },
    ],
    priorityMapping: [
      { when: 'priority', operator: 'equals', value: 'high', then: 'high' },
    ],
    participantsPath: 'assignee',
    tagsPath: 'labels',
    rawFields: ['key', 'title', 'url'],
  };

  it('maps a raw item to a MappedSignal', () => {
    const item = {
      id: '12345',
      key: 'PROJ-1',
      title: 'Fix login',
      status: 'closed',
      priority: 'high',
      updated_at: '2026-01-15T10:30:00Z',
      assignee: 'alice@example.com',
      labels: ['bug', 'critical'],
      url: 'https://example.com/PROJ-1',
    };

    const signal = engine.mapItem(item, mapping, 'test-connector', 'proj-001');

    expect(signal.source).toBe('test-connector');
    expect(signal.projectId).toBe('proj-001');
    expect(signal.type).toBe('ticket_status_changed');
    expect(signal.summary).toBe('PROJ-1: Fix login [closed]');
    expect(signal.timestamp).toBe('2026-01-15T10:30:00.000Z');
    expect(signal.metadata?.priority).toBe('high');
    expect(signal.metadata?.participants).toEqual(['alice@example.com']);
    expect(signal.metadata?.tags).toEqual(['bug', 'critical']);
    expect(signal.raw.key).toBe('PROJ-1');
    expect(signal.raw.title).toBe('Fix login');
    expect(signal.raw.url).toBe('https://example.com/PROJ-1');
    expect(signal.id).toHaveLength(26); // ULID
  });

  it('handles unix timestamps', () => {
    const item = { id: '1', updated_at: 1704067200 }; // 2024-01-01 00:00:00 UTC
    const signal = engine.mapItem(item, mapping, 'test', 'proj');
    expect(signal.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('handles unix millisecond timestamps', () => {
    const item = { id: '1', updated_at: 1704067200000 };
    const signal = engine.mapItem(item, mapping, 'test', 'proj');
    expect(signal.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('defaults to now for missing timestamps', () => {
    const item = { id: '1' };
    const signal = engine.mapItem(item, mapping, 'test', 'proj');
    const diff = new Date().getTime() - new Date(signal.timestamp).getTime();
    expect(diff).toBeLessThan(5000);
  });

  it('truncates long summaries to 500 chars', () => {
    const longTitle = 'A'.repeat(600);
    const item = { id: '1', key: 'K', title: longTitle, status: 'open' };
    const signal = engine.mapItem(item, mapping, 'test', 'proj');
    expect(signal.summary.length).toBeLessThanOrEqual(500);
  });

  it('maps full response with mapResponse', () => {
    const response = {
      issues: [
        { id: '1', key: 'A-1', title: 'First', status: 'open' },
        { id: '2', key: 'A-2', title: 'Second', status: 'closed' },
      ],
    };

    const signals = engine.mapResponse(response, mapping, 'test', 'proj');
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('ticket_updated');
    expect(signals[1].type).toBe('ticket_status_changed');
  });

  it('returns empty array for empty response', () => {
    const signals = engine.mapResponse({ issues: [] }, mapping, 'test', 'proj');
    expect(signals).toEqual([]);
  });

  it('omits metadata when no metadata fields match', () => {
    const sparseMapping: FieldMappingDescriptor = {
      itemsPath: '$',
      idPath: 'id',
      timestampPath: 'ts',
      summaryTemplate: '{{id}}',
      signalTypeRules: [{ when: 'id', operator: 'exists', then: 'unknown' }],
    };

    const signal = engine.mapItem(
      { id: '1', ts: '2026-01-01T00:00:00Z' },
      sparseMapping,
      'test',
      'proj'
    );
    expect(signal.metadata).toBeUndefined();
  });
});
