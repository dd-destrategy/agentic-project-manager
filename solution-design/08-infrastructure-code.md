# Infrastructure as Code Design — AWS CDK

> **Document type:** Solution Design
> **Status:** Implementation-ready
> **Source:** SPEC.md (single source of truth)
> **Last updated:** February 2026

---

## Table of Contents

1. [CDK Stack Structure](#1-cdk-stack-structure)
2. [Resource Definitions](#2-resource-definitions)
3. [Lambda Layer Strategy](#3-lambda-layer-strategy)
4. [CI/CD Pipeline](#4-cicd-pipeline)
5. [Local Development Setup](#5-local-development-setup)
6. [Cost Controls](#6-cost-controls)

---

## 1. CDK Stack Structure

### 1.1 Stack Organisation

The infrastructure is organised into four CDK stacks, following the principle of separation by lifecycle and deployment frequency.

```
infra/
├── bin/
│   └── agentic-pm.ts              # CDK app entry point
├── lib/
│   ├── stacks/
│   │   ├── foundation-stack.ts     # DynamoDB, Secrets Manager, IAM roles
│   │   ├── agent-stack.ts          # Lambda functions, Step Functions, EventBridge
│   │   ├── frontend-stack.ts       # Amplify hosting
│   │   └── monitoring-stack.ts     # CloudWatch alarms, dashboards
│   ├── constructs/
│   │   ├── agent-lambda.ts         # Reusable Lambda construct
│   │   ├── agent-state-machine.ts  # Step Functions state machine
│   │   └── dynamodb-table.ts       # DynamoDB with GSI
│   └── config/
│       ├── environments.ts         # Environment-specific configuration
│       └── constants.ts            # Shared constants
├── test/
│   └── *.test.ts                   # CDK snapshot and assertion tests
├── cdk.json
├── package.json
└── tsconfig.json
```

### 1.2 Stack Dependency Graph

```
┌─────────────────────┐
│   FoundationStack   │  ◄── Deploy first
│  - DynamoDB         │
│  - Secrets Manager  │
│  - IAM Roles        │
└─────────┬───────────┘
          │
          │ exports: tableArn, roleArns, secretArns
          │
┌─────────▼───────────┐
│     AgentStack      │  ◄── Depends on FoundationStack
│  - Lambda functions │
│  - Step Functions   │
│  - EventBridge      │
│  - SES identity     │
└─────────┬───────────┘
          │
          │ exports: stateMachineArn
          │
┌─────────▼───────────┐     ┌───────────────────────┐
│    FrontendStack    │     │    MonitoringStack    │
│  - Amplify app      │     │  - CloudWatch alarms  │
│  - API routes       │     │  - Dashboard          │
└─────────────────────┘     │  - Log groups         │
                            └───────────────────────┘
```

### 1.3 Cross-Stack References

```typescript
// infra/bin/agentic-pm.ts
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/stacks/foundation-stack';
import { AgentStack } from '../lib/stacks/agent-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { getEnvironmentConfig } from '../lib/config/environments';

const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';
const config = getEnvironmentConfig(env);

const foundation = new FoundationStack(app, `AgenticPM-Foundation-${env}`, {
  env: config.awsEnv,
  config,
});

const agent = new AgentStack(app, `AgenticPM-Agent-${env}`, {
  env: config.awsEnv,
  config,
  table: foundation.table,
  secrets: foundation.secrets,
  roles: foundation.roles,
});

new FrontendStack(app, `AgenticPM-Frontend-${env}`, {
  env: config.awsEnv,
  config,
  table: foundation.table,
  stateMachine: agent.stateMachine,
});

new MonitoringStack(app, `AgenticPM-Monitoring-${env}`, {
  env: config.awsEnv,
  config,
  table: foundation.table,
  lambdaFunctions: agent.lambdaFunctions,
  stateMachine: agent.stateMachine,
});
```

### 1.4 Environment Configuration

```typescript
// infra/lib/config/environments.ts
import * as cdk from 'aws-cdk-lib';

export interface EnvironmentConfig {
  envName: 'dev' | 'prod';
  awsEnv: cdk.Environment;
  tableName: string;
  pollingIntervalMinutes: number;
  holdQueueCheckMinutes: number;
  logRetentionDays: number;
  llmBudgetDaily: number;
  llmBudgetMonthly: number;
  enableAlarms: boolean;
}

const baseConfig = {
  awsEnv: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
  },
};

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    ...baseConfig,
    envName: 'dev',
    tableName: 'AgenticPM-Dev',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 7,
    llmBudgetDaily: 0.30,    // Higher ceiling for testing
    llmBudgetMonthly: 10.00,
    enableAlarms: false,
  },
  prod: {
    ...baseConfig,
    envName: 'prod',
    tableName: 'AgenticPM',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 30,
    llmBudgetDaily: 0.23,    // Per SPEC section 6.3
    llmBudgetMonthly: 8.00,
    enableAlarms: true,
  },
};

export function getEnvironmentConfig(env: string): EnvironmentConfig {
  const config = environments[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}. Valid options: ${Object.keys(environments).join(', ')}`);
  }
  return config;
}
```

---

## 2. Resource Definitions

### 2.1 DynamoDB Table with GSI1 and TTL

```typescript
// infra/lib/constructs/dynamodb-table.ts
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AgenticPMTableProps {
  tableName: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class AgenticPMTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AgenticPMTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: props.tableName,

      // Partition key and sort key
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },

      // On-demand capacity for cost efficiency at low scale
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      // Enable TTL for automatic expiration of events and actions
      timeToLiveAttribute: 'TTL',

      // Point-in-time recovery for disaster recovery
      pointInTimeRecovery: true,

      // Encryption at rest using AWS managed keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,

      // Stream for future CDC if needed (disabled for MVP)
      stream: undefined,

      // Removal policy based on environment
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
    });

    // GSI1: Cross-project queries (pending escalations, events by date, active projects)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      // Project all attributes for full entity retrieval
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output the table ARN for cross-stack references
    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      exportName: `${props.tableName}-Arn`,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      exportName: `${props.tableName}-Name`,
    });
  }
}
```

### 2.2 Secrets Manager Secrets

```typescript
// infra/lib/stacks/foundation-stack.ts (secrets section)
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface AgenticPMSecrets {
  llmApiKey: secretsmanager.ISecret;
  jiraApiToken: secretsmanager.ISecret;
  graphCredentials: secretsmanager.ISecret;
  nextAuthSecret: secretsmanager.ISecret;
}

// Within FoundationStack class:
private createSecrets(): AgenticPMSecrets {
  // Claude API key - accessed by Triage and Reasoning Lambdas
  const llmApiKey = new secretsmanager.Secret(this, 'LLMApiKey', {
    secretName: '/agentic-pm/llm/api-key',
    description: 'Claude API key for LLM operations',
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ apiKey: '' }),
      generateStringKey: 'placeholder',
    },
  });

  // Jira API token - accessed by Agent Lambdas only
  const jiraApiToken = new secretsmanager.Secret(this, 'JiraApiToken', {
    secretName: '/agentic-pm/jira/api-token',
    description: 'Jira Cloud API token',
    generateSecretString: {
      secretStringTemplate: JSON.stringify({
        email: '',
        apiToken: '',
        baseUrl: '',
      }),
      generateStringKey: 'placeholder',
    },
  });

  // Graph API credentials - accessed by Agent Lambdas only
  const graphCredentials = new secretsmanager.Secret(this, 'GraphCredentials', {
    secretName: '/agentic-pm/graph/credentials',
    description: 'Microsoft Graph API credentials for Outlook',
    generateSecretString: {
      secretStringTemplate: JSON.stringify({
        tenantId: '',
        clientId: '',
        clientSecret: '',
        userId: '',
      }),
      generateStringKey: 'placeholder',
    },
  });

  // NextAuth secret - accessed by Amplify frontend
  const nextAuthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
    secretName: '/agentic-pm/auth/nextauth-secret',
    description: 'NextAuth.js session secret',
    generateSecretString: {
      excludePunctuation: false,
      passwordLength: 64,
    },
  });

  return { llmApiKey, jiraApiToken, graphCredentials, nextAuthSecret };
}
```

### 2.3 IAM Roles with Least-Privilege Policies

```typescript
// infra/lib/stacks/foundation-stack.ts (IAM section)
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AgenticPMRoles {
  triageLambdaRole: iam.Role;
  agentLambdaRole: iam.Role;
  stepFunctionsRole: iam.Role;
}

