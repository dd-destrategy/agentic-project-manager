/**
 * Field Mapping Engine
 *
 * Transforms raw API response items into NormalisedSignal objects using
 * the connector's FieldMappingDescriptor. Uses JSONPath-like expressions
 * for field extraction and template interpolation for summaries.
 */

import { ulid } from 'ulid';

import type {
  FieldMappingDescriptor,
  SignalTypeRule,
  PriorityRule,
} from './connector-schemas.js';

// ============================================================================
// Types
// ============================================================================

export interface MappedSignal {
  id: string;
  source: string;
  timestamp: string;
  type: string;
  summary: string;
  raw: Record<string, unknown>;
  projectId: string;
  metadata?: {
    priority?: 'critical' | 'high' | 'medium' | 'low';
    participants?: string[];
    tags?: string[];
    relatedTickets?: string[];
  };
}

// ============================================================================
// JSONPath Utilities
// ============================================================================

/**
 * Extract a value from a nested object using a dot-notation path.
 * Supports array indexing with [n] and nested paths like "fields.status.name".
 *
 * Examples:
 *   "name"                    → obj.name
 *   "fields.status.name"      → obj.fields.status.name
 *   "items[0].title"          → obj.items[0].title
 *   "labels[*].name"          → [obj.labels[0].name, obj.labels[1].name, ...]
 */
export function extractPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;

  // '$' means the root object itself
  if (path === '$') return obj;

  const segments = parsePath(path);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (segment.type === 'key') {
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment.value];
    } else if (segment.type === 'index') {
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(segment.value, 10)];
    } else if (segment.type === 'wildcard') {
      if (!Array.isArray(current)) return undefined;
      // Collect remaining path from all array items
      const remainingPath = segments
        .slice(segments.indexOf(segment) + 1)
        .map((s) =>
          s.type === 'index'
            ? `[${s.value}]`
            : s.type === 'wildcard'
              ? '[*]'
              : s.value
        )
        .join('.');

      if (remainingPath) {
        return current.map((item) => extractPath(item, remainingPath));
      }
      return current;
    }
  }

  return current;
}

interface PathSegment {
  type: 'key' | 'index' | 'wildcard';
  value: string;
}

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const parts = path.split(/\.|\[|\]/).filter(Boolean);

  for (const part of parts) {
    if (part === '*') {
      segments.push({ type: 'wildcard', value: '*' });
    } else if (/^\d+$/.test(part)) {
      segments.push({ type: 'index', value: part });
    } else {
      segments.push({ type: 'key', value: part });
    }
  }

  return segments;
}

/**
 * Extract items array from API response using the itemsPath.
 */
export function extractItems(response: unknown, itemsPath: string): unknown[] {
  const items = extractPath(response, itemsPath);
  if (Array.isArray(items)) return items;
  // Single item (webhook payload) — wrap in array
  if (items !== null && items !== undefined) return [items];
  return [];
}

// ============================================================================
// Template Interpolation
// ============================================================================

/**
 * Interpolate a template string with values from an object.
 * Template variables use {{path.to.field}} syntax.
 *
 * Example: "{{key}} status changed: {{fields.status.name}}"
 */
export function interpolateTemplate(template: string, item: unknown): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = extractPath(item, path.trim());
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

// ============================================================================
// Signal Type Resolution
// ============================================================================

/**
 * Evaluate signal type rules against an item and return the first match.
 */
export function resolveSignalType(
  item: unknown,
  rules: SignalTypeRule[]
): string {
  for (const rule of rules) {
    const value = extractPath(item, rule.when);

    switch (rule.operator) {
      case 'exists':
        if (value !== null && value !== undefined) return rule.then;
        break;

      case 'equals':
        if (String(value) === rule.value) return rule.then;
        break;

      case 'contains':
        if (
          typeof value === 'string' &&
          rule.value &&
          value.includes(rule.value)
        ) {
          return rule.then;
        }
        break;

      case 'matches':
        if (
          typeof value === 'string' &&
          rule.value &&
          new RegExp(rule.value).test(value)
        ) {
          return rule.then;
        }
        break;
    }
  }

  return 'unknown';
}

/**
 * Evaluate priority rules against an item.
 */
