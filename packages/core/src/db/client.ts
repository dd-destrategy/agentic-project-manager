/**
 * DynamoDB client wrapper
 *
 * Provides a consistent interface for DynamoDB operations with:
 * - Automatic retries with exponential backoff
 * - Proper error handling and categorisation
 * - Timeout handling
 */

import {
  DynamoDBClient as AWSDynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  TransactWriteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type UpdateCommandInput,
  type DeleteCommandInput,
  type TransactWriteCommandInput,
  type BatchGetCommandInput,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TABLE_NAME } from '../constants.js';

/** Maximum number of retries for transient errors */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const BASE_DELAY_MS = 100;

/** Maximum delay in milliseconds between retries */
const MAX_DELAY_MS = 2000;

/**
 * Custom error class for DynamoDB operations
 */
export class DynamoDBError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'DynamoDBError';
  }
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorName = error.name;
    const retryableErrors = [
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'RequestLimitExceeded',
      'InternalServerError',
      'ServiceUnavailable',
      'TransactionConflictException',
    ];
    return retryableErrors.includes(errorName);
  }
  return false;
}

/**
 * Extracts error code from error object
 */
function getErrorCode(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'UnknownError';
  }
  return 'UnknownError';
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

/**
 * DynamoDB client with document client wrapper
 */
