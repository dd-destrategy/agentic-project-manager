import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import { StakeholderRepository } from '@agentic-pm/core/db/repositories';

/**
 * GET /api/stakeholders/[projectId]
 *
 * Returns all stakeholders and engagement anomalies for a project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const { projectId } = await params;
    const db = getDbClient();
    const repo = new StakeholderRepository(db);

    const [stakeholders, anomalies] = await Promise.all([
      repo.getAllForProject(projectId),
      repo.getEngagementAnomalies(projectId),
    ]);

    return NextResponse.json({
      stakeholders,
      anomalies,
      count: stakeholders.length,
    });
  } catch (error) {
    console.error('Stakeholder error:', error);
    return internalError('Failed to fetch stakeholders');
  }
}
