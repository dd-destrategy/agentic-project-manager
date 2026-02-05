import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { approveHeldActionSchema } from '@/schemas/api';
import type { HeldAction, HeldActionResponse } from '@/types';

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

    // TODO: Replace with real DynamoDB update and action execution
    // For now, return mock updated action
    const approvedAction: HeldAction = {
      id,
      projectId: 'proj-1',
      actionType: 'email_stakeholder',
      payload: {
        to: ['john.smith@example.com'],
        subject: 'Sprint Status Update',
        bodyText: 'Status update content...',
      },
      heldUntil: new Date().toISOString(),
      status: 'approved',
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      approvedAt: new Date().toISOString(),
      decidedBy: session.user?.email ?? 'user',
    };

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
