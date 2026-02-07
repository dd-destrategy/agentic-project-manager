import { ArtefactRepository } from '@agentic-pm/core/db/repositories';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import {
  unauthorised,
  badRequest,
  notFound,
  internalError,
} from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import type { DecisionWithOutcome, DecisionsResponse } from '@/types';

/**
 * GET /api/decisions/[projectId]
 *
 * Returns decisions from the decision_log artefact for a project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const { projectId } = await params;

    if (!projectId) {
      return badRequest('Project ID is required');
    }

    const db = getDbClient();
    const artefactRepo = new ArtefactRepository(db);

    const artefact = await artefactRepo.get(projectId, 'decision_log');

    if (!artefact) {
      return NextResponse.json({
        decisions: [],
        projectId,
      } satisfies DecisionsResponse);
    }

    const content =
      typeof artefact.content === 'string'
        ? JSON.parse(artefact.content)
        : artefact.content;

    const decisions: DecisionWithOutcome[] = (content.decisions ?? []).map(
      (d: Record<string, unknown>) => ({
        id: d.id,
        title: d.title,
        context: d.context,
        decision: d.decision,
        rationale: d.rationale,
        madeBy: d.madeBy,
        date: d.date,
        status: d.status,
        optionsConsidered: d.optionsConsidered,
        relatedRaidItems: d.relatedRaidItems,
        outcome: d.outcome,
        outcomeDate: d.outcomeDate,
        outcomeStatus: d.outcomeStatus,
        reviewDate: d.reviewDate,
        lessonsLearned: d.lessonsLearned,
      })
    );

    const response: DecisionsResponse = {
      decisions,
      projectId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching decisions:', error);
    return internalError('Failed to fetch decisions');
  }
}

/**
 * PATCH /api/decisions/[projectId]
 *
 * Updates a decision's outcome fields in the decision_log artefact.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const { projectId } = await params;

    if (!projectId) {
      return badRequest('Project ID is required');
    }

    const body = await request.json();

    const {
      decisionId,
      outcome,
      outcomeDate,
      outcomeStatus,
      reviewDate,
      lessonsLearned,
    } = body;

    if (!decisionId) {
      return badRequest('Decision ID is required');
    }

    const db = getDbClient();
    const artefactRepo = new ArtefactRepository(db);

    const artefact = await artefactRepo.get(projectId, 'decision_log');

    if (!artefact) {
      return notFound('Decision log not found for this project');
    }

    const content =
      typeof artefact.content === 'string'
        ? JSON.parse(artefact.content)
        : artefact.content;

    const decisions = content.decisions ?? [];
    const decisionIndex = decisions.findIndex(
      (d: { id: string }) => d.id === decisionId
    );

    if (decisionIndex === -1) {
      return notFound(`Decision "${decisionId}" not found`);
    }

    // Update outcome fields
    if (outcome !== undefined) decisions[decisionIndex].outcome = outcome;
    if (outcomeDate !== undefined)
      decisions[decisionIndex].outcomeDate = outcomeDate;
    if (outcomeStatus !== undefined)
      decisions[decisionIndex].outcomeStatus = outcomeStatus;
    if (reviewDate !== undefined)
      decisions[decisionIndex].reviewDate = reviewDate;
    if (lessonsLearned !== undefined)
      decisions[decisionIndex].lessonsLearned = lessonsLearned;

    // Save back via update
    const updatedContent = { ...content, decisions };
    await artefactRepo.update(projectId, 'decision_log', updatedContent, {
      updatedBy: 'user',
      rationale: `Updated outcome for decision "${decisionId}"`,
    });

    return NextResponse.json({
      success: true,
      decision: decisions[decisionIndex],
    });
  } catch (error) {
    console.error('Error updating decision outcome:', error);
    return internalError('Failed to update decision outcome');
  }
}
