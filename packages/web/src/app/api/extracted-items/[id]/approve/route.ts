import { DynamoDBClient } from '@agentic-pm/core/db';
import { ExtractedItemRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * POST /api/extracted-items/[id]/approve
 *
 * Approve an extracted item (move from pending_review to approved).
 * Query param: sessionId (required)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId query parameter is required' },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const repo = new ExtractedItemRepository(db);

    const updated = await repo.approve(sessionId, id);
    if (!updated) {
      return NextResponse.json(
        { error: 'Extracted item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approving extracted item:', error);
    return NextResponse.json(
      { error: 'Failed to approve extracted item' },
      { status: 500 }
    );
  }
}
