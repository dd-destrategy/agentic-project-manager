/**
 * Held Action repository
 *
 * Handles storage and retrieval of held actions - actions that are
 * queued for automatic execution after a hold period, unless
 * cancelled or approved early by the user.
 */

import { ulid } from 'ulid';

import { KEY_PREFIX, TTL } from '../../constants.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

/**
 * Held action types that can be queued
 */
export type HeldActionType = 'email_stakeholder' | 'jira_status_change';

/**
 * Held action status
 */
export type HeldActionStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'executed';

/**
 * Email stakeholder payload
 */
export interface EmailStakeholderPayload {
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  context?: string;
}

/**
 * Jira status change payload
 */
export interface JiraStatusChangePayload {
  issueKey: string;
  transitionId: string;
  transitionName: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}

/**
 * Union of all payload types
 */
export type HeldActionPayload =
  | EmailStakeholderPayload
  | JiraStatusChangePayload;

/**
 * Held action entity
 */
export interface HeldAction {
  id: string;
  projectId: string;
  actionType: HeldActionType;
  payload: HeldActionPayload;
  heldUntil: string;
  status: HeldActionStatus;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  executedAt?: string;
  cancelReason?: string;
  /** User who approved/cancelled (if applicable) */
  decidedBy?: string;
}

/**
 * DynamoDB item structure for held action
 */
interface HeldActionItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  TTL?: number;
  actionId: string;
  projectId: string;
  actionType: HeldActionType;
  payload: HeldActionPayload;
  heldUntil: string;
  status: HeldActionStatus;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  executedAt?: string;
  cancelReason?: string;
  decidedBy?: string;
}

/**
 * Options for creating a held action
 */
export interface CreateHeldActionOptions {
  projectId: string;
  actionType: HeldActionType;
  payload: HeldActionPayload;
  holdMinutes: number;
}

/**
 * Options for querying held actions
 */
export interface HeldActionQueryOptions extends QueryOptions {
  status?: HeldActionStatus;
}

/**
 * Repository for HeldAction entities
 */
