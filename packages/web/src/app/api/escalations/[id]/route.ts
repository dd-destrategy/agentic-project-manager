import { EscalationRepository } from '@agentic-pm/core/db/repositories';
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
import { decideEscalationSchema } from '@/schemas/api';

/**
 * GET /api/escalations/[id]
 *
 * Returns a specific escalation by ID.
 */
export async function GET(
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

    // Fetch escalation from DynamoDB
    // Note: We need projectId to query. In production, we'd use a GSI or get from query params
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return badRequest('projectId query parameter is required');
    }

    const db = getDbClient();
    const escalationRepo = new EscalationRepository(db);

    const escalation = await escalationRepo.getById(projectId, id);

    if (!escalation) {
      return notFound('Escalation not found');
    }

    return NextResponse.json(escalation);
  } catch (error) {
    console.error('Error fetching escalation:', error);
    return internalError('Failed to fetch escalation');
  }
}

/**
 * POST /api/escalations/[id]
 *
 * Record a decision on an escalation.
 * Body:
 * - decision: string (option ID selected)
 * - notes?: string (optional user notes)
 */
export async function POST(
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

    const result = decideEscalationSchema.safeParse(body);
    if (!result.success) {
      return validationError(
        'Invalid escalation decision',
        result.error.flatten()
      );
    }

    const { decision, notes } = result.data;

    // Get projectId from query params
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return badRequest('projectId query parameter is required');
    }

    // Record decision in DynamoDB (C03: singleton)
    const db = getDbClient();
    const escalationRepo = new EscalationRepository(db);

    const updatedEscalation = await escalationRepo.recordDecision(
      projectId,
      id,
      {
        userDecision: decision,
        userNotes: notes,
      }
    );

    if (!updatedEscalation) {
      return notFound('Escalation not found');
    }

    return NextResponse.json(updatedEscalation);
  } catch (error) {
    console.error('Error recording decision:', error);
    return internalError('Failed to record decision');
  }
}
