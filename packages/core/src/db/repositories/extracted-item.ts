/**
 * Extracted item repository
 *
 * Handles storage and retrieval of structured items extracted from
 * ingestion sessions. These items sit in a staging area for PM review
 * before being applied to artefacts.
 *
 * DynamoDB layout:
 *   PK: INGEST#<sessionId>   SK: EXTRACT#<itemId>
 *   GSI1PK: EXTRACT#<status>  GSI1SK: <createdAt>
 */

import { ulid } from 'ulid';

import { GSI1_PREFIX, KEY_PREFIX } from '../../constants.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export type ExtractedItemType =
  | 'risk'
  | 'action_item'
  | 'decision'
  | 'blocker'
  | 'status_update'
  | 'dependency'
  | 'stakeholder_request';

export type ExtractedItemStatus =
  | 'pending_review'
  | 'approved'
  | 'applied'
  | 'dismissed';

export type TargetArtefact =
  | 'raid_log'
  | 'delivery_state'
  | 'backlog_summary'
  | 'decision_log';

export type ExtractedItemPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ExtractedItem {
  id: string;
  sessionId: string;
  messageId: string;
  type: ExtractedItemType;
  title: string;
  content: string;
  targetArtefact: TargetArtefact;
  priority: ExtractedItemPriority;
  status: ExtractedItemStatus;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  dismissedAt?: string;
  dismissReason?: string;
}

export interface CreateExtractedItemOptions {
  sessionId: string;
  messageId: string;
  type: ExtractedItemType;
  title: string;
  content: string;
  targetArtefact: TargetArtefact;
  priority: ExtractedItemPriority;
  projectId?: string;
}

export interface UpdateExtractedItemOptions {
  title?: string;
  content?: string;
  type?: ExtractedItemType;
  targetArtefact?: TargetArtefact;
  priority?: ExtractedItemPriority;
  projectId?: string;
}

export interface ExtractedItemQueryOptions extends QueryOptions {
  status?: ExtractedItemStatus;
}

// ============================================================================
// DynamoDB item shape
// ============================================================================

interface ExtractedItemItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  itemId: string;
  sessionId: string;
  messageId: string;
  type: ExtractedItemType;
  title: string;
  content: string;
  targetArtefact: TargetArtefact;
  priority: ExtractedItemPriority;
  status: ExtractedItemStatus;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  dismissedAt?: string;
  dismissReason?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function gsi1PkForStatus(status: ExtractedItemStatus): string {
  switch (status) {
    case 'pending_review':
      return GSI1_PREFIX.EXTRACT_PENDING;
    case 'approved':
      return GSI1_PREFIX.EXTRACT_APPROVED;
    case 'applied':
      return GSI1_PREFIX.EXTRACT_APPLIED;
    case 'dismissed':
      return GSI1_PREFIX.EXTRACT_DISMISSED;
  }
}

// ============================================================================
// Repository
// ============================================================================

