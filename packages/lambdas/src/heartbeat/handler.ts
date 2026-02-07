/**
 * Heartbeat Lambda
 *
 * First step in the agent cycle. Logs cycle start, checks agent health,
 * and verifies integration connectivity.
 */

import {
  DynamoDBClient,
  ProjectRepository,
  EventRepository,
  AgentConfigRepository,
  IntegrationConfigRepository,
} from '@agentic-pm/core/db';
import type { IntegrationHealthCheck } from '@agentic-pm/core/integrations';
import { JiraClient } from '@agentic-pm/core/integrations/jira';
import { SESClient } from '@agentic-pm/core/integrations/ses';
import type { Context } from 'aws-lambda';
import { ulid } from 'ulid';

import { logger, getEnv, getCachedSecret } from '../shared/context.js';
import { metrics } from '../shared/metrics.js';
import type {
  AgentCycleInput,
  HeartbeatOutput,
  IntegrationStatus,
} from '../shared/types.js';

/** Timeout for individual health checks (ms) */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

// Initialise clients outside handler for connection reuse
let dbClient: DynamoDBClient | null = null;
let projectRepo: ProjectRepository | null = null;
let eventRepo: EventRepository | null = null;
let configRepo: AgentConfigRepository | null = null;
let integrationConfigRepo: IntegrationConfigRepository | null = null;

function getRepositories() {
  if (!dbClient) {
    const env = getEnv();
    dbClient = new DynamoDBClient(
      { region: process.env.AWS_REGION ?? 'ap-southeast-2' },
      env.TABLE_NAME
    );
    projectRepo = new ProjectRepository(dbClient);
    eventRepo = new EventRepository(dbClient);
    configRepo = new AgentConfigRepository(dbClient);
    integrationConfigRepo = new IntegrationConfigRepository(dbClient);
  }
  return {
    projectRepo: projectRepo!,
    eventRepo: eventRepo!,
    configRepo: configRepo!,
    integrationConfigRepo: integrationConfigRepo!,
  };
}

/**
 * Run a health check with a timeout
 */
