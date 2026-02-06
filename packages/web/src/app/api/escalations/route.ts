import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import type { Escalation, EscalationsResponse } from '@/types';

/**
 * GET /api/escalations
 *
 * Returns escalations with optional status filtering.
 * Query params:
 * - status: 'pending' | 'decided' | 'expired' | 'superseded' (default: pending)
 * - projectId: filter by project (optional)
 * - limit: number of escalations to return (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const searchParams = request.nextUrl.searchParams;
    const status =
      (searchParams.get('status') as Escalation['status']) || undefined;
    const projectId = searchParams.get('projectId');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '20', 10),
      100
    );

    // Initialise DynamoDB client and repository (C03: singleton)
    const dbClient = getDbClient();
    const escalationRepo = new EscalationRepository(dbClient);

    let escalations: Escalation[] = [];

    if (projectId) {
      // Get escalations for specific project
      const result = await escalationRepo.getByProject(projectId, {
        status,
        limit,
      });
      escalations = result.items;
    } else if (status === 'pending' || !status) {
      // Get all pending escalations across projects
      const result = await escalationRepo.getPending({ limit });
      escalations = result.items;
    } else if (status === 'decided') {
      // Get recently decided escalations
      const result = await escalationRepo.getRecentDecided({ limit });
      escalations = result.items;
    } else {
      // For other statuses, we'd need to scan (not ideal)
      // For now, return empty array
      escalations = [];
    }

    const response: EscalationsResponse = {
      escalations,
      count: escalations.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching escalations:', error);
    return internalError('Failed to fetch escalations');
  }
}

/**
 * HEAD /api/escalations
 *
 * Returns count of pending escalations (for badge display).
 */
export async function HEAD() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse(null, { status: 401 });
    }

    // Initialise DynamoDB client and repository (C03: singleton)
    const dbClient = getDbClient();
    const escalationRepo = new EscalationRepository(dbClient);

    // Get pending escalations count
    const pendingCount = await escalationRepo.countPending();

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Pending-Count': String(pendingCount),
      },
    });
  } catch (error) {
    console.error('Error counting escalations:', error);
    return new NextResponse(null, { status: 500 });
  }
}
