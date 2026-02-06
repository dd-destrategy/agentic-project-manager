import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import { EventRepository } from '@agentic-pm/core/db/repositories/event';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, validationError, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import { createProjectSchema } from '@/schemas/api';
import type { ProjectListResponse, ProjectSummary, Project } from '@/types';

/**
 * GET /api/projects
 *
 * Returns a list of all projects with summary information.
 * C04: Uses Promise.all to batch escalation counts and events in parallel
 * instead of sequential N+1 queries per project.
 * C10: Supports cursor-based pagination via query params.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '100', 10),
      100
    );

    // Initialise DynamoDB repositories (C03: singleton client)
    const dbClient = getDbClient();
    const projectRepo = new ProjectRepository(dbClient);
    const escalationRepo = new EscalationRepository(dbClient);
    const eventRepo = new EventRepository(dbClient);

    // Fetch active projects from DynamoDB with pagination
    const result = await projectRepo.getActive({ limit });

    // C04: Fetch all pending escalations in one query, then group by project
    const [allPendingEscalations, projectEventResults] = await Promise.all([
      escalationRepo.getPending({ limit: 500 }),
      Promise.all(
        result.items.map((project) =>
          eventRepo.getByProject(project.id, { limit: 1 })
        )
      ),
    ]);

    // Group pending escalation counts by projectId
    const escalationCountByProject = new Map<string, number>();
    for (const escalation of allPendingEscalations.items) {
      const count = escalationCountByProject.get(escalation.projectId) ?? 0;
      escalationCountByProject.set(escalation.projectId, count + 1);
    }

    // Build summaries using pre-fetched data
    const projectSummaries: ProjectSummary[] = result.items.map(
      (project, index) => {
        const pendingEscalations =
          escalationCountByProject.get(project.id) ?? 0;
        const lastActivity =
          projectEventResults[index]?.items[0]?.createdAt ?? project.updatedAt;
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
      }
    );

    const response: ProjectListResponse = {
      projects: projectSummaries,
      count: projectSummaries.length,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return internalError('Failed to fetch projects');
  }
}

/**
 * POST /api/projects
 *
 * Creates a new project. C05: Validated with Zod schema.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const body = await request.json();

    // C05: Validate with Zod schema
    const parseResult = createProjectSchema.safeParse(body);
    if (!parseResult.success) {
      return validationError(
        'Invalid project data',
        parseResult.error.flatten()
      );
    }

    const {
      name,
      description,
      source,
      sourceProjectKey,
      autonomyLevel,
      config,
    } = parseResult.data;

    // Initialise DynamoDB client and repository (C03: singleton)
    const dbClient = getDbClient();
    const projectRepo = new ProjectRepository(dbClient);

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

    return NextResponse.json({ project: newProject }, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return internalError('Failed to create project');
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