export class HeldActionRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a held action by ID
   */
  async getById(
    projectId: string,
    actionId: string
  ): Promise<HeldAction | null> {
    const item = await this.db.get<HeldActionItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `HELD#${actionId}`
    );

    return item ? this.toHeldAction(item) : null;
  }

  /**
   * Get held actions for a specific project
   */
  async getByProject(
    projectId: string,
    options?: HeldActionQueryOptions
  ): Promise<QueryResult<HeldAction>> {
    // Build filter expression for server-side filtering
    let filterExpression: string | undefined;
    let expressionAttributeNames: Record<string, string> | undefined;
    let additionalExpressionAttributeValues:
      | Record<string, unknown>
      | undefined;

    if (options?.status) {
      filterExpression = '#status = :status';
      expressionAttributeNames = { '#status': 'status' };
      additionalExpressionAttributeValues = { ':status': options.status };
    }

    const result = await this.db.query<HeldActionItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'HELD#',
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
        filterExpression,
        expressionAttributeNames,
        additionalExpressionAttributeValues,
      }
    );

    const items = result.items.map((item) => this.toHeldAction(item));

    return {
      items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get all pending held actions (across all projects)
   */
  async getPending(options?: QueryOptions): Promise<QueryResult<HeldAction>> {
    const result = await this.db.queryGSI1<HeldActionItem>('HELD#PENDING', {
      limit: options?.limit ?? 100,
      ascending: options?.ascending ?? true, // Ascending to get oldest first
    });

    return {
      items: result.items.map((item) => this.toHeldAction(item)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get actions ready to execute (past their heldUntil time)
   */
  async getReady(now: string, options?: QueryOptions): Promise<HeldAction[]> {
    // Query pending actions where heldUntil <= now
    // GSI1SK is heldUntil timestamp, so we query for values <= now
    const result = await this.db.queryWithExpression<HeldActionItem>(
      'GSI1PK = :pk AND GSI1SK <= :now',
      {
        ':pk': 'HELD#PENDING',
        ':now': now,
      },
      {
        indexName: 'GSI1',
        limit: options?.limit ?? 50,
        ascending: true,
      }
    );

    return result.items.map((item) => this.toHeldAction(item));
  }

  /**
   * Count pending held actions
   */
  async countPending(): Promise<number> {
    const result = await this.db.queryGSI1<HeldActionItem>('HELD#PENDING', {
      limit: 100,
    });
    return result.items.length;
  }

  /**
   * Count pending actions by project
   */
  async countPendingByProject(projectId: string): Promise<number> {
    const result = await this.getByProject(projectId, {
      status: 'pending',
      limit: 100,
    });
    return result.items.length;
  }

  /**
   * Create a new held action
   */
  async create(options: CreateHeldActionOptions): Promise<HeldAction> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    const heldUntil = new Date(
      Date.now() + options.holdMinutes * 60 * 1000
    ).toISOString();

    const item: HeldActionItem = {
      PK: `${KEY_PREFIX.PROJECT}${options.projectId}`,
      SK: `HELD#${id}`,
      GSI1PK: 'HELD#PENDING',
      GSI1SK: heldUntil, // Sort by when the action will be released
      TTL: Math.floor(Date.now() / 1000) + TTL.ACTIONS_DAYS * 24 * 60 * 60,
      actionId: id,
      projectId: options.projectId,
      actionType: options.actionType,
      payload: options.payload,
      heldUntil,
      status: 'pending',
      createdAt,
    };

    await this.db.put(item as unknown as Record<string, unknown>);

    return this.toHeldAction(item);
  }

  /**
   * Approve a held action (executes immediately instead of waiting)
   *
   * Uses conditional update to prevent race conditions where the same
   * action could be approved or cancelled concurrently.
   *
   * @returns Updated action if approval succeeded, null if action is not pending
   * @throws Error if action doesn't exist or update fails
   */
  async approve(
    projectId: string,
    actionId: string,
    decidedBy?: string
  ): Promise<HeldAction | null> {
    const approvedAt = new Date().toISOString();

    try {
      await this.db.update(
        `${KEY_PREFIX.PROJECT}${projectId}`,
        `HELD#${actionId}`,
        'SET #status = :status, #approvedAt = :approvedAt, #decidedBy = :decidedBy, #gsi1pk = :gsi1pk',
        {
          ':status': 'approved',
          ':approvedAt': approvedAt,
          ':decidedBy': decidedBy ?? null,
          ':gsi1pk': 'HELD#APPROVED',
          ':pendingStatus': 'pending',
        },
        {
          '#status': 'status',
          '#approvedAt': 'approvedAt',
          '#decidedBy': 'decidedBy',
          '#gsi1pk': 'GSI1PK',
        },
        // CRITICAL: Only update if status is still 'pending'
        // This prevents race conditions with concurrent approve/cancel operations
        'attribute_exists(PK) AND #status = :pendingStatus'
      );

      return this.getById(projectId, actionId);
    } catch (error) {
      // If conditional check failed, action was already processed
      if (
        error instanceof Error &&
        error.message.includes('ConditionalCheckFailed')
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Cancel a held action (prevents execution)
   *
   * Uses conditional update to prevent race conditions where the same
   * action could be approved or cancelled concurrently.
   *
   * @returns Updated action if cancellation succeeded, null if action is not pending
   * @throws Error if action doesn't exist or update fails
   */
  async cancel(
    projectId: string,
    actionId: string,
    reason?: string,
    decidedBy?: string
  ): Promise<HeldAction | null> {
    const cancelledAt = new Date().toISOString();

    try {
      await this.db.update(
        `${KEY_PREFIX.PROJECT}${projectId}`,
        `HELD#${actionId}`,
        'SET #status = :status, #cancelledAt = :cancelledAt, #cancelReason = :cancelReason, #decidedBy = :decidedBy, #gsi1pk = :gsi1pk',
        {
          ':status': 'cancelled',
          ':cancelledAt': cancelledAt,
          ':cancelReason': reason ?? null,
          ':decidedBy': decidedBy ?? null,
          ':gsi1pk': 'HELD#CANCELLED',
          ':pendingStatus': 'pending',
        },
        {
          '#status': 'status',
          '#cancelledAt': 'cancelledAt',
          '#cancelReason': 'cancelReason',
          '#decidedBy': 'decidedBy',
          '#gsi1pk': 'GSI1PK',
        },
        // CRITICAL: Only update if status is still 'pending'
        // This prevents race conditions with concurrent approve/cancel operations
        'attribute_exists(PK) AND #status = :pendingStatus'
      );

      return this.getById(projectId, actionId);
    } catch (error) {
      // If conditional check failed, action was already processed
      if (
        error instanceof Error &&
        error.message.includes('ConditionalCheckFailed')
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark a held action as executed
   */
  async markExecuted(
    projectId: string,
    actionId: string
  ): Promise<HeldAction | null> {
    const executedAt = new Date().toISOString();

    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `HELD#${actionId}`,
      'SET #status = :status, #executedAt = :executedAt, #gsi1pk = :gsi1pk',
      {
        ':status': 'executed',
        ':executedAt': executedAt,
        ':gsi1pk': 'HELD#EXECUTED',
      },
      {
        '#status': 'status',
        '#executedAt': 'executedAt',
        '#gsi1pk': 'GSI1PK',
      }
    );

    return this.getById(projectId, actionId);
  }

  /**
   * Update status (generic, for flexibility)
   */
  async updateStatus(
    projectId: string,
    actionId: string,
    status: HeldActionStatus
  ): Promise<void> {
    const gsi1pk = `HELD#${status.toUpperCase()}`;

    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `HELD#${actionId}`,
      'SET #status = :status, #gsi1pk = :gsi1pk',
      {
        ':status': status,
        ':gsi1pk': gsi1pk,
      },
      {
        '#status': 'status',
        '#gsi1pk': 'GSI1PK',
      }
    );
  }

  /**
   * Get recently executed actions (for audit trail)
   */
  async getRecentlyExecuted(
    options?: QueryOptions & { days?: number }
  ): Promise<QueryResult<HeldAction>> {
    const result = await this.db.queryGSI1<HeldActionItem>('HELD#EXECUTED', {
      limit: options?.limit ?? 50,
      ascending: options?.ascending ?? false,
    });

    return {
      items: result.items.map((item) => this.toHeldAction(item)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Convert DynamoDB item to HeldAction entity
   */
  private toHeldAction(item: HeldActionItem): HeldAction {
    return {
      id: item.actionId,
      projectId: item.projectId,
      actionType: item.actionType,
      payload: item.payload,
      heldUntil: item.heldUntil,
      status: item.status,
      createdAt: item.createdAt,
      approvedAt: item.approvedAt,
      cancelledAt: item.cancelledAt,
      executedAt: item.executedAt,
      cancelReason: item.cancelReason,
      decidedBy: item.decidedBy,
    };
  }
}
