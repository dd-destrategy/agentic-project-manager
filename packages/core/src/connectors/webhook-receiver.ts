/**
 * Webhook Receiver Gateway
 *
 * Processes inbound webhook payloads from any connector. Verifies signatures,
 * extracts event types, and maps payloads to NormalisedSignal format using
 * the connector's field mapping descriptor.
 *
 * Designed to sit behind API Gateway:
 *   POST /api/webhooks/{connectorId}/{projectId}
 */

import { UniversalAuthProvider, AuthError } from './auth-provider.js';
import type {
  ConnectorDescriptor,
  ConnectorInstance,
} from './connector-schemas.js';
import { FieldMappingEngine, extractPath } from './field-mapping-engine.js';
import type { MappedSignal } from './field-mapping-engine.js';

// ============================================================================
// Types
// ============================================================================

export interface WebhookRequest {
  connectorId: string;
  projectId: string;
  headers: Record<string, string>;
  body: string;
}

export interface WebhookResult {
  accepted: boolean;
  signals: MappedSignal[];
  eventType?: string;
  error?: string;
}

export interface WebhookReceiverDeps {
  /** Look up a connector descriptor by ID */
  getDescriptor: (connectorId: string) => Promise<ConnectorDescriptor | null>;
  /** Look up a connector instance */
  getInstance: (
    projectId: string,
    connectorId: string
  ) => Promise<ConnectorInstance | null>;
  /** Retrieve credentials for a connector instance */
  getCredentials: (secretArn: string) => Promise<Record<string, string>>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_BODY_SIZE = 256 * 1024; // 256KB

// ============================================================================
// Webhook Receiver
// ============================================================================

export class WebhookReceiver {
  private readonly authProvider: UniversalAuthProvider;
  private readonly fieldMapper: FieldMappingEngine;
  private readonly deps: WebhookReceiverDeps;

  constructor(deps: WebhookReceiverDeps) {
    this.authProvider = new UniversalAuthProvider();
    this.fieldMapper = new FieldMappingEngine();
    this.deps = deps;
  }

  /**
   * Process an inbound webhook request.
   */
  async processWebhook(request: WebhookRequest): Promise<WebhookResult> {
    // 1. Validate body size
    if (request.body.length > MAX_BODY_SIZE) {
      return {
        accepted: false,
        signals: [],
        error: `Payload exceeds maximum size of ${MAX_BODY_SIZE} bytes`,
      };
    }

    // 2. Look up connector descriptor
    const descriptor = await this.deps.getDescriptor(request.connectorId);
    if (!descriptor) {
      return {
        accepted: false,
        signals: [],
        error: `Unknown connector: ${request.connectorId}`,
      };
    }

    // 3. Verify connector supports webhooks
    const webhookConfig = this.getWebhookConfig(descriptor);
    if (!webhookConfig) {
      return {
        accepted: false,
        signals: [],
        error: `Connector ${request.connectorId} does not support webhooks`,
      };
    }

    // 4. Look up instance
    const instance = await this.deps.getInstance(
      request.projectId,
      request.connectorId
    );
    if (!instance) {
      return {
        accepted: false,
        signals: [],
        error: `No configured instance for connector ${request.connectorId} in project ${request.projectId}`,
      };
    }

    if (!instance.enabled) {
      return {
        accepted: false,
        signals: [],
        error: `Connector instance is disabled`,
      };
    }

    // 5. Verify signature if required
    if (webhookConfig.verification === 'signature') {
      const verified = await this.verifySignature(
        descriptor,
        instance,
        request
      );
      if (!verified) {
        return {
          accepted: false,
          signals: [],
          error: 'Webhook signature verification failed',
        };
      }
    }

    // 6. Parse body
    let payload: unknown;
    try {
      payload = JSON.parse(request.body);
    } catch {
      return {
        accepted: false,
        signals: [],
        error: 'Invalid JSON payload',
      };
    }

    // 7. Extract event type
    const eventType = String(
      extractPath(payload, webhookConfig.eventTypePath) ?? 'unknown'
    );

    // 8. Check if this event type is handled
    if (
      webhookConfig.eventTypes.length > 0 &&
      !webhookConfig.eventTypes.includes(eventType) &&
      !webhookConfig.eventTypes.includes('*')
    ) {
      return {
        accepted: true,
        signals: [],
        eventType,
        // Not an error — just an event type we don't care about
      };
    }

    // 9. Map to signals using field mapping
    const signals = this.fieldMapper.mapResponse(
      payload,
      descriptor.fieldMapping,
      request.connectorId,
      request.projectId
    );

    return {
      accepted: true,
      signals,
      eventType,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private getWebhookConfig(descriptor: ConnectorDescriptor) {
    const ingestion = descriptor.ingestion;
    if (ingestion.mode === 'webhook') return ingestion.webhook;
    if (ingestion.mode === 'polling_and_webhook') return ingestion.webhook;
    return null;
  }

  private async verifySignature(
    descriptor: ConnectorDescriptor,
    instance: ConnectorInstance,
    request: WebhookRequest
  ): Promise<boolean> {
    if (descriptor.auth.method !== 'webhook_secret') {
      // If auth isn't webhook_secret, we can't verify — accept
      return true;
    }

    if (!instance.credentialSecretArn) return false;

    try {
      const credentials = await this.deps.getCredentials(
        instance.credentialSecretArn
      );

      const signatureHeader =
        descriptor.auth.config.signatureHeader.toLowerCase();
      const signature =
        request.headers[signatureHeader] ??
        request.headers[descriptor.auth.config.signatureHeader];

      if (!signature) return false;

      return this.authProvider.verifyWebhookSignature(
        descriptor.auth,
        credentials,
        signature,
        request.body
      );
    } catch (err) {
      if (err instanceof AuthError) return false;
      throw err;
    }
  }
}
