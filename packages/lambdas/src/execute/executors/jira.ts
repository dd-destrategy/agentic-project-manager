/**
 * Jira action executor
 *
 * Handles execution of Jira-related actions:
 * - Status transitions
 * - Adding comments
 * - Updating issue fields
 */

import { JiraClient } from '@agentic-pm/core/integrations/jira';
import type { JiraStatusChangePayload } from '@agentic-pm/core/db/repositories/held-action';
import { logger } from '../../shared/context.js';

/**
 * Execute a Jira status change action
 */
export async function executeJiraStatusChange(
  client: JiraClient,
  payload: JiraStatusChangePayload
): Promise<void> {
  logger.info('Executing Jira status change', {
    issueKey: payload.issueKey,
    fromStatus: payload.fromStatus,
    toStatus: payload.toStatus,
    transitionId: payload.transitionId,
  });

  try {
    // Execute the transition
    await client.transitionIssue(payload.issueKey, payload.transitionId);

    // Optionally add a comment if reason is provided
    if (payload.reason) {
      await client.addComment(
        payload.issueKey,
        `Status changed from "${payload.fromStatus}" to "${payload.toStatus}": ${payload.reason}`
      );
    }

    logger.info('Jira status change completed', {
      issueKey: payload.issueKey,
      toStatus: payload.toStatus,
    });
  } catch (error) {
    logger.error('Jira status change failed', error instanceof Error ? error : new Error(String(error)), {
      issueKey: payload.issueKey,
      fromStatus: payload.fromStatus,
      toStatus: payload.toStatus,
    });
    throw error;
  }
}

/**
 * Add a comment to a Jira issue
 */
export async function addJiraComment(
  client: JiraClient,
  issueKey: string,
  comment: string
): Promise<void> {
  logger.info('Adding Jira comment', {
    issueKey,
    commentLength: comment.length,
  });

  try {
    await client.addComment(issueKey, comment);

    logger.info('Jira comment added', { issueKey });
  } catch (error) {
    logger.error('Failed to add Jira comment', error instanceof Error ? error : new Error(String(error)), {
      issueKey,
    });
    throw error;
  }
}
