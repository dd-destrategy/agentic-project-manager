import {
  EventRepository,
  EscalationRepository,
} from '@agentic-pm/core/db/repositories';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import type { CatchupSummary, CatchupEvent } from '@/types';

/**
 * GET /api/catchup
 *
 * Returns a "Since You Left" catch-up summary.
 * Compiles recent events, artefact changes, escalations, and
 * actions into a structured summary since the user's last visit.
 *
 * Uses 24 hours ago as the default lookback window.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const db = getDbClient();
    const eventRepo = new EventRepository(db);
    const escalationRepo = new EscalationRepository(db);

    // Default to 24 hours ago as the "since" timestamp
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent events (last 2 days to ensure we capture everything)
    const eventsResult = await eventRepo.getRecent({ limit: 100, days: 2 });
    const allEvents = eventsResult.items;

    // Filter events to those since the lookback window
    const recentEvents = allEvents.filter((event) => event.createdAt >= since);

    // Compute counts by event type
    let escalationsCreated = 0;
    let escalationsDecided = 0;
    let artefactsUpdated = 0;
    let actionsTaken = 0;
    let actionsHeld = 0;
    let signalsDetected = 0;

    for (const event of recentEvents) {
      switch (event.eventType) {
        case 'escalation_created':
          escalationsCreated++;
          break;
        case 'escalation_decided':
          escalationsDecided++;
          break;
        case 'artefact_updated':
          artefactsUpdated++;
          break;
        case 'action_taken':
        case 'action_executed':
        case 'action_approved':
          actionsTaken++;
          break;
        case 'action_held':
          actionsHeld++;
          break;
        case 'signal_detected':
          signalsDetected++;
          break;
      }
    }

    // Get pending escalations for highlights
    const pendingEscalations = await escalationRepo.getPending();
    const pendingCount = pendingEscalations.items.length;

    // Build highlights — key things the user should know about
    const highlights: string[] = [];

    if (pendingCount > 0) {
      highlights.push(
        `${pendingCount} escalation${pendingCount === 1 ? '' : 's'} awaiting your decision`
      );
    }

    if (escalationsCreated > 0) {
      highlights.push(
        `${escalationsCreated} new escalation${escalationsCreated === 1 ? '' : 's'} raised`
      );
    }

    if (artefactsUpdated > 0) {
      highlights.push(
        `${artefactsUpdated} artefact${artefactsUpdated === 1 ? '' : 's'} updated by the agent`
      );
    }

    if (actionsHeld > 0) {
      highlights.push(
        `${actionsHeld} action${actionsHeld === 1 ? '' : 's'} held for your review`
      );
    }

    if (signalsDetected > 0) {
      highlights.push(
        `${signalsDetected} signal${signalsDetected === 1 ? '' : 's'} detected from integrations`
      );
    }

    const errorEvents = recentEvents.filter(
      (e) => e.severity === 'error' || e.severity === 'critical'
    );
    if (errorEvents.length > 0) {
      highlights.push(
        `${errorEvents.length} error${errorEvents.length === 1 ? '' : 's'} or critical event${errorEvents.length === 1 ? '' : 's'} occurred`
      );
    }

    if (highlights.length === 0) {
      highlights.push(
        'All quiet — no significant activity while you were away'
      );
    }

    // Map the most important recent events for the summary
    // Prioritise non-heartbeat events and limit to 20
    const significantEvents = recentEvents
      .filter(
        (e) =>
          e.eventType !== 'heartbeat' &&
          e.eventType !== 'heartbeat_with_changes'
      )
      .slice(0, 20);

    const catchupEvents: CatchupEvent[] = significantEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      severity: event.severity,
      summary: event.summary,
      projectId: event.projectId ?? undefined,
      createdAt: event.createdAt,
    }));

    const summary: CatchupSummary = {
      since,
      escalationsCreated,
      escalationsDecided,
      artefactsUpdated,
      actionsTaken,
      actionsHeld,
      signalsDetected,
      recentEvents: catchupEvents,
      highlights,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error building catch-up summary:', error);
    return internalError('Failed to build catch-up summary');
  }
}
