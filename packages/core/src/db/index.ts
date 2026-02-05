/**
 * Database module
 *
 * DynamoDB access layer using AWS SDK v3.
 */

export { DynamoDBClient, DynamoDBError } from './client.js';
export { ProjectRepository } from './repositories/project.js';
export { EventRepository } from './repositories/event.js';
export type { CreateEventOptions, EventQueryOptions } from './repositories/event.js';
export { ArtefactRepository } from './repositories/artefact.js';
export { AgentConfigRepository, CONFIG_KEYS, DEFAULT_CONFIG } from './repositories/agent-config.js';
export type { QueryOptions, QueryResult } from './types.js';
