import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { HeldActionRepository } from '@agentic-pm/core/db/repositories/held-action';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { cancelHeldActionSchema } from '@/schemas/api';
import type { HeldActionResponse } from '@/types';

/**
 * POST /api/held-actions/[id]/cancel
 *
 * Cancel a held action (prevents execution).
 * Body:
 * - reason?: string (optional cancellation reason)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    // Parse and validate body
    const body = await request.json();
    const result = cancelHeldActionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    // Initialize DynamoDB client and repository
    const db = new DynamoDBClient();
    const repo = new HeldActionRepository(db);

    // Cancel the action
    const cancelledAction = await repo.cancel(
      result.data.projectId,
      id,
      result.data.reason,
      session.user?.email ?? 'user'
    );

    if (!cancelledAction) {
      return NextResponse.json(
        { error: 'Action not found or already processed' },
        { status: 409 }
      );
    }

    const response: HeldActionResponse = {
      heldAction: cancelledAction,
      success: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error cancelling held action:', error);
    return NextResponse.json(
      { error: 'Failed to cancel held action' },
      { status: 500 }
    );
  }
}
