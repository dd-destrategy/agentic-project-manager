/**
 * Universal Connector Framework — Zod Schemas
 *
 * Defines the validation schemas for connector descriptors, instances,
 * and all sub-components (auth, polling, webhooks, field mapping).
 */

import { z } from 'zod';

// ============================================================================
// Enums & Primitives
// ============================================================================

export const ConnectorCategorySchema = z.enum([
  'project_management',
  'communication',
  'code_devops',
  'documents',
  'monitoring',
  'custom',
]);

export const ConnectorKindSchema = z.enum(['native', 'generic']);

export const ConnectorInstanceStatusSchema = z.enum([
  'connected',
  'disconnected',
  'error',
  'pending',
  'testing',
]);

// ============================================================================
// Credential Fields
// ============================================================================

export const CredentialFieldSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'password', 'url']),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
});

// ============================================================================
// Auth Descriptors
// ============================================================================

export const OAuth2ConfigSchema = z.object({
  authoriseUrl: z.string().url(),
  tokenUrl: z.string().url(),
  scopes: z.array(z.string()),
  credentialFields: z.array(CredentialFieldSchema),
});

export const ApiKeyConfigSchema = z.object({
  delivery: z.enum(['header', 'query', 'bearer']),
  paramName: z.string().min(1).max(100),
  credentialFields: z.array(CredentialFieldSchema),
});

export const PatConfigSchema = z.object({
  delivery: z.enum(['header', 'bearer']),
  paramName: z.string().min(1).max(100),
  credentialFields: z.array(CredentialFieldSchema),
});

export const BasicAuthConfigSchema = z.object({
  credentialFields: z.array(CredentialFieldSchema),
});

export const WebhookSecretConfigSchema = z.object({
  signatureHeader: z.string().min(1),
  algorithm: z.enum(['hmac-sha256', 'hmac-sha1']),
  credentialFields: z.array(CredentialFieldSchema),
});

export const AuthDescriptorSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('oauth2'), config: OAuth2ConfigSchema }),
  z.object({ method: z.literal('api_key'), config: ApiKeyConfigSchema }),
  z.object({ method: z.literal('pat'), config: PatConfigSchema }),
  z.object({ method: z.literal('basic'), config: BasicAuthConfigSchema }),
  z.object({
    method: z.literal('webhook_secret'),
    config: WebhookSecretConfigSchema,
  }),
  z.object({ method: z.literal('none') }),
]);

// ============================================================================
// Delta Strategies
// ============================================================================

export const TimestampFilterDeltaSchema = z.object({
  type: z.literal('timestamp_filter'),
  queryParam: z.string().min(1),
  format: z.enum(['iso8601', 'unix', 'unix_ms']),
});

export const DeltaTokenDeltaSchema = z.object({
  type: z.literal('delta_token'),
  tokenPath: z.string().min(1),
  tokenParam: z.string().min(1),
});

export const CursorDeltaSchema = z.object({
  type: z.literal('cursor'),
  cursorPath: z.string().min(1),
  cursorParam: z.string().min(1),
});

export const SinceIdDeltaSchema = z.object({
  type: z.literal('since_id'),
  idPath: z.string().min(1),
  idParam: z.string().min(1),
});

export const DeltaStrategySchema = z.discriminatedUnion('type', [
  TimestampFilterDeltaSchema,
  DeltaTokenDeltaSchema,
  CursorDeltaSchema,
  SinceIdDeltaSchema,
]);

// ============================================================================
// Pagination
// ============================================================================

export const PaginationDescriptorSchema = z.object({
  type: z.enum(['offset', 'cursor', 'link_header']),
  nextPath: z.string().optional(),
  nextParam: z.string().optional(),
  totalPath: z.string().optional(),
  pageSize: z.number().int().min(1).max(1000),
});

// ============================================================================
// Ingestion Descriptors
// ============================================================================

export const PollingConfigSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(['GET', 'POST']),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  delta: DeltaStrategySchema,
  rateLimitRpm: z.number().int().min(1).max(1000),
  pagination: PaginationDescriptorSchema.optional(),
});

export const WebhookConfigSchema = z.object({
  eventTypes: z.array(z.string()),
  eventTypePath: z.string().min(1),
  verification: z.enum(['signature', 'token', 'none']),
});

export const IngestionDescriptorSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('polling'), polling: PollingConfigSchema }),
  z.object({ mode: z.literal('webhook'), webhook: WebhookConfigSchema }),
  z.object({
    mode: z.literal('polling_and_webhook'),
    polling: PollingConfigSchema,
    webhook: WebhookConfigSchema,
  }),
]);

