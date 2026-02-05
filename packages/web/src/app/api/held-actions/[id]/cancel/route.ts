import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { HeldAction, HeldActionResponse } from '@/types';

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

    // Parse optional reason from body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body provided, which is fine
    }

    // TODO: Replace with real DynamoDB update
    // For now, return mock updated action
    const cancelledAction: HeldAction = {
      id,
      projectId: 'proj-1',
      actionType: 'email_stakeholder',
      payload: {
        to: ['john.smith@example.com'],
        subject: 'Sprint Status Update',
        bodyText: 'Status update content...',
      },
      heldUntil: new Date().toISOString(),
      status: 'cancelled',
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      cancelledAt: new Date().toISOString(),
      cancelReason: reason,
      decidedBy: session.user?.email ?? 'user',
    };

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
