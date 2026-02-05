/**
 * Agent Config repository
 *
 * Handles agent configuration, budget tracking, and state persistence.
 * Uses a key-value pattern with PK=AGENT, SK=CONFIG#<key>
 */

import { KEY_PREFIX } from '../../constants.js';
import type {
  AgentConfig,
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
   */
  async recordSpend(amountUsd: number): Promise<BudgetStatus> {
    const status = await this.getBudgetStatus();

    const newDailySpend = status.dailySpendUsd + amountUsd;
    const newMonthlySpend = status.monthlySpendUsd + amountUsd;

    // Calculate new degradation tier
    let newTier: 0 | 1 | 2 | 3 = 0;
    if (newDailySpend >= 0.30) {
      newTier = 3;
    } else if (newDailySpend >= 0.27) {
      newTier = 2;
    } else if (newDailySpend >= status.dailyLimitUsd) {
      newTier = 1;
    }

    // Update values
    await Promise.all([
      this.setValue(CONFIG_KEYS.DAILY_SPEND, newDailySpend),
      this.setValue(CONFIG_KEYS.MONTHLY_SPEND, newMonthlySpend),
      this.setValue(CONFIG_KEYS.DEGRADATION_TIER, newTier),
    ]);

    return {
      dailySpendUsd: newDailySpend,
      dailyLimitUsd: status.dailyLimitUsd,
      monthlySpendUsd: newMonthlySpend,
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
}
