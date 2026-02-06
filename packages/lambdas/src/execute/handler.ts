/**
 * Execute Lambda
 *
 * Executes auto-approved actions, queues hold items, and creates escalations.
 * This Lambda HAS access to integration credentials.
 */

import type { Context } from 'aws-lambda';
import {
  DynamoDBClient,
  EventRepository,
  EscalationRepository,
} from '@agentic-pm/core';
import { HoldQueueService } from '@agentic-pm/core/execution/hold-queue';
import type {
  HeldActionType,
  EmailStakeholderPayload,
  JiraStatusChangePayload,
} from '@agentic-pm/core/db/repositories/held-action';

import { logger, getEnv } from '../shared/context.js';
import type { ReasoningOutput, ExecuteOutput, ProposedAction } from '../shared/types.js';

/**
 * Decision boundary thresholds
 */
const DECISION_BOUNDARIES = {
  // Actions with confidence >= this threshold are auto-executed
  AUTO_EXECUTE_THRESHOLD: 0.95,
  // Actions with confidence >= this threshold are held
  HOLD_THRESHOLD: 0.7,
  // Actions below this threshold are escalated
  ESCALATE_THRESHOLD: 0.7,
};

/**
 * Map proposed action to held action type
 */
function mapToHeldActionType(actionType: string): HeldActionType | null {
  // Map reasoning action types to held action types
  const typeMap: Record<string, HeldActionType> = {
    email_stakeholder: 'email_stakeholder',
    jira_status_change: 'jira_status_change',
    send_email: 'email_stakeholder',
    update_jira_status: 'jira_status_change',
    transition_jira: 'jira_status_change',
  };

  return typeMap[actionType] || null;
}

/**
 * Extract payload from proposed action
 */
function extractPayload(
  action: ProposedAction
): EmailStakeholderPayload | JiraStatusChangePayload | null {
  const heldActionType = mapToHeldActionType(action.actionType);

  if (!heldActionType) {
    return null;
  }

  // Extract payload based on action type
  switch (heldActionType) {
    case 'email_stakeholder':
      return {
        to: (action.details.to as string[]) || [],
        subject: (action.details.subject as string) || '',
        bodyText: (action.details.bodyText as string) || '',
        bodyHtml: (action.details.bodyHtml as string) || undefined,
        context: action.rationale,
      };

    case 'jira_status_change':
      return {
        issueKey: (action.details.issueKey as string) || '',
        transitionId: (action.details.transitionId as string) || '',
        transitionName: (action.details.transitionName as string) || '',
        fromStatus: (action.details.fromStatus as string) || '',
        toStatus: (action.details.toStatus as string) || '',
        reason: action.rationale,
      };

    default:
      return null;
  }
}

/**
 * Compute confidence score for an action
 *
 * This is a placeholder implementation. In a real system, this would
 * use ML models or heuristics to determine confidence.
 */
function computeConfidence(action: ProposedAction): number {
  // For now, use a simple heuristic:
  // - Actions with detailed rationale get higher confidence
  // - Actions with required fields populated get higher confidence
  let confidence = 0.5;

  // Boost confidence if rationale is detailed
  if (action.rationale && action.rationale.length > 50) {
    confidence += 0.2;
  }

  // Boost confidence if all required fields are present
  const requiredFields = Object.keys(action.details);
  if (requiredFields.length >= 3) {
    confidence += 0.2;
  }

  // Cap at 0.9 for now (we're not 100% confident without ML)
  return Math.min(confidence, 0.9);
}

/**
 * Create an escalation for an action that requires approval
 */
