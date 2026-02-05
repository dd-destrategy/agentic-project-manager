/**
 * Budget tracker
 *
 * Tracks LLM spending and implements the degradation ladder.
 */

import { DAILY_LLM_BUDGET_USD, MONTHLY_LLM_BUDGET_USD } from '../constants.js';
import type { BudgetState, TokenUsage } from './types.js';

/**
 * Degradation tiers
 *
 * Tier 0: Normal operation
 * Tier 1: Skip low-priority signals (daily > $0.23)
 * Tier 2: Haiku-only mode (daily > $0.30)
 * Tier 3: Monitoring-only, no LLM calls (daily > $0.40 - hard ceiling)
 */
const DEGRADATION_THRESHOLDS = {
  tier1: 0.23, // 100% of daily budget
  tier2: 0.30, // ~130% of daily budget
  tier3: 0.40, // Hard ceiling
} as const;

/**
 * Budget tracker for LLM spending
 */
export class BudgetTracker {
  private dailySpend: number = 0;
  private monthlySpend: number = 0;
  private currentDate: string;

  constructor() {
    this.currentDate = this.getDateString();
  }

  /**
   * Record token usage and update budget
   */
  recordUsage(usage: TokenUsage): void {
    // Reset daily spend if date changed
    const today = this.getDateString();
    if (today !== this.currentDate) {
      this.dailySpend = 0;
      this.currentDate = today;
    }

    this.dailySpend += usage.costUsd;
    this.monthlySpend += usage.costUsd;
  }

  /**
   * Get current budget state
   */
  getState(): BudgetState {
    return {
      dailySpendUsd: this.dailySpend,
      dailyLimitUsd: DAILY_LLM_BUDGET_USD,
      monthlySpendUsd: this.monthlySpend,
      monthlyLimitUsd: MONTHLY_LLM_BUDGET_USD,
      degradationTier: this.getDegradationTier(),
    };
  }

  /**
   * Check if we can make an LLM call
   */
  canMakeCall(): boolean {
    return this.getDegradationTier() < 3;
  }

  /**
   * Check if we should use Haiku-only mode
   */
  isHaikuOnly(): boolean {
    return this.getDegradationTier() >= 2;
  }

  /**
   * Check if we should skip low-priority signals
   */
  shouldSkipLowPriority(): boolean {
    return this.getDegradationTier() >= 1;
  }

  /**
   * Get current degradation tier
   */
  private getDegradationTier(): 0 | 1 | 2 | 3 {
    if (this.dailySpend >= DEGRADATION_THRESHOLDS.tier3) {
      return 3;
    }
    if (this.dailySpend >= DEGRADATION_THRESHOLDS.tier2) {
      return 2;
    }
    if (this.dailySpend >= DEGRADATION_THRESHOLDS.tier1) {
      return 1;
    }
    return 0;
  }

  /**
   * Get current date as string (YYYY-MM-DD)
   */
  private getDateString(): string {
    return new Date().toISOString().split('T')[0]!;
  }

  /**
   * Load state from DynamoDB
   *
   * TODO: Implement in Sprint 2
   */
  async loadFromDb(): Promise<void> {
    // Stub - will load from AGENT#CONFIG#daily_spend_<date>
  }

  /**
   * Save state to DynamoDB
   *
   * TODO: Implement in Sprint 2
   */
  async saveToDb(): Promise<void> {
    // Stub - will save to AGENT#CONFIG#daily_spend_<date>
  }
}
