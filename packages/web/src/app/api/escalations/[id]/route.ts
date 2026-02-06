import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { decideEscalationSchema } from '@/schemas/api';
import type { Escalation } from '@/types';
import { DynamoDBClient } from '@agentic-pm/core/db';
import { EscalationRepository } from '@agentic-pm/core/db/repositories';

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
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch escalation from DynamoDB
    // Note: We need projectId to query. In production, we'd use a GSI or get from query params
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId query parameter is required' },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const escalationRepo = new EscalationRepository(db);

    const escalation = await escalationRepo.getById(projectId, id);

    if (!escalation) {
      return NextResponse.json({ error: 'Escalation not found' }, { status: 404 });
    }

    return NextResponse.json(escalation);
  } catch (error) {
    console.error('Error fetching escalation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch escalation' },
      { status: 500 }
    );
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
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const result = decideEscalationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { decision, notes } = result.data;

    // Get projectId from query params
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId query parameter is required' },
        { status: 400 }
      );
    }

    // Record decision in DynamoDB
    const db = new DynamoDBClient();
    const escalationRepo = new EscalationRepository(db);

    const updatedEscalation = await escalationRepo.recordDecision(projectId, id, {
      userDecision: decision,
      userNotes: notes,
    });

    if (!updatedEscalation) {
      return NextResponse.json({ error: 'Escalation not found' }, { status: 404 });
    }

    return NextResponse.json(updatedEscalation);
  } catch (error) {
    console.error('Error recording decision:', error);
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 }
    );
  }
}