private createRoles(
  table: dynamodb.Table,
  secrets: AgenticPMSecrets
): AgenticPMRoles {

  // Triage Lambda Role - RESTRICTED: LLM access only, no integration credentials
  const triageLambdaRole = new iam.Role(this, 'TriageLambdaRole', {
    roleName: 'agentic-pm-triage-role',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    description: 'Role for Triage Lambda - LLM access only, no integration credentials',
  });

  // Triage can only access LLM API key
  secrets.llmApiKey.grantRead(triageLambdaRole);

  // Triage can read/write to DynamoDB
  table.grantReadWriteData(triageLambdaRole);

  // Basic Lambda execution permissions
  triageLambdaRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  );

  // Explicit deny for integration secrets (defence in depth)
  triageLambdaRole.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.DENY,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [
      secrets.jiraApiToken.secretArn,
      secrets.graphCredentials.secretArn,
    ],
  }));

  // Agent Lambda Role - Full integration access
  const agentLambdaRole = new iam.Role(this, 'AgentLambdaRole', {
    roleName: 'agentic-pm-agent-role',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    description: 'Role for Agent Lambdas - full integration access',
  });

  // Agent can access all secrets except NextAuth
  secrets.jiraApiToken.grantRead(agentLambdaRole);
  secrets.graphCredentials.grantRead(agentLambdaRole);
  secrets.llmApiKey.grantRead(agentLambdaRole);

  // Full DynamoDB access
  table.grantReadWriteData(agentLambdaRole);

  // SES permissions for notifications
  agentLambdaRole.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'ses:SendEmail',
      'ses:SendRawEmail',
      'ses:GetSendQuota',
    ],
    resources: ['*'], // Restricted by SES identity at runtime
  }));

  // Basic Lambda execution permissions
  agentLambdaRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  );

  // Step Functions Role
  const stepFunctionsRole = new iam.Role(this, 'StepFunctionsRole', {
    roleName: 'agentic-pm-stepfunctions-role',
    assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    description: 'Role for Step Functions state machine',
  });

  // Step Functions can invoke Lambda functions (policy added in AgentStack)
  stepFunctionsRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole')
  );

  return { triageLambdaRole, agentLambdaRole, stepFunctionsRole };
}
```

### 2.4 Lambda Functions

```typescript
// infra/lib/constructs/agent-lambda.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AgentLambdaProps {
  functionName: string;
  description: string;
  handler: string;
  role: lambda.IRole;
  timeout: cdk.Duration;
  memorySize?: number;
  environment?: Record<string, string>;
  layers?: lambda.ILayerVersion[];
  logRetention?: logs.RetentionDays;
}

export class AgentLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: AgentLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'Function', {
      functionName: props.functionName,
      description: props.description,

      // Runtime configuration
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: props.handler,
      code: lambda.Code.fromAsset('../packages/lambdas/dist'),

      // Execution configuration
      role: props.role,
      timeout: props.timeout,
      memorySize: props.memorySize ?? 256,

      // CRITICAL: Lambda runs OUTSIDE VPC to avoid NAT Gateway costs
      vpc: undefined,

      // Environment variables
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        LOG_LEVEL: 'INFO',
        ...props.environment,
      },

      // Lambda layers
      layers: props.layers,

      // Architecture
      architecture: lambda.Architecture.ARM64, // Cost-effective, faster

      // Insights for monitoring
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,

      // Tracing
      tracing: lambda.Tracing.ACTIVE,
    });

    // Configure log retention
    new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${props.functionName}`,
      retention: props.logRetention ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
```

```typescript
// infra/lib/stacks/agent-stack.ts (Lambda definitions)
import { AgentLambda } from '../constructs/agent-lambda';

// Lambda function definitions per SPEC section 5.2
const lambdaConfigs = [
  {
    name: 'heartbeat',
    description: 'Log cycle start, check agent health, verify integrations',
    handler: 'heartbeat.handler',
    timeout: cdk.Duration.seconds(30),
    role: 'agent', // Uses agentLambdaRole
  },
  {
    name: 'change-detection',
    description: 'Poll Jira and Outlook APIs for deltas since last checkpoint',
    handler: 'change-detection.handler',
    timeout: cdk.Duration.seconds(60),
    role: 'agent',
  },
  {
    name: 'normalise',
    description: 'Convert raw API responses to NormalisedSignal objects',
    handler: 'normalise.handler',
    timeout: cdk.Duration.seconds(30),
    role: 'agent',
  },
  {
    name: 'triage-sanitise',
    description: 'Strip/neutralise untrusted content from signals (Haiku)',
    handler: 'triage-sanitise.handler',
    timeout: cdk.Duration.seconds(120),
    role: 'triage', // Uses triageLambdaRole - RESTRICTED
  },
  {
    name: 'triage-classify',
    description: 'Classify signal importance and recommend actions (Haiku)',
    handler: 'triage-classify.handler',
    timeout: cdk.Duration.seconds(120),
    role: 'triage', // Uses triageLambdaRole - RESTRICTED
  },
  {
    name: 'reasoning',
    description: 'Complex multi-source reasoning for difficult signals (Sonnet)',
    handler: 'reasoning.handler',
    timeout: cdk.Duration.seconds(300),
    role: 'triage', // Uses triageLambdaRole - limited to LLM
  },
  {
    name: 'execute',
    description: 'Execute auto-approved actions, queue hold items, create escalations',
    handler: 'execute.handler',
    timeout: cdk.Duration.seconds(60),
    role: 'agent',
  },
  {
    name: 'artefact-update',
    description: 'Update artefact content if warranted by signals',
    handler: 'artefact-update.handler',
    timeout: cdk.Duration.seconds(180),
    role: 'agent',
  },
  {
    name: 'housekeeping',
    description: 'Daily storage check, digest email',
    handler: 'housekeeping.handler',
    timeout: cdk.Duration.seconds(120),
    role: 'agent',
  },
  {
    name: 'hold-queue',
    description: 'Process held actions past their heldUntil timestamp',
    handler: 'hold-queue.handler',
    timeout: cdk.Duration.seconds(60),
    role: 'agent',
  },
];

// Create Lambda functions
this.lambdaFunctions = new Map<string, lambda.Function>();

for (const config of lambdaConfigs) {
  const lambdaConstruct = new AgentLambda(this, `Lambda-${config.name}`, {
    functionName: `agentic-pm-${config.name}`,
    description: config.description,
    handler: config.handler,
    role: config.role === 'triage' ? props.roles.triageLambdaRole : props.roles.agentLambdaRole,
    timeout: config.timeout,
    memorySize: 256,
    layers: [this.coreLayer],
    environment: {
      TABLE_NAME: props.table.tableName,
      TABLE_ARN: props.table.tableArn,
      ENVIRONMENT: props.config.envName,
    },
    logRetention: props.config.envName === 'prod'
      ? logs.RetentionDays.ONE_MONTH
      : logs.RetentionDays.ONE_WEEK,
  });

  this.lambdaFunctions.set(config.name, lambdaConstruct.function);
}
```

### 2.5 Step Functions State Machine