// ============================================================================
// Field Mapping
// ============================================================================

export const SignalTypeRuleSchema = z.object({
  when: z.string().min(1),
  operator: z.enum(['equals', 'contains', 'exists', 'matches']),
  value: z.string().optional(),
  then: z.string().min(1),
});

export const PriorityRuleSchema = z.object({
  when: z.string().min(1),
  operator: z.enum(['equals', 'contains', 'in']),
  value: z.union([z.string(), z.array(z.string())]),
  then: z.enum(['critical', 'high', 'medium', 'low']),
});

export const FieldMappingDescriptorSchema = z.object({
  itemsPath: z.string().min(1),
  idPath: z.string().min(1),
  timestampPath: z.string().min(1),
  summaryTemplate: z.string().min(1).max(500),
  signalTypeRules: z.array(SignalTypeRuleSchema).min(1),
  priorityMapping: z.array(PriorityRuleSchema).optional(),
  participantsPath: z.string().optional(),
  tagsPath: z.string().optional(),
  relatedItemsPath: z.string().optional(),
  rawFields: z.array(z.string()).optional(),
});

// ============================================================================
// Health Check
// ============================================================================

export const HealthCheckDescriptorSchema = z.object({
  endpoint: z.string().min(1),
  method: z.enum(['GET', 'HEAD']),
  expectStatus: z.number().int().min(100).max(599),
  timeoutMs: z.number().int().min(1000).max(30000),
});

// ============================================================================
// Connector Descriptor (complete)
// ============================================================================

export const ConnectorDescriptorSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: ConnectorCategorySchema,
  icon: z.string().min(1).max(100),
  kind: ConnectorKindSchema,
  auth: AuthDescriptorSchema,
  ingestion: IngestionDescriptorSchema,
  fieldMapping: FieldMappingDescriptorSchema,
  healthCheck: HealthCheckDescriptorSchema,
  version: z.string().min(1).max(20),
});

// ============================================================================
// Connector Instance (a configured connection)
// ============================================================================

export const ConnectorInstanceConfigSchema = z.object({
  /** Key-value pairs for endpoint templates (baseUrl, projectKey, etc.) */
  parameters: z.record(z.string()),
  /** Whether to enable this connector immediately */
  enabled: z.boolean().default(true),
});

export const ConnectorInstanceSchema = z.object({
  projectId: z.string().uuid(),
  connectorId: z.string().min(1).max(50),
  enabled: z.boolean(),
  credentialSecretArn: z.string().optional(),
  config: z.record(z.string()),
  healthy: z.boolean(),
  lastHealthCheck: z.string().datetime().optional(),
  consecutiveFailures: z.number().int().min(0),
  lastError: z.string().optional(),
  latencyMs: z.number().optional(),
  signalCount24h: z.number().int().min(0).default(0),
  signalCount7d: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// Derived Types
// ============================================================================

export type ConnectorCategory = z.infer<typeof ConnectorCategorySchema>;
export type ConnectorKind = z.infer<typeof ConnectorKindSchema>;
export type ConnectorInstanceStatus = z.infer<
  typeof ConnectorInstanceStatusSchema
>;
export type CredentialField = z.infer<typeof CredentialFieldSchema>;
export type AuthDescriptor = z.infer<typeof AuthDescriptorSchema>;
export type OAuth2Config = z.infer<typeof OAuth2ConfigSchema>;
export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>;
export type PatConfig = z.infer<typeof PatConfigSchema>;
export type BasicAuthConfig = z.infer<typeof BasicAuthConfigSchema>;
export type WebhookSecretConfig = z.infer<typeof WebhookSecretConfigSchema>;
export type DeltaStrategy = z.infer<typeof DeltaStrategySchema>;
export type PaginationDescriptor = z.infer<typeof PaginationDescriptorSchema>;
export type PollingConfig = z.infer<typeof PollingConfigSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type IngestionDescriptor = z.infer<typeof IngestionDescriptorSchema>;
export type SignalTypeRule = z.infer<typeof SignalTypeRuleSchema>;
export type PriorityRule = z.infer<typeof PriorityRuleSchema>;
export type FieldMappingDescriptor = z.infer<
  typeof FieldMappingDescriptorSchema
>;
export type HealthCheckDescriptor = z.infer<typeof HealthCheckDescriptorSchema>;
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
export type ConnectorInstanceConfig = z.infer<
  typeof ConnectorInstanceConfigSchema
>;
export type ConnectorInstance = z.infer<typeof ConnectorInstanceSchema>;
