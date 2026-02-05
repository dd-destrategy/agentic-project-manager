import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import type { AgenticPMSecrets, AgenticPMRoles } from './foundation-stack.js';

export interface AgentStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  table: dynamodb.Table;
  secrets: AgenticPMSecrets;
  roles: AgenticPMRoles;
}

export class AgentStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly lambdaFunctions: Map<string, lambda.Function>;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly logEncryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // Add cost tracking tags
    cdk.Tags.of(this).add('Project', 'agentic-pm');
    cdk.Tags.of(this).add('Environment', props.config.envName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Create KMS key for CloudWatch log encryption
    this.logEncryptionKey = new kms.Key(this, 'LogEncryptionKey', {
      alias: 'agentic-pm-logs',
      description: 'KMS key for encrypting CloudWatch logs',
      enableKeyRotation: true,
      removalPolicy: props.config.envName === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Grant CloudWatch Logs permission to use the key
    this.logEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:Describe*',
        ],
        principals: [
          new iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`),
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`,
          },
        },
      })
    );

    // Create dead letter queue for Lambda failures
    this.deadLetterQueue = new sqs.Queue(this, 'LambdaDLQ', {
      queueName: 'agentic-pm-lambda-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: this.deadLetterQueue.queueUrl,
      exportName: `${this.stackName}-DLQUrl`,
    });

    // Create Lambda functions
    this.lambdaFunctions = this.createLambdaFunctions(props);

    // Create Step Functions state machine
    this.stateMachine = this.createStateMachine(props);

    // Create EventBridge schedule
    this.createSchedule(props);
  }

  private createLambdaFunctions(props: AgentStackProps): Map<string, lambda.Function> {
    const functions = new Map<string, lambda.Function>();

    const lambdaConfigs = [
      { name: 'heartbeat', role: 'agent', timeout: 30 },
      { name: 'change-detection', role: 'agent', timeout: 60 },
      { name: 'normalise', role: 'agent', timeout: 30 },
      { name: 'triage-sanitise', role: 'triage', timeout: 120 },
      { name: 'triage-classify', role: 'triage', timeout: 120 },
      { name: 'reasoning', role: 'triage', timeout: 300 },
      { name: 'execute', role: 'agent', timeout: 60 },
      { name: 'artefact-update', role: 'agent', timeout: 180 },
      { name: 'housekeeping', role: 'agent', timeout: 120 },
      { name: 'hold-queue', role: 'agent', timeout: 60 },
    ];

    for (const config of lambdaConfigs) {
      const fn = new lambda.Function(this, `Lambda-${config.name}`, {
        functionName: `agentic-pm-${config.name}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: `${config.name}/handler.handler`,
        code: lambda.Code.fromAsset('../lambdas/dist'),
        role:
          config.role === 'triage'
            ? props.roles.triageLambdaRole
            : props.roles.agentLambdaRole,
        timeout: cdk.Duration.seconds(config.timeout),
        memorySize: 256,
        architecture: lambda.Architecture.ARM64,
        environment: {
          TABLE_NAME: props.table.tableName,
          TABLE_ARN: props.table.tableArn,
          ENVIRONMENT: props.config.envName,
          NODE_OPTIONS: '--enable-source-maps',
          LOG_LEVEL: 'INFO',
        },
        tracing: lambda.Tracing.ACTIVE,
        deadLetterQueue: this.deadLetterQueue,
      });

      functions.set(config.name, fn);
    }

    return functions;
  }

  private createStateMachine(props: AgentStackProps): sfn.StateMachine {
    const getLambda = (name: string) => {
      const fn = this.lambdaFunctions.get(name);
      if (!fn) throw new Error(`Lambda not found: ${name}`);
      return fn;
    };

    // Create tasks with retry configuration
    const heartbeat = new tasks.LambdaInvoke(this, 'Heartbeat', {
      lambdaFunction: getLambda('heartbeat'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    heartbeat.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const changeDetection = new tasks.LambdaInvoke(this, 'ChangeDetection', {
      lambdaFunction: getLambda('change-detection'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    changeDetection.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    const normalise = new tasks.LambdaInvoke(this, 'Normalise', {
      lambdaFunction: getLambda('normalise'),
      outputPath: '$.Payload',
    });

    const triageSanitise = new tasks.LambdaInvoke(this, 'TriageSanitise', {
      lambdaFunction: getLambda('triage-sanitise'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    triageSanitise.addRetry({
      errors: ['Lambda.ServiceException', 'States.Timeout'],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const triageClassify = new tasks.LambdaInvoke(this, 'TriageClassify', {
      lambdaFunction: getLambda('triage-classify'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    triageClassify.addRetry({
      errors: ['Lambda.ServiceException', 'States.Timeout'],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const reasoning = new tasks.LambdaInvoke(this, 'Reasoning', {
      lambdaFunction: getLambda('reasoning'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    reasoning.addRetry({
      errors: ['Lambda.ServiceException', 'States.Timeout'],
      interval: cdk.Duration.seconds(60),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const execute = new tasks.LambdaInvoke(this, 'Execute', {
      lambdaFunction: getLambda('execute'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    execute.addRetry({
      errors: ['Lambda.ServiceException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const artefactUpdate = new tasks.LambdaInvoke(this, 'ArtefactUpdate', {
      lambdaFunction: getLambda('artefact-update'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    artefactUpdate.addRetry({
      errors: ['Lambda.ServiceException', 'States.Timeout'],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const housekeeping = new tasks.LambdaInvoke(this, 'Housekeeping', {
      lambdaFunction: getLambda('housekeeping'),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    housekeeping.addRetry({
      errors: ['Lambda.ServiceException', 'States.Timeout'],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // Success state
    const success = new sfn.Succeed(this, 'Success');

    // Pass state to preserve heartbeat output for housekeeping check
    const preserveHeartbeat = new sfn.Pass(this, 'PreserveHeartbeatOutput', {
      resultPath: '$.heartbeat',
    });

    // Housekeeping check - runs after main flow (with or without changes)
    const checkHousekeeping = new sfn.Choice(this, 'HousekeepingDue?')
      .when(sfn.Condition.booleanEquals('$.housekeepingDue', true), housekeeping)
      .otherwise(success);

    // Connect housekeeping to success
    housekeeping.next(success);

    // No changes path - still check housekeeping
    const noChangesPass = new sfn.Pass(this, 'NoChanges', {
      // Pass through the heartbeat output which contains housekeepingDue
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Choice states
    const hasChanges = new sfn.Choice(this, 'HasChanges?')
      .when(sfn.Condition.booleanEquals('$.hasChanges', true), normalise)
      .otherwise(noChangesPass);

    const needsReasoning = new sfn.Choice(this, 'NeedsReasoning?')
      .when(sfn.Condition.booleanEquals('$.needsComplexReasoning', true), reasoning)
      .otherwise(execute);

    // Chain states for the main processing path
    normalise.next(triageSanitise);
    triageSanitise.next(triageClassify);
    triageClassify.next(needsReasoning);
    reasoning.next(execute);
    execute.next(artefactUpdate);
    artefactUpdate.next(checkHousekeeping);

    // No changes path goes directly to housekeeping check
    noChangesPass.next(checkHousekeeping);

    // Main flow: heartbeat -> save heartbeat -> change detection -> hasChanges choice
    const definition = heartbeat
      .next(preserveHeartbeat)
      .next(changeDetection)
      .next(hasChanges);

    // Create log group with KMS encryption
    const logGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/stepfunctions/agentic-pm-agent',
      retention:
        props.config.envName === 'prod'
          ? logs.RetentionDays.ONE_MONTH
          : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryptionKey: this.logEncryptionKey,
    });

    // Create state machine
    const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: 'agentic-pm-agent-cycle',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.minutes(10),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });

    // Grant Step Functions permission to invoke Lambdas
    this.lambdaFunctions.forEach((fn) => {
      fn.grantInvoke(stateMachine);
    });

    return stateMachine;
  }

  private createSchedule(props: AgentStackProps): void {
    // Main cycle schedule (every 15 minutes)
    new events.Rule(this, 'MainCycleRule', {
      ruleName: 'agentic-pm-main-cycle',
      schedule: events.Schedule.rate(
        cdk.Duration.minutes(props.config.pollingIntervalMinutes)
      ),
      targets: [new targets.SfnStateMachine(this.stateMachine)],
    });

    // Hold queue schedule (every 1 minute)
    const holdQueueFn = this.lambdaFunctions.get('hold-queue');
    if (holdQueueFn) {
      new events.Rule(this, 'HoldQueueRule', {
        ruleName: 'agentic-pm-hold-queue',
        schedule: events.Schedule.rate(
          cdk.Duration.minutes(props.config.holdQueueCheckMinutes)
        ),
        targets: [new targets.LambdaFunction(holdQueueFn)],
      });
    }
  }
}