```typescript
// infra/lib/constructs/agent-state-machine.ts
import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AgentStateMachineProps {
  lambdaFunctions: Map<string, lambda.Function>;
  logRetention: logs.RetentionDays;
}

export class AgentStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: AgentStateMachineProps) {
    super(scope, id);

    const getLambda = (name: string) => {
      const fn = props.lambdaFunctions.get(name);
      if (!fn) throw new Error(`Lambda function not found: ${name}`);
      return fn;
    };

    // Helper to create Lambda invoke task with standard configuration
    const createInvokeTask = (
      name: string,
      lambdaName: string,
      options?: {
        resultPath?: string;
        retryOnServiceExceptions?: boolean;
        retryAttempts?: number;
        retryBackoff?: cdk.Duration;
      }
    ) => {
      const task = new tasks.LambdaInvoke(this, name, {
        lambdaFunction: getLambda(lambdaName),
        outputPath: '$.Payload',
        resultPath: options?.resultPath,
      });

      if (options?.retryOnServiceExceptions !== false) {
        task.addRetry({
          errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.TooManyRequestsException'],
          maxAttempts: options?.retryAttempts ?? 2,
          backoffRate: 2,
          interval: options?.retryBackoff ?? cdk.Duration.seconds(5),
        });
      }

      return task;
    };

    // Define state machine states
    const heartbeat = createInvokeTask('Heartbeat', 'heartbeat', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(5),
    });

    const changeDetection = createInvokeTask('ChangeDetection', 'change-detection', {
      retryAttempts: 3,
      retryBackoff: cdk.Duration.seconds(10),
    });

    const normalise = createInvokeTask('Normalise', 'normalise', {
      retryOnServiceExceptions: false, // Deterministic, no retry needed
    });

    const triageSanitise = createInvokeTask('TriageSanitise', 'triage-sanitise', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(30),
    });

    const triageClassify = createInvokeTask('TriageClassify', 'triage-classify', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(30),
    });

    const reasoning = createInvokeTask('Reasoning', 'reasoning', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(60),
    });

    const execute = createInvokeTask('Execute', 'execute', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(10),
    });

    const artefactUpdate = createInvokeTask('ArtefactUpdate', 'artefact-update', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(30),
    });

    const housekeeping = createInvokeTask('Housekeeping', 'housekeeping', {
      retryAttempts: 2,
      retryBackoff: cdk.Duration.seconds(30),
    });

    // Choice states
    const hasChanges = new sfn.Choice(this, 'HasChanges?')
      .when(sfn.Condition.booleanEquals('$.hasChanges', true), normalise)
      .otherwise(new sfn.Pass(this, 'NoChanges'));

    const needsReasoning = new sfn.Choice(this, 'NeedsReasoning?')
      .when(sfn.Condition.booleanEquals('$.needsComplexReasoning', true), reasoning)
      .otherwise(execute);

    const isHousekeepingDue = new sfn.Choice(this, 'IsHousekeepingDue?')
      .when(sfn.Condition.booleanEquals('$.housekeepingDue', true), housekeeping)
      .otherwise(new sfn.Succeed(this, 'CycleComplete'));

    // Success state
    const success = new sfn.Succeed(this, 'Success');

    // Catch-all error handler
    const catchError = new sfn.Pass(this, 'CatchError', {
      result: sfn.Result.fromObject({ error: true }),
    }).next(new sfn.Fail(this, 'CycleFailed', {
      cause: 'Agent cycle failed after retries',
      error: 'AgentCycleError',
    }));

    // Chain the states
    normalise.next(triageSanitise);
    triageSanitise.next(triageClassify);
    triageClassify.next(needsReasoning);
    reasoning.next(execute);
    execute.next(artefactUpdate);
    artefactUpdate.next(isHousekeepingDue);
    housekeeping.next(success);

    // Main flow
    const definition = heartbeat
      .next(changeDetection)
      .next(hasChanges);

    // Add error handling to critical states
    [heartbeat, changeDetection, triageSanitise, triageClassify, reasoning, execute, artefactUpdate].forEach(state => {
      state.addCatch(catchError, {
        errors: ['States.ALL'],
        resultPath: '$.error',
      });
    });

    // Create log group for state machine
    const logGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/stepfunctions/agentic-pm-agent',
      retention: props.logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create the state machine
    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: 'agentic-pm-agent-cycle',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD, // Not EXPRESS - need execution history
      timeout: cdk.Duration.minutes(10),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });
  }
}
```

### 2.6 EventBridge Schedules

```typescript
// infra/lib/stacks/agent-stack.ts (EventBridge section)
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as iam from 'aws-cdk-lib/aws-iam';

// Main agent cycle - 15 minute schedule
const mainCycleSchedule = new scheduler.CfnSchedule(this, 'MainCycleSchedule', {
  name: 'agentic-pm-main-cycle',
  description: 'Trigger main agent cycle every 15 minutes',
  scheduleExpression: 'rate(15 minutes)',
  flexibleTimeWindow: {
    mode: 'OFF',
  },
  state: 'ENABLED',
  target: {
    arn: this.stateMachine.stateMachineArn,
    roleArn: schedulerRole.roleArn,
    input: JSON.stringify({
      triggeredBy: 'schedule',
      scheduleType: 'main-cycle',
    }),
    retryPolicy: {
      maximumEventAgeInSeconds: 300,
      maximumRetryAttempts: 2,
    },
  },
});

// Hold queue check - 1 minute schedule
const holdQueueSchedule = new scheduler.CfnSchedule(this, 'HoldQueueSchedule', {
  name: 'agentic-pm-hold-queue',
  description: 'Check hold queue every minute',
  scheduleExpression: 'rate(1 minute)',
  flexibleTimeWindow: {
    mode: 'OFF',
  },
  state: 'ENABLED',
  target: {
    arn: getLambda('hold-queue').functionArn,
    roleArn: schedulerRole.roleArn,
    input: JSON.stringify({
      triggeredBy: 'schedule',
      scheduleType: 'hold-queue',
    }),
    retryPolicy: {
      maximumEventAgeInSeconds: 60,
      maximumRetryAttempts: 1,
    },
  },
});

// Scheduler role for EventBridge to invoke targets
const schedulerRole = new iam.Role(this, 'SchedulerRole', {
  roleName: 'agentic-pm-scheduler-role',
  assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
});

this.stateMachine.grantStartExecution(schedulerRole);
getLambda('hold-queue').grantInvoke(schedulerRole);
```

### 2.7 CloudWatch Alarms and Dashboard

```typescript
// infra/lib/stacks/monitoring-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'agentic-pm-alerts',
      displayName: 'Agentic PM Alerts',
    });

    // Add email subscription (configure via parameter)
    const alertEmail = this.node.tryGetContext('alertEmail');
    if (alertEmail) {
      alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    // Alarm: Missed heartbeat (no successful execution in 30 minutes)
    const missedHeartbeatAlarm = new cloudwatch.Alarm(this, 'MissedHeartbeatAlarm', {
      alarmName: 'agentic-pm-missed-heartbeat',
      alarmDescription: 'No successful agent cycle in 30 minutes',
      metric: props.stateMachine.metricSucceeded({
        period: cdk.Duration.minutes(30),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    missedHeartbeatAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Alarm: State machine failures
    const executionFailedAlarm = new cloudwatch.Alarm(this, 'ExecutionFailedAlarm', {
      alarmName: 'agentic-pm-execution-failed',
      alarmDescription: 'Agent cycle execution failed',
      metric: props.stateMachine.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    executionFailedAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Alarm: Lambda errors (aggregated across all functions)
    const lambdaErrors = new cloudwatch.MathExpression({
      expression: Object.keys(props.lambdaFunctions)
        .map((_, i) => `m${i}`)
        .join('+'),
      usingMetrics: Object.fromEntries(
        Array.from(props.lambdaFunctions.entries()).map(([name, fn], i) => [
          `m${i}`,
          fn.metricErrors({ period: cdk.Duration.minutes(5) }),
        ])
      ),
      period: cdk.Duration.minutes(5),
    });

    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'agentic-pm-lambda-errors',
      alarmDescription: 'Lambda function errors detected',
      metric: lambdaErrors,
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    lambdaErrorAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Alarm: DynamoDB throttling
    const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
      alarmName: 'agentic-pm-dynamo-throttle',
      alarmDescription: 'DynamoDB read/write throttling detected',
      metric: props.table.metricThrottledRequestsForOperations({
        operations: [
          dynamodb.Operation.GET_ITEM,
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.QUERY,
        ],
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'AgenticPM',
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Row 1: Agent Status
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Cycle Executions',
        width: 12,
        left: [
          props.stateMachine.metricStarted({ statistic: 'Sum' }),
          props.stateMachine.metricSucceeded({ statistic: 'Sum' }),
          props.stateMachine.metricFailed({ statistic: 'Sum' }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Agent Cycle Duration',
        width: 12,
        left: [
          props.stateMachine.metricTime({
            statistic: 'Average',
            label: 'Avg Duration',
          }),
          props.stateMachine.metricTime({
            statistic: 'p95',
            label: 'P95 Duration',
          }),
        ],
      })
    );

    // Row 2: Lambda Performance
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        width: 12,
        left: Array.from(props.lambdaFunctions.values()).map(fn =>
          fn.metricInvocations({ statistic: 'Sum' })
        ),
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        width: 12,
        left: Array.from(props.lambdaFunctions.values()).map(fn =>
          fn.metricDuration({ statistic: 'Average' })
        ),
      })
    );

    // Row 3: DynamoDB
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Units',
        width: 12,
        left: [
          props.table.metricConsumedReadCapacityUnits({ statistic: 'Sum' }),
          props.table.metricConsumedWriteCapacityUnits({ statistic: 'Sum' }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Latency',
        width: 12,
        left: [
          props.table.metric('SuccessfulRequestLatency', {
            statistic: 'Average',
            dimensionsMap: { Operation: 'GetItem' },
          }),
          props.table.metric('SuccessfulRequestLatency', {
            statistic: 'Average',
            dimensionsMap: { Operation: 'Query' },
          }),
        ],
      })
    );

    // Row 4: Alarms Status
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        width: 24,
        alarms: [
          missedHeartbeatAlarm,
          executionFailedAlarm,
          lambdaErrorAlarm,
          dynamoThrottleAlarm,
        ],
      })
    );
  }
}
```

