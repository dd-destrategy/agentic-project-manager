import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { HeldActionsResponse, HeldAction } from '@/types';

/**
 * GET /api/held-actions
 *
 * Returns pending held actions awaiting approval.
 * Query params:
 * - status: 'pending' | 'approved' | 'cancelled' | 'executed' (default: 'pending')
 * - projectId: filter by project (optional)
 * - limit: number of actions to return (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as HeldAction['status'] | null;
    const projectId = searchParams.get('projectId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    // TODO: Replace with real DynamoDB queries when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockHeldActions: HeldAction[] = [
      {
        id: 'held-1',
        projectId: 'proj-1',
        actionType: 'email_stakeholder',
        payload: {
          to: ['john.smith@example.com', 'sarah.jones@example.com'],
          subject: 'Sprint 14 Status Update - Action Required',
          bodyText: `Hi Team,

I wanted to provide a quick update on Sprint 14 progress:

- Completed: 18 story points (56%)
- In Progress: 8 story points (25%)
- Blocked: 6 story points (19%)

The blocked items are related to the API integration dependency we discussed. I recommend we schedule a quick sync to unblock these items.

Please let me know your availability for a 15-minute call tomorrow.

Best regards,
Agentic PM`,
          context: 'Weekly sprint status communication to stakeholders',
        },
        heldUntil: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // 25 mins from now
        status: 'pending',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: 'held-2',
        projectId: 'proj-1',
        actionType: 'jira_status_change',
        payload: {
          issueKey: 'PROJ-234',
          transitionId: '31',
          transitionName: 'Start Progress',
          fromStatus: 'To Do',
          toStatus: 'In Progress',
          reason: 'Dependencies resolved, ready to begin work',
        },
        heldUntil: new Date(Date.now() + 12 * 60 * 1000).toISOString(), // 12 mins from now
        status: 'pending',
        createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      },
      {
        id: 'held-3',
        projectId: 'proj-1',
        actionType: 'email_stakeholder',
        payload: {
          to: ['product.owner@example.com'],
          subject: 'Risk Alert: Dependency Delay Impact',
          bodyText: `Hi,

I've identified a potential risk that may impact the current sprint:

Risk: Third-party API integration delay
Impact: Could delay 3 user stories (estimated 8 story points)
Mitigation: Propose parallel development with mock service

Recommended action: Schedule meeting with tech lead to discuss alternatives.

Regards,
Agentic PM`,
          context: 'Proactive risk communication based on detected blockers',
        },
        heldUntil: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 mins from now
        status: 'pending',
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
    ];

    // Filter by status (default to pending)
    const filterStatus = status ?? 'pending';
    let filteredActions = mockHeldActions.filter((a) => a.status === filterStatus);

    // Filter by projectId if specified
    if (projectId) {
      filteredActions = filteredActions.filter((a) => a.projectId === projectId);
    }

    // Apply limit
    const paginatedActions = filteredActions.slice(0, limit);

    const response: HeldActionsResponse = {
      heldActions: paginatedActions,
      count: filteredActions.length,
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
    // TODO: Replace with real DynamoDB query
    const pendingCount = 3;

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
