import { AgentConfigRepository } from '@agentic-pm/core/db/repositories';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';

/**
 * Budget status response type
 */
interface BudgetStatusResponse {
  /** Daily spend in USD */
  dailySpend: number;
  /** Daily budget limit in USD */
  dailyLimit: number;
  /** Monthly spend in USD */
  monthSpend: number;
  /** Monthly budget limit in USD */
  monthLimit: number;
  /** Average daily spend for the month */
  dailyAverage: number;
  /** Current degradation tier (0-3) */
  tier: 0 | 1 | 2 | 3;
  /** Tier description */
  tierName: string;
  /** Days remaining in the month */
  daysRemaining: number;
  /** Projected monthly spend based on current rate */
  projectedMonthSpend: number;
  /** Whether budget is on track */
  onTrack: boolean;
  /** Usage history for chart */
  usageHistory: UsageHistoryEntry[];
}

/**
 * Usage history entry for charts
 */
interface UsageHistoryEntry {
  date: string;
  spend: number;
  tokens: number;
}

/**
 * Degradation tier names
 */
const TIER_NAMES: Record<0 | 1 | 2 | 3, string> = {
  0: 'Normal',
  1: 'Budget Pressure',
  2: 'High Pressure',
  3: 'Monitoring Only',
};

/**
 * GET /api/budget
 *
 * Returns the current budget status including daily/monthly spend,
 * degradation tier, and usage history.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    // Fetch budget status from DynamoDB (C03: singleton)
    const db = getDbClient();
    const configRepo = new AgentConfigRepository(db);

    const budgetStatus = await configRepo.getBudgetStatus();

    // Calculate additional metrics
    const now = new Date();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const dailyAverage =
      dayOfMonth > 0 ? budgetStatus.monthlySpendUsd / dayOfMonth : 0;
    const projectedMonthSpend = dailyAverage * daysInMonth;

    // Note: Usage history would need to be stored separately in production
    // For now, we'll return empty history since we don't have historical data yet
    const usageHistory: UsageHistoryEntry[] = [];

    const response: BudgetStatusResponse = {
      dailySpend: budgetStatus.dailySpendUsd,
      dailyLimit: budgetStatus.dailyLimitUsd,
      monthSpend: budgetStatus.monthlySpendUsd,
      monthLimit: budgetStatus.monthlyLimitUsd,
      dailyAverage,
      tier: budgetStatus.degradationTier,
      tierName: TIER_NAMES[budgetStatus.degradationTier],
      daysRemaining,
      projectedMonthSpend,
      onTrack: projectedMonthSpend <= budgetStatus.monthlyLimitUsd,
      usageHistory,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching budget status:', error);
    return internalError('Failed to fetch budget status');
  }
}
