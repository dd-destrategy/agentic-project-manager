/**
 * Budget tracker with DynamoDB persistence
 *
 * Tracks LLM spending and implements the degradation ladder.
 * Persists daily/monthly spend to DynamoDB for cross-Lambda consistency.
 *
 * Budget thresholds (from SPEC):
 * - Daily ceiling: $0.23 (~$7/month)
 * - Tier 1: 70% ($0.161) - skip low priority signals
 * - Tier 2: 85% ($0.196) - batch signals, reduce frequency
 * - Tier 3: 95% ($0.219) - monitoring only, no LLM calls
 * - Hard ceiling: 100% ($0.23) - complete stop
 */

import { DynamoDBClient } from '../db/client.js';
import { DAILY_LLM_BUDGET_USD, MONTHLY_LLM_BUDGET_USD, KEY_PREFIX } from '../constants.js';
import type {
  BudgetState,
  BudgetRecord,
  TokenUsage,
  UsageEntry,
  DegradationTier,
  DegradationConfig,
  ModelId,
} from './types.js';

// ============================================================================
// Degradation Ladder Configuration
// ============================================================================

/**
 * Degradation thresholds as percentages of daily budget
 *
 * From SPEC.md:
 * - Tier 0: Normal operation (0-70%)
 * - Tier 1: Skip low priority signals (70-85%)
 * - Tier 2: Batch signals, Haiku only (85-95%)
 * - Tier 3: Monitoring only, no LLM calls (95-100%)
 * - Hard ceiling: Complete stop (100%+)
 */
export const DEGRADATION_THRESHOLDS = {
  /** Tier 1 starts at 70% of daily budget */
  tier1Percent: 0.70,
  /** Tier 2 starts at 85% of daily budget */
  tier2Percent: 0.85,
  /** Tier 3 starts at 95% of daily budget */
  tier3Percent: 0.95,
  /** Hard ceiling at 100% */
  hardCeilingPercent: 1.00,
} as const;

/**
 * Degradation tier configurations
 */
export const DEGRADATION_CONFIGS: Record<DegradationTier, DegradationConfig> = {
  0: {
    tier: 0,
    name: 'Normal',
    description: 'Normal operation with full LLM capabilities',
    dailyThresholdPercent: 0,
    haikuPercent: 70,
    sonnetPercent: 30,
    allowLlmCalls: true,
    skipLowPriority: false,
    batchSignals: false,
    pollingIntervalMinutes: 15,
  },
  1: {
    tier: 1,
    name: 'Budget Pressure',
    description: 'Skip low-priority signals to conserve budget',
    dailyThresholdPercent: DEGRADATION_THRESHOLDS.tier1Percent,
    haikuPercent: 85,
    sonnetPercent: 15,
    allowLlmCalls: true,
    skipLowPriority: true,
    batchSignals: false,
    pollingIntervalMinutes: 15,
  },
  2: {
    tier: 2,
    name: 'High Pressure',
    description: 'Batch signals, Haiku only mode',
    dailyThresholdPercent: DEGRADATION_THRESHOLDS.tier2Percent,
    haikuPercent: 100,
    sonnetPercent: 0,
    allowLlmCalls: true,
    skipLowPriority: true,
    batchSignals: true,
    pollingIntervalMinutes: 30,
  },
  3: {
    tier: 3,
    name: 'Monitoring Only',
    description: 'No LLM calls, monitoring and logging only',
    dailyThresholdPercent: DEGRADATION_THRESHOLDS.tier3Percent,
    haikuPercent: 0,
    sonnetPercent: 0,
    allowLlmCalls: false,
    skipLowPriority: true,
    batchSignals: true,
    pollingIntervalMinutes: 60,
  },
};

// ============================================================================
// Budget Tracker
// ============================================================================

/**
 * Budget tracker for LLM spending with DynamoDB persistence
 */
export class BudgetTracker {
  private db: DynamoDBClient | null = null;
  private dailySpend: number = 0;
  private monthlySpend: number = 0;
  private currentDate: string;
  private currentMonth: string;
  private usageHistory: UsageEntry[] = [];
  private lastSyncedAt: string | null = null;

  constructor(db?: DynamoDBClient) {
    this.db = db ?? null;
    this.currentDate = this.getDateString();
    this.currentMonth = this.getMonthString();
  }

  /**
   * Set the DynamoDB client (for lazy initialization in Lambdas)
   */
  setDbClient(db: DynamoDBClient): void {
    this.db = db;
  }

  /**
   * Record token usage and update budget
   */
  async recordUsage(
    usage: TokenUsage,
    operation: string,
    model: ModelId
  ): Promise<BudgetState> {
    // Check if date rolled over
    await this.checkDateRollover();

    // Create usage entry
    const entry: UsageEntry = {
      timestamp: new Date().toISOString(),
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      operation,
    };

    // Update in-memory state
    this.dailySpend += usage.costUsd;
    this.monthlySpend += usage.costUsd;
    this.usageHistory.push(entry);

    // Persist to DynamoDB
    await this.saveToDb();

    return this.getState();
  }

