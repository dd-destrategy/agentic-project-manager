import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { ActivityStatsResponse, ActivityStats } from '@/types';

/**
 * GET /api/stats
 *
 * Returns 24-hour activity statistics for the dashboard.
 * Shows agent cycles, signals detected, actions taken, and costs.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // TODO: Fetch real statistics from DynamoDB when agent runtime is deployed
    // This will aggregate events from the last 24 hours
    // For now, return mock data for frontend development

    const mockLast24Hours: ActivityStats = {
      cyclesRun: 96, // 24 hours * 4 cycles per hour (15 min intervals)
      signalsDetected: 12,
      actionsTaken: 8,
      actionsHeld: 2,
      artefactsUpdated: 5,
      escalationsCreated: 1,
      escalationsResolved: 0,
      llmCostUsd: 0.15,
      tokensUsed: 4500,
    };

    const mockToday: ActivityStats = {
      cyclesRun: 42,
      signalsDetected: 6,
      actionsTaken: 4,
      actionsHeld: 1,
      artefactsUpdated: 3,
      escalationsCreated: 1,
      escalationsResolved: 0,
      llmCostUsd: 0.08,
      tokensUsed: 2100,
    };

    const response: ActivityStatsResponse = {
      last24Hours: mockLast24Hours,
      today: mockToday,
      comparison: {
        cyclesChange: 0, // Cycles are consistent
        signalsChange: 3, // 3 more signals than previous period
        actionsChange: 2, // 2 more actions than previous period
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity statistics' },
      { status: 500 }
    );
  }
}
