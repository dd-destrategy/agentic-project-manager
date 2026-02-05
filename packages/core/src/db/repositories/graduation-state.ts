/**
 * Graduation State repository
 *
 * Tracks consecutive approvals per action type to support hold time graduation.
 * After sufficient consecutive approvals, hold times are reduced:
 * - 5 approvals: 30min -> 15min
 * - 10 approvals: 15min -> 5min
 * - 20 approvals: 5min -> immediate (with logging)
 */

import { KEY_PREFIX } from '../../constants.js';
import { DynamoDBClient } from '../client.js';

import type { HeldActionType } from './held-action.js';

/**
 * Graduation tier levels
 */
export type GraduationTier = 0 | 1 | 2 | 3;

/**
 * Hold times in minutes for each graduation tier
 */
export const GRADUATION_HOLD_TIMES: Record<GraduationTier, number> = {
  0: 30, // Default: 30 minutes
  1: 15, // After 5 approvals: 15 minutes
  2: 5,  // After 10 approvals: 5 minutes
  3: 0,  // After 20 approvals: immediate (with logging)
};

/**
 * Thresholds for graduation tiers
 */
export const GRADUATION_THRESHOLDS: Record<GraduationTier, number> = {
  0: 0,   // Start at tier 0
  1: 5,   // 5 consecutive approvals -> tier 1
  2: 10,  // 10 consecutive approvals -> tier 2
  3: 20,  // 20 consecutive approvals -> tier 3
};

/**
 * Default hold times by action type (before graduation)
 */
export const DEFAULT_HOLD_TIMES: Record<HeldActionType, number> = {
  email_stakeholder: 30,
  jira_status_change: 5,
};

/**
 * Graduation state entity
 */
export interface GraduationState {
  projectId: string;
  actionType: HeldActionType;
  consecutiveApprovals: number;
  tier: GraduationTier;
  lastApprovalAt?: string;
  lastCancellationAt?: string;
  updatedAt: string;
}

/**
 * DynamoDB item structure for graduation state
 */
interface GraduationStateItem {
  PK: string;
  SK: string;
  projectId: string;
  actionType: HeldActionType;
  consecutiveApprovals: number;
  tier: GraduationTier;
  lastApprovalAt?: string;
  lastCancellationAt?: string;
  updatedAt: string;
}

/**
 * Repository for GraduationState entities
 */
export class GraduationStateRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get graduation state for a project and action type
   */
  async get(
    projectId: string,
    actionType: HeldActionType
  ): Promise<GraduationState | null> {
    const item = await this.db.get<GraduationStateItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `GRADUATION#${actionType}`
    );

    return item ? this.toGraduationState(item) : null;
  }

  /**
   * Get all graduation states for a project
   */
  async getByProject(projectId: string): Promise<GraduationState[]> {
    const result = await this.db.query<GraduationStateItem>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'GRADUATION#',
      { limit: 10 }
    );

    return result.items.map((item) => this.toGraduationState(item));
  }

  /**
   * Get or create graduation state
   */
  async getOrCreate(
    projectId: string,
    actionType: HeldActionType
  ): Promise<GraduationState> {
    const existing = await this.get(projectId, actionType);

    if (existing) {
      return existing;
    }

    // Create new graduation state at tier 0
    const now = new Date().toISOString();
    const state: GraduationState = {
      projectId,
      actionType,
      consecutiveApprovals: 0,
      tier: 0,
      updatedAt: now,
    };

    await this.save(state);
    return state;
  }

  /**
   * Save graduation state
   */
  async save(state: GraduationState): Promise<void> {
    const item: GraduationStateItem = {
      PK: `${KEY_PREFIX.PROJECT}${state.projectId}`,
      SK: `GRADUATION#${state.actionType}`,
      ...state,
    };

    await this.db.put(item as unknown as Record<string, unknown>);
  }

  /**
   * Record an approval and update graduation tier if needed
   * Returns the updated state
   */
  async recordApproval(
    projectId: string,
    actionType: HeldActionType
  ): Promise<GraduationState> {
    const state = await this.getOrCreate(projectId, actionType);
    const now = new Date().toISOString();

    // Increment consecutive approvals
    state.consecutiveApprovals += 1;
    state.lastApprovalAt = now;
    state.updatedAt = now;

    // Check for tier upgrade
    const newTier = this.calculateTier(state.consecutiveApprovals);
    if (newTier > state.tier) {
      state.tier = newTier;
    }

    await this.save(state);
    return state;
  }

  /**
   * Record a cancellation (resets consecutive approvals)
   * Returns the updated state
   */
  async recordCancellation(
    projectId: string,
    actionType: HeldActionType
  ): Promise<GraduationState> {
    const state = await this.getOrCreate(projectId, actionType);
    const now = new Date().toISOString();

    // Reset consecutive approvals but keep the tier
    // (cancellation doesn't demote, just resets progress)
    state.consecutiveApprovals = 0;
    state.lastCancellationAt = now;
    state.updatedAt = now;

    await this.save(state);
    return state;
  }

  /**
   * Get the hold time in minutes for an action type based on graduation state
   */
  async getHoldTime(
    projectId: string,
    actionType: HeldActionType
  ): Promise<number> {
    const state = await this.get(projectId, actionType);

    if (!state) {
      // Use default hold time for action type
      return DEFAULT_HOLD_TIMES[actionType];
    }

    // Get hold time for current tier
    const tierHoldTime = GRADUATION_HOLD_TIMES[state.tier];

    // For jira_status_change, the base is already 5 min, so graduation
    // only affects it at tier 3 (immediate)
    if (actionType === 'jira_status_change') {
      return state.tier === 3 ? 0 : DEFAULT_HOLD_TIMES.jira_status_change;
    }

    return tierHoldTime;
  }

  /**
   * Calculate tier based on consecutive approvals
   */
  private calculateTier(consecutiveApprovals: number): GraduationTier {
    if (consecutiveApprovals >= GRADUATION_THRESHOLDS[3]) {
      return 3;
    }
    if (consecutiveApprovals >= GRADUATION_THRESHOLDS[2]) {
      return 2;
    }
    if (consecutiveApprovals >= GRADUATION_THRESHOLDS[1]) {
      return 1;
    }
    return 0;
  }

  /**
   * Convert DynamoDB item to GraduationState entity
   */
  private toGraduationState(item: GraduationStateItem): GraduationState {
    return {
      projectId: item.projectId,
      actionType: item.actionType,
      consecutiveApprovals: item.consecutiveApprovals,
      tier: item.tier,
      lastApprovalAt: item.lastApprovalAt,
      lastCancellationAt: item.lastCancellationAt,
      updatedAt: item.updatedAt,
    };
  }
}

/**
 * Get a human-readable description of the graduation tier
 */
export function getGraduationTierDescription(tier: GraduationTier): string {
  switch (tier) {
    case 0:
      return 'Standard (30 min hold)';
    case 1:
      return 'Trusted (15 min hold)';
    case 2:
      return 'Highly trusted (5 min hold)';
    case 3:
      return 'Immediate (no hold)';
  }
}

/**
 * Get approvals needed for next tier
 */
export function getApprovalsToNextTier(
  currentApprovals: number,
  currentTier: GraduationTier
): number | null {
  if (currentTier >= 3) {
    return null; // Already at max tier
  }

  const nextTier = (currentTier + 1) as GraduationTier;
  return GRADUATION_THRESHOLDS[nextTier] - currentApprovals;
}