  /**
   * Get current budget state
   */
  getState(): BudgetState {
    const dailyLimitUsd = DAILY_LLM_BUDGET_USD;
    const monthlyLimitUsd = MONTHLY_LLM_BUDGET_USD;

    return {
      dailySpendUsd: this.dailySpend,
      dailyLimitUsd,
      monthlySpendUsd: this.monthlySpend,
      monthlyLimitUsd,
      degradationTier: this.calculateDegradationTier(),
      currentDate: this.currentDate,
      monthStartDate: `${this.currentMonth}-01`,
    };
  }

  /**
   * Get current degradation tier based on daily spend
   */
  calculateDegradationTier(): DegradationTier {
    const dailyPercentUsed = this.dailySpend / DAILY_LLM_BUDGET_USD;

    if (dailyPercentUsed >= DEGRADATION_THRESHOLDS.tier3Percent) {
      return 3;
    }
    if (dailyPercentUsed >= DEGRADATION_THRESHOLDS.tier2Percent) {
      return 2;
    }
    if (dailyPercentUsed >= DEGRADATION_THRESHOLDS.tier1Percent) {
      return 1;
    }
    return 0;
  }

  /**
   * Get the configuration for the current degradation tier
   */
  getDegradationConfig(): DegradationConfig {
    return DEGRADATION_CONFIGS[this.calculateDegradationTier()];
  }

  /**
   * Check if we can make an LLM call
   */
  canMakeCall(): boolean {
    return this.getDegradationConfig().allowLlmCalls;
  }

  /**
   * Check if we're at or above the hard ceiling
   */
  isAtHardCeiling(): boolean {
    return this.dailySpend >= DAILY_LLM_BUDGET_USD;
  }

  /**
   * Check if we should use Haiku-only mode
   */
  isHaikuOnly(): boolean {
    return this.calculateDegradationTier() >= 2;
  }

  /**
   * Check if we should skip low-priority signals
   */
  shouldSkipLowPriority(): boolean {
    return this.getDegradationConfig().skipLowPriority;
  }

  /**
   * Check if we should batch signals
   */
  shouldBatchSignals(): boolean {
    return this.getDegradationConfig().batchSignals;
  }

  /**
   * Get the recommended polling interval for current tier
   */
  getPollingIntervalMinutes(): number {
    return this.getDegradationConfig().pollingIntervalMinutes;
  }

  /**
   * Get the LLM mix percentages for current tier
   */
  getLlmMix(): { haikuPercent: number; sonnetPercent: number } {
    const config = this.getDegradationConfig();
    return {
      haikuPercent: config.haikuPercent,
      sonnetPercent: config.sonnetPercent,
    };
  }

  /**
   * Estimate if a call would exceed budget
   */
  wouldExceedBudget(estimatedCost: number): boolean {
    return (this.dailySpend + estimatedCost) > DAILY_LLM_BUDGET_USD;
  }

  /**
   * Get remaining daily budget
   */
  getRemainingDailyBudget(): number {
    return Math.max(0, DAILY_LLM_BUDGET_USD - this.dailySpend);
  }

  /**
   * Get remaining monthly budget
   */
  getRemainingMonthlyBudget(): number {
    return Math.max(0, MONTHLY_LLM_BUDGET_USD - this.monthlySpend);
  }

  /**
   * Get daily spend percentage
   */
  getDailySpendPercent(): number {
    return (this.dailySpend / DAILY_LLM_BUDGET_USD) * 100;
  }

  /**
   * Get monthly spend percentage
   */
  getMonthlySpendPercent(): number {
    return (this.monthlySpend / MONTHLY_LLM_BUDGET_USD) * 100;
  }

  /**
   * Get usage history for the current day
   */
  getUsageHistory(): UsageEntry[] {
    return [...this.usageHistory];
  }

  /**
   * Check if date rolled over and reset daily spend
   */
  private async checkDateRollover(): Promise<void> {
    const today = this.getDateString();
    const thisMonth = this.getMonthString();

    if (today !== this.currentDate) {
      // Date changed - reset daily spend
      this.dailySpend = 0;
      this.usageHistory = [];
      this.currentDate = today;

      // Check if month also changed
      if (thisMonth !== this.currentMonth) {
        this.monthlySpend = 0;
        this.currentMonth = thisMonth;
      }

      // Load fresh data from DB
      await this.loadFromDb();
    }
  }

