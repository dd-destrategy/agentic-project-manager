/**
 * Checkpoint repository
 *
 * Stores last sync timestamps for integration polling.
 * Uses DynamoDB to persist checkpoint data across Lambda invocations.
 */

import { KEY_PREFIX } from '../../constants.js';
import type { AgentCheckpoint, IntegrationSource } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';

/**
 * Repository for checkpoint data
 *
 * Checkpoints track the last successful sync time for each integration
 * per project. This enables delta detection - only fetching changes
 * since the last sync.
 *
 * Key schema:
 * - PK: PROJECT#{projectId}
 * - SK: CHECKPOINT#{integration}#{checkpointKey}
 */
export class CheckpointRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a checkpoint value
   *
   * @param projectId - Project ID
   * @param integration - Integration source (jira, outlook, etc.)
   * @param checkpointKey - Specific checkpoint key (e.g., 'last_sync', 'last_webhook')
   */
  async get(
    projectId: string,
    integration: IntegrationSource,
    checkpointKey: string = 'last_sync'
  ): Promise<AgentCheckpoint | null> {
    return this.db.get<AgentCheckpoint>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.CHECKPOINT}${integration}#${checkpointKey}`
    );
  }

  /**
   * Get all checkpoints for a project
   */
  async getAllForProject(projectId: string): Promise<AgentCheckpoint[]> {
    const result = await this.db.query<AgentCheckpoint>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.CHECKPOINT
    );
    return result.items;
  }

  /**
   * Get all checkpoints for a specific integration across all projects
   */
  async getAllForIntegration(
    _integration: IntegrationSource
  ): Promise<AgentCheckpoint[]> {
    // This requires a scan or GSI - for now, return empty
    // In production, you might want a GSI on integration type
    console.warn(
      'getAllForIntegration not efficiently implemented - consider adding GSI'
    );
    return [];
  }

  /**
   * Set a checkpoint value
   *
   * @param projectId - Project ID
   * @param integration - Integration source
   * @param checkpointValue - The checkpoint value (usually an ISO timestamp)
   * @param checkpointKey - Specific checkpoint key (default: 'last_sync')
   */
  async set(
    projectId: string,
    integration: IntegrationSource,
    checkpointValue: string,
    checkpointKey: string = 'last_sync'
  ): Promise<AgentCheckpoint> {
    const now = new Date().toISOString();

    const checkpoint: AgentCheckpoint = {
      projectId,
      integration,
      checkpointKey,
      checkpointValue,
      updatedAt: now,
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.CHECKPOINT}${integration}#${checkpointKey}`,
      ...checkpoint,
    });

    return checkpoint;
  }

  /**
   * Update checkpoint only if the new value is more recent
   *
   * This prevents race conditions where an older checkpoint
   * might overwrite a newer one.
   *
   * @returns true if checkpoint was updated, false if skipped
   */
  async setIfNewer(
    projectId: string,
    integration: IntegrationSource,
    checkpointValue: string,
    checkpointKey: string = 'last_sync'
  ): Promise<boolean> {
    const existing = await this.get(projectId, integration, checkpointKey);

    // If no existing checkpoint, or new value is more recent, update
    if (!existing || checkpointValue > existing.checkpointValue) {
      await this.set(projectId, integration, checkpointValue, checkpointKey);
      return true;
    }

    return false;
  }

  /**
   * Delete a checkpoint
   */
  async delete(
    projectId: string,
    integration: IntegrationSource,
    checkpointKey: string = 'last_sync'
  ): Promise<void> {
    await this.db.delete(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.CHECKPOINT}${integration}#${checkpointKey}`
    );
  }

  /**
   * Delete all checkpoints for a project
   */
  async deleteAllForProject(projectId: string): Promise<void> {
    const checkpoints = await this.getAllForProject(projectId);

    for (const checkpoint of checkpoints) {
      await this.db.delete(
        `${KEY_PREFIX.PROJECT}${projectId}`,
        `${KEY_PREFIX.CHECKPOINT}${checkpoint.integration}#${checkpoint.checkpointKey}`
      );
    }
  }

  /**
   * Get the last sync time as a Date object
   *
   * Convenience method for common use case.
   */
  async getLastSyncTime(
    projectId: string,
    integration: IntegrationSource
  ): Promise<Date | null> {
    const checkpoint = await this.get(projectId, integration, 'last_sync');

    if (!checkpoint) {
      return null;
    }

    return new Date(checkpoint.checkpointValue);
  }

  /**
   * Set the last sync time
   *
   * Convenience method for common use case.
   */
  async setLastSyncTime(
    projectId: string,
    integration: IntegrationSource,
    timestamp: Date | string
  ): Promise<AgentCheckpoint> {
    const value =
      typeof timestamp === 'string' ? timestamp : timestamp.toISOString();

    return this.set(projectId, integration, value, 'last_sync');
  }

  /**
   * Initialise checkpoints for a new project
   *
   * Sets initial checkpoint to 24 hours ago to avoid fetching
   * too much historical data on first sync.
   */
  async initializeForProject(
    projectId: string,
    integrations: IntegrationSource[]
  ): Promise<AgentCheckpoint[]> {
    const initialCheckpoint = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const checkpoints: AgentCheckpoint[] = [];

    for (const integration of integrations) {
      const checkpoint = await this.set(
        projectId,
        integration,
        initialCheckpoint,
        'last_sync'
      );
      checkpoints.push(checkpoint);
    }

    return checkpoints;
  }
}

/**
 * Create a checkpoint repository with the given DynamoDB client
 */
export function createCheckpointRepository(
  db: DynamoDBClient
): CheckpointRepository {
  return new CheckpointRepository(db);
}
