/**
 * Database module types
 */

/**
 * Options for query operations
 */
export interface QueryOptions {
  /** Maximum items to return */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
  /** Sort order (default: descending) */
  ascending?: boolean;
}

/**
 * Result of a query operation
 */
export interface QueryResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * DynamoDB item with standard keys
 */
export interface DynamoDBItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  TTL?: number;
  [key: string]: unknown;
}
