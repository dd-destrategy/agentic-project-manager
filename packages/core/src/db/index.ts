/**
 * Database module
 *
 * DynamoDB access layer using AWS SDK v3.
 */

export { DynamoDBClient, DynamoDBError } from './client.js';
export { ProjectRepository } from './repositories/project.js';
export { EventRepository } from './repositories/event.js';
export type {
  CreateEventOptions,
  EventQueryOptions,
} from './repositories/event.js';
export { ArtefactRepository } from './repositories/artefact.js';
export {
  AgentConfigRepository,
  CONFIG_KEYS,
  DEFAULT_CONFIG,
} from './repositories/agent-config.js';
export { EscalationRepository } from './repositories/escalation.js';
export type {
  CreateEscalationOptions,
  RecordDecisionOptions,
  EscalationQueryOptions,
} from './repositories/escalation.js';
export { CheckpointRepository } from './repositories/checkpoint.js';
export {
  HeldActionRepository,
  type HeldAction,
  type HeldActionType,
  type CreateHeldActionOptions,
} from './repositories/held-action.js';
export {
  GraduationStateRepository,
  DEFAULT_HOLD_TIMES,
  GRADUATION_HOLD_TIMES,
  type GraduationState,
} from './repositories/graduation-state.js';
export {
  IntegrationConfigRepository,
  type IntegrationHealthConfig,
} from './repositories/integration-config.js';
export type { QueryOptions, QueryResult } from './types.js';
