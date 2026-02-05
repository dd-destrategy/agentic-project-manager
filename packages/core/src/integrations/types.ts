/**
 * Integration module types
 */

import type { IntegrationSource, RawSignal } from '../types/index.js';

/**
 * Interface for signal sources (Jira, Outlook, etc.)
 */
export interface SignalSource {
  /** Name of the integration */
  source: IntegrationSource;

  /**
   * Authenticate with the service
   * @returns true if authentication successful
   */
  authenticate(): Promise<boolean>;

  /**
   * Fetch changes since last checkpoint
   * @param checkpoint - Last sync checkpoint
   * @returns Array of raw signals and new checkpoint
   */
  fetchDelta(checkpoint: string | null): Promise<{
    signals: RawSignal[];
    newCheckpoint: string;
  }>;

  /**
   * Check integration health
   */
  healthCheck(): Promise<IntegrationHealthCheck>;
}

/**
 * Result of an integration health check
 */
export interface IntegrationHealthCheck {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}