async function createEscalation(
  db: DynamoDBClient,
  action: ProposedAction,
  reason: string
): Promise<void> {
  const escalationRepo = new EscalationRepository(db);
  const eventRepo = new EventRepository(db);

  await escalationRepo.create({
    projectId: action.projectId,
    title: `Action requires approval: ${action.actionType}`,
    context: {
      summary: `${reason}\n\nAction Type: ${action.actionType}\nRationale: ${action.rationale || 'Not provided'}`,
      triggeringSignals: [],
      relevantArtefacts: [],
      precedents: [],
    },
    options: [
      {
        id: 'approve',
        label: 'Approve Action',
        description: 'Execute this action as proposed by the agent',
        pros: ['Allows agent to take action', 'Maintains automation'],
        cons: ['May have unforeseen consequences'],
        riskLevel: 'medium' as const,
      },
      {
        id: 'reject',
        label: 'Reject Action',
        description: 'Do not execute this action',
        pros: ['Prevents potentially incorrect action', 'Allows manual review'],
        cons: ['Requires manual intervention', 'Delays response'],
        riskLevel: 'low' as const,
      },
    ],
    agentRecommendation: 'approve',
    agentRationale: action.rationale,
    expiresInDays: 7,
  });

  // Log escalation event
  await eventRepo.create({
    projectId: action.projectId,
    eventType: 'escalation_created',
    severity: 'warning',
    summary: `Escalated action: ${action.actionType}`,
    detail: {
      context: {
        actionType: action.actionType,
        reason,
      },
    },
  });

  logger.info('Escalation created', {
    projectId: action.projectId,
    actionType: action.actionType,
    reason,
  });
}

/**
 * Process a single proposed action
 */
async function processAction(
  db: DynamoDBClient,
  holdQueueService: HoldQueueService,
  action: ProposedAction
): Promise<'executed' | 'held' | 'escalated'> {
  // Map to held action type
  const heldActionType = mapToHeldActionType(action.actionType);

  if (!heldActionType) {
    logger.warn('Unknown action type, escalating', {
      actionType: action.actionType,
      projectId: action.projectId,
    });
    await createEscalation(db, action, 'Unknown action type');
    return 'escalated';
  }

  // Extract payload
  const payload = extractPayload(action);

  if (!payload) {
    logger.warn('Failed to extract payload, escalating', {
      actionType: action.actionType,
      projectId: action.projectId,
    });
    await createEscalation(db, action, 'Invalid action payload');
    return 'escalated';
  }

  // Compute confidence
  const confidence = computeConfidence(action);

  logger.info('Processing action', {
    actionType: action.actionType,
    projectId: action.projectId,
    confidence,
  });

  // Decision logic based on confidence
  if (confidence < DECISION_BOUNDARIES.ESCALATE_THRESHOLD) {
    // Low confidence - escalate for manual review
    await createEscalation(
      db,
      action,
      `Low confidence (${confidence.toFixed(2)}). Requires manual review.`
    );
    return 'escalated';
  }

  // Queue the action with appropriate hold time
  await holdQueueService.queueAction({
    projectId: action.projectId,
    actionType: heldActionType,
    payload,
    holdMinutes: 0, // Let graduation system determine hold time
  });

  logger.info('Action queued', {
    actionType: action.actionType,
    projectId: action.projectId,
  });

  return 'held';
}

export async function handler(
  event: ReasoningOutput,
  context: Context
): Promise<ExecuteOutput> {
  logger.setContext(context);

  logger.info('Execution started', {
    proposedActions: event.proposedActions.length,
  });

  const env = getEnv();
  const db = new DynamoDBClient(
    { region: process.env.AWS_REGION ?? 'ap-southeast-2' },
    env.TABLE_NAME
  );
  const holdQueueService = new HoldQueueService(db);

  let executed = 0;
  let held = 0;
  let escalations = 0;

  // Process each proposed action
  for (const action of event.proposedActions) {
    try {
      const result = await processAction(db, holdQueueService, action);

      switch (result) {
        case 'executed':
          executed++;
          break;
        case 'held':
          held++;
          break;
        case 'escalated':
          escalations++;
          break;
      }
    } catch (error) {
      logger.error(
        'Failed to process action',
        error instanceof Error ? error : new Error(String(error)),
        {
          actionType: action.actionType,
          projectId: action.projectId,
        }
      );

      // Escalate on error
      try {
        await createEscalation(
          db,
          action,
          `Processing error: ${error instanceof Error ? error.message : String(error)}`
        );
        escalations++;
      } catch (escalationError) {
        logger.error(
          'Failed to create escalation',
          escalationError instanceof Error ? escalationError : new Error(String(escalationError))
        );
      }
    }
  }

  logger.info('Execution completed', {
    executed,
    held,
    escalations,
  });

  return {
    executed,
    held,
    escalations,
  };
}
