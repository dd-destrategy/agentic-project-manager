import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import { EventRepository } from '@agentic-pm/core/db/repositories/event';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { ProjectListResponse, ProjectSummary, Project } from '@/types';

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

    // Initialize DynamoDB repositories
    const dbClient = new DynamoDBClient();
    const projectRepo = new ProjectRepository(dbClient);
    const escalationRepo = new EscalationRepository(dbClient);
    const eventRepo = new EventRepository(dbClient);

    // Fetch active projects from DynamoDB
    const result = await projectRepo.getActive({ limit: 100 });

    // Enrich projects with summary information
    const projectSummaries: ProjectSummary[] = await Promise.all(
      result.items.map(async (project) => {
        // Get pending escalations count
        const pendingEscalations = await escalationRepo.countPendingByProject(
          project.id
        );

        // Get latest activity from events
        const projectEvents = await eventRepo.getByProject(project.id, {
          limit: 1,
        });
        const lastActivity =
          projectEvents.items[0]?.createdAt ?? project.updatedAt;

        // Calculate health status based on pending escalations and recent activity
        const healthStatus = calculateHealthStatus(
          pendingEscalations,
          lastActivity
        );

        return {
          id: project.id,
          name: project.name,
          status: project.status,
          source: project.source,
          sourceProjectKey: project.sourceProjectKey,
          autonomyLevel: project.autonomyLevel,
          healthStatus,
          pendingEscalations,
          lastActivity,
          updatedAt: project.updatedAt,
        };
      })
    );

    const response: ProjectListResponse = {
      projects: projectSummaries,
      count: projectSummaries.length,
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

/**
 * POST /api/projects
 *
 * Creates a new project.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, source, sourceProjectKey, autonomyLevel, config } =
      body;

    // Validate required fields
    if (!name || !source || !sourceProjectKey) {
      return NextResponse.json(
        { error: 'Missing required fields: name, source, sourceProjectKey' },
        { status: 400 }
      );
    }

    // Initialize DynamoDB client and repository
    const dbClient = new DynamoDBClient();
    const projectRepo = new ProjectRepository(dbClient);

    // Generate project ID (simple approach - can be improved)
    const projectId = `proj-${Date.now()}`;
    const now = new Date().toISOString();

    const newProject: Project = {
      id: projectId,
      name,
      description,
      status: 'active',
      source,
      sourceProjectKey,
      autonomyLevel: autonomyLevel ?? 'monitoring',
      config: config ?? {},
      createdAt: now,
      updatedAt: now,
    };

    await projectRepo.create(newProject);

    return NextResponse.json(
      { project: newProject },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}

/**
 * Calculate health status based on project metrics
 */
function calculateHealthStatus(
  pendingEscalations: number,
  lastActivity: string
): 'healthy' | 'warning' | 'error' {
  const hoursSinceActivity =
    (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);

  if (pendingEscalations >= 3) {
    return 'error';
  }
  if (pendingEscalations >= 1 || hoursSinceActivity > 48) {
    return 'warning';
  }
  return 'healthy';
}
