import { ArtefactSnapshotRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, badRequest, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import type { ArtefactType } from '@/types';

/**
 * GET /api/snapshots/[projectId]
 *
 * Returns trend data for a project's artefact snapshots.
 * Query params:
 * - type: ArtefactType (required) - e.g. 'delivery_state', 'raid_log'
 * - limit: number of data points to return (default: 30, max: 90)
 * - since: ISO timestamp to fetch snapshots from (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const { projectId } = await params;

    if (!projectId) {
      return badRequest('Project ID is required');
    }

    const searchParams = request.nextUrl.searchParams;
    const artefactType = searchParams.get('type') as ArtefactType | null;

    if (!artefactType) {
      return badRequest('Artefact type is required (query param: type)');
    }

    const validTypes: ArtefactType[] = [
      'delivery_state',
      'raid_log',
      'backlog_summary',
      'decision_log',
    ];

    if (!validTypes.includes(artefactType)) {
      return badRequest(
        `Invalid artefact type. Must be one of: ${validTypes.join(', ')}`
      );
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 90);
    const since = searchParams.get('since') ?? undefined;

    const db = getDbClient();
    const snapshotRepo = new ArtefactSnapshotRepository(db);

    const trend = await snapshotRepo.getTrend(projectId, artefactType, {
      limit,
      since,
    });

    return NextResponse.json({
      projectId,
      artefactType,
      dataPoints: trend,
      count: trend.length,
    });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    return internalError('Failed to fetch artefact snapshots');
  }
}