### 2.8 Amplify App Configuration

```typescript
// infra/lib/stacks/frontend-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // GitHub token for Amplify to access repository
    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this, 'GitHubToken', '/agentic-pm/github/token'
    );

    // Amplify App
    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: 'agentic-pm-dashboard',
      description: 'Agentic PM Workbench Dashboard',

      // GitHub repository configuration
      repository: 'https://github.com/your-username/agentic-pm-workbench',
      accessToken: githubToken.secretValue.unsafeUnwrap(),

      // Build settings
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'npm install -g pnpm',
                'pnpm install --frozen-lockfile',
              ],
            },
            build: {
              commands: [
                'pnpm build',
              ],
            },
          },
          artifacts: {
            baseDirectory: '.next',
            files: ['**/*'],
          },
          cache: {
            paths: ['node_modules/**/*', '.next/cache/**/*'],
          },
        },
      }).toBuildSpec(),

      // Environment variables
      environmentVariables: [
        {
          name: 'NEXT_PUBLIC_AWS_REGION',
          value: this.region,
        },
        {
          name: 'TABLE_NAME',
          value: props.table.tableName,
        },
        {
          name: 'NEXTAUTH_URL',
          value: `https://main.${amplifyApp.attrDefaultDomain}`,
        },
      ],

      // Platform configuration for Next.js SSR
      platform: 'WEB_COMPUTE',

      // IAM service role
      iamServiceRole: amplifyRole.roleArn,

      // Custom rules for SPA routing
      customRules: [
        {
          source: '/<*>',
          target: '/index.html',
          status: '404-200',
        },
      ],
    });

    // Main branch configuration
    const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: true,
      enablePullRequestPreview: false,
      stage: 'PRODUCTION',
      environmentVariables: [
        {
          name: 'ENVIRONMENT',
          value: 'prod',
        },
      ],
    });

    // Development branch (optional)
    if (props.config.envName === 'dev') {
      new amplify.CfnBranch(this, 'DevBranch', {
        appId: amplifyApp.attrAppId,
        branchName: 'develop',
        enableAutoBuild: true,
        enablePullRequestPreview: true,
        stage: 'DEVELOPMENT',
        environmentVariables: [
          {
            name: 'ENVIRONMENT',
            value: 'dev',
          },
        ],
      });
    }

    // IAM role for Amplify
    const amplifyRole = new iam.Role(this, 'AmplifyRole', {
      roleName: 'agentic-pm-amplify-role',
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
    });

    // Amplify needs DynamoDB access for API routes
    props.table.grantReadWriteData(amplifyRole);

    // Amplify needs Secrets Manager access for NextAuth
    amplifyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/agentic-pm/auth/*`,
      ],
    }));

    // Output the Amplify app URL
    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://main.${amplifyApp.attrDefaultDomain}`,
      description: 'Amplify App URL',
    });
  }
}
```

---

## 3. Lambda Layer Strategy

### 3.1 Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Lambda Function                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Handler Code                               │   │
│  │  - Event parsing                                              │   │
│  │  - Error handling                                             │   │
│  │  - Response formatting                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                @agentic-pm/core Layer                         │   │
│  │  - Business logic                                             │   │
│  │  - DynamoDB operations                                        │   │
│  │  - LLM client                                                 │   │
│  │  - Integration clients                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   AWS SDK v3 (bundled)                        │   │
│  │  - @aws-sdk/client-dynamodb                                   │   │
│  │  - @aws-sdk/client-secrets-manager                            │   │
│  │  - @aws-sdk/client-ses                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Shared Dependencies Layer (@agentic-pm/core)

```typescript
// infra/lib/stacks/agent-stack.ts (layer section)
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

// Create the shared core layer
this.coreLayer = new lambda.LayerVersion(this, 'CoreLayer', {
  layerVersionName: 'agentic-pm-core',
  description: 'Shared @agentic-pm/core library and dependencies',
  compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
  compatibleArchitectures: [lambda.Architecture.ARM64],
  code: lambda.Code.fromAsset(path.join(__dirname, '../../../packages/core/layer')),
  license: 'MIT',
});

// Grant layer usage to all Lambda functions
// (This is automatic when layers are passed to Lambda construct)
```

### 3.3 Layer Build Process

```typescript
// packages/core/scripts/build-layer.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const LAYER_DIR = path.join(__dirname, '../layer');
const NODEJS_DIR = path.join(LAYER_DIR, 'nodejs');
const CORE_DIST = path.join(__dirname, '../dist');

// Clean and create layer directory structure
fs.rmSync(LAYER_DIR, { recursive: true, force: true });
fs.mkdirSync(NODEJS_DIR, { recursive: true });

// Copy compiled core library
fs.cpSync(CORE_DIST, path.join(NODEJS_DIR, 'node_modules/@agentic-pm/core'), {
  recursive: true,
});

// Install production dependencies
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const prodDeps = packageJson.dependencies;

// Create a minimal package.json for the layer
const layerPackageJson = {
  name: 'agentic-pm-layer',
  version: packageJson.version,
  dependencies: prodDeps,
};

fs.writeFileSync(
  path.join(NODEJS_DIR, 'package.json'),
  JSON.stringify(layerPackageJson, null, 2)
);

// Install dependencies (excluding AWS SDK - it's provided by Lambda runtime)
execSync('pnpm install --prod --ignore-scripts', {
  cwd: NODEJS_DIR,
  stdio: 'inherit',
});

// Remove AWS SDK packages (provided by Lambda runtime)
const awsSdkPackages = [
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-ses',
  '@aws-sdk/lib-dynamodb',
];

for (const pkg of awsSdkPackages) {
  const pkgPath = path.join(NODEJS_DIR, 'node_modules', pkg);
  if (fs.existsSync(pkgPath)) {
    fs.rmSync(pkgPath, { recursive: true });
  }
}

console.log('Layer built successfully at:', LAYER_DIR);
```

### 3.4 Layer Versioning Approach

```typescript
// infra/lib/stacks/agent-stack.ts (versioning)

// Layer versions are managed via CDK asset hashing
// When layer content changes, CDK automatically creates a new version

// For explicit version tracking, use SSM Parameter Store
import * as ssm from 'aws-cdk-lib/aws-ssm';

const coreLayerVersion = new ssm.StringParameter(this, 'CoreLayerVersionParam', {
  parameterName: '/agentic-pm/layers/core-version',
  stringValue: this.coreLayer.layerVersionArn,
  description: 'Current version ARN of @agentic-pm/core layer',
});

// Lambda functions reference the layer directly (not via parameter)
// This ensures atomic deployments where functions and layers update together
```

### 3.5 AWS SDK Strategy

```typescript
// packages/core/src/aws/client-factory.ts

/**
 * AWS SDK v3 Client Factory
 *
 * Strategy: Use Lambda runtime's bundled AWS SDK
 *
 * Benefits:
 * - Smaller deployment package
 * - Automatic security updates
 * - Better cold start performance
 *
 * Caveat: If specific SDK version needed, bundle it explicitly
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SESClient } from '@aws-sdk/client-ses';

// Singleton clients (reused across warm invocations)
let dynamoClient: DynamoDBDocumentClient | null = null;
let secretsClient: SecretsManagerClient | null = null;
let sesClient: SESClient | null = null;

const clientConfig = {
  region: process.env.AWS_REGION || 'ap-southeast-2',
};

export function getDynamoClient(): DynamoDBDocumentClient {
  if (!dynamoClient) {
    dynamoClient = DynamoDBDocumentClient.from(
      new DynamoDBClient(clientConfig),
      {
        marshallOptions: {
          removeUndefinedValues: true,
          convertEmptyValues: false,
        },
      }
    );
  }
  return dynamoClient;
}

export function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient(clientConfig);
  }
  return secretsClient;
}

export function getSESClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient(clientConfig);
  }
  return sesClient;
}
```

---

## 4. CI/CD Pipeline

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy Agentic PM

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main

env:
  AWS_REGION: ap-southeast-2
  NODE_VERSION: '20'

jobs:
  # Job 1: Lint and Test
  test:
    name: Lint and Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

      - name: Run unit tests
        run: pnpm test:unit

      - name: Run integration tests
        run: pnpm test:integration
        env:
          # Use DynamoDB Local for integration tests
          DYNAMODB_ENDPOINT: http://localhost:8000

  # Job 2: Build
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build

      - name: Build Lambda layer
        run: pnpm --filter @agentic-pm/core build:layer

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: |
            packages/core/dist
            packages/core/layer
            packages/lambdas/dist
            apps/dashboard/.next
          retention-days: 1

  # Job 3: CDK Synth (validate infrastructure)
  cdk-synth:
    name: CDK Synth
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: CDK Synth
        run: |
          cd infra
          pnpm cdk synth --context env=dev
        env:
          AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}

      - name: Upload CDK output
        uses: actions/upload-artifact@v4
        with:
          name: cdk-output
          path: infra/cdk.out
          retention-days: 1

  # Job 4: Deploy to Dev
  deploy-dev:
    name: Deploy to Dev
    runs-on: ubuntu-latest
    needs: [build, cdk-synth]
    if: github.ref == 'refs/heads/develop' || github.event_name == 'pull_request'
    environment: development
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: CDK Deploy (Dev)
        run: |
          cd infra
          pnpm cdk deploy --all --context env=dev --require-approval never
        env:
          AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}

      - name: Post-deployment validation
        run: |
          # Verify Step Functions state machine exists
          aws stepfunctions describe-state-machine \
            --state-machine-arn arn:aws:states:${{ env.AWS_REGION }}:${{ secrets.AWS_ACCOUNT_ID }}:stateMachine:agentic-pm-agent-cycle

          # Verify Lambda functions exist
          for fn in heartbeat change-detection normalise triage-sanitise triage-classify reasoning execute artefact-update housekeeping hold-queue; do
            aws lambda get-function --function-name agentic-pm-$fn
          done

  # Job 5: Deploy to Prod
  deploy-prod:
    name: Deploy to Prod
    runs-on: ubuntu-latest
    needs: [build, cdk-synth, deploy-dev]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
          aws-region: ${{ env.AWS_REGION }}

      - name: CDK Deploy (Prod)
        run: |
          cd infra
          pnpm cdk deploy --all --context env=prod --require-approval never
        env:
          AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID_PROD }}

      - name: Smoke test
        run: |
          # Trigger a test execution of the state machine
          EXECUTION_ARN=$(aws stepfunctions start-execution \
            --state-machine-arn arn:aws:states:${{ env.AWS_REGION }}:${{ secrets.AWS_ACCOUNT_ID_PROD }}:stateMachine:agentic-pm-agent-cycle \
            --input '{"triggeredBy":"ci-smoke-test"}' \
            --query 'executionArn' --output text)

          # Wait for completion (max 5 minutes)
          aws stepfunctions describe-execution \
            --execution-arn $EXECUTION_ARN \
            --query 'status' --output text | grep -E 'SUCCEEDED|RUNNING'
```

### 4.2 CDK Deploy Stages

```typescript
// infra/lib/pipeline/deploy-stages.ts
import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

/**
 * CDK Pipeline (alternative to GitHub Actions)
 * Use this if you prefer AWS-native CI/CD
 */
