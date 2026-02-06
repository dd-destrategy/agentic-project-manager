/**
 * Shared DynamoDB client singleton for web API routes.
 *
 * Avoids creating a new DynamoDBClient on every request,
 * which is wasteful in a long-lived Next.js server process.
 */

import { DynamoDBClient } from '@agentic-pm/core/db';

let _client: DynamoDBClient | null = null;

/**
 * Returns a singleton DynamoDBClient instance.
 * Safe for use across all API routes in the web package.
 */
export function getDbClient(): DynamoDBClient {
  if (!_client) {
    _client = new DynamoDBClient();
  }
  return _client;
}
