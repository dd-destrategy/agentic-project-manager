import { DynamoDBClient } from '@agentic-pm/core/db';
import {
  AgentConfigRepository,
  EventRepository,
  IntegrationConfigRepository,
} from '@agentic-pm/core/db/repositories';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { AgentStatusResponse, IntegrationHealth } from '@/types';

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

    // Initialize repositories
    const db = new DynamoDBClient();
    const configRepo = new AgentConfigRepository(db);
    const eventRepo = new EventRepository(db);
    const integrationConfigRepo = new IntegrationConfigRepository(db);

    // Fetch real data from DynamoDB
    const [
      lastHeartbeat,
      budgetStatus,
      config,
      latestHeartbeatEvent,
      integrationConfigs,
    ] = await Promise.all([
      configRepo.getLastHeartbeat(),
      configRepo.getBudgetStatus(),
      configRepo.getConfig(),
      eventRepo.getLatestHeartbeat(),
      integrationConfigRepo.getAll(),
    ]);

    // Calculate agent status based on heartbeat age
    const heartbeatAge = lastHeartbeat
      ? Date.now() - new Date(lastHeartbeat).getTime()
      : Infinity;
    const isHealthy = heartbeatAge < 5 * 60 * 1000; // Less than 5 minutes old

    // Map integration health configs to frontend IntegrationHealth format
    const integrations: IntegrationHealth[] =
      integrationConfigs.length > 0
        ? integrationConfigs.map((ic) => ({
            name: ic.name as IntegrationHealth['name'],
            status: ic.healthy
              ? ('healthy' as const)
              : ic.consecutiveFailures >= 3
                ? ('error' as const)
                : ('degraded' as const),
            lastCheck: ic.lastHealthCheck,
            errorMessage: ic.lastError,
          }))
        : [
            {
              name: 'jira',
              status: 'healthy' as const,
              lastCheck:
                lastHeartbeat ??
                new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          ];

    const status: AgentStatusResponse = {
      status: isHealthy ? 'active' : lastHeartbeat ? 'stopped' : 'never_run',
      lastHeartbeat: lastHeartbeat ?? null,
      nextScheduledRun: lastHeartbeat
        ? new Date(
            new Date(lastHeartbeat).getTime() +
              config.pollingIntervalMinutes * 60 * 1000
          ).toISOString()
        : new Date(
            Date.now() + config.pollingIntervalMinutes * 60 * 1000
          ).toISOString(),
      currentCycleState:
        (latestHeartbeatEvent?.detail?.context?.cycleId as
          | string
          | undefined) ?? null,
      integrations,
      budgetStatus: {
        dailySpendUsd: budgetStatus.dailySpendUsd,
        dailyLimitUsd: budgetStatus.dailyLimitUsd,
        monthlySpendUsd: budgetStatus.monthlySpendUsd,
        monthlyLimitUsd: budgetStatus.monthlyLimitUsd,
        degradationTier: budgetStatus.degradationTier,
      },
    };

    return NextResponse.json(status);
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
          dailyLimitUsd: 0.5,
          monthlySpendUsd: 0,
          monthlyLimitUsd: 7.0,
          degradationTier: 0,
        },
        error: 'Failed to fetch agent status',
      } satisfies AgentStatusResponse,
      { status: 500 }
    );
  }
}
