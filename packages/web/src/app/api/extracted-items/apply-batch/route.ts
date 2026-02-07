import { applyExtractedItem } from '@agentic-pm/core/artefacts';
import { DynamoDBClient } from '@agentic-pm/core/db';
import { ExtractedItemRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

interface BatchApplyItem {
  id: string;
  sessionId: string;
}

interface BatchApplyRequest {
  itemIds: BatchApplyItem[];
  projectId: string;
}

interface BatchApplyResultEntry {
  id: string;
  success: boolean;
  artefactType?: string;
  error?: string;
}

/**
 * POST /api/extracted-items/apply-batch
 *
 * Apply multiple approved extracted items to their target project artefacts.
 * Body: { itemIds: Array<{ id: string, sessionId: string }>, projectId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = (await request.json()) as BatchApplyRequest;

    if (
      !body.itemIds ||
      !Array.isArray(body.itemIds) ||
      body.itemIds.length === 0
    ) {
      return NextResponse.json(
        { error: 'itemIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!body.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const db = new DynamoDBClient();
    const repo = new ExtractedItemRepository(db);

    const results: BatchApplyResultEntry[] = [];
    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const entry of body.itemIds) {
      // Fetch the item
      const item = await repo.getById(entry.sessionId, entry.id);

      if (!item) {
        results.push({
          id: entry.id,
          success: false,
          error: 'Item not found',
        });
        failedCount++;
        continue;
      }

      if (item.status !== 'approved') {
        results.push({
          id: entry.id,
          success: false,
          error: `Item is '${item.status}', not 'approved'`,
        });
        skippedCount++;
        continue;
      }

      // Apply the item
      const result = await applyExtractedItem(item, body.projectId, db);

      if (!result.success) {
        results.push({
          id: entry.id,
          success: false,
          artefactType: result.artefactType,
          error: result.error,
        });
        failedCount++;
        continue;
      }

      // Mark as applied
      await repo.markApplied(entry.sessionId, entry.id);

      results.push({
        id: entry.id,
        success: true,
        artefactType: result.artefactType,
      });
      appliedCount++;
    }

    return NextResponse.json({
      summary: {
        total: body.itemIds.length,
        applied: appliedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
      results,
    });
  } catch (error) {
    console.error('Error batch applying extracted items:', error);
    return NextResponse.json(
      { error: 'Failed to batch apply extracted items' },
      { status: 500 }
    );
  }
}
