/**
 * Database module
 *
 * DynamoDB access layer using AWS SDK v3.
 */

export { DynamoDBClient } from './client.js';
export { ProjectRepository } from './repositories/project.js';
export { EventRepository } from './repositories/event.js';
export { ArtefactRepository } from './repositories/artefact.js';
export type { QueryOptions, QueryResult } from './types.js';