export class ExtractedItemRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a single item by session + item ID
   */
  async getById(
    sessionId: string,
    itemId: string
  ): Promise<ExtractedItem | null> {
    const item = await this.db.get<ExtractedItemItem>(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`
    );
    return item ? this.toExtractedItem(item) : null;
  }

  /**
   * List all extracted items for a specific ingestion session
   */
  async getBySession(
    sessionId: string,
    options?: QueryOptions
  ): Promise<QueryResult<ExtractedItem>> {
    const result = await this.db.query<ExtractedItemItem>(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      'EXTRACT#',
      {
        limit: options?.limit ?? 100,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items.map((i) => this.toExtractedItem(i)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * List items by status across all sessions (via GSI1)
   */
  async getByStatus(
    status: ExtractedItemStatus,
    options?: QueryOptions
  ): Promise<QueryResult<ExtractedItem>> {
    const result = await this.db.queryGSI1<ExtractedItemItem>(
      gsi1PkForStatus(status),
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items.map((i) => this.toExtractedItem(i)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Count pending review items (for badges)
   */
  async countPendingReview(): Promise<number> {
    const result = await this.db.queryGSI1<ExtractedItemItem>(
      GSI1_PREFIX.EXTRACT_PENDING,
      { limit: 200 }
    );
    return result.items.length;
  }

  /**
   * Create a new extracted item
   */
  async create(options: CreateExtractedItemOptions): Promise<ExtractedItem> {
    const id = ulid();
    const now = new Date().toISOString();

    const item: ExtractedItemItem = {
      PK: `${KEY_PREFIX.INGEST}${options.sessionId}`,
      SK: `EXTRACT#${id}`,
      GSI1PK: GSI1_PREFIX.EXTRACT_PENDING,
      GSI1SK: now,
      itemId: id,
      sessionId: options.sessionId,
      messageId: options.messageId,
      type: options.type,
      title: options.title,
      content: options.content,
      targetArtefact: options.targetArtefact,
      priority: options.priority,
      status: 'pending_review',
      projectId: options.projectId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.put(item as unknown as Record<string, unknown>);
    return this.toExtractedItem(item);
  }

  /**
   * Create multiple items at once (batch from a single AI extraction)
   */
  async createBatch(
    items: CreateExtractedItemOptions[]
  ): Promise<ExtractedItem[]> {
    const results: ExtractedItem[] = [];
    for (const opts of items) {
      const created = await this.create(opts);
      results.push(created);
    }
    return results;
  }

  /**
   * Update an extracted item (for inline editing)
   */
  async update(
    sessionId: string,
    itemId: string,
    updates: UpdateExtractedItemOptions
  ): Promise<ExtractedItem | null> {
    const now = new Date().toISOString();

    const setClauses: string[] = ['#updatedAt = :now'];
    const exprValues: Record<string, unknown> = { ':now': now };
    const exprNames: Record<string, string> = { '#updatedAt': 'updatedAt' };

    if (updates.title !== undefined) {
      setClauses.push('#title = :title');
      exprValues[':title'] = updates.title;
      exprNames['#title'] = 'title';
    }
    if (updates.content !== undefined) {
      setClauses.push('#content = :content');
      exprValues[':content'] = updates.content;
      exprNames['#content'] = 'content';
    }
    if (updates.type !== undefined) {
      setClauses.push('#itemType = :itemType');
      exprValues[':itemType'] = updates.type;
      exprNames['#itemType'] = 'type';
    }
    if (updates.targetArtefact !== undefined) {
      setClauses.push('#targetArtefact = :targetArtefact');
      exprValues[':targetArtefact'] = updates.targetArtefact;
      exprNames['#targetArtefact'] = 'targetArtefact';
    }
    if (updates.priority !== undefined) {
      setClauses.push('#priority = :priority');
      exprValues[':priority'] = updates.priority;
      exprNames['#priority'] = 'priority';
    }
    if (updates.projectId !== undefined) {
      setClauses.push('#projectId = :projectId');
      exprValues[':projectId'] = updates.projectId;
      exprNames['#projectId'] = 'projectId';
    }

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`,
      `SET ${setClauses.join(', ')}`,
      exprValues,
      exprNames
    );

    return this.getById(sessionId, itemId);
  }

  /**
   * Approve an item (move from pending_review to approved)
   */
  async approve(
    sessionId: string,
    itemId: string
  ): Promise<ExtractedItem | null> {
    const now = new Date().toISOString();

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`,
      'SET #status = :status, #gsi1pk = :gsi1pk, #updatedAt = :now',
      {
        ':status': 'approved',
        ':gsi1pk': GSI1_PREFIX.EXTRACT_APPROVED,
        ':now': now,
      },
      {
        '#status': 'status',
        '#gsi1pk': 'GSI1PK',
        '#updatedAt': 'updatedAt',
      }
    );

    return this.getById(sessionId, itemId);
  }

  /**
   * Mark an item as applied to an artefact
   */
  async markApplied(
    sessionId: string,
    itemId: string
  ): Promise<ExtractedItem | null> {
    const now = new Date().toISOString();

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`,
      'SET #status = :status, #gsi1pk = :gsi1pk, #appliedAt = :now, #updatedAt = :now',
      {
        ':status': 'applied',
        ':gsi1pk': GSI1_PREFIX.EXTRACT_APPLIED,
        ':now': now,
      },
      {
        '#status': 'status',
        '#gsi1pk': 'GSI1PK',
        '#appliedAt': 'appliedAt',
        '#updatedAt': 'updatedAt',
      }
    );

    return this.getById(sessionId, itemId);
  }

  /**
   * Dismiss an item (user decides it's not relevant)
   */
  async dismiss(
    sessionId: string,
    itemId: string,
    reason?: string
  ): Promise<ExtractedItem | null> {
    const now = new Date().toISOString();

    const setClauses = [
      '#status = :status',
      '#gsi1pk = :gsi1pk',
      '#dismissedAt = :now',
      '#updatedAt = :now',
    ];
    const exprValues: Record<string, unknown> = {
      ':status': 'dismissed',
      ':gsi1pk': GSI1_PREFIX.EXTRACT_DISMISSED,
      ':now': now,
    };
    const exprNames: Record<string, string> = {
      '#status': 'status',
      '#gsi1pk': 'GSI1PK',
      '#dismissedAt': 'dismissedAt',
      '#updatedAt': 'updatedAt',
    };

    if (reason) {
      setClauses.push('#dismissReason = :reason');
      exprValues[':reason'] = reason;
      exprNames['#dismissReason'] = 'dismissReason';
    }

    await this.db.update(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`,
      `SET ${setClauses.join(', ')}`,
      exprValues,
      exprNames
    );

    return this.getById(sessionId, itemId);
  }

  /**
   * Delete an extracted item permanently
   */
  async delete(sessionId: string, itemId: string): Promise<void> {
    await this.db.delete(
      `${KEY_PREFIX.INGEST}${sessionId}`,
      `EXTRACT#${itemId}`
    );
  }

  // ============================================================================
  // Mapping
  // ============================================================================

  private toExtractedItem(item: ExtractedItemItem): ExtractedItem {
    return {
      id: item.itemId,
      sessionId: item.sessionId,
      messageId: item.messageId,
      type: item.type,
      title: item.title,
      content: item.content,
      targetArtefact: item.targetArtefact,
      priority: item.priority,
      status: item.status,
      projectId: item.projectId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      appliedAt: item.appliedAt,
      dismissedAt: item.dismissedAt,
      dismissReason: item.dismissReason,
    };
  }
}
