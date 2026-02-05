import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { AgentStatusResponse } from '@/types';

/**
 * GET /api/agent/status
 *
 * Returns the current agent status including health, last run time, and integration status.
 * This endpoint is polled every 30 seconds by the frontend.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // TODO: Fetch real status from DynamoDB when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockStatus: AgentStatusResponse = {
      status: 'active',
      lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      nextScheduledRun: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
      currentCycleState: null,
      integrations: [
        {
          name: 'jira',
          status: 'healthy',
          lastCheck: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
        {
          name: 'outlook',
          status: 'healthy',
          lastCheck: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ],
      budgetStatus: {
        dailySpendUsd: 0.15,
        dailyLimitUsd: 0.50,
        monthlySpendUsd: 2.45,
        monthlyLimitUsd: 7.00,
        degradationTier: 0,
      },
    };

    return NextResponse.json(mockStatus);
  } catch (error) {
    console.error('Error fetching agent status:', error);
    return NextResponse.json(
      {
        status: 'error',
        lastHeartbeat: null,
        nextScheduledRun: new Date().toISOString(),
        currentCycleState: null,
        integrations: [],
        budgetStatus: {
          dailySpendUsd: 0,
          dailyLimitUsd: 0.50,
          monthlySpendUsd: 0,
          monthlyLimitUsd: 7.00,
          degradationTier: 0,
        },
        error: 'Failed to fetch agent status',
      } satisfies AgentStatusResponse,
      { status: 500 }
    );
  }
}
