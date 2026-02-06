import { DynamoDBClient } from '@agentic-pm/core/db';
import { ExtractedItemRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * GET /api/extracted-items
 *
 * List extracted items, optionally filtered by status or session.
 * Query params: status, sessionId, limit
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status') as
      | 'pending_review'
      | 'approved'
      | 'applied'
      | 'dismissed'
      | null;
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const limit = parseInt(
      request.nextUrl.searchParams.get('limit') ?? '50',
      10
    );

    const db = new DynamoDBClient();
    const repo = new ExtractedItemRepository(db);

    if (sessionId) {
      // Query items for a specific session
      const result = await repo.getBySession(sessionId, { limit });
      const items = status
        ? result.items.filter((i) => i.status === status)
        : result.items;
      return NextResponse.json({ items, count: items.length });
    }

    if (status) {
      // Query by status across all sessions
      const result = await repo.getByStatus(status, { limit });
      return NextResponse.json({
        items: result.items,
        count: result.items.length,
      });
    }

    // Default: return pending review items
    const result = await repo.getByStatus('pending_review', { limit });
    return NextResponse.json({
      items: result.items,
      count: result.items.length,
    });
  } catch (error) {
    console.error('Error listing extracted items:', error);
    return NextResponse.json(
      { error: 'Failed to list extracted items' },
      { status: 500 }
    );
  }
}
