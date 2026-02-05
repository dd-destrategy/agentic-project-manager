/**
 * DynamoDB client wrapper
 *
 * Provides a consistent interface for DynamoDB operations.
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
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type UpdateCommandInput,
  type DeleteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TABLE_NAME } from '../constants.js';

/**
 * DynamoDB client with document client wrapper
 */
export class DynamoDBClient {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config?: DynamoDBClientConfig, tableName?: string) {
    const baseClient = new AWSDynamoDBClient(config ?? {});
    this.client = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
    this.tableName = tableName ?? TABLE_NAME;
  }

  /**
   * Get a single item by primary key
   */
  async get<T>(pk: string, sk: string): Promise<T | null> {
    const input: GetCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
    };

    const result = await this.client.send(new GetCommand(input));
    return (result.Item as T) ?? null;
  }

  /**
   * Put an item
   */
  async put(item: Record<string, unknown>): Promise<void> {
    const input: PutCommandInput = {
      TableName: this.tableName,
      Item: item,
    };

    await this.client.send(new PutCommand(input));
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
    }
  ): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
    const input: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: options?.indexName,
      KeyConditionExpression: skPrefix
        ? 'PK = :pk AND begins_with(SK, :skPrefix)'
        : 'PK = :pk',
      ExpressionAttributeValues: skPrefix
        ? { ':pk': pk, ':skPrefix': skPrefix }
        : { ':pk': pk },
      ScanIndexForward: options?.ascending ?? false,
      Limit: options?.limit,
      ExclusiveStartKey: options?.exclusiveStartKey,
    };

    const result = await this.client.send(new QueryCommand(input));
    return {
      items: (result.Items as T[]) ?? [],
      lastKey: result.LastEvaluatedKey,
    };
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
    }
  ): Promise<{ items: T[]; lastKey?: Record<string, unknown> }> {
    const input: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: options?.gsi1skPrefix
        ? 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)'
        : 'GSI1PK = :pk',
      ExpressionAttributeValues: options?.gsi1skPrefix
        ? { ':pk': gsi1pk, ':skPrefix': options.gsi1skPrefix }
        : { ':pk': gsi1pk },
      ScanIndexForward: options?.ascending ?? false,
      Limit: options?.limit,
      ExclusiveStartKey: options?.exclusiveStartKey,
    };

    const result = await this.client.send(new QueryCommand(input));
    return {
      items: (result.Items as T[]) ?? [],
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Update an item with an update expression
   */
  async update(
    pk: string,
    sk: string,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<void> {
    const input: UpdateCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
    };

    await this.client.send(new UpdateCommand(input));
  }

  /**
   * Delete an item
   */
  async delete(pk: string, sk: string): Promise<void> {
    const input: DeleteCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
    };

    await this.client.send(new DeleteCommand(input));
  }
}
