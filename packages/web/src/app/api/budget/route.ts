import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

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
 * Generate mock usage history for the last 7 days
 */
function generateMockHistory(): UsageHistoryEntry[] {
  const history: UsageHistoryEntry[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    history.push({
      date: date.toISOString().split('T')[0]!,
      spend: Math.random() * 0.20 + 0.03, // Random between $0.03 and $0.23
      tokens: Math.floor(Math.random() * 50000) + 10000, // Random between 10k and 60k
    });
  }

  return history;
}

/**
 * In-memory budget state for development/demo
 * In production, this would be fetched from DynamoDB via BudgetTracker
 */
function getBudgetState(): BudgetStatusResponse {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Simulated values
  const dailySpend = 0.12;
  const dailyLimit = 0.23;
  const monthSpend = dayOfMonth * 0.15; // Average $0.15/day
  const monthLimit = 8.0;
  const dailyAverage = monthSpend / dayOfMonth;
  const projectedMonthSpend = dailyAverage * daysInMonth;

  // Calculate tier based on daily percentage used
  const dailyPercent = dailySpend / dailyLimit;
  let tier: 0 | 1 | 2 | 3 = 0;
  if (dailyPercent >= 0.95) tier = 3;
  else if (dailyPercent >= 0.85) tier = 2;
  else if (dailyPercent >= 0.70) tier = 1;

  return {
    dailySpend,
    dailyLimit,
    monthSpend,
    monthLimit,
    dailyAverage,
    tier,
    tierName: TIER_NAMES[tier],
    daysRemaining,
    projectedMonthSpend,
    onTrack: projectedMonthSpend <= monthLimit,
    usageHistory: generateMockHistory(),
  };
}

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
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const budgetStatus = getBudgetState();
    return NextResponse.json(budgetStatus);
  } catch (error) {
    console.error('Error fetching budget status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch budget status' },
      { status: 500 }
    );
  }
}
