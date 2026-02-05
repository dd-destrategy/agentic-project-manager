/**
 * Hold Queue Lambda
 *
 * Processes held actions past their heldUntil timestamp.
 * Triggered by EventBridge every 1 minute.
 */

import type { Context, ScheduledEvent } from 'aws-lambda';
import { logger, getEnv } from '../shared/context.js';
import { DynamoDBClient } from '@agentic-pm/core/db/client';
import {
  HoldQueueService,
  type ActionExecutor,
  type HoldQueueProcessingResult,
} from '@agentic-pm/core/execution/hold-queue';
import type {
  EmailStakeholderPayload,
  JiraStatusChangePayload,
} from '@agentic-pm/core/db/repositories/held-action';
import { SESClient } from '@agentic-pm/core/integrations/ses';
import { JiraClient } from '@agentic-pm/core/integrations/jira';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface HoldQueueOutput {
  processed: number;
  executed: number;
  cancelled: number;
  errors: Array<{ actionId: string; error: string }>;
}

/**
 * Create an action executor with real integrations
 */
async function createActionExecutor(): Promise<ActionExecutor> {
  const secretsClient = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? 'ap-southeast-2',
  });

  // Lazily initialise clients to avoid loading secrets if not needed
  let sesClient: SESClient | null = null;
  let jiraClient: JiraClient | null = null;

  const getSESClient = async (): Promise<SESClient> => {
    if (sesClient) return sesClient;

    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: '/agentic-pm/ses/config',
      })
    );

    const config = JSON.parse(secretResponse.SecretString ?? '{}') as {
      fromAddress: string;
      region?: string;
    };

    sesClient = new SESClient({
      fromAddress: config.fromAddress,
      region: config.region,
    });

    return sesClient;
  };

  const getJiraClient = async (): Promise<JiraClient> => {
    if (jiraClient) return jiraClient;

    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: '/agentic-pm/jira/credentials',
      })
    );

    const credentials = JSON.parse(secretResponse.SecretString ?? '{}') as {
      baseUrl: string;
      email: string;
      apiToken: string;
    };

    jiraClient = new JiraClient(credentials);

    return jiraClient;
  };

  return {
    async executeEmail(payload: EmailStakeholderPayload): Promise<{ messageId: string }> {
      logger.info('Executing email action', {
        to: payload.to,
        subject: payload.subject,
      });

      const client = await getSESClient();
      const result = await client.sendEmail({
        to: payload.to,
        subject: payload.subject,
        bodyText: payload.bodyText,
        bodyHtml: payload.bodyHtml,
      });

      logger.info('Email sent successfully', { messageId: result.messageId });
      return result;
    },

    async executeJiraStatusChange(payload: JiraStatusChangePayload): Promise<void> {
      logger.info('Executing Jira status change', {
        issueKey: payload.issueKey,
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
      });

      const client = await getJiraClient();
      await client.transitionIssue(payload.issueKey, payload.transitionId);

      logger.info('Jira status change completed', {
        issueKey: payload.issueKey,
        toStatus: payload.toStatus,
      });
    },
  };
}

export async function handler(
  event: ScheduledEvent,
  context: Context
): Promise<HoldQueueOutput> {
  logger.setContext(context);

  logger.info('Hold queue processing started', {
    time: event.time,
    source: event.source,
  });

  const env = getEnv();
  const db = new DynamoDBClient(
    { region: process.env.AWS_REGION ?? 'ap-southeast-2' },
    env.TABLE_NAME
  );
  const holdQueueService = new HoldQueueService(db);

  let result: HoldQueueProcessingResult;

  try {
    // Create the action executor with real integrations
    const executor = await createActionExecutor();

    // Process the queue
    result = await holdQueueService.processQueue(executor);

    logger.info('Hold queue processing completed', {
      processed: result.processed,
      executed: result.executed,
      cancelled: result.cancelled,
      errorCount: result.errors.length,
    });

    // Log any errors
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        logger.warn('Action execution error', {
          actionId: error.actionId,
          error: error.error,
        });
      }
    }
  } catch (error) {
    logger.error(
      'Hold queue processing failed',
      error instanceof Error ? error : new Error(String(error))
    );

    return {
      processed: 0,
      executed: 0,
      cancelled: 0,
      errors: [
        {
          actionId: 'queue-processing',
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  return {
    processed: result.processed,
    executed: result.executed,
    cancelled: result.cancelled,
    errors: result.errors,
  };
}
