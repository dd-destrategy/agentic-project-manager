/**
 * Jira Cloud integration client
 */

import type { RawSignal } from '../types/index.js';
import type { IntegrationHealthCheck, SignalSource } from './types.js';

/**
 * Configuration for Jira client
 */
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

/**
 * Jira Cloud API client
 */
export class JiraClient implements SignalSource {
  readonly source = 'jira' as const;
  private config: JiraConfig;
  private authHeader: string;

  constructor(config: JiraConfig) {
    this.config = config;
    this.authHeader = Buffer.from(
      `${config.email}:${config.apiToken}`
    ).toString('base64');
  }

  /**
   * Authenticate with Jira
   */
  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/rest/api/3/myself`, {
        headers: {
          Authorization: `Basic ${this.authHeader}`,
          Accept: 'application/json',
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch issues updated since checkpoint
   */
  async fetchDelta(checkpoint: string | null): Promise<{
    signals: RawSignal[];
    newCheckpoint: string;
  }> {
    const now = new Date().toISOString();

    // Build JQL query for recently updated issues
    const jql = checkpoint
      ? `updated >= "${checkpoint}" ORDER BY updated ASC`
      : 'updated >= -1d ORDER BY updated ASC';

    try {
      const response = await fetch(
        `${this.config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`,
        {
          headers: {
            Authorization: `Basic ${this.authHeader}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }

      const data = await response.json() as { issues?: unknown[] };
      const issues = data.issues ?? [];

      const signals: RawSignal[] = issues.map((issue) => ({
        source: 'jira' as const,
        timestamp: now,
        rawPayload: issue,
      }));

      return {
        signals,
        newCheckpoint: now,
      };
    } catch (error) {
      // On error, return empty signals but keep checkpoint
      console.error('Jira fetch error:', error);
      return {
        signals: [],
        newCheckpoint: checkpoint ?? now,
      };
    }
  }

  /**
   * Check Jira API health
   */
  async healthCheck(): Promise<IntegrationHealthCheck> {
    const start = Date.now();

    try {
      const response = await fetch(
        `${this.config.baseUrl}/rest/api/3/serverInfo`,
        {
          headers: {
            Authorization: `Basic ${this.authHeader}`,
            Accept: 'application/json',
          },
        }
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { version?: string };

      return {
        healthy: true,
        latencyMs,
        details: {
          version: data.version,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
