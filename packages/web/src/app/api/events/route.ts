import { DynamoDBClient } from '@agentic-pm/core/db';
import { EventRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { EventsResponse } from '@/types';

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
    const _cursor = searchParams.get('cursor'); // TODO: implement pagination with cursor
    const projectId = searchParams.get('projectId');

    // Fetch events from DynamoDB
    const db = new DynamoDBClient();
    const eventRepo = new EventRepository(db);

    let result;
    if (projectId) {
      // Get events for specific project
      result = await eventRepo.getByProject(projectId, { limit });
    } else {
      // Get recent events across all projects
      result = await eventRepo.getRecent({ limit, days: 2 });
    }

    const response: EventsResponse = {
      events: result.items,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore ?? false,
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
