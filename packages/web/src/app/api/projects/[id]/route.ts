import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { Project, HealthStatus, AutonomyLevel, ProjectStatus } from '@/types';

interface ProjectDetailResponse {
  project: Project & {
    healthStatus: HealthStatus;
    pendingEscalations: number;
  };
}

/**
 * GET /api/projects/[id]
 *
 * Returns detailed information for a specific project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // TODO: Fetch real project from DynamoDB when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockProjects: Record<string, ProjectDetailResponse> = {
      'proj-1': {
        project: {
          id: 'proj-1',
          name: 'Platform Migration',
          description: 'Migrating legacy platform to modern cloud-native architecture with improved scalability and maintainability.',
          status: 'active' as ProjectStatus,
          source: 'jira',
          sourceProjectKey: 'PLAT',
          autonomyLevel: 'artefact' as AutonomyLevel,
          config: {
            pollingIntervalMinutes: 15,
            holdQueueMinutes: 60,
            jiraBoardId: 'board-123',
            monitoredEmails: ['platform-team@example.com'],
          },
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          healthStatus: 'healthy',
          pendingEscalations: 0,
        },
      },
      'proj-2': {
        project: {
          id: 'proj-2',
          name: 'Mobile App v2',
          description: 'Next generation mobile application with enhanced user experience and offline capabilities.',
          status: 'active' as ProjectStatus,
          source: 'jira',
          sourceProjectKey: 'MOB',
          autonomyLevel: 'tactical' as AutonomyLevel,
          config: {
            pollingIntervalMinutes: 15,
            holdQueueMinutes: 30,
            jiraBoardId: 'board-456',
            monitoredEmails: ['mobile-team@example.com'],
          },
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          healthStatus: 'warning',
          pendingEscalations: 1,
        },
      },
    };

    const projectData = mockProjects[id];

    if (!projectData) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(projectData);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}
