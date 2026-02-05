/**
 * Anti-Complacency Spot Check System
 *
 * Implements random action review every 2 weeks to prevent user complacency.
 * Users are presented with a recent action and asked to verify if it was correct.
 * This maintains trust calibration and catches potential drift in agent behaviour.
 */

import { ulid } from 'ulid';

import { KEY_PREFIX, TTL } from '../constants.js';
import type { DynamoDBClient } from '../db/client.js';

/**
 * User verdict on a spot check
 */
export type SpotCheckVerdict = 'correct' | 'incorrect' | 'skipped' | null;

/**
 * Spot check entity - represents a random action review
 */
export interface SpotCheck {
  /** Unique identifier for the spot check */
  checkId: string;
  /** Project ID the action belongs to */
  projectId: string;
  /** The action ID being reviewed */
  actionId: string;
  /** When the spot check was presented to the user */
  presentedAt: string;
  /** When the user reviewed (if reviewed) */
  reviewedAt?: string;
  /** User's verdict on the action */
  userVerdict: SpotCheckVerdict;
  /** Optional user notes on the review */
  userNotes?: string;
  /** When the next spot check is due (+14 days from last review) */
  nextCheckDue: string;
  /** Action details for display */
  actionDetails?: SpotCheckActionDetails;
}

/**
 * Action details included in spot check for display
 */
export interface SpotCheckActionDetails {
  /** Type of action */
  actionType: string;
  /** Description of what was done */
  description: string;
  /** When the action was executed */
  executedAt: string;
  /** Confidence score if available */
  confidence?: number;
}

/**
 * Spot check statistics
 */
export interface SpotCheckStats {
  /** Total spot checks presented */
  totalChecks: number;
  /** Checks marked as correct */
  correctCount: number;
  /** Checks marked as incorrect */
  incorrectCount: number;
  /** Checks skipped by user */
  skippedCount: number;
  /** Checks still pending review */
  pendingCount: number;
  /** Accuracy rate (correct / (correct + incorrect)) */
  accuracyRate: number;
  /** Days since last spot check */
  daysSinceLastCheck: number | null;
}

/**
 * Options for creating a spot check
 */
export interface CreateSpotCheckOptions {
  projectId: string;
  actionId: string;
  actionDetails?: SpotCheckActionDetails;
}

/**
 * Options for reviewing a spot check
 */
export interface ReviewSpotCheckOptions {
  checkId: string;
  verdict: Exclude<SpotCheckVerdict, null>;
  userNotes?: string;
}

/** Spot check interval in days */
const SPOT_CHECK_INTERVAL_DAYS = 14;

/** Milliseconds in a day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate days since a given date
 */
