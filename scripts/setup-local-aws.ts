/**
 * Set up all local AWS services in LocalStack.
 * Idempotent — safe to run multiple times.
 *
 * Creates:
 *   - DynamoDB table (AgenticPM) with GSI1
 *   - SQS dead-letter queue
 *   - SNS alarm topic
 *   - Secrets Manager secrets (4 placeholder secrets)
 *   - Step Functions state machine (mirrors CDK agent-stack.ts)
 *   - EventBridge rules (disabled by default)
 *
 * Usage: npx tsx scripts/setup-local-aws.ts
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  DescribeRuleCommand,
} from '@aws-sdk/client-eventbridge';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  SFNClient,
  CreateStateMachineCommand,
  DescribeStateMachineCommand,
  UpdateStateMachineCommand,
} from '@aws-sdk/client-sfn';
import { SNSClient, CreateTopicCommand } from '@aws-sdk/client-sns';
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://127.0.0.1:4566';
const REGION = process.env.AWS_REGION ?? 'ap-southeast-2';
const ACCOUNT_ID = '000000000000'; // LocalStack default
const TABLE_NAME = 'AgenticPM';

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
const clientConfig = { region: REGION, endpoint: ENDPOINT, credentials };

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const dynamodb = new DynamoDBClient(clientConfig);
const sqs = new SQSClient(clientConfig);
const sns = new SNSClient(clientConfig);
const secretsManager = new SecretsManagerClient(clientConfig);
const sfn = new SFNClient(clientConfig);
const eventBridge = new EventBridgeClient(clientConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function heading(text: string) {
  console.log(`\n${BOLD}${CYAN}--- ${text} ---${RESET}`);
}

function ok(text: string) {
  console.log(`  ${GREEN}✓${RESET} ${text}`);
}

function skip(text: string) {
  console.log(`  ${YELLOW}⊘${RESET} ${text}`);
}

async function waitForLocalStack(maxAttempts = 30, intervalMs = 2000) {
  heading('Waiting for LocalStack');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}/_localstack/health`);
      if (res.ok) {
        const body = (await res.json()) as Record<
          string,
          Record<string, string>
        >;
        const services = body.services ?? {};
        const allAvailable = Object.values(services).every(
          (status) => status === 'available' || status === 'running'
        );
        if (allAvailable) {
          ok('LocalStack is healthy');
          return;
        }
      }
    } catch {
      // Connection refused — not ready yet
    }

    if (attempt < maxAttempts) {
      process.stdout.write(
        `  Attempt ${attempt}/${maxAttempts} — waiting ${intervalMs}ms...\r`
      );
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(
    `LocalStack did not become healthy after ${maxAttempts} attempts`
  );
}

// ---------------------------------------------------------------------------
// 1. DynamoDB Table
// ---------------------------------------------------------------------------

async function createDynamoDBTable(): Promise<void> {
  heading('DynamoDB Table');

  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    skip(`Table "${TABLE_NAME}" already exists`);
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }

  await dynamodb.send(
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
  ok(`Table "${TABLE_NAME}" created`);
}

// ---------------------------------------------------------------------------
// 2. SQS Dead-Letter Queue
// ---------------------------------------------------------------------------

async function createSQSQueue(): Promise<string> {
  heading('SQS Dead-Letter Queue');

  const queueName = 'agentic-pm-lambda-dlq';

  try {
    const existing = await sqs.send(
      new GetQueueUrlCommand({ QueueName: queueName })
    );
    skip(`Queue "${queueName}" already exists`);
    return existing.QueueUrl!;
  } catch {
    // Queue does not exist
  }

  const result = await sqs.send(
    new CreateQueueCommand({
      QueueName: queueName,
      Attributes: {
        MessageRetentionPeriod: String(14 * 24 * 60 * 60), // 14 days
      },
    })
  );
  ok(`Queue "${queueName}" created`);
  return result.QueueUrl!;
}

// ---------------------------------------------------------------------------
// 3. SNS Topic
// ---------------------------------------------------------------------------

async function createSNSTopic(): Promise<string> {
  heading('SNS Alarm Topic');

  const topicName = 'agentic-pm-dlq-alarm';

  // CreateTopic is idempotent — returns existing ARN if topic exists
  const result = await sns.send(new CreateTopicCommand({ Name: topicName }));
  ok(`Topic "${topicName}" ready (ARN: ${result.TopicArn})`);
  return result.TopicArn!;
}

// ---------------------------------------------------------------------------
// 4. Secrets Manager
// ---------------------------------------------------------------------------

async function createSecret(
  name: string,
  description: string,
  value: string
): Promise<string> {
  try {
    const existing = await secretsManager.send(
      new DescribeSecretCommand({ SecretId: name })
    );
    skip(`Secret "${name}" already exists`);
    return existing.ARN!;
  } catch {
    // Secret does not exist
  }

  const result = await secretsManager.send(
    new CreateSecretCommand({
      Name: name,
      Description: description,
      SecretString: value,
    })
  );
  ok(`Secret "${name}" created`);
  return result.ARN!;
}

async function createSecrets(): Promise<void> {
  heading('Secrets Manager');

  await createSecret(
    '/agentic-pm/llm/api-key',
    'Claude API key for LLM operations',
    JSON.stringify({ apiKey: 'sk-ant-local-placeholder' })
  );

  await createSecret(
    '/agentic-pm/jira/api-token',
    'Jira Cloud API token',
    JSON.stringify({
      baseUrl: 'https://your-org.atlassian.net',
      email: 'user@example.com',
      apiToken: 'local-placeholder-token',
    })
  );

  await createSecret(
    '/agentic-pm/graph/credentials',
    'Microsoft Graph API credentials for Outlook',
    JSON.stringify({
      tenantId: 'local-placeholder',
      clientId: 'local-placeholder',
      clientSecret: 'local-placeholder',
    })
  );

  await createSecret(
    '/agentic-pm/auth/nextauth-secret',
    'NextAuth.js session secret',
    JSON.stringify({
      secret: 'local-dev-nextauth-secret-placeholder-value-32chars!',
    })
  );
}

// ---------------------------------------------------------------------------
// 5. Step Functions State Machine
// ---------------------------------------------------------------------------

function buildStateMachineDefinition(): string {
  /**
   * Amazon States Language definition matching the CDK agent-stack.ts.
   *
   * Flow:
   *   Heartbeat -> PreserveHeartbeatOutput -> ChangeDetection -> HasChanges?
   *     Yes -> Normalise -> TriageSanitise -> TriageClassify -> NeedsReasoning?
   *       Yes -> Reasoning -> Execute -> ArtefactUpdate -> HousekeepingDue?
   *       No  ->              Execute -> ArtefactUpdate -> HousekeepingDue?
   *     No  -> NoChanges -> HousekeepingDue?
   *   HousekeepingDue?
   *     Yes -> Housekeeping -> Success
   *     No  -> Success
   */

  const lambdaArn = (name: string) =>
    `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:agentic-pm-${name}`;

  const definition = {
    Comment: 'Agentic PM Agent Cycle — local development mirror',
    StartAt: 'Heartbeat',
    TimeoutSeconds: 600,
    States: {
      Heartbeat: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('heartbeat'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: [
              'Lambda.ServiceException',
              'Lambda.TooManyRequestsException',
            ],
            IntervalSeconds: 5,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'PreserveHeartbeatOutput',
      },

      PreserveHeartbeatOutput: {
        Type: 'Pass',
        ResultPath: '$.heartbeat',
        Next: 'ChangeDetection',
      },

      ChangeDetection: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('change-detection'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: [
              'Lambda.ServiceException',
              'Lambda.TooManyRequestsException',
            ],
            IntervalSeconds: 10,
            MaxAttempts: 3,
            BackoffRate: 2,
          },
        ],
        Next: 'HasChanges',
      },

      HasChanges: {
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.hasChanges',
            BooleanEquals: true,
            Next: 'Normalise',
          },
        ],
        Default: 'NoChanges',
      },

      NoChanges: {
        Type: 'Pass',
        ResultPath: null,
        Next: 'HousekeepingDue',
      },

      Normalise: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('normalise'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Next: 'TriageSanitise',
      },

      TriageSanitise: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('triage-sanitise'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'States.Timeout'],
            IntervalSeconds: 30,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'TriageClassify',
      },

      TriageClassify: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('triage-classify'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'States.Timeout'],
            IntervalSeconds: 30,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'NeedsReasoning',
      },

      NeedsReasoning: {
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.needsComplexReasoning',
            BooleanEquals: true,
            Next: 'Reasoning',
          },
        ],
        Default: 'Execute',
      },

      Reasoning: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('reasoning'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'States.Timeout'],
            IntervalSeconds: 60,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'Execute',
      },

      Execute: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('execute'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException'],
            IntervalSeconds: 10,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'ArtefactUpdate',
      },

      ArtefactUpdate: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('artefact-update'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'States.Timeout'],
            IntervalSeconds: 30,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'HousekeepingDue',
      },

      HousekeepingDue: {
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.housekeepingDue',
            BooleanEquals: true,
            Next: 'Housekeeping',
          },
        ],
        Default: 'Success',
      },

      Housekeeping: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: lambdaArn('housekeeping'),
          'Payload.$': '$',
        },
        OutputPath: '$.Payload',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'States.Timeout'],
            IntervalSeconds: 30,
            MaxAttempts: 2,
            BackoffRate: 2,
          },
        ],
        Next: 'Success',
      },

      Success: {
        Type: 'Succeed',
      },
    },
  };

  return JSON.stringify(definition, null, 2);
}

