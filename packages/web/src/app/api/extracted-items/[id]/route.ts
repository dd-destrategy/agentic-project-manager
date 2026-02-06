import { DynamoDBClient } from '@agentic-pm/core/db';
import { ExtractedItemRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { updateExtractedItemSchema } from '@/schemas/ingest';

/**
 * PATCH /api/extracted-items/[id]
 *
 * Update an extracted item (inline editing).
 * Query param: sessionId (required)
 * Body: { title?, content?, type?, targetArtefact?, priority?, projectId? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId query parameter is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parseResult = updateExtractedItemSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const repo = new ExtractedItemRepository(db);

    const updated = await repo.update(sessionId, id, parseResult.data);
    if (!updated) {
      return NextResponse.json(
        { error: 'Extracted item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating extracted item:', error);
    return NextResponse.json(
      { error: 'Failed to update extracted item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/extracted-items/[id]
 *
 * Delete an extracted item permanently.
 * Query param: sessionId (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId query parameter is required' },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const repo = new ExtractedItemRepository(db);

    await repo.delete(sessionId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting extracted item:', error);
    return NextResponse.json(
      { error: 'Failed to delete extracted item' },
      { status: 500 }
    );
  }
}
