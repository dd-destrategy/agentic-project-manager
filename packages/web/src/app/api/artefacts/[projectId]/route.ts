import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { ArtefactType } from '@/types';

interface Artefact {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: string;
  version: number;
  updatedAt: string;
  createdAt: string;
}

interface ArtefactsResponse {
  artefacts: Artefact[];
  projectId: string;
}

/**
 * GET /api/artefacts/[projectId]
 *
 * Returns all artefacts for a specific project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // TODO: Fetch real artefacts from DynamoDB when agent runtime is deployed
    // For now, return mock data for frontend development
    const mockArtefacts: Artefact[] = [
      {
        id: `art-delivery-${projectId}`,
        projectId,
        type: 'delivery_state',
        content: JSON.stringify({
          sprintName: 'Sprint 12',
          sprintGoal: 'Complete authentication flow and API integration',
          velocity: { current: 32, average: 35, trend: 'stable' },
          burndown: { planned: 45, actual: 38, remaining: 7 },
          blockers: ['Waiting for API documentation from vendor'],
          highlights: ['Login flow completed ahead of schedule'],
        }),
        version: 5,
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `art-raid-${projectId}`,
        projectId,
        type: 'raid_log',
        content: JSON.stringify({
          risks: [
            {
              id: 'R1',
              description: 'Third-party API may have rate limits',
              probability: 'medium',
              impact: 'high',
              mitigation: 'Implement caching layer',
              status: 'open',
            },
          ],
          assumptions: [
            { id: 'A1', description: 'Backend team will maintain API backwards compatibility' },
          ],
          issues: [
            {
              id: 'I1',
              description: 'API documentation incomplete',
              assignee: 'PM',
              status: 'in_progress',
            },
          ],
          dependencies: [
            {
              id: 'D1',
              description: 'Design system components from Platform team',
              status: 'resolved',
            },
          ],
        }),
        version: 12,
        updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `art-backlog-${projectId}`,
        projectId,
        type: 'backlog_summary',
        content: JSON.stringify({
          totalItems: 45,
          byPriority: { critical: 2, high: 8, medium: 20, low: 15 },
          byStatus: { todo: 25, in_progress: 12, done: 8 },
          recentAdditions: ['User profile settings', 'Push notification preferences'],
          staleItems: ['Legacy export feature - no activity for 30 days'],
        }),
        version: 8,
        updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `art-decisions-${projectId}`,
        projectId,
        type: 'decision_log',
        content: JSON.stringify({
          decisions: [
            {
              id: 'DEC-1',
              date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              title: 'Use React Query for data fetching',
              context: 'Need consistent caching and refetching strategy',
              decision: 'Adopt TanStack Query (React Query) for all API calls',
              rationale: 'Built-in caching, polling, and devtools support',
              participants: ['Tech Lead', 'Senior Dev'],
            },
            {
              id: 'DEC-2',
              date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              title: 'Authentication provider',
              context: 'Need secure, simple auth for single-user app',
              decision: 'Use NextAuth.js with Credentials provider',
              rationale: 'Simple setup, JWT-based, no external dependencies',
              participants: ['PM', 'Tech Lead'],
            },
          ],
        }),
        version: 3,
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const response: ArtefactsResponse = {
      artefacts: mockArtefacts,
      projectId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching artefacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artefacts' },
      { status: 500 }
    );
  }
}
