/**
 * Heartbeat Lambda
 *
 * First step in the agent cycle. Logs cycle start, checks agent health,
 * and verifies integration connectivity.
 */

import type { Context } from 'aws-lambda';
import { ulid } from 'ulid';
import {
  DynamoDBClient,
  ProjectRepository,
  EventRepository,
  AgentConfigRepository,
} from '@agentic-pm/core/db';
import { logger, getEnv } from '../shared/context.js';
import type { AgentCycleInput, HeartbeatOutput, IntegrationStatus } from '../shared/types.js';

// Initialise clients outside handler for connection reuse
let dbClient: DynamoDBClient | null = null;
let projectRepo: ProjectRepository | null = null;
let eventRepo: EventRepository | null = null;
let configRepo: AgentConfigRepository | null = null;

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
  }
  return { projectRepo: projectRepo!, eventRepo: eventRepo!, configRepo: configRepo! };
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

  const { projectRepo, eventRepo, configRepo } = getRepositories();

  try {
    // 1. Get active projects from DynamoDB
    const activeProjectsResult = await projectRepo.getActive({ limit: 10 });
    const activeProjects = activeProjectsResult.items.map((p) => p.id);

    logger.info('Active projects retrieved', {
      cycleId,
      count: activeProjects.length,
      projectIds: activeProjects,
    });

    // 2. Check integration health (stub for Sprint 1 - will be implemented in Sprint 3)
    const integrations: IntegrationStatus[] = [
      {
        name: 'jira',
        healthy: true,
        lastCheck: timestamp,
      },
    ];

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
        integrations: integrations.map((i) => ({ name: i.name, healthy: i.healthy })),
        housekeepingDue,
        budgetStatus: {
          dailySpendUsd: budgetStatus.dailySpendUsd,
          degradationTier: budgetStatus.degradationTier,
        },
      },
    });

    logger.info('Heartbeat completed', {
      cycleId,
      activeProjects: activeProjects.length,
      integrations: integrations.map((i) => ({ name: i.name, healthy: i.healthy })),
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