export function daysSince(dateString: string | undefined | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

/**
 * Calculate the next spot check due date
 */
export function calculateNextCheckDue(fromDate?: string): string {
  const baseDate = fromDate ? new Date(fromDate) : new Date();
  const nextDue = new Date(baseDate.getTime() + SPOT_CHECK_INTERVAL_DAYS * MS_PER_DAY);
  return nextDue.toISOString();
}

/**
 * Check if a spot check is due
 */
export function isSpotCheckDue(lastCheckDate: string | undefined | null): boolean {
  const days = daysSince(lastCheckDate);
  return days === null || days >= SPOT_CHECK_INTERVAL_DAYS;
}

/**
 * Spot Check Repository
 *
 * Handles storage and retrieval of spot checks in DynamoDB
 */
export class SpotCheckRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a spot check by ID
   */
  async getById(checkId: string): Promise<SpotCheck | null> {
    const result = await this.db.query<SpotCheck>(
      KEY_PREFIX.GLOBAL,
      `${KEY_PREFIX.CHECKPOINT}SPOTCHECK#${checkId}`,
      { limit: 1 }
    );
    return result.items[0] ?? null;
  }

  /**
   * Get the latest spot check for a project
   */
  async getLatest(projectId: string): Promise<SpotCheck | null> {
    const result = await this.db.queryGSI1<SpotCheck>(
      `SPOTCHECK#PROJECT#${projectId}`,
      { limit: 1 }
    );
    return result.items[0] ?? null;
  }

  /**
   * Get all pending spot checks (not yet reviewed)
   */
  async getPending(): Promise<SpotCheck[]> {
    const result = await this.db.queryGSI1<SpotCheck>(
      'SPOTCHECK#PENDING',
      { limit: 50 }
    );
    return result.items;
  }

  /**
   * Get spot check history for a project
   */
  async getHistory(
    projectId: string,
    options?: { limit?: number }
  ): Promise<SpotCheck[]> {
    const result = await this.db.queryGSI1<SpotCheck>(
      `SPOTCHECK#PROJECT#${projectId}`,
      { limit: options?.limit ?? 20 }
    );
    return result.items;
  }

  /**
   * Get all spot checks (across all projects)
   */
  async getAll(options?: { limit?: number }): Promise<SpotCheck[]> {
    const result = await this.db.query<SpotCheck>(
      KEY_PREFIX.GLOBAL,
      `${KEY_PREFIX.CHECKPOINT}SPOTCHECK#`,
      { limit: options?.limit ?? 100 }
    );
    return result.items;
  }

  /**
   * Create a new spot check
   */
  async create(options: CreateSpotCheckOptions): Promise<SpotCheck> {
    const checkId = ulid();
    const presentedAt = new Date().toISOString();
    const nextCheckDue = calculateNextCheckDue(presentedAt);

    const spotCheck: SpotCheck = {
      checkId,
      projectId: options.projectId,
      actionId: options.actionId,
      presentedAt,
      userVerdict: null,
      nextCheckDue,
      actionDetails: options.actionDetails,
    };

    await this.db.put({
      PK: KEY_PREFIX.GLOBAL,
      SK: `${KEY_PREFIX.CHECKPOINT}SPOTCHECK#${checkId}`,
      GSI1PK: `SPOTCHECK#PROJECT#${options.projectId}`,
      GSI1SK: presentedAt,
      GSI2PK: 'SPOTCHECK#PENDING',
      GSI2SK: presentedAt,
      TTL: Math.floor(Date.now() / 1000) + TTL.ACTIONS_DAYS * 24 * 60 * 60,
      ...spotCheck,
    });

    return spotCheck;
  }

  /**
   * Record a review for a spot check
   */
  async review(options: ReviewSpotCheckOptions): Promise<SpotCheck | null> {
    const spotCheck = await this.getById(options.checkId);
    if (!spotCheck) return null;

    const reviewedAt = new Date().toISOString();
    const nextCheckDue = calculateNextCheckDue(reviewedAt);

    const updatedSpotCheck: SpotCheck = {
      ...spotCheck,
      reviewedAt,
      userVerdict: options.verdict,
      userNotes: options.userNotes,
      nextCheckDue,
    };

    // Update with new GSI to remove from pending
    await this.db.put({
      PK: KEY_PREFIX.GLOBAL,
      SK: `${KEY_PREFIX.CHECKPOINT}SPOTCHECK#${options.checkId}`,
      GSI1PK: `SPOTCHECK#PROJECT#${spotCheck.projectId}`,
      GSI1SK: spotCheck.presentedAt,
      // Remove from pending by setting to reviewed status
      GSI2PK: `SPOTCHECK#REVIEWED#${options.verdict}`,
      GSI2SK: reviewedAt,
      TTL: Math.floor(Date.now() / 1000) + TTL.ACTIONS_DAYS * 24 * 60 * 60,
      ...updatedSpotCheck,
    });

    return updatedSpotCheck;
  }

  /**
   * Get statistics for spot checks
   */
  async getStats(projectId?: string): Promise<SpotCheckStats> {
    const checks = projectId
      ? await this.getHistory(projectId, { limit: 100 })
      : await this.getAll({ limit: 100 });

    const stats: SpotCheckStats = {
      totalChecks: checks.length,
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
      pendingCount: 0,
      accuracyRate: 1.0,
      daysSinceLastCheck: null,
    };

    for (const check of checks) {
      switch (check.userVerdict) {
        case 'correct':
          stats.correctCount++;
          break;
        case 'incorrect':
          stats.incorrectCount++;
          break;
        case 'skipped':
          stats.skippedCount++;
          break;
        case null:
          stats.pendingCount++;
          break;
      }
    }

    // Calculate accuracy rate (only considering decisive verdicts)
    const decidedCount = stats.correctCount + stats.incorrectCount;
    if (decidedCount > 0) {
      stats.accuracyRate = stats.correctCount / decidedCount;
    }

    // Calculate days since last check
    const latestCheck = checks[0];
    if (latestCheck) {
      stats.daysSinceLastCheck = daysSince(
        latestCheck.reviewedAt ?? latestCheck.presentedAt
      );
    }

    return stats;
  }
}

/**
 * Action repository interface for fetching random actions
 */
export interface ActionRepository {
  getRandomRecent(projectId: string): Promise<{ id: string; details: SpotCheckActionDetails } | null>;
}

/**
 * Maybe create a spot check if one is due
 *
 * Returns a new spot check if:
 * - No previous spot check exists, OR
 * - Last spot check was 14+ days ago
 *
 * @param projectId - Project to check
 * @param spotCheckRepo - Spot check repository
 * @param actionRepo - Action repository for fetching random actions
 * @returns New spot check if created, null if not due
 */
export async function maybeCreateSpotCheck(
  projectId: string,
  spotCheckRepo: SpotCheckRepository,
  actionRepo: ActionRepository
): Promise<SpotCheck | null> {
  // Get the latest spot check for this project
  const lastCheck = await spotCheckRepo.getLatest(projectId);

  // Check if a new spot check is due
  const lastReviewDate = lastCheck?.reviewedAt ?? lastCheck?.presentedAt;
  if (!isSpotCheckDue(lastReviewDate)) {
    return null;
  }

  // Get a random recent action to review
  const randomAction = await actionRepo.getRandomRecent(projectId);
  if (!randomAction) {
    // No actions to review
    return null;
  }

  // Create the spot check
  return spotCheckRepo.create({
    projectId,
    actionId: randomAction.id,
    actionDetails: randomAction.details,
  });
}

/**
 * Check if there are any pending spot checks that need attention
 *
 * @param spotCheckRepo - Spot check repository
 * @returns True if there are pending spot checks
 */
export async function hasPendingSpotChecks(
  spotCheckRepo: SpotCheckRepository
): Promise<boolean> {
  const pending = await spotCheckRepo.getPending();
  return pending.length > 0;
}

/**
 * Get the next pending spot check to present to the user
 *
 * @param spotCheckRepo - Spot check repository
 * @returns The oldest pending spot check, or null if none
 */
export async function getNextPendingSpotCheck(
  spotCheckRepo: SpotCheckRepository
): Promise<SpotCheck | null> {
  const pending = await spotCheckRepo.getPending();
  // Return the oldest pending check (sorted by presentedAt ascending)
  return pending.sort(
    (a, b) => new Date(a.presentedAt).getTime() - new Date(b.presentedAt).getTime()
  )[0] ?? null;
}