export class AgenticPMPipeline extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Source: GitHub
    const source = pipelines.CodePipelineSource.gitHub(
      'your-username/agentic-pm-workbench',
      'main',
      {
        authentication: cdk.SecretValue.secretsManager('/agentic-pm/github/token'),
      }
    );

    // Pipeline
    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: 'agentic-pm-pipeline',
      crossAccountKeys: false,

      synth: new pipelines.ShellStep('Synth', {
        input: source,
        commands: [
          'npm install -g pnpm',
          'pnpm install --frozen-lockfile',
          'pnpm build',
          'pnpm --filter @agentic-pm/core build:layer',
          'cd infra && pnpm cdk synth',
        ],
        primaryOutputDirectory: 'infra/cdk.out',
      }),
    });

    // Development stage
    const devStage = new AgenticPMStage(this, 'Dev', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-southeast-2',
      },
      envName: 'dev',
    });

    pipeline.addStage(devStage, {
      post: [
        new pipelines.ShellStep('IntegrationTest', {
          commands: [
            'pnpm test:integration',
          ],
        }),
      ],
    });

    // Production stage (manual approval)
    const prodStage = new AgenticPMStage(this, 'Prod', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-southeast-2',
      },
      envName: 'prod',
    });

    pipeline.addStage(prodStage, {
      pre: [
        new pipelines.ManualApprovalStep('ApproveProd', {
          comment: 'Approve deployment to production',
        }),
      ],
      post: [
        new pipelines.ShellStep('SmokeTest', {
          commands: [
            'aws stepfunctions start-execution --state-machine-arn $STATE_MACHINE_ARN --input \'{"triggeredBy":"pipeline-smoke-test"}\'',
          ],
          envFromCfnOutputs: {
            STATE_MACHINE_ARN: prodStage.stateMachineArn,
          },
        }),
      ],
    });
  }
}

class AgenticPMStage extends cdk.Stage {
  public readonly stateMachineArn: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: cdk.StageProps & { envName: string }) {
    super(scope, id, props);

    // Create all stacks for this stage
    const config = getEnvironmentConfig(props.envName);

    const foundation = new FoundationStack(this, 'Foundation', { config });
    const agent = new AgentStack(this, 'Agent', {
      config,
      table: foundation.table,
      secrets: foundation.secrets,
      roles: foundation.roles,
    });

    new FrontendStack(this, 'Frontend', {
      config,
      table: foundation.table,
      stateMachine: agent.stateMachine,
    });

    new MonitoringStack(this, 'Monitoring', {
      config,
      table: foundation.table,
      lambdaFunctions: agent.lambdaFunctions,
      stateMachine: agent.stateMachine,
    });

    this.stateMachineArn = agent.stateMachineArnOutput;
  }
}
```

### 4.3 Lambda Deployment Strategy

```yaml
# Lambda deployment is handled via CDK asset bundling
# Key strategies:

# 1. Asset hashing for change detection
#    - CDK automatically detects when Lambda code changes
#    - Only changed functions are redeployed

# 2. Layer separation
#    - Core library in layer (shared across functions)
#    - Handler code deployed per-function
#    - Reduces deployment size and time

# 3. Blue/green deployment via aliases (optional for future)
#    - Can be added if zero-downtime deployment needed
#    - Not critical for background agent process
```

### 4.4 Amplify Auto-Deploy Integration

```yaml
# Amplify auto-deploys from GitHub automatically
# Configuration is in the FrontendStack CDK

# Key settings:
# - Auto-build: enabled for main and develop branches
# - Pull request previews: enabled for develop branch only
# - Build spec: defined in CDK, not amplify.yml

# Environment variables are set via CDK:
# - TABLE_NAME: from FoundationStack
# - NEXTAUTH_URL: computed from Amplify domain
# - ENVIRONMENT: dev or prod

