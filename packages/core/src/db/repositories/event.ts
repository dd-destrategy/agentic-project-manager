/**
 * Event repository
 *
 * Handles storage and retrieval of agent events for activity feed,
 * heartbeats, and audit logging.
 */

import { ulid } from 'ulid';
import { KEY_PREFIX, GSI1_PREFIX, TTL } from '../../constants.js';
import type { Event, EventType, EventSeverity } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

/**
 * Options for creating events
 */
export interface CreateEventOptions {
  projectId?: string;
  eventType: EventType;
  severity: EventSeverity;
  summary: string;
  detail?: Event['detail'];
}

/**
 * Options for querying events with filters
 */
export interface EventQueryOptions extends QueryOptions {
  eventType?: EventType;
  severity?: EventSeverity;
  fromTimestamp?: string;
  toTimestamp?: string;
}

/**
 * Repository for Event entities
 */
export class EventRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a specific event by project and ID
   */
  async getById(projectId: string | null, eventId: string, timestamp: string): Promise<Event | null> {
    const pk = projectId
      ? `${KEY_PREFIX.PROJECT}${projectId}`
      : KEY_PREFIX.GLOBAL;
    const sk = `${KEY_PREFIX.EVENT}${timestamp}#${eventId}`;

    return this.db.get<Event>(pk, sk);
  }

  /**
   * Get events for a project
   */
  async getByProject(
    projectId: string,
    options?: EventQueryOptions
  ): Promise<QueryResult<Event>> {
    const result = await this.db.query<Event>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.EVENT,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    // Apply client-side filtering if needed
    let items = result.items;
    if (options?.eventType) {
      items = items.filter((e) => e.eventType === options.eventType);
    }
    if (options?.severity) {
      items = items.filter((e) => e.severity === options.severity);
    }

    return {
      items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get global events (not associated with a specific project)
   */
  async getGlobal(options?: EventQueryOptions): Promise<QueryResult<Event>> {
    const result = await this.db.query<Event>(
      KEY_PREFIX.GLOBAL,
      KEY_PREFIX.EVENT,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    let items = result.items;
    if (options?.eventType) {
      items = items.filter((e) => e.eventType === options.eventType);
    }
    if (options?.severity) {
      items = items.filter((e) => e.severity === options.severity);
    }

    return {
      items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get events by date (global, across all projects)
   */
  async getByDate(
    date: string,
    options?: EventQueryOptions
  ): Promise<QueryResult<Event>> {
    const result = await this.db.queryGSI1<Event>(
      `${GSI1_PREFIX.EVENT_DATE}${date}`,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    let items = result.items;
    if (options?.eventType) {
      items = items.filter((e) => e.eventType === options.eventType);
    }
    if (options?.severity) {
      items = items.filter((e) => e.severity === options.severity);
    }

    return {
      items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get recent events across multiple dates (for activity feed)
   * Fetches from today and yesterday by default
   */
  async getRecent(
    options?: EventQueryOptions & { days?: number }
  ): Promise<QueryResult<Event>> {
    const days = options?.days ?? 2;
    const limit = options?.limit ?? 50;
    const allItems: Event[] = [];

    // Query each day starting from today
    for (let i = 0; i < days && allItems.length < limit; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0]!;

      const result = await this.getByDate(dateStr, {
        ...options,
        limit: limit - allItems.length,
      });

      allItems.push(...result.items);
    }

    // Sort by timestamp descending
    allItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      items: allItems.slice(0, limit),
      hasMore: allItems.length > limit,
    };
  }

  /**
   * Get the most recent heartbeat event
   */
  async getLatestHeartbeat(): Promise<Event | null> {
    const result = await this.getGlobal({
      eventType: 'heartbeat',
      limit: 1,
    });

    return result.items[0] ?? null;
  }

  /**
   * Create a new event
   */
  async create(event: CreateEventOptions): Promise<Event> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    const dateOnly = createdAt.split('T')[0]!;

    const fullEvent: Event = {
      id,
      projectId: event.projectId,
      eventType: event.eventType,
      severity: event.severity,
      summary: event.summary,
      detail: event.detail,
      createdAt,
    };

    const pk = event.projectId
      ? `${KEY_PREFIX.PROJECT}${event.projectId}`
      : KEY_PREFIX.GLOBAL;

    await this.db.put({
      PK: pk,
      SK: `${KEY_PREFIX.EVENT}${createdAt}#${id}`,
      GSI1PK: `${GSI1_PREFIX.EVENT_DATE}${dateOnly}`,
      GSI1SK: `${createdAt}#${id}`,
      TTL: Math.floor(Date.now() / 1000) + TTL.EVENTS_DAYS * 24 * 60 * 60,
      ...fullEvent,
    });

    return fullEvent;
  }

  /**
   * Create a heartbeat event
   */
  async createHeartbeat(
    cycleId: string,
    hasChanges: boolean,
    detail?: Event['detail']
  ): Promise<Event> {
    return this.create({
      eventType: hasChanges ? 'heartbeat_with_changes' : 'heartbeat',
      severity: 'info',
      summary: hasChanges
        ? `Agent cycle ${cycleId}: Changes detected`
        : `Agent cycle ${cycleId}: No changes`,
      detail: {
        ...detail,
        context: {
          ...detail?.context,
          cycleId,
        },
      },
    });
  }

  /**
   * Create an error event
   */
  async createError(
    error: Error,
    projectId?: string,
    context?: Record<string, unknown>
  ): Promise<Event> {
    return this.create({
      projectId,
      eventType: 'error',
      severity: 'error',
      summary: `Error: ${error.message}`,
      detail: {
        context: {
          ...context,
          errorName: error.name,
          errorStack: error.stack,
        },
      },
    });
  }

  /**
   * Count events by type for a given date range
   */
  async countByType(
    date: string,
    eventType?: EventType
  ): Promise<number> {
    const result = await this.getByDate(date, { eventType, limit: 1000 });
    return result.items.length;
  }
}
