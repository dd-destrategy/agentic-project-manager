/**
 * Universal Connector Framework
 *
 * Public API for the connector system. Import from '@agentic-pm/core/connectors'.
 */

// Schemas & types
export {
  ConnectorDescriptorSchema,
  ConnectorInstanceSchema,
  ConnectorInstanceConfigSchema,
  ConnectorCategorySchema,
  ConnectorKindSchema,
  ConnectorInstanceStatusSchema,
  AuthDescriptorSchema,
  IngestionDescriptorSchema,
  FieldMappingDescriptorSchema,
  HealthCheckDescriptorSchema,
  CredentialFieldSchema,
  type ConnectorDescriptor,
  type ConnectorInstance,
  type ConnectorInstanceConfig,
  type ConnectorCategory,
  type ConnectorKind,
  type ConnectorInstanceStatus,
  type AuthDescriptor,
  type IngestionDescriptor,
  type FieldMappingDescriptor,
  type HealthCheckDescriptor,
  type CredentialField,
  type DeltaStrategy,
  type PollingConfig,
  type WebhookConfig,
  type SignalTypeRule,
  type PriorityRule,
} from './connector-schemas.js';

// Registry
export {
  ConnectorRegistry,
  type ConnectorRegistryDeps,
  type DescriptorRecord,
} from './connector-registry.js';

// Runtime
export {
  ConnectorRuntime,
  ConnectorRuntimeError,
  type ConnectorRuntimeDeps,
  type PollResult,
  type HealthResult,
} from './connector-runtime.js';

// Engines
export {
  GenericPollingEngine,
  PollingError,
  type HttpClient,
  type PollingResult,
  type PollingEngineConfig,
} from './polling-engine.js';

export {
  FieldMappingEngine,
  extractPath,
  extractItems,
  interpolateTemplate,
  resolveSignalType,
  resolvePriority,
  type MappedSignal,
} from './field-mapping-engine.js';

export {
  UniversalAuthProvider,
  AuthError,
  type AuthResult,
} from './auth-provider.js';

// Webhook receiver
export {
  WebhookReceiver,
  type WebhookRequest,
  type WebhookResult,
  type WebhookReceiverDeps,
} from './webhook-receiver.js';

// Built-in descriptors
export {
  builtinDescriptors,
  githubIssuesDescriptor,
  linearDescriptor,
  trelloDescriptor,
  slackDescriptor,
  notionDescriptor,
  confluenceDescriptor,
  pagerdutyDescriptor,
  sentryDescriptor,
  jiraNativeDescriptor,
  outlookNativeDescriptor,
  sesNativeDescriptor,
} from './builtin-descriptors.js';