async function withTimeout(
  promise: Promise<IntegrationHealthCheck>,
  timeoutMs: number
): Promise<IntegrationHealthCheck> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<IntegrationHealthCheck>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        healthy: false,
        latencyMs: timeoutMs,
        error: `Health check timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Perform real health checks against configured integrations
 */
async function checkIntegrationHealth(
  repo: IntegrationConfigRepository
): Promise<IntegrationStatus[]> {
  const timestamp = new Date().toISOString();

  const checks: Array<{
    name: string;
    check: () => Promise<IntegrationHealthCheck>;
  }> = [];

  // Jira health check
  checks.push({
    name: 'jira',
    check: async () => {
      const credentialsJson = await getCachedSecret(
        '/agentic-pm/jira/credentials'
      );
      const credentials = JSON.parse(credentialsJson) as {
        baseUrl: string;
        email: string;
        apiToken: string;
      };
      const client = new JiraClient(credentials);
      return client.healthCheck();
    },
  });

  // SES health check
  checks.push({
    name: 'ses',
    check: async () => {
      const sesConfigJson = await getCachedSecret('/agentic-pm/ses/config');
      const sesConfig = JSON.parse(sesConfigJson) as {
        fromAddress: string;
        region?: string;
      };
      const client = new SESClient(sesConfig);
      return client.healthCheck();
    },
  });

  // Run all checks in parallel with timeout
  const results = await Promise.allSettled(
    checks.map(async ({ name, check }) => {
      const result = await withTimeout(check(), HEALTH_CHECK_TIMEOUT_MS);
      // Record result in DynamoDB
      await repo.updateHealthStatus(
        name,
        result.healthy,
        { ...result.details, latencyMs: result.latencyMs },
        result.error
      );
      return { name, result };
    })
  );

  return results.map((settled, index) => {
    const name = checks[index]!.name;
    if (settled.status === 'fulfilled') {
      return {
        name,
        healthy: settled.value.result.healthy,
        lastCheck: timestamp,
        error: settled.value.result.error,
      };
    }
    // Promise.allSettled rejected — unexpected error
    const errorMsg =
      settled.reason instanceof Error
        ? settled.reason.message
        : 'Unknown error';
    // Best-effort record failure
    repo.updateHealthStatus(name, false, undefined, errorMsg).catch(() => {});
    return {
      name,
      healthy: false,
      lastCheck: timestamp,
      error: errorMsg,
    };
  });
}

export async function handler(
  event: AgentCycleInput,
  context: Context
): Promise<HeartbeatOutput> {
  logger.setContext(context);
  const env = getEnv();

  const cycleId = ulid();
  const timestamp = new Date().toISOString();

  logger.info('Heartbeat started', {
    cycleId,
    source: event.source,
    environment: env.ENVIRONMENT,
  });

  const { projectRepo, eventRepo, configRepo, integrationConfigRepo } =
    getRepositories();

  try {
    // 1. Get active projects from DynamoDB
    const activeProjectsResult = await projectRepo.getActive({ limit: 10 });
    const activeProjects = activeProjectsResult.items.map((p) => p.id);

    logger.info('Active projects retrieved', {
      cycleId,
      count: activeProjects.length,
      projectIds: activeProjects,
    });

    // 2. Check integration health with real calls
    let integrations: IntegrationStatus[];
    try {
      integrations = await checkIntegrationHealth(integrationConfigRepo);
    } catch (healthError) {
      logger.warn('Integration health checks failed, using defaults', {
        cycleId,
        error:
          healthError instanceof Error ? healthError.message : 'Unknown error',
      });
      integrations = [
        {
          name: 'jira',
          healthy: false,
          lastCheck: timestamp,
          error: 'Health check failed',
        },
        {
          name: 'ses',
          healthy: false,
          lastCheck: timestamp,
          error: 'Health check failed',
        },
      ];
    }

    // 3. Get budget status
    const budgetStatus = await configRepo.getBudgetStatus();

    logger.info('Budget status', {
      cycleId,
      dailySpend: budgetStatus.dailySpendUsd,
      dailyLimit: budgetStatus.dailyLimitUsd,
      monthlySpend: budgetStatus.monthlySpendUsd,
      degradationTier: budgetStatus.degradationTier,
    });

    // 4. Determine if housekeeping is due
    const housekeepingDue = await configRepo.isHousekeepingDue();

    // 5. Update last heartbeat timestamp
    await configRepo.updateLastHeartbeat();

    // 6. Write heartbeat event to DynamoDB
    await eventRepo.createHeartbeat(cycleId, false, {
      metrics: {
        durationMs: Date.now() - new Date(timestamp).getTime(),
      },
      context: {
        activeProjects: activeProjects.length,
        integrations: integrations.map((i) => ({
          name: i.name,
          healthy: i.healthy,
        })),
        housekeepingDue,
        budgetStatus: {
          dailySpendUsd: budgetStatus.dailySpendUsd,
          degradationTier: budgetStatus.degradationTier,
        },
      },
    });

    // 7. Emit dead man's switch heartbeat metric
    metrics.increment('AgentHeartbeatEmitted');
    await metrics.flush();

    logger.info('Heartbeat completed', {
      cycleId,
      activeProjects: activeProjects.length,
      integrations: integrations.map((i) => ({
        name: i.name,
        healthy: i.healthy,
      })),
      housekeepingDue,
    });

    return {
      cycleId,
      timestamp,
      activeProjects,
      integrations,
      housekeepingDue,
    };
  } catch (error) {
    logger.error('Heartbeat failed', error as Error, { cycleId });

    // Try to log error event
    try {
      await eventRepo.createError(error as Error, undefined, { cycleId });
    } catch {
      // Ignore error logging failure
    }

    throw error;
  }
}
