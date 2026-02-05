/**
 * Agent Config repository
 *
 * Handles agent configuration, budget tracking, and state persistence.
 * Uses a key-value pattern with PK=AGENT, SK=CONFIG#<key>
 */

import { KEY_PREFIX } from '../../constants.js';
import type {
  AgentConfig,
  AutonomyLevel,
  AutonomySettings,
  AutonomyChangeAcknowledgement,
  BudgetStatus,
  WorkingHours,
  LlmSplit,
} from '../../types/index.js';
import { DynamoDBClient } from '../client.js';

/**
 * Config key constants
 */
export const CONFIG_KEYS = {
  POLLING_INTERVAL: 'polling_interval_minutes',
  BUDGET_CEILING_DAILY: 'budget_ceiling_daily_usd',
  BUDGET_CEILING_MONTHLY: 'budget_ceiling_monthly_usd',
  HOLD_QUEUE_MINUTES: 'hold_queue_minutes',
  WORKING_HOURS: 'working_hours',
  LLM_SPLIT: 'llm_split',
  // Budget tracking (daily reset)
  DAILY_SPEND: 'daily_spend_usd',
  DAILY_SPEND_DATE: 'daily_spend_date',
  // Budget tracking (monthly reset)
  MONTHLY_SPEND: 'monthly_spend_usd',
  MONTHLY_SPEND_MONTH: 'monthly_spend_month',
  // State
  DEGRADATION_TIER: 'degradation_tier',
  LAST_HEARTBEAT: 'last_heartbeat',
  LAST_HOUSEKEEPING: 'last_housekeeping',
  // Autonomy settings
  AUTONOMY_LEVEL: 'autonomy_level',
  DRY_RUN: 'dry_run',
  LAST_AUTONOMY_CHANGE: 'last_autonomy_change',
  PENDING_ACKNOWLEDGEMENT: 'pending_acknowledgement',
  // Daily digest settings
  DIGEST_EMAIL: 'digest_email',
  DIGEST_TIME: 'digest_time',
  DASHBOARD_URL: 'dashboard_url',
  // Aliases for budget limits (for convenience)
  DAILY_BUDGET_LIMIT: 'budget_ceiling_daily_usd',
  MONTHLY_BUDGET_LIMIT: 'budget_ceiling_monthly_usd',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AgentConfig = {
  pollingIntervalMinutes: 15,
  budgetCeilingDailyUsd: 0.23,
  holdQueueMinutes: 30,
  workingHours: {
    start: '08:00',
    end: '18:00',
    timezone: 'Australia/Sydney',
  },
  llmSplit: {
    haikuPercent: 70,
    sonnetPercent: 30,
  },
  autonomyLevel: 'monitoring',
  dryRun: false,
};

/**
 * Single config item from DynamoDB
 */
interface ConfigItem {
  PK: string;
  SK: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

/**
 * Repository for Agent Config entities
 */
export class AgentConfigRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a single config value
   */
  async getValue<T>(key: string): Promise<T | null> {
    const item = await this.db.get<ConfigItem>(
      KEY_PREFIX.AGENT,
      `${KEY_PREFIX.CONFIG}${key}`
    );
    return item?.value as T ?? null;
  }

  /**
   * Set a config value
   */
  async setValue(key: string, value: unknown): Promise<void> {
    await this.db.put({
      PK: KEY_PREFIX.AGENT,
      SK: `${KEY_PREFIX.CONFIG}${key}`,
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get all config values as AgentConfig object
   */
  async getConfig(): Promise<AgentConfig> {
    const result = await this.db.query<ConfigItem>(
      KEY_PREFIX.AGENT,
      KEY_PREFIX.CONFIG
    );

    const configMap = new Map<string, unknown>();
    for (const item of result.items) {
      configMap.set(item.key, item.value);
    }

    return {
      pollingIntervalMinutes:
        (configMap.get(CONFIG_KEYS.POLLING_INTERVAL) as number) ??
        DEFAULT_CONFIG.pollingIntervalMinutes,
      budgetCeilingDailyUsd:
        (configMap.get(CONFIG_KEYS.BUDGET_CEILING_DAILY) as number) ??
        DEFAULT_CONFIG.budgetCeilingDailyUsd,
      holdQueueMinutes:
        (configMap.get(CONFIG_KEYS.HOLD_QUEUE_MINUTES) as number) ??
        DEFAULT_CONFIG.holdQueueMinutes,
      workingHours:
        (configMap.get(CONFIG_KEYS.WORKING_HOURS) as WorkingHours) ??
        DEFAULT_CONFIG.workingHours,
      llmSplit:
        (configMap.get(CONFIG_KEYS.LLM_SPLIT) as LlmSplit) ??
        DEFAULT_CONFIG.llmSplit,
      autonomyLevel:
        (configMap.get(CONFIG_KEYS.AUTONOMY_LEVEL) as AutonomyLevel) ??
        DEFAULT_CONFIG.autonomyLevel,
      dryRun:
        (configMap.get(CONFIG_KEYS.DRY_RUN) as boolean) ??
        DEFAULT_CONFIG.dryRun,
    };
  }

  /**
   * Initialize default config values (idempotent)
   */
  async initializeDefaults(): Promise<void> {
    const existing = await this.getValue<number>(CONFIG_KEYS.POLLING_INTERVAL);
    if (existing !== null) {
      // Already initialized
      return;
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0]!;
    const month = today.substring(0, 7); // YYYY-MM

    await this.db.batchWriteAll([
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.POLLING_INTERVAL}`,
        item: {
          key: CONFIG_KEYS.POLLING_INTERVAL,
          value: DEFAULT_CONFIG.pollingIntervalMinutes,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.BUDGET_CEILING_DAILY}`,
        item: {
          key: CONFIG_KEYS.BUDGET_CEILING_DAILY,
          value: DEFAULT_CONFIG.budgetCeilingDailyUsd,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.BUDGET_CEILING_MONTHLY}`,
        item: {
          key: CONFIG_KEYS.BUDGET_CEILING_MONTHLY,
          value: 8.0,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.HOLD_QUEUE_MINUTES}`,
        item: {
          key: CONFIG_KEYS.HOLD_QUEUE_MINUTES,
          value: DEFAULT_CONFIG.holdQueueMinutes,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.WORKING_HOURS}`,
        item: {
          key: CONFIG_KEYS.WORKING_HOURS,
          value: DEFAULT_CONFIG.workingHours,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.LLM_SPLIT}`,
        item: {
          key: CONFIG_KEYS.LLM_SPLIT,
          value: DEFAULT_CONFIG.llmSplit,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DAILY_SPEND}`,
        item: {
          key: CONFIG_KEYS.DAILY_SPEND,
          value: 0,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DAILY_SPEND_DATE}`,
        item: {
          key: CONFIG_KEYS.DAILY_SPEND_DATE,
          value: today,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.MONTHLY_SPEND}`,
        item: {
          key: CONFIG_KEYS.MONTHLY_SPEND,
          value: 0,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.MONTHLY_SPEND_MONTH}`,
        item: {
          key: CONFIG_KEYS.MONTHLY_SPEND_MONTH,
          value: month,
          updatedAt: now,
        },
      },
      {
        type: 'put',
        pk: KEY_PREFIX.AGENT,
        sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DEGRADATION_TIER}`,
        item: {
          key: CONFIG_KEYS.DEGRADATION_TIER,
          value: 0,
          updatedAt: now,
        },
      },
    ]);
  }

  /**
   * Get current budget status with auto-reset for new day/month
   */
  async getBudgetStatus(): Promise<BudgetStatus> {
    const now = new Date();
    const today = now.toISOString().split('T')[0]!;
    const month = today.substring(0, 7);

    // Get current values
    const [
      dailySpend,
      dailySpendDate,
      monthlySpend,
      monthlySpendMonth,
      dailyLimit,
      monthlyLimit,
      degradationTier,
    ] = await Promise.all([
      this.getValue<number>(CONFIG_KEYS.DAILY_SPEND),
      this.getValue<string>(CONFIG_KEYS.DAILY_SPEND_DATE),
      this.getValue<number>(CONFIG_KEYS.MONTHLY_SPEND),
      this.getValue<string>(CONFIG_KEYS.MONTHLY_SPEND_MONTH),
      this.getValue<number>(CONFIG_KEYS.BUDGET_CEILING_DAILY),
      this.getValue<number>(CONFIG_KEYS.BUDGET_CEILING_MONTHLY),
      this.getValue<number>(CONFIG_KEYS.DEGRADATION_TIER),
    ]);

    let currentDailySpend = dailySpend ?? 0;
    let currentMonthlySpend = monthlySpend ?? 0;
    let currentTier = (degradationTier ?? 0) as 0 | 1 | 2 | 3;

    // Reset daily spend if new day
    if (dailySpendDate !== today) {
      currentDailySpend = 0;
      currentTier = 0;
      await Promise.all([
        this.setValue(CONFIG_KEYS.DAILY_SPEND, 0),
        this.setValue(CONFIG_KEYS.DAILY_SPEND_DATE, today),
        this.setValue(CONFIG_KEYS.DEGRADATION_TIER, 0),
      ]);
    }

    // Reset monthly spend if new month
    if (monthlySpendMonth !== month) {
      currentMonthlySpend = 0;
      await Promise.all([
        this.setValue(CONFIG_KEYS.MONTHLY_SPEND, 0),
        this.setValue(CONFIG_KEYS.MONTHLY_SPEND_MONTH, month),
      ]);
    }

    return {
      dailySpendUsd: currentDailySpend,
      dailyLimitUsd: dailyLimit ?? DEFAULT_CONFIG.budgetCeilingDailyUsd,
      monthlySpendUsd: currentMonthlySpend,
      monthlyLimitUsd: monthlyLimit ?? 8.0,
      degradationTier: currentTier,
    };
  }

  /**
   * Record LLM spend and update degradation tier
   *
   * Degradation tiers (from SPEC.md):
   * - Tier 0: Normal operation
   * - Tier 1: At $0.23/day - reduce to 85/15 Haiku/Sonnet split
   * - Tier 2: At $0.27/day - 85/15 split + 20-min polling
   * - Tier 3: At $0.30/day - Haiku-only + 30-min polling
   * - Hard ceiling: $0.40/day - monitoring-only mode
   *
   * Uses atomic DynamoDB operations to prevent race conditions.
   */
  async recordSpend(amountUsd: number): Promise<BudgetStatus> {
    const status = await this.getBudgetStatus();
    const now = new Date().toISOString();

    // Calculate expected new values for tier calculation
    const expectedDailySpend = status.dailySpendUsd + amountUsd;
    const expectedMonthlySpend = status.monthlySpendUsd + amountUsd;

    // Pre-check if this would exceed hard ceiling (fail fast)
    if (expectedMonthlySpend > status.monthlyLimitUsd) {
      throw new Error(
        `Cannot record spend: would exceed monthly limit ($${expectedMonthlySpend.toFixed(2)} > $${status.monthlyLimitUsd.toFixed(2)})`
      );
    }
    if (expectedDailySpend > 0.40) {
      throw new Error(
        `Cannot record spend: would exceed daily hard ceiling ($${expectedDailySpend.toFixed(2)} > $0.40)`
      );
    }

    // Calculate new degradation tier based on expected spend
    let newTier: 0 | 1 | 2 | 3 = 0;
    if (expectedDailySpend >= 0.30) {
      newTier = 3;
    } else if (expectedDailySpend >= 0.27) {
      newTier = 2;
    } else if (expectedDailySpend >= status.dailyLimitUsd) {
      newTier = 1;
    }

    // Use DynamoDB transaction to atomically update all budget values
    // with conditional checks to prevent exceeding limits
    try {
      await this.db.transactWrite([
        {
          type: 'update',
          pk: KEY_PREFIX.AGENT,
          sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DAILY_SPEND}`,
          updateExpression: 'ADD #value :amount SET updatedAt = :now',
          expressionAttributeNames: {
            '#value': 'value',
          },
          expressionAttributeValues: {
            ':amount': amountUsd,
            ':now': now,
            ':maxDaily': 0.40,
          },
          conditionExpression: 'attribute_exists(#value) AND #value + :amount <= :maxDaily',
        },
        {
          type: 'update',
          pk: KEY_PREFIX.AGENT,
          sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.MONTHLY_SPEND}`,
          updateExpression: 'ADD #value :amount SET updatedAt = :now',
          expressionAttributeNames: {
            '#value': 'value',
          },
          expressionAttributeValues: {
            ':amount': amountUsd,
            ':now': now,
            ':maxMonthly': status.monthlyLimitUsd,
          },
          conditionExpression: 'attribute_exists(#value) AND #value + :amount <= :maxMonthly',
        },
        {
          type: 'put',
          pk: KEY_PREFIX.AGENT,
          sk: `${KEY_PREFIX.CONFIG}${CONFIG_KEYS.DEGRADATION_TIER}`,
          item: {
            key: CONFIG_KEYS.DEGRADATION_TIER,
            value: newTier,
            updatedAt: now,
          },
        },
      ]);
    } catch (error) {
      // Handle transaction cancellation (conditional check failed)
      if (error instanceof Error && error.name === 'TransactionCanceledException') {
        throw new Error(
          `Budget update failed: concurrent modification or budget limit exceeded. Please retry.`
        );
      }
      throw error;
    }

    // Return updated budget status
    return {
      dailySpendUsd: expectedDailySpend,
      dailyLimitUsd: status.dailyLimitUsd,
      monthlySpendUsd: expectedMonthlySpend,
      monthlyLimitUsd: status.monthlyLimitUsd,
      degradationTier: newTier,
    };
  }

  /**
   * Check if LLM calls are allowed (not at hard ceiling)
   */
  async canMakeLlmCall(): Promise<{
    allowed: boolean;
    reason?: string;
    budget: BudgetStatus;
  }> {
    const budget = await this.getBudgetStatus();

    // Monthly hard ceiling
    if (budget.monthlySpendUsd >= budget.monthlyLimitUsd) {
      return {
        allowed: false,
        reason: `Monthly budget exceeded ($${budget.monthlySpendUsd.toFixed(2)}/$${budget.monthlyLimitUsd.toFixed(2)})`,
        budget,
      };
    }

    // Daily hard ceiling ($0.40)
    if (budget.dailySpendUsd >= 0.40) {
      return {
        allowed: false,
        reason: `Daily hard ceiling reached ($${budget.dailySpendUsd.toFixed(2)}/$0.40)`,
        budget,
      };
    }

    return { allowed: true, budget };
  }

  /**
   * Update last heartbeat timestamp
   */
  async updateLastHeartbeat(): Promise<void> {
    await this.setValue(CONFIG_KEYS.LAST_HEARTBEAT, new Date().toISOString());
  }

  /**
   * Get last heartbeat timestamp
   */
  async getLastHeartbeat(): Promise<string | null> {
    return this.getValue<string>(CONFIG_KEYS.LAST_HEARTBEAT);
  }

  /**
   * Update last housekeeping timestamp
   */
  async updateLastHousekeeping(): Promise<void> {
    await this.setValue(CONFIG_KEYS.LAST_HOUSEKEEPING, new Date().toISOString());
  }

  /**
   * Get last housekeeping timestamp
   */
  async getLastHousekeeping(): Promise<string | null> {
    return this.getValue<string>(CONFIG_KEYS.LAST_HOUSEKEEPING);
  }

  /**
   * Check if housekeeping is due (first cycle after 8am that hasn't run today)
   */
  async isHousekeepingDue(workingHours?: WorkingHours): Promise<boolean> {
    const hours = workingHours ?? DEFAULT_CONFIG.workingHours;
    const now = new Date();
    const today = now.toISOString().split('T')[0]!;

    // Get last housekeeping date
    const lastHousekeeping = await this.getLastHousekeeping();
    const lastHousekeepingDate = lastHousekeeping?.split('T')[0];

    // Already ran today
    if (lastHousekeepingDate === today) {
      return false;
    }

    // Check if we're past the start of working hours
    const startHour = parseInt(hours.start.split(':')[0]!, 10);
    const currentHour = now.getHours();

    return currentHour >= startHour;
  }

  // ============================================================================
  // Autonomy Settings
  // ============================================================================

  /**
   * Get current autonomy settings
   */
  async getAutonomySettings(): Promise<AutonomySettings> {
    const [autonomyLevel, dryRun, lastLevelChange, pendingAcknowledgement] =
      await Promise.all([
        this.getValue<AutonomyLevel>(CONFIG_KEYS.AUTONOMY_LEVEL),
        this.getValue<boolean>(CONFIG_KEYS.DRY_RUN),
        this.getValue<string>(CONFIG_KEYS.LAST_AUTONOMY_CHANGE),
        this.getValue<AutonomyChangeAcknowledgement>(CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT),
      ]);

    return {
      autonomyLevel: autonomyLevel ?? DEFAULT_CONFIG.autonomyLevel,
      dryRun: dryRun ?? DEFAULT_CONFIG.dryRun,
      lastLevelChange: lastLevelChange ?? undefined,
      pendingAcknowledgement: pendingAcknowledgement ?? undefined,
    };
  }

  /**
   * Get current autonomy level
   */
  async getAutonomyLevel(): Promise<AutonomyLevel> {
    const level = await this.getValue<AutonomyLevel>(CONFIG_KEYS.AUTONOMY_LEVEL);
    return level ?? DEFAULT_CONFIG.autonomyLevel;
  }

  /**
   * Set autonomy level with acknowledgement tracking
   *
   * When the autonomy level changes, creates a pending acknowledgement
   * that the agent must confirm before the new level takes effect.
   */
  async setAutonomyLevel(newLevel: AutonomyLevel): Promise<AutonomySettings> {
    const currentLevel = await this.getAutonomyLevel();
    const now = new Date().toISOString();

    // If level is changing, create pending acknowledgement
    if (currentLevel !== newLevel) {
      const acknowledgement: AutonomyChangeAcknowledgement = {
        fromLevel: currentLevel,
        toLevel: newLevel,
        requestedAt: now,
        acknowledged: false,
      };

      await Promise.all([
        this.setValue(CONFIG_KEYS.AUTONOMY_LEVEL, newLevel),
        this.setValue(CONFIG_KEYS.LAST_AUTONOMY_CHANGE, now),
        this.setValue(CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT, acknowledgement),
      ]);
    }

    return this.getAutonomySettings();
  }

  /**
   * Acknowledge an autonomy level change (called by the agent)
   */
  async acknowledgeAutonomyChange(): Promise<AutonomySettings> {
    const pending = await this.getValue<AutonomyChangeAcknowledgement>(
      CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT
    );

    if (pending && !pending.acknowledged) {
      const acknowledged: AutonomyChangeAcknowledgement = {
        ...pending,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      };
      await this.setValue(CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT, acknowledged);
    }

    return this.getAutonomySettings();
  }

  /**
   * Clear pending acknowledgement (after agent has processed it)
   */
  async clearPendingAcknowledgement(): Promise<void> {
    await this.setValue(CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT, null);
  }

  /**
   * Check if there's a pending autonomy change that needs acknowledgement
   */
  async hasPendingAcknowledgement(): Promise<boolean> {
    const pending = await this.getValue<AutonomyChangeAcknowledgement>(
      CONFIG_KEYS.PENDING_ACKNOWLEDGEMENT
    );
    return pending !== null && !pending.acknowledged;
  }

  /**
   * Get dry-run mode setting
   */
  async getDryRun(): Promise<boolean> {
    const dryRun = await this.getValue<boolean>(CONFIG_KEYS.DRY_RUN);
    return dryRun ?? DEFAULT_CONFIG.dryRun;
  }

  /**
   * Set dry-run mode
   *
   * When enabled, the agent logs actions but doesn't execute them.
   */
  async setDryRun(enabled: boolean): Promise<void> {
    await this.setValue(CONFIG_KEYS.DRY_RUN, enabled);
  }

  /**
   * Toggle dry-run mode
   */
  async toggleDryRun(): Promise<boolean> {
    const current = await this.getDryRun();
    const newValue = !current;
    await this.setDryRun(newValue);
    return newValue;
  }
}