# To manually trigger a build:
# aws amplify start-job --app-id <app-id> --branch-name main --job-type RELEASE
```

### 4.5 Environment Promotion (Dev to Prod)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Environment Promotion Flow                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  develop branch ──► GitHub Actions ──► Deploy to Dev                 │
│       │                                     │                        │
│       │                                     ▼                        │
│       │                            Integration Tests                 │
│       │                                     │                        │
│       │                                     ▼                        │
│       │                              ✓ Tests Pass                    │
│       │                                                              │
│       ▼                                                              │
│  Pull Request ──► main branch ──► GitHub Actions ──► Deploy to Prod  │
│  (with review)                                           │           │
│                                                          ▼           │
│                                                    Smoke Tests       │
│                                                          │           │
│                                                          ▼           │
│                                                    ✓ Production      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Local Development Setup

### 5.1 docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  # DynamoDB Local for database development
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    container_name: agentic-pm-dynamodb
    ports:
      - "8000:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /data"
    volumes:
      - dynamodb-data:/data
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:8000 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3

  # LocalStack for AWS service mocking
  localstack:
    image: localstack/localstack:latest
    container_name: agentic-pm-localstack
    ports:
      - "4566:4566"           # LocalStack Gateway
      - "4510-4559:4510-4559" # External services
    environment:
      - SERVICES=secretsmanager,ses,stepfunctions,lambda,events
      - DEBUG=1
      - DOCKER_HOST=unix:///var/run/docker.sock
      - LAMBDA_EXECUTOR=docker
      - LAMBDA_DOCKER_NETWORK=agentic-pm-network
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - localstack-data:/var/lib/localstack
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:4566/_localstack/health | grep -q '\"secretsmanager\": \"running\"'"]
      interval: 10s
      timeout: 5s
      retries: 3

  # DynamoDB Admin UI (optional)
  dynamodb-admin:
    image: aaronshaf/dynamodb-admin:latest
    container_name: agentic-pm-dynamodb-admin
    ports:
      - "8001:8001"
    environment:
      - DYNAMO_ENDPOINT=http://dynamodb-local:8000
      - AWS_REGION=ap-southeast-2
      - AWS_ACCESS_KEY_ID=local
      - AWS_SECRET_ACCESS_KEY=local
    depends_on:
      - dynamodb-local

volumes:
  dynamodb-data:
  localstack-data:

networks:
  default:
    name: agentic-pm-network
```

### 5.2 LocalStack Configuration

```typescript
// scripts/localstack-init.ts
import { execSync } from 'child_process';

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const AWS_REGION = 'ap-southeast-2';

// Common AWS CLI options for LocalStack
const awsLocal = (command: string) =>
  `aws --endpoint-url=${LOCALSTACK_ENDPOINT} --region=${AWS_REGION} ${command}`;

// Create secrets in Secrets Manager
const secrets = [
  {
    name: '/agentic-pm/llm/api-key',
    value: JSON.stringify({ apiKey: 'sk-test-local-development' }),
  },
  {
    name: '/agentic-pm/jira/api-token',
    value: JSON.stringify({
      email: 'test@example.com',
      apiToken: 'test-token',
      baseUrl: 'https://test.atlassian.net',
    }),
  },
  {
    name: '/agentic-pm/graph/credentials',
    value: JSON.stringify({
      tenantId: 'test-tenant',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      userId: 'test-user@example.com',
    }),
  },
  {
    name: '/agentic-pm/auth/nextauth-secret',
    value: JSON.stringify({ secret: 'local-development-secret-key-for-testing' }),
  },
];

console.log('Creating secrets in LocalStack...');
for (const secret of secrets) {
  try {
    execSync(awsLocal(`secretsmanager create-secret --name "${secret.name}" --secret-string '${secret.value}'`), {
      stdio: 'inherit',
    });
  } catch (e) {
    // Secret may already exist
    execSync(awsLocal(`secretsmanager put-secret-value --secret-id "${secret.name}" --secret-string '${secret.value}'`), {
      stdio: 'inherit',
    });
  }
}

// Verify SES email identity (for local testing)
console.log('Verifying SES email identity...');
execSync(awsLocal('ses verify-email-identity --email-address test@agentic-pm.local'), {
  stdio: 'inherit',
});

console.log('LocalStack initialization complete!');
```

### 5.3 DynamoDB Local Setup

```typescript
// scripts/dynamodb-init.ts
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = 'AgenticPM-Local';

const client = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: 'ap-southeast-2',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

async function createTable() {
  try {
    // Check if table exists
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`Table ${TABLE_NAME} already exists`);
    return;
  } catch (e: any) {
    if (e.name !== 'ResourceNotFoundException') throw e;
  }

  // Create table with same schema as production
  await client.send(new CreateTableCommand({
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
  }));

  console.log(`Table ${TABLE_NAME} created successfully`);
}

async function seedData() {
  const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
  const docClient = DynamoDBDocumentClient.from(client);

  // Seed default agent config
  const defaultConfigs = [
    { key: 'polling_interval_minutes', value: 15 },
    { key: 'budget_ceiling_daily_usd', value: 0.30 },
    { key: 'hold_queue_minutes', value: 30 },
    { key: 'working_hours', value: { start: '08:00', end: '18:00', timezone: 'Australia/Sydney' } },
  ];

  for (const config of defaultConfigs) {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: 'AGENT',
        SK: `CONFIG#${config.key}`,
        key: config.key,
        value: config.value,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  // Seed a test project
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: 'PROJECT#test-project-001',
      SK: 'METADATA',
      id: 'test-project-001',
      name: 'Test Project',
      description: 'A project for local development testing',
      status: 'active',
      source: 'jira',
      sourceProjectKey: 'TEST',
      autonomyLevel: 'monitoring',
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI1PK: 'STATUS#active',
      GSI1SK: 'PROJECT#test-project-001',
    },
  }));

  console.log('Seed data inserted successfully');
}

createTable()
  .then(seedData)
  .catch(console.error);
```

### 5.4 SAM Local Invoke Setup

```yaml
# template.yaml (SAM template for local Lambda testing)
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: SAM template for local Lambda development

Globals:
  Function:
    Runtime: nodejs20.x
    Timeout: 120
    MemorySize: 256
    Architectures:
      - arm64
    Environment:
      Variables:
        TABLE_NAME: AgenticPM-Local
        DYNAMODB_ENDPOINT: http://host.docker.internal:8000
        LOCALSTACK_ENDPOINT: http://host.docker.internal:4566
        ENVIRONMENT: local
        LOG_LEVEL: DEBUG

Resources:
  HeartbeatFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: agentic-pm-heartbeat
      Handler: heartbeat.handler
      CodeUri: packages/lambdas/dist/
      Layers:
        - !Ref CoreLayer

  ChangeDetectionFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: agentic-pm-change-detection
      Handler: change-detection.handler
      CodeUri: packages/lambdas/dist/
      Timeout: 60
      Layers:
        - !Ref CoreLayer

  TriageSanitiseFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: agentic-pm-triage-sanitise
      Handler: triage-sanitise.handler
      CodeUri: packages/lambdas/dist/
      Layers:
        - !Ref CoreLayer

  # ... additional functions ...

  CoreLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: agentic-pm-core
      ContentUri: packages/core/layer/
      CompatibleRuntimes:
        - nodejs20.x
      RetentionPolicy: Delete
```

```bash
# scripts/sam-invoke.sh
#!/bin/bash

# Build Lambda functions
pnpm build

# Build core layer
pnpm --filter @agentic-pm/core build:layer

# Invoke a Lambda function locally
# Usage: ./scripts/sam-invoke.sh heartbeat '{"triggeredBy":"manual"}'

FUNCTION_NAME=$1
EVENT_PAYLOAD=${2:-'{}'}

sam local invoke "${FUNCTION_NAME}Function" \
  --template template.yaml \
  --event <(echo "$EVENT_PAYLOAD") \
  --docker-network agentic-pm-network \
  --env-vars scripts/env.json
