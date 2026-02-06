import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { EventRepository } from '@agentic-pm/core/db/repositories/event';
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

    // Initialize DynamoDB client and repository
    const db = new DynamoDBClient();
    const eventRepo = new EventRepository(db);

    // Get date strings for queries
    const now = new Date();
    const today = now.toISOString().split('T')[0]!;
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    // Fetch events for today and yesterday
    const todayEvents = await eventRepo.getByDate(today, { limit: 1000 });
    const yesterdayEvents = await eventRepo.getByDate(yesterday, { limit: 1000 });

    // Helper to aggregate stats from events
    const aggregateStats = (events: typeof todayEvents.items): ActivityStats => {
      const stats: ActivityStats = {
        cyclesRun: 0,
        signalsDetected: 0,
        actionsTaken: 0,
        actionsHeld: 0,
        artefactsUpdated: 0,
        escalationsCreated: 0,
        escalationsResolved: 0,
        llmCostUsd: 0,
        tokensUsed: 0,
      };

      for (const event of events) {
        switch (event.eventType) {
          case 'heartbeat':
          case 'heartbeat_with_changes':
            stats.cyclesRun++;
            break;
          case 'signal_detected':
            stats.signalsDetected++;
            break;
          case 'action_executed':
            stats.actionsTaken++;
            break;
          case 'action_held':
            stats.actionsHeld++;
            break;
          case 'artefact_updated':
            stats.artefactsUpdated++;
            break;
          case 'escalation_created':
            stats.escalationsCreated++;
            break;
          case 'escalation_decided':
            stats.escalationsResolved++;
            break;
        }

        // Accumulate costs if available
        if (event.detail?.context?.llmCostUsd) {
          stats.llmCostUsd += event.detail.context.llmCostUsd as number;
        }
        if (event.detail?.context?.tokensUsed) {
          stats.tokensUsed += event.detail.context.tokensUsed as number;
        }
      }

      return stats;
    };

    // Aggregate stats for today
    const todayStats = aggregateStats(todayEvents.items);

    // For last 24 hours, combine today and yesterday (filter by actual timestamp)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last24HoursEvents = [
      ...todayEvents.items,
      ...yesterdayEvents.items.filter(e => e.createdAt >= twentyFourHoursAgo)
    ];
    const last24HoursStats = aggregateStats(last24HoursEvents);

    // Calculate comparison (today vs previous day)
    const previousDayEvents = yesterdayEvents.items.filter(e => e.createdAt < twentyFourHoursAgo);
    const previousStats = aggregateStats(previousDayEvents);

    const response: ActivityStatsResponse = {
      last24Hours: last24HoursStats,
      today: todayStats,
      comparison: {
        cyclesChange: todayStats.cyclesRun - previousStats.cyclesRun,
        signalsChange: todayStats.signalsDetected - previousStats.signalsDetected,
        actionsChange: todayStats.actionsTaken - previousStats.actionsTaken,
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
