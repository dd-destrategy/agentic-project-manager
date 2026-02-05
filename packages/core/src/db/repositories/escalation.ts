/**
 * Escalation repository
 *
 * Handles storage and retrieval of escalations - situations where
 * the agent needs human input before proceeding.
 */

import { ulid } from 'ulid';

import { KEY_PREFIX, GSI1_PREFIX, TTL } from '../../constants.js';
import type {
  Escalation,
  EscalationStatus,
  EscalationContext,
  EscalationOption,
} from '../../types/index.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

/**
 * Options for creating an escalation
 */
export interface CreateEscalationOptions {
  projectId: string;
  title: string;
  context: EscalationContext;
  options: EscalationOption[];
  agentRecommendation?: string;
  agentRationale?: string;
  /** Time until escalation expires (defaults to 7 days) */
  expiresInDays?: number;
}

/**
 * Options for recording a user's decision
 */
export interface RecordDecisionOptions {
  userDecision: string;
  userNotes?: string;
}

/**
 * Options for querying escalations
 */
export interface EscalationQueryOptions extends QueryOptions {
  status?: EscalationStatus;
}

/**
 * DynamoDB item structure for escalation
 */
interface EscalationItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  TTL?: number;
  escalationId: string;
  projectId: string;
  title: string;
  context: EscalationContext;
  options: EscalationOption[];
  agentRecommendation?: string;
  agentRationale?: string;
  status: EscalationStatus;
  userDecision?: string;
  userNotes?: string;
  decidedAt?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Repository for Escalation entities
 */
export class EscalationRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get an escalation by ID
   */
  async getById(projectId: string, escalationId: string): Promise<Escalation | null> {
    const item = await this.db.get<EscalationItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.ESCALATION}${escalationId}`
    );

    return item ? this.toEscalation(item) : null;
  }

  /**
   * Get escalations for a specific project
   */
  async getByProject(
    projectId: string,
    options?: EscalationQueryOptions
  ): Promise<QueryResult<Escalation>> {
    const result = await this.db.query<EscalationItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.ESCALATION,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    let items = result.items.map((item) => this.toEscalation(item));

    // Apply client-side filtering if needed
    if (options?.status) {
      items = items.filter((e) => e.status === options.status);
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
   * Get all pending escalations (across all projects)
   */
  async getPending(options?: QueryOptions): Promise<QueryResult<Escalation>> {
    const result = await this.db.queryGSI1<EscalationItem>(
      GSI1_PREFIX.ESCALATION_PENDING,
      {
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items.map((item) => this.toEscalation(item)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get count of pending escalations
   */
  async countPending(): Promise<number> {
    const result = await this.db.queryGSI1<EscalationItem>(
      GSI1_PREFIX.ESCALATION_PENDING,
      { limit: 100 }
    );
    return result.items.length;
  }

  /**
   * Get pending escalation count by project
   */
  async countPendingByProject(projectId: string): Promise<number> {
    const result = await this.getByProject(projectId, { status: 'pending', limit: 100 });
    return result.items.length;
  }

  /**
   * Create a new escalation
   */
  async create(options: CreateEscalationOptions): Promise<Escalation> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    const expiresInDays = options.expiresInDays ?? 7;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const item: EscalationItem = {
      PK: `${KEY_PREFIX.PROJECT}${options.projectId}`,
      SK: `${KEY_PREFIX.ESCALATION}${id}`,
      GSI1PK: GSI1_PREFIX.ESCALATION_PENDING,
      GSI1SK: createdAt,
      TTL: Math.floor(Date.now() / 1000) + TTL.ACTIONS_DAYS * 24 * 60 * 60,
      escalationId: id,
      projectId: options.projectId,
      title: options.title,
      context: options.context,
      options: options.options,
      agentRecommendation: options.agentRecommendation,
      agentRationale: options.agentRationale,
      status: 'pending',
      createdAt,
      expiresAt,
    };

    await this.db.put(item as unknown as Record<string, unknown>);

    return this.toEscalation(item);
  }

  /**
   * Record a user's decision on an escalation
   */
  async recordDecision(
    projectId: string,
    escalationId: string,
    decision: RecordDecisionOptions
  ): Promise<Escalation | null> {
    const decidedAt = new Date().toISOString();

    // Update the escalation
    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.ESCALATION}${escalationId}`,
      'SET #status = :status, #userDecision = :userDecision, #userNotes = :userNotes, #decidedAt = :decidedAt, #gsi1pk = :gsi1pk',
      {
        ':status': 'decided',
        ':userDecision': decision.userDecision,
        ':userNotes': decision.userNotes ?? null,
        ':decidedAt': decidedAt,
        ':gsi1pk': GSI1_PREFIX.ESCALATION_DECIDED,
      },
      {
        '#status': 'status',
        '#userDecision': 'userDecision',
        '#userNotes': 'userNotes',
        '#decidedAt': 'decidedAt',
        '#gsi1pk': 'GSI1PK',
      }
    );

    return this.getById(projectId, escalationId);
  }

  /**
   * Update escalation status (for expiration, superseding, etc.)
   */
  async updateStatus(
    projectId: string,
    escalationId: string,
    status: EscalationStatus
  ): Promise<void> {
    const gsi1pk =
      status === 'pending'
        ? GSI1_PREFIX.ESCALATION_PENDING
        : GSI1_PREFIX.ESCALATION_DECIDED;

    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.ESCALATION}${escalationId}`,
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
   * Expire old escalations that have passed their expiry date
   */
  async expireOldEscalations(): Promise<number> {
    const now = new Date().toISOString();
    const pendingResult = await this.getPending({ limit: 100 });

    let expiredCount = 0;

    for (const escalation of pendingResult.items) {
      // Check if we have expiresAt in the original item
      const item = await this.db.get<EscalationItem>(
        `${KEY_PREFIX.PROJECT}${escalation.projectId}`,
        `${KEY_PREFIX.ESCALATION}${escalation.id}`
      );

      if (item && item.expiresAt && item.expiresAt < now) {
        await this.updateStatus(escalation.projectId, escalation.id, 'expired');
        expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Supersede an escalation (when a new one replaces it)
   */
  async supersede(projectId: string, escalationId: string): Promise<void> {
    await this.updateStatus(projectId, escalationId, 'superseded');
  }

  /**
   * Get recent escalations (decided within last N days)
   */
  async getRecentDecided(
    options?: QueryOptions & { days?: number }
  ): Promise<QueryResult<Escalation>> {
    const days = options?.days ?? 7;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await this.db.queryGSI1<EscalationItem>(
      GSI1_PREFIX.ESCALATION_DECIDED,
      {
        gsi1skPrefix: cutoffDate.slice(0, 10), // Date prefix
        limit: options?.limit ?? 50,
        ascending: options?.ascending ?? false,
      }
    );

    return {
      items: result.items.map((item) => this.toEscalation(item)),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Convert DynamoDB item to Escalation entity
   */
  private toEscalation(item: EscalationItem): Escalation {
    return {
      id: item.escalationId,
      projectId: item.projectId,
      title: item.title,
      context: item.context,
      options: item.options,
      agentRecommendation: item.agentRecommendation,
      agentRationale: item.agentRationale,
      status: item.status,
      userDecision: item.userDecision,
      userNotes: item.userNotes,
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
    };
  }
}
