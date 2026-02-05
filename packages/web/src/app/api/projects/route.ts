import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { ProjectListResponse, ProjectSummary } from '@/types';

/**
 * GET /api/projects
 *
 * Returns a list of all projects with summary information.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // TODO: Fetch real projects from DynamoDB when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockProjects: ProjectSummary[] = [
      {
        id: 'proj-1',
        name: 'Platform Migration',
        status: 'active',
        source: 'jira',
        sourceProjectKey: 'PLAT',
        autonomyLevel: 'artefact',
        healthStatus: 'healthy',
        pendingEscalations: 0,
        lastActivity: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: 'proj-2',
        name: 'Mobile App v2',
        status: 'active',
        source: 'jira',
        sourceProjectKey: 'MOB',
        autonomyLevel: 'tactical',
        healthStatus: 'warning',
        pendingEscalations: 1,
        lastActivity: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ];

    const response: ProjectListResponse = {
      projects: mockProjects,
      count: mockProjects.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
