import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import { EventRepository } from '@agentic-pm/core/db/repositories/event';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import {
  unauthorised,
  badRequest,
  notFound,
  validationError,
  internalError,
} from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import { updateProjectSchema } from '@/schemas/api';
import type { Project, HealthStatus } from '@/types';

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
      return unauthorised();
    }

    const { id } = await params;

    if (!id) {
      return badRequest('Project ID is required');
    }

    // Initialise DynamoDB repositories (C03: singleton)
    const dbClient = getDbClient();
    const projectRepo = new ProjectRepository(dbClient);
    const escalationRepo = new EscalationRepository(dbClient);
    const eventRepo = new EventRepository(dbClient);

    // Fetch project from DynamoDB
    const project = await projectRepo.getById(id);

    if (!project) {
      return notFound('Project not found');
    }

    // Get pending escalations count
    const pendingEscalations = await escalationRepo.countPendingByProject(id);

    // Get latest activity from events
    const projectEvents = await eventRepo.getByProject(id, { limit: 1 });
    const lastActivity = projectEvents.items[0]?.createdAt ?? project.updatedAt;

    // Calculate health status
    const healthStatus = calculateHealthStatus(
      pendingEscalations,
      lastActivity
    );

    const response: ProjectDetailResponse = {
      project: {
        ...project,
        healthStatus,
        pendingEscalations,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching project:', error);
    return internalError('Failed to fetch project');
  }
}

/**
 * PATCH /api/projects/[id]
 *
 * Updates a project. C02: Validated with Zod schema to prevent
 * arbitrary field injection.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const { id } = await params;
    const body = await request.json();

    // C02: Validate body against schema — only allows known fields
    const parseResult = updateProjectSchema.safeParse(body);
    if (!parseResult.success) {
      return validationError(
        'Invalid project update data',
        parseResult.error.flatten()
      );
    }

    const validatedBody = parseResult.data;

    // Initialise DynamoDB client and repository (C03: singleton)
    const dbClient = getDbClient();
    const projectRepo = new ProjectRepository(dbClient);

    // Check if project exists
    const existingProject = await projectRepo.getById(id);
    if (!existingProject) {
      return notFound('Project not found');
    }

    // Update project with validated fields only
    await projectRepo.update(id, validatedBody);

    // Fetch updated project
    const updatedProject = await projectRepo.getById(id);

    return NextResponse.json({ project: updatedProject });
  } catch (error) {
    console.error('Error updating project:', error);
    return internalError('Failed to update project');
  }
}

/**
 * DELETE /api/projects/[id]
 *
 * Archives a project (soft delete).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const { id } = await params;

    // Initialise DynamoDB client and repository (C03: singleton)
    const dbClient = getDbClient();
    const projectRepo = new ProjectRepository(dbClient);

    // Check if project exists
    const existingProject = await projectRepo.getById(id);
    if (!existingProject) {
      return notFound('Project not found');
    }

    // Archive project (soft delete)
    await projectRepo.update(id, { status: 'archived' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return internalError('Failed to delete project');
  }
}

/**
 * Calculate health status based on project metrics
 */
function calculateHealthStatus(
  pendingEscalations: number,
  lastActivity: string
): HealthStatus {
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
