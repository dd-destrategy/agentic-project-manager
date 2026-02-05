/**
 * Change Detection Lambda
 *
 * Polls Jira and Outlook APIs for changes since last checkpoint.
 * This is the gate that prevents unnecessary LLM calls when there are no changes.
 *
 * Key responsibilities:
 * 1. Retrieve checkpoints from DynamoDB for each active project
 * 2. Poll Jira for issues updated since checkpoint
 * 3. Update checkpoints in DynamoDB
 * 4. Return hasChanges: false if no changes detected (skips LLM processing)
 */

import { parseJiraCredentials } from '@agentic-pm/core';
import type { Project } from '@agentic-pm/core';
import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { CheckpointRepository } from '@agentic-pm/core/db/repositories/checkpoint';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import { JiraClient } from '@agentic-pm/core/integrations/jira';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import type { Context } from 'aws-lambda';

import { logger, getEnv } from '../shared/context.js';
import type {
  HeartbeatOutput,
  ChangeDetectionOutput,
  RawSignalBatch,
} from '../shared/types.js';

// Initialise clients outside handler for connection reuse
let dbClient: DynamoDBClient | null = null;
let secretsClient: SecretsManagerClient | null = null;

/**
 * Get or create DynamoDB client
 */
function getDbClient(): DynamoDBClient {
  if (!dbClient) {
    const env = getEnv();
    dbClient = new DynamoDBClient({}, env.TABLE_NAME);
  }
  return dbClient;
}

/**
 * Get or create Secrets Manager client
 */
function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({});
  }
  return secretsClient;
}

/**
 * Retrieve a secret from AWS Secrets Manager
 */
async function getSecret(secretId: string): Promise<string> {
  const client = getSecretsClient();
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretId} has no string value`);
  }

  return response.SecretString;
}

/**
 * Create Jira client from stored credentials
 */
async function createJiraClientFromSecrets(): Promise<JiraClient> {
  const secretValue = await getSecret('/agentic-pm/jira/credentials');
  const credentials = parseJiraCredentials(JSON.parse(secretValue));

  return new JiraClient(credentials);
}

/**
 * Poll Jira for changes for a specific project
 */
async function pollJiraForProject(
  project: Project,
  jiraClient: JiraClient,
  checkpointRepo: CheckpointRepository
): Promise<RawSignalBatch | null> {
  // Get last sync checkpoint
  const checkpoint = await checkpointRepo.get(project.id, 'jira', 'last_sync');
  const lastSync = checkpoint?.checkpointValue ?? null;

  logger.info('Polling Jira for project', {
    projectId: project.id,
    projectKey: project.sourceProjectKey,
    lastSync,
  });

  try {
    // Fetch changes since checkpoint
    const { signals, newCheckpoint } = await jiraClient.fetchDelta(
      lastSync,
      project.sourceProjectKey
    );

    // Update checkpoint if we got new data
    if (newCheckpoint !== lastSync) {
      await checkpointRepo.setIfNewer(
        project.id,
        'jira',
        newCheckpoint,
        'last_sync'
      );
    }

    logger.info('Jira polling complete', {
      projectId: project.id,
      signalCount: signals.length,
      newCheckpoint,
    });

    // Return null if no changes
    if (signals.length === 0) {
      return null;
    }

    // Return signal batch
    return {
      projectId: project.id,
      source: 'jira',
      signals: signals.map((s) => s.rawPayload),
      checkpoint: newCheckpoint,
    };
  } catch (error) {
    logger.error(
      'Jira polling failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        projectId: project.id,
        projectKey: project.sourceProjectKey,
      }
    );

    // Don't fail the entire cycle for one project
    return null;
  }
}

/**
 * Change Detection Lambda handler
 */
export async function handler(
  event: HeartbeatOutput,
  context: Context
): Promise<ChangeDetectionOutput> {
  logger.setContext(context);

  logger.info('Change detection started', {
    cycleId: event.cycleId,
    activeProjects: event.activeProjects.length,
    timestamp: event.timestamp,
  });

  const signals: RawSignalBatch[] = [];

  // Skip if no active projects
  if (event.activeProjects.length === 0) {
    logger.info('No active projects, skipping change detection');
    return {
      hasChanges: false,
      signals: [],
    };
  }

  const db = getDbClient();
  const projectRepo = new ProjectRepository(db);
  const checkpointRepo = new CheckpointRepository(db);

  // Create Jira client (shared across projects)
  let jiraClient: JiraClient | null = null;

  // Check if Jira integration is healthy
  const jiraIntegration = event.integrations.find((i) => i.name === 'jira');
  const jiraHealthy = jiraIntegration?.healthy ?? false;

  if (jiraHealthy) {
    try {
      jiraClient = await createJiraClientFromSecrets();
    } catch (error) {
      logger.error(
        'Failed to create Jira client',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // Process each active project
  for (const projectId of event.activeProjects) {
    const project = await projectRepo.getById(projectId);

    if (!project) {
      logger.warn('Project not found', { projectId });
      continue;
    }

    // Poll Jira if project uses Jira and client is available
    if (project.source === 'jira' && jiraClient) {
      const jiraSignals = await pollJiraForProject(
        project,
        jiraClient,
        checkpointRepo
      );

      if (jiraSignals) {
        signals.push(jiraSignals);
      }
    }

    // TODO: Poll Outlook when implemented (Phase 3)
    // if (project.config.monitoredEmails?.length && outlookClient) {
    //   const outlookSignals = await pollOutlookForProject(project, outlookClient, checkpointRepo);
    //   if (outlookSignals) {
    //     signals.push(outlookSignals);
    //   }
    // }
  }

  const hasChanges = signals.length > 0;
  const totalSignals = signals.reduce(
    (acc, batch) => acc + batch.signals.length,
    0
  );

  logger.info('Change detection completed', {
    cycleId: event.cycleId,
    hasChanges,
    signalBatches: signals.length,
    totalSignals,
  });

  return {
    hasChanges,
    signals,
  };
}