```

```json
// scripts/env.json
{
  "Parameters": {
    "TABLE_NAME": "AgenticPM-Local",
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:8000",
    "LOCALSTACK_ENDPOINT": "http://host.docker.internal:4566",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local",
    "AWS_REGION": "ap-southeast-2",
    "ENVIRONMENT": "local",
    "LOG_LEVEL": "DEBUG"
  }
}
```

### 5.5 Local Development Scripts

```json
// package.json (root)
{
  "scripts": {
    "dev": "pnpm run --parallel dev:*",
    "dev:dashboard": "pnpm --filter @agentic-pm/dashboard dev",
    "dev:agent": "tsx watch packages/lambdas/src/local-runner.ts",

    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",

    "db:init": "tsx scripts/dynamodb-init.ts",
    "localstack:init": "tsx scripts/localstack-init.ts",
    "local:setup": "pnpm docker:up && sleep 5 && pnpm db:init && pnpm localstack:init",

    "test:unit": "vitest run --dir packages",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "playwright test",

    "build": "pnpm run --filter @agentic-pm/* build",
    "build:layer": "pnpm --filter @agentic-pm/core build:layer",

    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",

    "cdk:synth": "cd infra && pnpm cdk synth",
    "cdk:deploy:dev": "cd infra && pnpm cdk deploy --all --context env=dev",
    "cdk:deploy:prod": "cd infra && pnpm cdk deploy --all --context env=prod"
  }
}
```

```typescript
// packages/lambdas/src/local-runner.ts
/**
 * Local development runner that simulates the Step Functions workflow
 * Runs the full agent cycle locally using DynamoDB Local and LocalStack
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { heartbeatHandler } from './heartbeat';
import { changeDetectionHandler } from './change-detection';
import { normaliseHandler } from './normalise';
import { triageSanitiseHandler } from './triage-sanitise';
import { triageClassifyHandler } from './triage-classify';
import { executeHandler } from './execute';
import { artefactUpdateHandler } from './artefact-update';
import { housekeepingHandler } from './housekeeping';

interface AgentState {
  triggeredBy: string;
  hasChanges?: boolean;
  signals?: any[];
  sanitisedSignals?: any[];
  classifiedSignals?: any[];
  needsComplexReasoning?: boolean;
  actions?: any[];
  housekeepingDue?: boolean;
}

async function runAgentCycle() {
  console.log('Starting local agent cycle...');
  let state: AgentState = { triggeredBy: 'local-runner' };

  try {
    // Step 1: Heartbeat
    console.log('Step 1: Heartbeat');
    state = await heartbeatHandler(state);

    // Step 2: Change Detection
    console.log('Step 2: Change Detection');
    state = await changeDetectionHandler(state);

    // Step 3: Check if changes exist
    if (!state.hasChanges) {
      console.log('No changes detected. Cycle complete.');
      return;
    }

    // Step 4: Normalise
    console.log('Step 3: Normalise');
    state = await normaliseHandler(state);

    // Step 5: Triage Sanitise
    console.log('Step 4: Triage Sanitise');
    state = await triageSanitiseHandler(state);

    // Step 6: Triage Classify
    console.log('Step 5: Triage Classify');
    state = await triageClassifyHandler(state);

    // Step 7: Execute (skip complex reasoning for local dev)
    console.log('Step 6: Execute');
    state = await executeHandler(state);

    // Step 8: Artefact Update
    console.log('Step 7: Artefact Update');
    state = await artefactUpdateHandler(state);

    // Step 9: Housekeeping (if due)
    if (state.housekeepingDue) {
      console.log('Step 8: Housekeeping');
      state = await housekeepingHandler(state);
    }

    console.log('Agent cycle complete!');
    console.log('Final state:', JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Agent cycle failed:', error);
    process.exit(1);
  }
}

// Run immediately in local development
runAgentCycle();
```

---

## 6. Cost Controls

### 6.1 CDK Aspects for Tagging

```typescript
// infra/lib/aspects/cost-tagging.ts
import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

/**
 * CDK Aspect that applies cost allocation tags to all resources
 */
export class CostTaggingAspect implements cdk.IAspect {
  private readonly tags: Record<string, string>;

  constructor(envName: string) {
    this.tags = {
      Project: 'agentic-pm',
      Environment: envName,
      ManagedBy: 'cdk',
      CostCenter: 'personal',
      Owner: 'agentic-pm-workbench',
    };
  }

  visit(node: IConstruct): void {
    if (cdk.TagManager.isTaggable(node)) {
      for (const [key, value] of Object.entries(this.tags)) {
        cdk.Tags.of(node).add(key, value);
      }
    }
  }
}

// Apply to all stacks
// In bin/agentic-pm.ts:
import { CostTaggingAspect } from '../lib/aspects/cost-tagging';

cdk.Aspects.of(app).add(new CostTaggingAspect(env));
```

### 6.2 Resource Limit Aspect

```typescript
// infra/lib/aspects/resource-limits.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

/**
 * CDK Aspect that enforces resource limits to control costs
 */
export class ResourceLimitAspect implements cdk.IAspect {
  private readonly config: {
    maxLambdaMemory: number;
    maxLambdaTimeout: number;
    maxConcurrency: number;
  };

  constructor(envName: 'dev' | 'prod') {
    this.config = envName === 'prod'
      ? {
          maxLambdaMemory: 512,      // MB
          maxLambdaTimeout: 300,      // seconds
          maxConcurrency: 10,         // reserved concurrency
        }
      : {
          maxLambdaMemory: 256,
          maxLambdaTimeout: 120,
          maxConcurrency: 5,
        };
  }

  visit(node: IConstruct): void {
    // Enforce Lambda memory limits
    if (node instanceof lambda.Function) {
      const cfnFunction = node.node.defaultChild as lambda.CfnFunction;

      // Check memory
      if (cfnFunction.memorySize && cfnFunction.memorySize > this.config.maxLambdaMemory) {
        cdk.Annotations.of(node).addWarning(
          `Lambda memory (${cfnFunction.memorySize}MB) exceeds limit (${this.config.maxLambdaMemory}MB). Resetting to limit.`
        );
        cfnFunction.memorySize = this.config.maxLambdaMemory;
      }

      // Check timeout
      if (cfnFunction.timeout && cfnFunction.timeout > this.config.maxLambdaTimeout) {
        cdk.Annotations.of(node).addWarning(
          `Lambda timeout (${cfnFunction.timeout}s) exceeds limit (${this.config.maxLambdaTimeout}s). Resetting to limit.`
        );
        cfnFunction.timeout = this.config.maxLambdaTimeout;
      }

      // Set reserved concurrency to prevent runaway costs
      if (!node.currentVersion) {
        node.addAlias('current', {
          provisionedConcurrentExecutions: 0, // No provisioned concurrency
        });
      }
    }
  }
}
```

### 6.3 VPC Prevention Aspect

```typescript
// infra/lib/aspects/no-vpc.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { IConstruct } from 'constructs';

/**
 * CDK Aspect that prevents VPC usage to avoid NAT Gateway costs
 *
 * CRITICAL: NAT Gateway costs ~$33/month, which exceeds the entire budget.
 * Lambda functions MUST run outside VPC.
 */
export class NoVpcAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    // Fail if any Lambda is configured with VPC
    if (node instanceof lambda.Function) {
      const cfnFunction = node.node.defaultChild as lambda.CfnFunction;
      if (cfnFunction.vpcConfig) {
        cdk.Annotations.of(node).addError(
          'Lambda functions must run OUTSIDE VPC to avoid NAT Gateway costs (~$33/month). ' +
          'Remove VPC configuration from this function.'
        );
      }
    }

    // Fail if NAT Gateway is created
    if (node instanceof ec2.CfnNatGateway) {
      cdk.Annotations.of(node).addError(
        'NAT Gateway creation is prohibited. Cost: ~$33/month, which exceeds the entire project budget. ' +
        'Lambda functions should run outside VPC for external API access.'
      );
    }

    // Warn if VPC is created (may be legitimate, but review)
    if (node instanceof ec2.Vpc) {
      cdk.Annotations.of(node).addWarning(
        'VPC created. Ensure no NAT Gateway or VPC-attached Lambda functions are configured. ' +
        'Lambda functions must run outside VPC for cost control.'
      );
    }
  }
}
```

### 6.4 Budget Alerts via CloudWatch

```typescript
// infra/lib/stacks/monitoring-stack.ts (budget section)
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';

