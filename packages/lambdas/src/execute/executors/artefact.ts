import type {
  AgentAction,
  ArtefactContent,
  ArtefactType,
} from '@agentic-pm/core';
import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { ArtefactRepository } from '@agentic-pm/core/db/repositories/artefact';

/**
 * Execute artefact update actions
 */
export async function executeArtefactAction(action: AgentAction) {
  const db = new DynamoDBClient();
  const repo = new ArtefactRepository(db);

  const projectId = action.projectId;
  const artefactType = action.detail?.target?.id as ArtefactType | undefined;
  const content = action.detail?.changes?.after as ArtefactContent | undefined;

  if (!projectId || !artefactType || !content) {
    return {
      success: false,
      executedAt: new Date().toISOString(),
      error: 'Missing required fields: projectId, artefactType, or content',
    };
  }

  // Update artefact content
  await repo.update(projectId, artefactType, content, {
    updatedBy: 'agent',
    rationale: `Agent action ${action.id}`,
  });

  return {
    success: true,
    executedAt: new Date().toISOString(),
    result: {
      type: 'artefact',
      projectId,
      artefactType,
    },
  };
}
