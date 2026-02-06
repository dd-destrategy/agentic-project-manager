import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { HeldActionRepository } from '@agentic-pm/core/db/repositories/held-action';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { approveHeldActionSchema } from '@/schemas/api';
import type { HeldActionResponse } from '@/types';

/**
 * POST /api/held-actions/[id]/approve
 *
 * Approve a held action for immediate execution.
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
    const body = await request.json();

    const result = approveHeldActionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    // Verify the actionId in the body matches the URL param
    if (result.data.actionId !== id) {
      return NextResponse.json(
        { error: 'Action ID mismatch between URL and body' },
        { status: 400 }
      );
    }

    // Initialize DynamoDB client and repository
    const db = new DynamoDBClient();
    const repo = new HeldActionRepository(db);

    // Approve the action
    const approvedAction = await repo.approve(
      result.data.projectId,
      id,
      session.user?.email ?? 'user'
    );

    if (!approvedAction) {
      return NextResponse.json(
        { error: 'Action not found or already processed' },
        { status: 409 }
      );
    }

    const response: HeldActionResponse = {
      heldAction: approvedAction,
      success: true,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error approving held action:', error);
    return NextResponse.json(
      { error: 'Failed to approve held action' },
      { status: 500 }
    );
  }
}
