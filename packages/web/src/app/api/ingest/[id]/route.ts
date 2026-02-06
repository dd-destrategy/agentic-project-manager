import { DynamoDBClient } from '@agentic-pm/core/db';
import { IngestionSessionRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * GET /api/ingest/[id]
 *
 * Get a specific ingestion session with all messages.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    const db = new DynamoDBClient();
    const repo = new IngestionSessionRepository(db);

    const ingestionSession = await repo.getById(id);
    if (!ingestionSession) {
      return NextResponse.json(
        { error: 'Ingestion session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ingestionSession);
  } catch (error) {
    console.error('Error fetching ingestion session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ingestion session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingest/[id]
 *
 * Archive an ingestion session.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    const db = new DynamoDBClient();
    const repo = new IngestionSessionRepository(db);

    await repo.archive(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving ingestion session:', error);
    return NextResponse.json(
      { error: 'Failed to archive ingestion session' },
      { status: 500 }
    );
  }
}
