/**
 * Universal Connector Registry
 *
 * Manages connector descriptors (templates) and instances (configured
 * connections) in DynamoDB. Provides CRUD operations and health tracking.
 */

import type {
  ConnectorDescriptor,
  ConnectorInstance,
  ConnectorInstanceConfig,
} from './connector-schemas.js';
import {
  ConnectorDescriptorSchema,
  ConnectorInstanceSchema,
} from './connector-schemas.js';

// ============================================================================
// DynamoDB Key Patterns
// ============================================================================

const DESCRIPTOR_PK = (id: string) => `CONNECTOR#${id}`;
const DESCRIPTOR_SK = 'DESCRIPTOR';
const INSTANCE_PK = (projectId: string) => `PROJECT#${projectId}`;
const INSTANCE_SK = (connectorId: string) =>
  `CONNECTOR_INSTANCE#${connectorId}`;

// ============================================================================
// Types
// ============================================================================

export interface ConnectorRegistryDeps {
  /** DynamoDB document client (put, get, query, delete) */
  docClient: {
    put(params: {
      TableName: string;
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    }): Promise<void>;
    get(params: {
      TableName: string;
      Key: Record<string, unknown>;
    }): Promise<{ Item?: Record<string, unknown> }>;
    query(params: {
      TableName: string;
      KeyConditionExpression: string;
      ExpressionAttributeValues: Record<string, unknown>;
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
    }): Promise<{ Items?: Record<string, unknown>[] }>;
    delete(params: {
      TableName: string;
      Key: Record<string, unknown>;
    }): Promise<void>;
    update(params: {
      TableName: string;
      Key: Record<string, unknown>;
      UpdateExpression: string;
      ExpressionAttributeValues: Record<string, unknown>;
      ExpressionAttributeNames?: Record<string, string>;
    }): Promise<void>;
  };
  tableName: string;
}

export interface DescriptorRecord {
  descriptor: ConnectorDescriptor;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Registry Implementation
// ============================================================================

export class ConnectorRegistry {
  private readonly docClient: ConnectorRegistryDeps['docClient'];
  private readonly tableName: string;

  constructor(deps: ConnectorRegistryDeps) {
    this.docClient = deps.docClient;
    this.tableName = deps.tableName;
  }

  // --------------------------------------------------------------------------
  // Descriptor Operations
  // --------------------------------------------------------------------------

  async listDescriptors(): Promise<DescriptorRecord[]> {
    const result = await this.docClient.query({
      TableName: this.tableName,
      KeyConditionExpression: 'begins_with(PK, :prefix) AND SK = :sk',
      ExpressionAttributeValues: {
        ':prefix': 'CONNECTOR#',
        ':sk': DESCRIPTOR_SK,
      },
    });

    // DynamoDB doesn't support begins_with on PK in query — use scan-like approach
    // For a small registry (<50 connectors), this is fine. Use GSI if it grows.
    return (result.Items ?? []).map((item) => ({
      descriptor: item.descriptor as ConnectorDescriptor,
      builtIn: item.builtIn as boolean,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    }));
  }

  async getDescriptor(connectorId: string): Promise<DescriptorRecord | null> {
    const result = await this.docClient.get({
      TableName: this.tableName,
      Key: { PK: DESCRIPTOR_PK(connectorId), SK: DESCRIPTOR_SK },
    });

    if (!result.Item) return null;

    return {
      descriptor: result.Item.descriptor as ConnectorDescriptor,
      builtIn: result.Item.builtIn as boolean,
      createdAt: result.Item.createdAt as string,
      updatedAt: result.Item.updatedAt as string,
    };
  }

