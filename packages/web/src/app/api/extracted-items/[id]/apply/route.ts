import { applyExtractedItem } from '@agentic-pm/core/artefacts';
import { DynamoDBClient } from '@agentic-pm/core/db';
import { ExtractedItemRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * POST /api/extracted-items/[id]/apply
 *
 * Apply an approved extracted item to its target project artefact.
 * Query param: sessionId (required)
 * Body (optional): { projectId: string }
 */
export async function POST(
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

    // Fetch the item
    const item = await repo.getById(sessionId, id);
    if (!item) {
      return NextResponse.json(
        { error: 'Extracted item not found' },
        { status: 404 }
      );
    }

    // Validate status
    if (item.status !== 'approved') {
      return NextResponse.json(
        {
          error: `Item must be in 'approved' status to apply. Current status: '${item.status}'`,
        },
        { status: 400 }
      );
    }

    // Get projectId from body or item
    let projectId = item.projectId;
    try {
      const body = await request.json();
      if (body.projectId) {
        projectId = body.projectId;
      }
    } catch {
      // No body provided, use item's projectId
    }

    if (!projectId) {
      return NextResponse.json(
        {
          error:
            'projectId is required. Provide it in the request body or set it on the item.',
        },
        { status: 400 }
      );
    }

    // Apply the item to the artefact
    const result = await applyExtractedItem(item, projectId, db);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to apply extracted item' },
        { status: 500 }
      );
    }

    // Mark the item as applied
    const updated = await repo.markApplied(sessionId, id);

    return NextResponse.json({
      success: true,
      item: updated,
      artefactType: result.artefactType,
    });
  } catch (error) {
    console.error('Error applying extracted item:', error);
    return NextResponse.json(
      { error: 'Failed to apply extracted item' },
      { status: 500 }
    );
  }
}