  /**
   * Load state from DynamoDB
   */
  async loadFromDb(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const today = this.getDateString();
      const thisMonth = this.getMonthString();

      // Load daily budget record
      const dailyRecord = await this.db.get<BudgetRecord>(
        KEY_PREFIX.AGENT,
        `${KEY_PREFIX.CONFIG}daily_spend_${today}`
      );

      if (dailyRecord) {
        this.dailySpend = dailyRecord.dailySpendUsd;
        this.usageHistory = dailyRecord.usageHistory ?? [];
        this.lastSyncedAt = dailyRecord.lastUpdated;
      } else {
        this.dailySpend = 0;
        this.usageHistory = [];
      }

      // Load monthly budget record
      const monthlyRecord = await this.db.get<BudgetRecord>(
        KEY_PREFIX.AGENT,
        `${KEY_PREFIX.CONFIG}monthly_spend_${thisMonth}`
      );

      if (monthlyRecord) {
        this.monthlySpend = monthlyRecord.monthlySpendUsd;
      } else {
        this.monthlySpend = 0;
      }

      this.currentDate = today;
      this.currentMonth = thisMonth;
    } catch (error) {
      // Log error but don't throw - budget tracking should not break agent
      console.error('Failed to load budget from DynamoDB:', error);
    }
  }

  /**
   * Save state to DynamoDB
   */
  async saveToDb(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const now = new Date().toISOString();

      // Save daily budget record
      const dailyRecord: BudgetRecord = {
        PK: KEY_PREFIX.AGENT,
        SK: `${KEY_PREFIX.CONFIG}daily_spend_${this.currentDate}`,
        dailySpendUsd: this.dailySpend,
        monthlySpendUsd: this.monthlySpend,
        currentDate: this.currentDate,
        monthStartDate: `${this.currentMonth}-01`,
        lastUpdated: now,
        usageHistory: this.usageHistory.slice(-100), // Keep last 100 entries
      };

      await this.db.put(dailyRecord);

      // Save monthly budget record (separate for aggregation)
      const monthlyRecord: BudgetRecord = {
        PK: KEY_PREFIX.AGENT,
        SK: `${KEY_PREFIX.CONFIG}monthly_spend_${this.currentMonth}`,
        dailySpendUsd: this.dailySpend,
        monthlySpendUsd: this.monthlySpend,
        currentDate: this.currentDate,
        monthStartDate: `${this.currentMonth}-01`,
        lastUpdated: now,
        usageHistory: [], // Don't store full history in monthly record
      };

      await this.db.put(monthlyRecord);

      this.lastSyncedAt = now;
    } catch (error) {
      // Log error but don't throw - budget tracking should not break agent
      console.error('Failed to save budget to DynamoDB:', error);
    }
  }

  /**
   * Force sync with DynamoDB (useful at Lambda start)
   */
  async sync(): Promise<BudgetState> {
    await this.loadFromDb();
    return this.getState();
  }

  /**
   * Get current date as string (YYYY-MM-DD)
   */
  private getDateString(): string {
    return new Date().toISOString().split('T')[0]!;
  }

  /**
   * Get current month as string (YYYY-MM)
   */
  private getMonthString(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // ============================================================================
  // Static Utilities
  // ============================================================================

  /**
   * Calculate the daily spend threshold for a given tier
   */
  static getDailyThresholdForTier(tier: DegradationTier): number {
    return DEGRADATION_CONFIGS[tier].dailyThresholdPercent * DAILY_LLM_BUDGET_USD;
  }

  /**
   * Get degradation tier from spend amount
   */
  static getTierFromSpend(dailySpend: number): DegradationTier {
    const percentUsed = dailySpend / DAILY_LLM_BUDGET_USD;

    if (percentUsed >= DEGRADATION_THRESHOLDS.tier3Percent) {
      return 3;
    }
    if (percentUsed >= DEGRADATION_THRESHOLDS.tier2Percent) {
      return 2;
    }
    if (percentUsed >= DEGRADATION_THRESHOLDS.tier1Percent) {
      return 1;
    }
    return 0;
  }

  /**
   * Format budget state for logging
   */
  static formatBudgetState(state: BudgetState): string {
    const dailyPercent = ((state.dailySpendUsd / state.dailyLimitUsd) * 100).toFixed(1);
    const monthlyPercent = ((state.monthlySpendUsd / state.monthlyLimitUsd) * 100).toFixed(1);
    const tierConfig = DEGRADATION_CONFIGS[state.degradationTier];

    return [
      `Budget Status: Tier ${state.degradationTier} (${tierConfig.name})`,
      `Daily: $${state.dailySpendUsd.toFixed(4)} / $${state.dailyLimitUsd.toFixed(2)} (${dailyPercent}%)`,
      `Monthly: $${state.monthlySpendUsd.toFixed(4)} / $${state.monthlyLimitUsd.toFixed(2)} (${monthlyPercent}%)`,
    ].join(' | ');
  }
}

/**
 * Create a budget tracker with DynamoDB client
 */
export function createBudgetTracker(db?: DynamoDBClient): BudgetTracker {
  return new BudgetTracker(db);
}