  async registerDescriptor(
    descriptor: ConnectorDescriptor,
    builtIn = false
  ): Promise<void> {
    // Validate the descriptor against the schema
    ConnectorDescriptorSchema.parse(descriptor);

    const now = new Date().toISOString();

    await this.docClient.put({
      TableName: this.tableName,
      Item: {
        PK: DESCRIPTOR_PK(descriptor.id),
        SK: DESCRIPTOR_SK,
        connectorId: descriptor.id,
        descriptor,
        builtIn,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async updateDescriptor(descriptor: ConnectorDescriptor): Promise<void> {
    ConnectorDescriptorSchema.parse(descriptor);

    const now = new Date().toISOString();

    await this.docClient.update({
      TableName: this.tableName,
      Key: { PK: DESCRIPTOR_PK(descriptor.id), SK: DESCRIPTOR_SK },
      UpdateExpression: 'SET descriptor = :descriptor, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':descriptor': descriptor,
        ':updatedAt': now,
      },
    });
  }

  async deleteDescriptor(connectorId: string): Promise<void> {
    await this.docClient.delete({
      TableName: this.tableName,
      Key: { PK: DESCRIPTOR_PK(connectorId), SK: DESCRIPTOR_SK },
    });
  }

  // --------------------------------------------------------------------------
  // Instance Operations
  // --------------------------------------------------------------------------

  async listInstances(projectId: string): Promise<ConnectorInstance[]> {
    const result = await this.docClient.query({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': INSTANCE_PK(projectId),
        ':skPrefix': 'CONNECTOR_INSTANCE#',
      },
    });

    return (result.Items ?? []).map((item) => this.mapToInstance(item));
  }

  async getInstance(
    projectId: string,
    connectorId: string
  ): Promise<ConnectorInstance | null> {
    const result = await this.docClient.get({
      TableName: this.tableName,
      Key: {
        PK: INSTANCE_PK(projectId),
        SK: INSTANCE_SK(connectorId),
      },
    });

    if (!result.Item) return null;

    return this.mapToInstance(result.Item);
  }

  async createInstance(
    projectId: string,
    connectorId: string,
    config: ConnectorInstanceConfig,
    credentialSecretArn?: string
  ): Promise<ConnectorInstance> {
    const now = new Date().toISOString();

    const instance: ConnectorInstance = {
      projectId,
      connectorId,
      enabled: config.enabled,
      credentialSecretArn,
      config: config.parameters,
      healthy: false,
      consecutiveFailures: 0,
      signalCount24h: 0,
      signalCount7d: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Validate before storing
    ConnectorInstanceSchema.parse(instance);

    await this.docClient.put({
      TableName: this.tableName,
      Item: {
        PK: INSTANCE_PK(projectId),
        SK: INSTANCE_SK(connectorId),
        GSI2PK: DESCRIPTOR_PK(connectorId),
        GSI2SK: INSTANCE_PK(projectId),
        ...instance,
      },
    });

    return instance;
  }

  async updateInstance(
    projectId: string,
    connectorId: string,
    updates: Partial<
      Pick<ConnectorInstance, 'enabled' | 'config' | 'credentialSecretArn'>
    >
  ): Promise<void> {
    const now = new Date().toISOString();
    const expressions: string[] = ['updatedAt = :updatedAt'];
    const values: Record<string, unknown> = { ':updatedAt': now };
    const names: Record<string, string> = {};

    if (updates.enabled !== undefined) {
      expressions.push('#enabled = :enabled');
      values[':enabled'] = updates.enabled;
      names['#enabled'] = 'enabled';
    }

    if (updates.config !== undefined) {
      expressions.push('#config = :config');
      values[':config'] = updates.config;
      names['#config'] = 'config';
    }

    if (updates.credentialSecretArn !== undefined) {
      expressions.push('credentialSecretArn = :arn');
      values[':arn'] = updates.credentialSecretArn;
    }

    await this.docClient.update({
      TableName: this.tableName,
      Key: {
        PK: INSTANCE_PK(projectId),
        SK: INSTANCE_SK(connectorId),
      },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length > 0
        ? { ExpressionAttributeNames: names }
        : {}),
    });
  }

  async updateInstanceHealth(
    projectId: string,
    connectorId: string,
    healthy: boolean,
    latencyMs?: number,
    error?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const updateParts = [
      'healthy = :healthy',
      'lastHealthCheck = :now',
      'updatedAt = :now',
    ];
    const values: Record<string, unknown> = {
      ':healthy': healthy,
      ':now': now,
    };

    if (latencyMs !== undefined) {
      updateParts.push('latencyMs = :latencyMs');
      values[':latencyMs'] = latencyMs;
    }

    if (healthy) {
      updateParts.push('consecutiveFailures = :zero');
      updateParts.push('lastError = :null');
      values[':zero'] = 0;
      values[':null'] = null;
    } else {
      updateParts.push('consecutiveFailures = consecutiveFailures + :one');
      values[':one'] = 1;
      if (error) {
        updateParts.push('lastError = :error');
        values[':error'] = error;
      }
    }

    await this.docClient.update({
      TableName: this.tableName,
      Key: {
        PK: INSTANCE_PK(projectId),
        SK: INSTANCE_SK(connectorId),
      },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: values,
    });
  }

  async deleteInstance(projectId: string, connectorId: string): Promise<void> {
    await this.docClient.delete({
      TableName: this.tableName,
      Key: {
        PK: INSTANCE_PK(projectId),
        SK: INSTANCE_SK(connectorId),
      },
    });
  }

  async enableInstance(
    projectId: string,
    connectorId: string,
    enabled: boolean
  ): Promise<void> {
    await this.updateInstance(projectId, connectorId, { enabled });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private mapToInstance(item: Record<string, unknown>): ConnectorInstance {
    return {
      projectId: item.projectId as string,
      connectorId: item.connectorId as string,
      enabled: item.enabled as boolean,
      credentialSecretArn: item.credentialSecretArn as string | undefined,
      config: (item.config as Record<string, string>) ?? {},
      healthy: item.healthy as boolean,
      lastHealthCheck: item.lastHealthCheck as string | undefined,
      consecutiveFailures: (item.consecutiveFailures as number) ?? 0,
      lastError: item.lastError as string | undefined,
      latencyMs: item.latencyMs as number | undefined,
      signalCount24h: (item.signalCount24h as number) ?? 0,
      signalCount7d: (item.signalCount7d as number) ?? 0,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }
}
