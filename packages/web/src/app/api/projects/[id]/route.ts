import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import { EventRepository } from '@agentic-pm/core/db/repositories/event';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
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
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Initialize DynamoDB repositories
    const dbClient = new DynamoDBClient();
    const projectRepo = new ProjectRepository(dbClient);
    const escalationRepo = new EscalationRepository(dbClient);
    const eventRepo = new EventRepository(dbClient);

    // Fetch project from DynamoDB
    const project = await projectRepo.getById(id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get pending escalations count
    const pendingEscalations = await escalationRepo.countPendingByProject(id);

    // Get latest activity from events
    const projectEvents = await eventRepo.getByProject(id, { limit: 1 });
    const lastActivity = projectEvents.items[0]?.createdAt ?? project.updatedAt;

    // Calculate health status
    const healthStatus = calculateHealthStatus(pendingEscalations, lastActivity);

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
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 *
 * Updates a project.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Initialize DynamoDB client and repository
    const dbClient = new DynamoDBClient();
    const projectRepo = new ProjectRepository(dbClient);

    // Check if project exists
    const existingProject = await projectRepo.getById(id);
    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Update project
    await projectRepo.update(id, body);

    // Fetch updated project
    const updatedProject = await projectRepo.getById(id);

    return NextResponse.json({ project: updatedProject });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
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
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    // Initialize DynamoDB client and repository
    const dbClient = new DynamoDBClient();
    const projectRepo = new ProjectRepository(dbClient);

    // Check if project exists
    const existingProject = await projectRepo.getById(id);
    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Archive project (soft delete)
    await projectRepo.update(id, { status: 'archived' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
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