// AWS Budgets for cost monitoring
const monthlyBudget = new budgets.CfnBudget(this, 'MonthlyBudget', {
  budget: {
    budgetName: 'agentic-pm-monthly',
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: 15, // $15/month ceiling
      unit: 'USD',
    },
    costFilters: {
      TagKeyValue: ['Project$agentic-pm'],
    },
  },
  notificationsWithSubscribers: [
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 80, // Alert at 80% ($12)
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [
        {
          subscriptionType: 'SNS',
          address: alertTopic.topicArn,
        },
      ],
    },
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 100, // Alert at 100% ($15)
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [
        {
          subscriptionType: 'SNS',
          address: alertTopic.topicArn,
        },
      ],
    },
    {
      notification: {
        notificationType: 'FORECASTED',
        comparisonOperator: 'GREATER_THAN',
        threshold: 120, // Alert if forecast exceeds $18
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [
        {
          subscriptionType: 'SNS',
          address: alertTopic.topicArn,
        },
      ],
    },
  ],
});

// CloudWatch alarm for daily cost anomaly
const dailyCostMetric = new cloudwatch.Metric({
  namespace: 'AWS/Billing',
  metricName: 'EstimatedCharges',
  dimensionsMap: {
    Currency: 'USD',
  },
  statistic: 'Maximum',
  period: cdk.Duration.hours(6),
});

const dailyCostAlarm = new cloudwatch.Alarm(this, 'DailyCostAlarm', {
  alarmName: 'agentic-pm-daily-cost-spike',
  alarmDescription: 'Daily cost exceeds expected rate',
  metric: dailyCostMetric,
  threshold: 0.75, // $0.75/day is ~$22.50/month (50% over budget)
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
});
dailyCostAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

### 6.5 Lambda Concurrency Limits

```typescript
// infra/lib/stacks/agent-stack.ts (concurrency section)

// Set reserved concurrency to prevent runaway Lambda costs
// At $0.20 per 1M requests, this is mainly about preventing
// unexpected high invocation rates

const concurrencyLimits: Record<string, number> = {
  'heartbeat': 2,
  'change-detection': 2,
  'normalise': 2,
  'triage-sanitise': 2,
  'triage-classify': 2,
  'reasoning': 1,           // Expensive LLM calls
  'execute': 2,
  'artefact-update': 2,
  'housekeeping': 1,
  'hold-queue': 2,
};

for (const [name, concurrency] of Object.entries(concurrencyLimits)) {
  const fn = this.lambdaFunctions.get(name);
  if (fn) {
    // Note: Reserved concurrency of 0 would disable the function
    // Setting to low values ensures cost control while maintaining availability
    new lambda.Alias(this, `${name}Alias`, {
      aliasName: 'current',
      version: fn.currentVersion,
    });

    // Account-level concurrency is 1000 by default
    // Reserving concurrency per function prevents one function from
    // consuming all available concurrency
    (fn.node.defaultChild as lambda.CfnFunction).reservedConcurrentExecutions = concurrency;
  }
}
```

### 6.6 Cost Summary Dashboard

```typescript
// Additional CloudWatch dashboard widgets for cost tracking

dashboard.addWidgets(
  new cloudwatch.SingleValueWidget({
    title: 'Estimated Monthly Cost',
    width: 8,
    metrics: [
      new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
      }),
    ],
  }),
  new cloudwatch.TextWidget({
    title: 'Cost Targets',
    width: 8,
    markdown: `
## Budget Thresholds
- **Target:** $11-13/month
- **Ceiling:** $15/month
- **Alert at:** $12 (80%)

## LLM Budget
- **Daily:** $0.23
- **Monthly:** $8.00
- **Degradation tiers:** See SPEC section 6.3
    `,
  }),
  new cloudwatch.GraphWidget({
    title: 'Cost Trend (30 days)',
    width: 8,
    left: [
      new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.days(1),
      }),
    ],
  })
);
```

---

## Appendix A: Complete Stack File Structure

```
agentic-pm-workbench/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── apps/
│   └── dashboard/                 # Next.js frontend
├── packages/
│   ├── core/                      # Shared library
│   │   ├── src/
│   │   ├── layer/                 # Built layer (gitignored)
│   │   ├── scripts/
│   │   │   └── build-layer.ts
│   │   └── package.json
│   └── lambdas/                   # Lambda handlers
│       ├── src/
│       │   ├── heartbeat.ts
│       │   ├── change-detection.ts
│       │   ├── normalise.ts
│       │   ├── triage-sanitise.ts
│       │   ├── triage-classify.ts
│       │   ├── reasoning.ts
│       │   ├── execute.ts
│       │   ├── artefact-update.ts
│       │   ├── housekeeping.ts
│       │   ├── hold-queue.ts
│       │   └── local-runner.ts
│       ├── dist/                  # Compiled (gitignored)
│       └── package.json
├── infra/
│   ├── bin/
│   │   └── agentic-pm.ts
│   ├── lib/
│   │   ├── stacks/
│   │   │   ├── foundation-stack.ts
│   │   │   ├── agent-stack.ts
│   │   │   ├── frontend-stack.ts
│   │   │   └── monitoring-stack.ts
│   │   ├── constructs/
│   │   │   ├── agent-lambda.ts
│   │   │   ├── agent-state-machine.ts
│   │   │   └── dynamodb-table.ts
│   │   ├── aspects/
│   │   │   ├── cost-tagging.ts
│   │   │   ├── resource-limits.ts
│   │   │   └── no-vpc.ts
│   │   └── config/
│   │       ├── environments.ts
│   │       └── constants.ts
│   ├── test/
│   ├── cdk.json
│   └── package.json
├── scripts/
│   ├── dynamodb-init.ts
│   ├── localstack-init.ts
│   ├── sam-invoke.sh
│   └── env.json
├── tests/
│   └── integration/
├── docker-compose.yml
├── template.yaml                  # SAM template for local dev
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Appendix B: CDK Deployment Commands

```bash
# First-time setup
cd infra
pnpm install
pnpm cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2

# Development
pnpm cdk synth --context env=dev           # Validate templates
pnpm cdk diff --context env=dev            # Preview changes
pnpm cdk deploy --all --context env=dev    # Deploy all stacks

# Production
pnpm cdk synth --context env=prod
pnpm cdk diff --context env=prod
pnpm cdk deploy --all --context env=prod --require-approval broadening

# Destroy (dev only)
pnpm cdk destroy --all --context env=dev

# Useful commands
pnpm cdk list                              # List all stacks
pnpm cdk doctor                            # Check CDK setup
aws cloudformation describe-stacks         # View deployed stacks
```

---

## Appendix C: Environment Variables Reference

| Variable | Description | Set By |
|----------|-------------|--------|
| `TABLE_NAME` | DynamoDB table name | CDK (Lambda env) |
| `TABLE_ARN` | DynamoDB table ARN | CDK (Lambda env) |
| `ENVIRONMENT` | `dev` or `prod` | CDK (Lambda env) |
| `LOG_LEVEL` | Logging level (`DEBUG`, `INFO`, `WARN`, `ERROR`) | CDK (Lambda env) |
| `AWS_REGION` | AWS region | Lambda runtime |
| `DYNAMODB_ENDPOINT` | DynamoDB endpoint (local dev only) | docker-compose |
| `LOCALSTACK_ENDPOINT` | LocalStack endpoint (local dev only) | docker-compose |

---

## Appendix D: Cost Trap Prevention Checklist

Before every deployment, verify:

- [ ] No Lambda functions have VPC configuration
- [ ] No NAT Gateway resources in CloudFormation template
- [ ] No RDS or Aurora resources
- [ ] No ElastiCache resources
- [ ] DynamoDB uses on-demand billing (not provisioned)
- [ ] No provisioned concurrency on Lambda functions
- [ ] CloudWatch log retention is set (not indefinite)
- [ ] Budget alerts are configured and SNS topic has subscriber

```bash
# Validate no VPC/NAT in synthesised template
cd infra
pnpm cdk synth --context env=prod -q
grep -r "AWS::EC2::NatGateway" cdk.out/ && echo "ERROR: NAT Gateway found!" && exit 1
grep -r "VpcConfig" cdk.out/ && echo "WARNING: VPC config found - verify no NAT Gateway"
echo "Cost trap check passed"
```
