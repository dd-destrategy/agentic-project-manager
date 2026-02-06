import { ArtefactRepository } from '@agentic-pm/core/artefacts/repository';
import { getDynamoDBClient } from '@agentic-pm/core/db/client';
import type { Action } from '@agentic-pm/core/schemas/action';

/**
 * Execute artefact update actions
 */
export async function executeArtefactAction(action: Action) {
  const db = getDynamoDBClient();
  const repo = new ArtefactRepository(db);

  // Update artefact content
  await repo.updateArtefact(
    action.payload.projectId,
    action.payload.artefactType,
    action.payload.content,
    {
      trigger: 'agent_action',
      actionId: action.id,
      timestamp: new Date().toISOString(),
    }
  );

  return {
    success: true,
    executedAt: new Date().toISOString(),
    result: {
      type: 'artefact',
      projectId: action.payload.projectId,
      artefactType: action.payload.artefactType,
    },
  };
}
