/**
 * Heartbeat Lambda
 *
 * First step in the agent cycle. Logs cycle start, checks agent health,
 * and verifies integration connectivity.
 */

import type { Context } from 'aws-lambda';
import { ulid } from 'ulid';
import { logger, getEnv } from '../shared/context.js';
import type { AgentCycleInput, HeartbeatOutput, IntegrationStatus } from '../shared/types.js';

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

  // TODO: Implement in Sprint 1
  // 1. Get active projects from DynamoDB
  // 2. Check integration health (Jira, Outlook)
  // 3. Write heartbeat event to DynamoDB
  // 4. Determine if housekeeping is due (first cycle of day)

  const activeProjects: string[] = [];
  const integrations: IntegrationStatus[] = [
    {
      name: 'jira',
      healthy: true,
      lastCheck: timestamp,
    },
  ];

  // Check if housekeeping is due (first cycle after 8am)
  const hour = new Date().getHours();
  const housekeepingDue = hour === 8;

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
}
