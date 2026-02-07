/**
 * Connector Runtime
 *
 * Orchestrates the full lifecycle of a generic connector:
 * polling, field mapping, health checks, and signal production.
 *
 * This is the single entry point that the change-detection Lambda calls
 * for any connector that isn't a native SignalSource implementation.
 */

import { UniversalAuthProvider } from './auth-provider.js';
import type {
  ConnectorDescriptor,
  ConnectorInstance,
} from './connector-schemas.js';
import { FieldMappingEngine } from './field-mapping-engine.js';
import type { MappedSignal } from './field-mapping-engine.js';
import type { HttpClient } from './polling-engine.js';
import { GenericPollingEngine } from './polling-engine.js';

// ============================================================================
// Types
// ============================================================================

export interface ConnectorRuntimeDeps {
  httpClient: HttpClient;
  /** Retrieve credentials from Secrets Manager */
  getCredentials: (secretArn: string) => Promise<Record<string, string>>;
}

export interface PollResult {
  signals: MappedSignal[];
  newCheckpoint: string;
  apiCallCount: number;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

// ============================================================================
// Connector Runtime
// ============================================================================

export class ConnectorRuntime {
  private readonly pollingEngine: GenericPollingEngine;
  private readonly fieldMapper: FieldMappingEngine;
  private readonly authProvider: UniversalAuthProvider;
  private readonly deps: ConnectorRuntimeDeps;

  constructor(deps: ConnectorRuntimeDeps) {
    this.deps = deps;
    this.authProvider = new UniversalAuthProvider();
    this.fieldMapper = new FieldMappingEngine();
    this.pollingEngine = new GenericPollingEngine({
      httpClient: deps.httpClient,
      authProvider: this.authProvider,
    });
  }

  /**
   * Poll a connector for new/changed data and return normalised signals.
   */
  async poll(
    descriptor: ConnectorDescriptor,
    instance: ConnectorInstance,
    checkpoint: string | null
  ): Promise<PollResult> {
    // Validate connector supports polling
    const pollingConfig = this.getPollingConfig(descriptor);
    if (!pollingConfig) {
      throw new ConnectorRuntimeError(
        `Connector ${descriptor.id} does not support polling`
      );
    }

    // Retrieve credentials
    const credentials = instance.credentialSecretArn
      ? await this.deps.getCredentials(instance.credentialSecretArn)
      : {};

    // Execute polling
    const pollResult = await this.pollingEngine.fetchDelta(
      pollingConfig,
      descriptor.auth,
      credentials,
      checkpoint,
      instance.config
    );

    // Map raw responses to signals
    const allSignals: MappedSignal[] = [];
    for (const responseBody of pollResult.items) {
      const signals = this.fieldMapper.mapResponse(
        responseBody,
        descriptor.fieldMapping,
        descriptor.id,
        instance.projectId
      );
      allSignals.push(...signals);
    }

    return {
      signals: allSignals,
      newCheckpoint: pollResult.newCheckpoint,
      apiCallCount: pollResult.apiCallCount,
    };
  }

  /**
   * Run a health check against the connector's API.
   */
  async healthCheck(
    descriptor: ConnectorDescriptor,
    instance: ConnectorInstance
  ): Promise<HealthResult> {
    const credentials = instance.credentialSecretArn
      ? await this.deps.getCredentials(instance.credentialSecretArn)
      : {};

    return this.pollingEngine.healthCheck(
      descriptor.healthCheck.endpoint,
      descriptor.healthCheck.method,
      descriptor.healthCheck.expectStatus,
      descriptor.healthCheck.timeoutMs,
      descriptor.auth,
      credentials,
      instance.config
    );
  }

  /**
   * Test a connection with provided credentials (before saving).
   * Used in the setup flow to validate credentials before persisting.
   */
  async testConnection(
    descriptor: ConnectorDescriptor,
    credentials: Record<string, string>,
    parameters: Record<string, string>
  ): Promise<HealthResult> {
    return this.pollingEngine.healthCheck(
      descriptor.healthCheck.endpoint,
      descriptor.healthCheck.method,
      descriptor.healthCheck.expectStatus,
      descriptor.healthCheck.timeoutMs,
      descriptor.auth,
      credentials,
      parameters
    );
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getPollingConfig(descriptor: ConnectorDescriptor) {
    const ingestion = descriptor.ingestion;
    if (ingestion.mode === 'polling') return ingestion.polling;
    if (ingestion.mode === 'polling_and_webhook') return ingestion.polling;
    return null;
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class ConnectorRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorRuntimeError';
  }
}
