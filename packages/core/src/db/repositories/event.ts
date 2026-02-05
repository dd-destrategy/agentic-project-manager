/**
 * Event repository
 */

import { ulid } from 'ulid';
import { KEY_PREFIX, GSI1_PREFIX, TTL } from '../../constants.js';
import type { Event } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

/**
 * Repository for Event entities
 */
export class EventRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get events for a project
   */
  async getByProject(
    projectId: string,
    options?: QueryOptions
  ): Promise<QueryResult<Event>> {
    const result = await this.db.query<Event>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.EVENT,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get events by date (global)
   */
  async getByDate(
    date: string,
    options?: QueryOptions
  ): Promise<QueryResult<Event>> {
    const result = await this.db.queryGSI1<Event>(
      `${GSI1_PREFIX.EVENT_DATE}${date}`,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Create a new event
   */
  async create(event: Omit<Event, 'id' | 'createdAt'>): Promise<Event> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    const dateOnly = createdAt.split('T')[0]!;

    const fullEvent: Event = {
      ...event,
      id,
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
}