async function createStateMachine(): Promise<string> {
  heading('Step Functions State Machine');

  const stateMachineName = 'agentic-pm-agent-cycle';
  const roleArn = `arn:aws:iam::${ACCOUNT_ID}:role/agentic-pm-stepfunctions-role`;
  const definition = buildStateMachineDefinition();

  // Check if state machine already exists
  const stateMachineArn = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${stateMachineName}`;

  try {
    await sfn.send(
      new DescribeStateMachineCommand({
        stateMachineArn,
      })
    );

    // Update existing state machine with latest definition
    await sfn.send(
      new UpdateStateMachineCommand({
        stateMachineArn,
        definition,
        roleArn,
      })
    );
    skip(
      `State machine "${stateMachineName}" already exists — definition updated`
    );
    return stateMachineArn;
  } catch {
    // Does not exist — create it
  }

  const result = await sfn.send(
    new CreateStateMachineCommand({
      name: stateMachineName,
      definition,
      roleArn,
      type: 'STANDARD',
    })
  );

  ok(`State machine "${stateMachineName}" created`);
  return result.stateMachineArn!;
}

// ---------------------------------------------------------------------------
// 6. EventBridge Rules (disabled by default)
// ---------------------------------------------------------------------------

async function createEventBridgeRules(stateMachineArn: string): Promise<void> {
  heading('EventBridge Rules (disabled by default)');

  // Main cycle rule — every 15 minutes
  const mainRuleName = 'agentic-pm-main-cycle';

  try {
    await eventBridge.send(new DescribeRuleCommand({ Name: mainRuleName }));
    skip(`Rule "${mainRuleName}" already exists`);
  } catch {
    await eventBridge.send(
      new PutRuleCommand({
        Name: mainRuleName,
        Description: 'Triggers the agentic-pm agent cycle every 15 minutes',
        ScheduleExpression: 'rate(15 minutes)',
        State: 'DISABLED',
      })
    );
    await eventBridge.send(
      new PutTargetsCommand({
        Rule: mainRuleName,
        Targets: [
          {
            Id: 'agentic-pm-state-machine',
            Arn: stateMachineArn,
            Input: JSON.stringify({ source: 'scheduled' }),
          },
        ],
      })
    );
    ok(`Rule "${mainRuleName}" created (DISABLED)`);
  }

  // Hold queue rule — every 1 minute
  const holdRuleName = 'agentic-pm-hold-queue';
  const holdQueueLambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:agentic-pm-hold-queue`;

  try {
    await eventBridge.send(new DescribeRuleCommand({ Name: holdRuleName }));
    skip(`Rule "${holdRuleName}" already exists`);
  } catch {
    await eventBridge.send(
      new PutRuleCommand({
        Name: holdRuleName,
        Description: 'Triggers the hold-queue Lambda every 1 minute',
        ScheduleExpression: 'rate(1 minute)',
        State: 'DISABLED',
      })
    );
    await eventBridge.send(
      new PutTargetsCommand({
        Rule: holdRuleName,
        Targets: [
          {
            Id: 'agentic-pm-hold-queue',
            Arn: holdQueueLambdaArn,
          },
        ],
      })
    );
    ok(`Rule "${holdRuleName}" created (DISABLED)`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(dlqUrl: string, snsArn: string, stateMachineArn: string) {
  heading('Setup Complete');

  console.log(`
${BOLD}Resources created in LocalStack (${ENDPOINT}):${RESET}

  DynamoDB Table:      ${TABLE_NAME}
  DynamoDB Admin UI:   http://localhost:8001

  SQS DLQ:            ${dlqUrl}
  SNS Alarm Topic:    ${snsArn}

  Secrets Manager:
    /agentic-pm/llm/api-key
    /agentic-pm/jira/api-token
    /agentic-pm/graph/credentials
    /agentic-pm/auth/nextauth-secret

  State Machine:       ${stateMachineArn}

  EventBridge Rules (DISABLED):
    agentic-pm-main-cycle     rate(15 minutes) -> State Machine
    agentic-pm-hold-queue     rate(1 minute)   -> hold-queue Lambda

  MailHog Web UI:      http://localhost:8025

${BOLD}Next steps:${RESET}
  pnpm db:seed                   Seed sample data
  pnpm local:invoke heartbeat    Invoke a handler locally
  pnpm local:state-machine       Run the full state machine
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${BOLD}Agentic PM — Local AWS Setup${RESET}`);
  console.log(`Endpoint: ${ENDPOINT}`);

  await waitForLocalStack();
  await createDynamoDBTable();
  const dlqUrl = await createSQSQueue();
  const snsArn = await createSNSTopic();
  await createSecrets();
  const stateMachineArn = await createStateMachine();
  await createEventBridgeRules(stateMachineArn);

  printSummary(dlqUrl, snsArn, stateMachineArn);
}

main().catch((err) => {
  console.error('\nFailed to set up local AWS services:', err);
  process.exit(1);
});