export class DynamoDBClient {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config?: DynamoDBClientConfig, tableName?: string) {
    const baseClient = new AWSDynamoDBClient({
      ...config,
      maxAttempts: 1, // We handle retries ourselves for better control
    });
    this.client = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
    this.tableName = tableName ?? TABLE_NAME;
  }

  /**
   * Get the table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Execute an operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorCode = getErrorCode(error);

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          throw new DynamoDBError(
            `${operationName} failed: ${lastError.message}`,
            errorCode,
            isRetryableError(error),
            lastError
          );
        }

        const delay = calculateBackoffDelay(attempt);
        await sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new DynamoDBError(
      `${operationName} failed after ${MAX_RETRIES} retries`,
      'MaxRetriesExceeded',
      false,
      lastError
    );
  }

  /**
   * Get a single item by primary key
   */
  async get<T>(pk: string, sk: string): Promise<T | null> {
    return this.executeWithRetry(async () => {
      const input: GetCommandInput = {
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      };

      const result = await this.client.send(new GetCommand(input));
      return (result.Item as T) ?? null;
    }, 'GetItem');
  }

  /**
   * Put an item
   */
  async put(item: Record<string, unknown>): Promise<void> {
    return this.executeWithRetry(async () => {
      const input: PutCommandInput = {
        TableName: this.tableName,
        Item: item,
      };

      await this.client.send(new PutCommand(input));
    }, 'PutItem');
  }

  /**
   * Put an item with a condition expression (for optimistic locking)
   */
  async putWithCondition(
    item: Record<string, unknown>,
    conditionExpression: string,
    expressionAttributeValues?: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<boolean> {
    try {
      const input: PutCommandInput = {
        TableName: this.tableName,
        Item: item,
        ConditionExpression: conditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      };

      await this.executeWithRetry(
        () => this.client.send(new PutCommand(input)),
        'PutItemWithCondition'
      );
      return true;
    } catch (error) {
      if (error instanceof DynamoDBError && error.code === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Query items by partition key with optional sort key prefix
   */
  async query<T>(
    pk: string,
    skPrefix?: string,
    options?: {
      limit?: number;
      ascending?: boolean;
      exclusiveStartKey?: Record<string, unknown>;
      indexName?: string;
      /** Projection expression to limit returned attributes (reduces read capacity) */
      projectionExpression?: string;
      /** Filter expression for server-side filtering (more efficient than client-side) */
      filterExpression?: string;
      /** Expression attribute names for projection/filter expressions */
      expressionAttributeNames?: Record<string, string>;
      /** Additional expression attribute values for filter expressions */
      additionalExpressionAttributeValues?: Record<string, unknown>;
    }
  ): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
    return this.executeWithRetry(async () => {
      const expressionAttributeValues: Record<string, unknown> = skPrefix
        ? { ':pk': pk, ':skPrefix': skPrefix }
        : { ':pk': pk };

      // Merge additional expression attribute values for filter expressions
      if (options?.additionalExpressionAttributeValues) {
        Object.assign(expressionAttributeValues, options.additionalExpressionAttributeValues);
      }

      const input: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: options?.indexName,
        KeyConditionExpression: skPrefix
          ? 'PK = :pk AND begins_with(SK, :skPrefix)'
          : 'PK = :pk',
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        ProjectionExpression: options?.projectionExpression,
        FilterExpression: options?.filterExpression,
        ScanIndexForward: options?.ascending ?? false,
        Limit: options?.limit,
        ExclusiveStartKey: options?.exclusiveStartKey,
      };

      const result = await this.client.send(new QueryCommand(input));
      return {
        items: (result.Items as T[]) ?? [],
        lastKey: result.LastEvaluatedKey,
      };
    }, 'Query');
  }

  /**
   * Query with a custom key condition expression
   */
  async queryWithExpression<T>(
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    options?: {
      limit?: number;
      ascending?: boolean;
      exclusiveStartKey?: Record<string, unknown>;
      indexName?: string;
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
    }
  ): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
    return this.executeWithRetry(async () => {
      const input: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: options?.indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        FilterExpression: options?.filterExpression,
        ScanIndexForward: options?.ascending ?? false,
        Limit: options?.limit,
        ExclusiveStartKey: options?.exclusiveStartKey,
      };

      const result = await this.client.send(new QueryCommand(input));
      return {
        items: (result.Items as T[]) ?? [],
        lastKey: result.LastEvaluatedKey,
      };
    }, 'QueryWithExpression');
  }

  /**
   * Query GSI1
   */
  async queryGSI1<T>(
    gsi1pk: string,
    options?: {
      gsi1skPrefix?: string;
      limit?: number;
      ascending?: boolean;
      exclusiveStartKey?: Record<string, unknown>;
      /** Projection expression to limit returned attributes (reduces read capacity) */
      projectionExpression?: string;
      /** Filter expression for server-side filtering (more efficient than client-side) */
      filterExpression?: string;
      /** Expression attribute names for projection/filter expressions */
      expressionAttributeNames?: Record<string, string>;
      /** Additional expression attribute values for filter expressions */
      additionalExpressionAttributeValues?: Record<string, unknown>;
    }
  ): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
    return this.executeWithRetry(async () => {
      const expressionAttributeValues: Record<string, unknown> = options?.gsi1skPrefix
        ? { ':pk': gsi1pk, ':skPrefix': options.gsi1skPrefix }
        : { ':pk': gsi1pk };

      // Merge additional expression attribute values for filter expressions
      if (options?.additionalExpressionAttributeValues) {
        Object.assign(expressionAttributeValues, options.additionalExpressionAttributeValues);
      }

      const input: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: options?.gsi1skPrefix
          ? 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)'
          : 'GSI1PK = :pk',
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        ProjectionExpression: options?.projectionExpression,
        FilterExpression: options?.filterExpression,
        ScanIndexForward: options?.ascending ?? false,
        Limit: options?.limit,
        ExclusiveStartKey: options?.exclusiveStartKey,
      };

      const result = await this.client.send(new QueryCommand(input));
      return {
        items: (result.Items as T[]) ?? [],
        lastKey: result.LastEvaluatedKey,
      };
    }, 'QueryGSI1');
  }

  /**
   * Update an item with an update expression
   */
  async update(
    pk: string,
    sk: string,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
    conditionExpression?: string
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const input: UpdateCommandInput = {
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ConditionExpression: conditionExpression,
      };

      await this.client.send(new UpdateCommand(input));
    }, 'UpdateItem');
  }

  /**
   * Delete an item
   */
  async delete(pk: string, sk: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const input: DeleteCommandInput = {
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      };

      await this.client.send(new DeleteCommand(input));
    }, 'DeleteItem');
  }

  /**
   * Execute a transactional write (up to 100 items)
   */
  async transactWrite(
    items: Array<{
      type: 'put' | 'update' | 'delete';
      pk: string;
      sk: string;
      item?: Record<string, unknown>;
      updateExpression?: string;
      expressionAttributeValues?: Record<string, unknown>;
      expressionAttributeNames?: Record<string, string>;
      conditionExpression?: string;
    }>
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const transactItems = items.map((item) => {
        if (item.type === 'put' && item.item) {
          return {
            Put: {
              TableName: this.tableName,
              Item: { ...item.item, PK: item.pk, SK: item.sk },
              ConditionExpression: item.conditionExpression,
            },
          };
        } else if (item.type === 'update' && item.updateExpression) {
          return {
            Update: {
              TableName: this.tableName,
              Key: { PK: item.pk, SK: item.sk },
              UpdateExpression: item.updateExpression,
              ExpressionAttributeValues: item.expressionAttributeValues,
              ExpressionAttributeNames: item.expressionAttributeNames,
              ConditionExpression: item.conditionExpression,
            },
          };
        } else if (item.type === 'delete') {
          return {
            Delete: {
              TableName: this.tableName,
              Key: { PK: item.pk, SK: item.sk },
              ConditionExpression: item.conditionExpression,
            },
          };
        }
        throw new Error(`Invalid transaction item type: ${item.type}`);
      });

      const input: TransactWriteCommandInput = {
        TransactItems: transactItems,
      };

      await this.client.send(new TransactWriteCommand(input));
    }, 'TransactWrite');
  }

  /**
   * Batch get items (up to 100 items)
   * Returns items in the same order as requested keys (null for missing items)
   */
  async batchGet<T>(
    keys: Array<{ pk: string; sk: string }>
  ): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return [];
    }

    if (keys.length > 100) {
      throw new DynamoDBError(
        'BatchGet supports up to 100 items',
        'ValidationError',
        false
      );
    }

    return this.executeWithRetry(async () => {
      const input: BatchGetCommandInput = {
        RequestItems: {
          [this.tableName]: {
            Keys: keys.map((key) => ({ PK: key.pk, SK: key.sk })),
          },
        },
      };

      const result = await this.client.send(new BatchGetCommand(input));
      const responses = result.Responses?.[this.tableName] ?? [];

      // Create a map for quick lookup
      const responseMap = new Map<string, T>();
      for (const item of responses) {
        const compositeKey = `${item.PK}#${item.SK}`;
        responseMap.set(compositeKey, item as T);
      }

      // Return items in the same order as requested
      return keys.map((key) => {
        const compositeKey = `${key.pk}#${key.sk}`;
        return responseMap.get(compositeKey) ?? null;
      });
    }, 'BatchGet');
  }

  /**
   * Batch write items (up to 25 items per batch)
   * Automatically handles unprocessed items with retry
   */
  async batchWrite(
    operations: Array<{
      type: 'put' | 'delete';
      pk: string;
      sk: string;
      item?: Record<string, unknown>;
    }>
  ): Promise<void> {
    if (operations.length === 0) {
      return;
    }

    if (operations.length > 25) {
      throw new DynamoDBError(
        'BatchWrite supports up to 25 items per call. Use batchWriteAll for larger batches.',
        'ValidationError',
        false
      );
    }

    return this.executeWithRetry(async () => {
      const writeRequests = operations.map((op) => {
        if (op.type === 'put' && op.item) {
          return {
            PutRequest: {
              Item: { ...op.item, PK: op.pk, SK: op.sk },
            },
          };
        } else if (op.type === 'delete') {
          return {
            DeleteRequest: {
              Key: { PK: op.pk, SK: op.sk },
            },
          };
        }
        throw new Error(`Invalid batch write operation type: ${op.type}`);
      });

      const input: BatchWriteCommandInput = {
        RequestItems: {
          [this.tableName]: writeRequests,
        },
      };

      let response = await this.client.send(new BatchWriteCommand(input));

      // Handle unprocessed items with exponential backoff
      let retryCount = 0;
      while (
        response.UnprocessedItems &&
        Object.keys(response.UnprocessedItems).length > 0 &&
        retryCount < MAX_RETRIES
      ) {
        const delay = calculateBackoffDelay(retryCount);
        await sleep(delay);

        response = await this.client.send(
          new BatchWriteCommand({ RequestItems: response.UnprocessedItems })
        );
        retryCount++;
      }

      if (
        response.UnprocessedItems &&
        Object.keys(response.UnprocessedItems).length > 0
      ) {
        throw new DynamoDBError(
          `BatchWrite failed with ${Object.keys(response.UnprocessedItems).length} unprocessed items after ${MAX_RETRIES} retries`,
          'UnprocessedItems',
          true
        );
      }
    }, 'BatchWrite');
  }

  /**
   * Batch write all items (handles chunking for large batches)
   * Splits into 25-item chunks and processes sequentially
   */
  async batchWriteAll(
    operations: Array<{
      type: 'put' | 'delete';
      pk: string;
      sk: string;
      item?: Record<string, unknown>;
    }>
  ): Promise<void> {
    const BATCH_SIZE = 25;

    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      await this.batchWrite(batch);
    }
  }

  /**
   * Batch get all items (handles chunking for large batches)
   * Splits into 100-item chunks and processes sequentially
   */
  async batchGetAll<T>(
    keys: Array<{ pk: string; sk: string }>
  ): Promise<(T | null)[]> {
    const BATCH_SIZE = 100;
    const results: (T | null)[] = [];

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const batchResults = await this.batchGet<T>(batch);
      results.push(...batchResults);
    }

    return results;
  }
}