export function resolvePriority(
  item: unknown,
  rules?: PriorityRule[]
): 'critical' | 'high' | 'medium' | 'low' | undefined {
  if (!rules || rules.length === 0) return undefined;

  for (const rule of rules) {
    const value = extractPath(item, rule.when);

    switch (rule.operator) {
      case 'equals':
        if (String(value) === rule.value) return rule.then;
        break;

      case 'contains':
        if (
          typeof value === 'string' &&
          typeof rule.value === 'string' &&
          value.includes(rule.value)
        ) {
          return rule.then;
        }
        break;

      case 'in':
        if (Array.isArray(rule.value) && rule.value.includes(String(value))) {
          return rule.then;
        }
        break;
    }
  }

  return undefined;
}

// ============================================================================
// Field Mapping Engine
// ============================================================================

export class FieldMappingEngine {
  /**
   * Map a single raw API item to a MappedSignal.
   */
  mapItem(
    item: unknown,
    mapping: FieldMappingDescriptor,
    connectorId: string,
    projectId: string
  ): MappedSignal {
    const id = ulid();
    const rawId = extractPath(item, mapping.idPath);
    const timestamp = this.resolveTimestamp(item, mapping.timestampPath);
    const summary = interpolateTemplate(mapping.summaryTemplate, item);
    const type = resolveSignalType(item, mapping.signalTypeRules);
    const priority = resolvePriority(item, mapping.priorityMapping);

    // Extract optional metadata
    const participants = mapping.participantsPath
      ? this.extractStringArray(item, mapping.participantsPath)
      : undefined;

    const tags = mapping.tagsPath
      ? this.extractStringArray(item, mapping.tagsPath)
      : undefined;

    const relatedTickets = mapping.relatedItemsPath
      ? this.extractStringArray(item, mapping.relatedItemsPath)
      : undefined;

    // Build raw payload with selected fields
    const raw = this.buildRawPayload(item, mapping.rawFields, rawId);

    const metadata: MappedSignal['metadata'] = {};
    if (priority) metadata.priority = priority;
    if (participants?.length) metadata.participants = participants;
    if (tags?.length) metadata.tags = tags;
    if (relatedTickets?.length) metadata.relatedTickets = relatedTickets;

    return {
      id,
      source: connectorId,
      timestamp,
      type,
      summary: summary.slice(0, 500),
      raw,
      projectId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  /**
   * Map all items from an API response to MappedSignals.
   */
  mapResponse(
    response: unknown,
    mapping: FieldMappingDescriptor,
    connectorId: string,
    projectId: string
  ): MappedSignal[] {
    const items = extractItems(response, mapping.itemsPath);
    return items.map((item) =>
      this.mapItem(item, mapping, connectorId, projectId)
    );
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private resolveTimestamp(item: unknown, path: string): string {
    const value = extractPath(item, path);
    if (!value) return new Date().toISOString();

    // Handle Unix timestamps
    if (typeof value === 'number') {
      // Seconds
      if (value < 1e12) return new Date(value * 1000).toISOString();
      // Milliseconds
      return new Date(value).toISOString();
    }

    // Try parsing as date string
    const date = new Date(String(value));
    if (!isNaN(date.getTime())) return date.toISOString();

    return new Date().toISOString();
  }

  private extractStringArray(
    item: unknown,
    path: string
  ): string[] | undefined {
    const value = extractPath(item, path);
    if (Array.isArray(value)) {
      return value
        .map((v) =>
          typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
        )
        .filter(Boolean);
    }
    if (typeof value === 'string') return [value];
    return undefined;
  }

  private buildRawPayload(
    item: unknown,
    rawFields: string[] | undefined,
    id: unknown
  ): Record<string, unknown> {
    const raw: Record<string, unknown> = { sourceId: id };

    if (!rawFields || rawFields.length === 0) {
      // Include the whole item (capped to prevent bloat)
      if (typeof item === 'object' && item !== null) {
        const str = JSON.stringify(item);
        if (str.length <= 10000) {
          return { ...raw, ...(item as Record<string, unknown>) };
        }
      }
      return raw;
    }

    for (const field of rawFields) {
      const value = extractPath(item, field);
      if (value !== undefined) {
        raw[field] = value;
      }
    }

    return raw;
  }
}
