import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { HeldActionRepository } from '@agentic-pm/core/db/repositories/held-action';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { HeldAction, HeldActionsResponse } from '@/types';

/**
 * GET /api/held-actions
 *
 * Returns pending held actions awaiting approval.
 * Query params:
 * - status: 'pending' | 'approved' | 'cancelled' | 'executed' (default: 'pending')
 * - projectId: filter by project (optional)
 * - limit: number of actions to return (default: 50)
 * - cursor: pagination cursor (base64-encoded lastEvaluatedKey)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status =
      (searchParams.get('status') as HeldAction['status']) || undefined;
    const projectId = searchParams.get('projectId');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      100
    );

    // Initialize DynamoDB client and repository
    const db = new DynamoDBClient();
    const repo = new HeldActionRepository(db);

    let result;

    if (projectId) {
      // Query actions for specific project
      result = await repo.getByProject(projectId, { status, limit });
    } else if (status === 'pending' || !status) {
      // Query all pending actions (default)
      result = await repo.getPending({ limit });
    } else if (status === 'executed') {
      // Query recently executed actions
      result = await repo.getRecentlyExecuted({ limit });
    } else {
      // For other statuses without specific queries, return empty
      result = { items: [], hasMore: false };
    }

    const response: HeldActionsResponse = {
      heldActions: result.items,
      count: result.items.length,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching held actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch held actions' },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/held-actions
 *
 * Returns count of pending held actions (for badge display).
 */
export async function HEAD() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse(null, { status: 401 });
    }

    // Initialize DynamoDB client and repository
    const db = new DynamoDBClient();
    const repo = new HeldActionRepository(db);

    // Get pending count
    const pendingCount = await repo.countPending();

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Pending-Count': String(pendingCount),
      },
    });
  } catch (error) {
    console.error('Error counting held actions:', error);
    return new NextResponse(null, { status: 500 });
  }
}
