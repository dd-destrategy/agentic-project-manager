/**
 * Ingestion session repository
 *
 * Handles storage and retrieval of ingestion sessions — conversations
 * where the user pastes screenshots, chat logs, and other content
 * to discuss with the AI and extract PM-relevant information.
 */

import { ulid } from 'ulid';

import { KEY_PREFIX, GSI1_PREFIX, TTL } from '../../constants.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export type IngestionSessionStatus = 'active' | 'archived';
export type IngestionMessageRole = 'user' | 'assistant';

export interface IngestionAttachment {
  id: string;
  mimeType: string;
  /** Base64-encoded data URL */
  dataUrl: string;
  filename?: string;
}

export interface IngestionMessage {
  id: string;
  role: IngestionMessageRole;
  content: string;
  attachments?: IngestionAttachment[];
  createdAt: string;
}

export interface IngestionSession {
  id: string;
  title: string;
  status: IngestionSessionStatus;
  messages: IngestionMessage[];
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIngestionSessionOptions {
  title: string;
  projectId?: string;
}

export interface IngestionSessionQueryOptions extends QueryOptions {
  status?: IngestionSessionStatus;
}

// ============================================================================
// DynamoDB item shape
// ============================================================================

interface IngestionSessionItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  TTL?: number;
  sessionId: string;
  title: string;
  status: IngestionSessionStatus;
  messages: IngestionMessage[];
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Repository
// ============================================================================

export class IngestionSessionRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a session by ID
   */
  async getById(sessionId: string): Promise<IngestionSession | null> {
    const item = await this.db.get<IngestionSessionItem>(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      'METADATA'
    );
    return item ? this.toSession(item) : null;
  }

  /**
   * List sessions, optionally filtered by status
   */
  async list(
    options?: IngestionSessionQueryOptions
  ): Promise<QueryResult<Omit<IngestionSession, 'messages'>>> {
    const gsi1pk =
      options?.status === 'archived'
        ? GSI1_PREFIX.INGEST_ARCHIVED
        : GSI1_PREFIX.INGEST_ACTIVE;

    const result = await this.db.queryGSI1<IngestionSessionItem>(gsi1pk, {
      limit: options?.limit ?? 50,
      ascending: false,
    });

    const items = result.items.map((item) => this.toSessionSummary(item));

    return {
      items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Create a new ingestion session
   */
  async create(
    options: CreateIngestionSessionOptions
  ): Promise<IngestionSession> {
    const id = ulid();
    const now = new Date().toISOString();

    const item: IngestionSessionItem = {
      PK: `${KEY_PREFIX.INGEST}${id}`,
      SK: 'METADATA',
      GSI1PK: GSI1_PREFIX.INGEST_ACTIVE,
      GSI1SK: now,
      TTL: Math.floor(Date.now() / 1000) + TTL.ACTIONS_DAYS * 24 * 60 * 60,
      sessionId: id,
      title: options.title,
      status: 'active',
      messages: [],
      projectId: options.projectId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.put(item as unknown as Record<string, unknown>);
    return this.toSession(item);
  }

  /**
   * Add a message to a session and return the updated session
   */
  async addMessage(
    sessionId: string,
    message: IngestionMessage
  ): Promise<IngestionSession | null> {
    const now = new Date().toISOString();

    try {
      await this.db.update(
        `${KEY_PREFIX.INGEST}${sessionId}`,
        'METADATA',
        'SET #messages = list_append(#messages, :newMessage), #updatedAt = :now',
        {
          ':newMessage': [message],
          ':now': now,
        },
        {
          '#messages': 'messages',
          '#updatedAt': 'updatedAt',
        }
      );
    } catch {
      return null;
    }

    return this.getById(sessionId);
  }

  /**
   * Add multiple messages at once (e.g. user + assistant pair)
   */
  async addMessages(
    sessionId: string,
    messages: IngestionMessage[]
  ): Promise<IngestionSession | null> {
    const now = new Date().toISOString();

    try {
      await this.db.update(
        `${KEY_PREFIX.INGEST}${sessionId}`,
        'METADATA',
        'SET #messages = list_append(#messages, :newMessages), #updatedAt = :now',
        {
          ':newMessages': messages,
          ':now': now,
        },
        {
          '#messages': 'messages',
          '#updatedAt': 'updatedAt',
        }
      );
    } catch {
      return null;
    }

    return this.getById(sessionId);
  }

  /**
   * Update session title
   */
  async updateTitle(sessionId: string, title: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      'METADATA',
      'SET #title = :title, #updatedAt = :now',
      {
        ':title': title,
        ':now': now,
      },
      {
        '#title': 'title',
        '#updatedAt': 'updatedAt',
      }
    );
  }

  /**
   * Archive a session
   */
  async archive(sessionId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      'METADATA',
      'SET #status = :status, #gsi1pk = :gsi1pk, #updatedAt = :now',
      {
        ':status': 'archived',
        ':gsi1pk': GSI1_PREFIX.INGEST_ARCHIVED,
        ':now': now,
      },
      {
        '#status': 'status',
        '#gsi1pk': 'GSI1PK',
        '#updatedAt': 'updatedAt',
      }
    );
  }

  /**
   * Delete a session permanently
   */
  async delete(sessionId: string): Promise<void> {
    await this.db.delete(`${KEY_PREFIX.INGEST}${sessionId}`, 'METADATA');
  }

  // ============================================================================
  // Mapping helpers
  // ============================================================================

  private toSession(item: IngestionSessionItem): IngestionSession {
    return {
      id: item.sessionId,
      title: item.title,
      status: item.status,
      messages: item.messages ?? [],
      projectId: item.projectId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toSessionSummary(
    item: IngestionSessionItem
  ): Omit<IngestionSession, 'messages'> {
    return {
      id: item.sessionId,
      title: item.title,
      status: item.status,
      projectId: item.projectId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
