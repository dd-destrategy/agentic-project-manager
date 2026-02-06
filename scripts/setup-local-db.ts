/**
 * Create the AgenticPM DynamoDB table in DynamoDB Local.
 * Idempotent — skips if the table already exists.
 *
 * Usage: npx tsx scripts/setup-local-db.ts
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'AgenticPM';
const ENDPOINT = 'http://127.0.0.1:4566';

const client = new DynamoDBClient({
  region: 'ap-southeast-2',
  endpointUrl: ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

async function tableExists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return false;
    throw err;
  }
}

async function createTable(): Promise<void> {
  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    })
  );
}

async function main() {
  console.log(`Connecting to DynamoDB Local at ${ENDPOINT}...`);

  if (await tableExists()) {
    console.log(`Table "${TABLE_NAME}" already exists — skipping creation.`);
    return;
  }

  console.log(`Creating table "${TABLE_NAME}"...`);
  await createTable();
  console.log(`Table "${TABLE_NAME}" created successfully.`);
}

main().catch((err) => {
  console.error('Failed to set up local DB:', err);
  process.exit(1);
});
