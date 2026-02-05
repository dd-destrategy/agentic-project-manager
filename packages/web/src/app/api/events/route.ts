import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { EventsResponse, Event } from '@/types';

/**
 * GET /api/events
 *
 * Returns recent events with pagination support.
 * Query params:
 * - limit: number of events to return (default: 20, max: 100)
 * - cursor: pagination cursor for fetching more events
 * - projectId: filter by project (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const cursor = searchParams.get('cursor');
    const projectId = searchParams.get('projectId');

    // TODO: Fetch real events from DynamoDB when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockEvents: Event[] = [
      {
        id: 'evt-1',
        projectId: 'proj-1',
        eventType: 'heartbeat_with_changes',
        severity: 'info',
        summary: 'Agent completed monitoring cycle with 2 new signals detected',
        detail: {
          source: 'agent-runtime',
          metrics: { durationMs: 1250, tokensUsed: 450, costUsd: 0.002 },
        },
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: 'evt-2',
        projectId: 'proj-1',
        eventType: 'artefact_updated',
        severity: 'info',
        summary: 'Updated RAID log with new risk: API rate limit approaching threshold',
        detail: {
          source: 'reasoning-engine',
          relatedIds: { artefactId: 'art-raid-1' },
        },
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      {
        id: 'evt-3',
        projectId: 'proj-1',
        eventType: 'signal_detected',
        severity: 'warning',
        summary: 'Jira: Sprint velocity dropped 25% compared to previous sprint',
        detail: {
          source: 'jira-integration',
          relatedIds: { signalId: 'sig-1' },
        },
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
      {
        id: 'evt-4',
        projectId: 'proj-1',
        eventType: 'action_held',
        severity: 'info',
        summary: 'Draft status update email held for review (autonomy level: tactical)',
        detail: {
          source: 'execution-engine',
          relatedIds: { actionId: 'act-1' },
        },
        createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        id: 'evt-5',
        eventType: 'heartbeat',
        severity: 'info',
        summary: 'Agent monitoring cycle completed - no changes detected',
        detail: {
          source: 'agent-runtime',
          metrics: { durationMs: 850, tokensUsed: 120, costUsd: 0.0005 },
        },
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ];

    // Filter by projectId if specified
    const filteredEvents = projectId
      ? mockEvents.filter((e) => e.projectId === projectId)
      : mockEvents;

    // Apply pagination (in real implementation, use DynamoDB cursor)
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedEvents = filteredEvents.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredEvents.length;

    const response: EventsResponse = {
      events: paginatedEvents,
      nextCursor: hasMore ? String(startIndex + limit) : null,
      hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
