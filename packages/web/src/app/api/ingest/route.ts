import { DynamoDBClient } from '@agentic-pm/core/db';
import { IngestionSessionRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { createIngestionSessionSchema } from '@/schemas/ingest';

/**
 * GET /api/ingest
 *
 * List ingestion sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status') as
      | 'active'
      | 'archived'
      | null;
    const limit = parseInt(
      request.nextUrl.searchParams.get('limit') ?? '20',
      10
    );

    const db = new DynamoDBClient();
    const repo = new IngestionSessionRepository(db);

    const result = await repo.list({
      status: status ?? 'active',
      limit,
    });

    return NextResponse.json({
      sessions: result.items,
      count: result.items.length,
    });
  } catch (error) {
    console.error('Error listing ingestion sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list ingestion sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ingest
 *
 * Create a new ingestion session.
 * Body: { title: string, projectId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const result = createIngestionSessionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.flatten() },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const repo = new IngestionSessionRepository(db);

    const ingestionSession = await repo.create({
      title: result.data.title,
      projectId: result.data.projectId,
    });

    return NextResponse.json(ingestionSession, { status: 201 });
  } catch (error) {
    console.error('Error creating ingestion session:', error);
    return NextResponse.json(
      { error: 'Failed to create ingestion session' },
      { status: 500 }
    );
  }
}
