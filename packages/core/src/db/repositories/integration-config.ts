/**
 * Integration config repository
 *
 * Tracks integration health status, consecutive failures,
 * and last health check timestamps.
 *
 * Entity key pattern:
 *   PK = INTEGRATION#<name>
 *   SK = CONFIG
 */

import { KEY_PREFIX } from '../../constants.js';
import { DynamoDBClient } from '../client.js';

/**
 * Stored integration health config
 */
export interface IntegrationHealthConfig {
  /** Integration name (e.g. 'jira', 'ses', 'outlook') */
  name: string;
  /** Whether the integration is currently healthy */
  healthy: boolean;
  /** ISO 8601 timestamp of last health check */
  lastHealthCheck: string;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last error message, if any */
  lastError?: string;
  /** Latency of last health check in ms */
  latencyMs?: number;
  /** Additional details from last health check */
  details?: Record<string, unknown>;
  /** ISO 8601 timestamp of record creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Repository for integration health configuration
 */
export class IntegrationConfigRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get health config for a specific integration by name
   */
  async getByName(name: string): Promise<IntegrationHealthConfig | null> {
    return this.db.get<IntegrationHealthConfig>(
      `${KEY_PREFIX.INTEGRATION}${name}`,
      'CONFIG'
    );
  }

  /**
   * Get health configs for all known integrations
   */
  async getAll(): Promise<IntegrationHealthConfig[]> {
    const names = ['jira', 'ses', 'outlook'];
    const results = await Promise.all(
      names.map((name) => this.getByName(name))
    );
    return results.filter(
      (item): item is IntegrationHealthConfig => item !== null
    );
  }

  /**
   * Create or update an integration health config
   */
  async upsert(config: IntegrationHealthConfig): Promise<void> {
    await this.db.put({
      PK: `${KEY_PREFIX.INTEGRATION}${config.name}`,
      SK: 'CONFIG',
      ...config,
    });
  }

  /**
   * Update health status after a health check
   */
  async updateHealthStatus(
    name: string,
    healthy: boolean,
    details?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getByName(name);

    const consecutiveFailures = healthy
      ? 0
      : (existing?.consecutiveFailures ?? 0) + 1;

    const config: IntegrationHealthConfig = {
      name,
      healthy,
      lastHealthCheck: now,
      consecutiveFailures,
      lastError: error,
      latencyMs: (details?.latencyMs as number) ?? undefined,
      details,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.upsert(config);
  }
}
