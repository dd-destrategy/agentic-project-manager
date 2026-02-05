import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
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

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

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

    // Create tasks
    const heartbeat = new tasks.LambdaInvoke(this, 'Heartbeat', {
      lambdaFunction: getLambda('heartbeat'),
      outputPath: '$.Payload',
    });

    const changeDetection = new tasks.LambdaInvoke(this, 'ChangeDetection', {
      lambdaFunction: getLambda('change-detection'),
      outputPath: '$.Payload',
    });

    const normalise = new tasks.LambdaInvoke(this, 'Normalise', {
      lambdaFunction: getLambda('normalise'),
      outputPath: '$.Payload',
    });

    const triageSanitise = new tasks.LambdaInvoke(this, 'TriageSanitise', {
      lambdaFunction: getLambda('triage-sanitise'),
      outputPath: '$.Payload',
    });

    const triageClassify = new tasks.LambdaInvoke(this, 'TriageClassify', {
      lambdaFunction: getLambda('triage-classify'),
      outputPath: '$.Payload',
    });

    const reasoning = new tasks.LambdaInvoke(this, 'Reasoning', {
      lambdaFunction: getLambda('reasoning'),
      outputPath: '$.Payload',
    });

    const execute = new tasks.LambdaInvoke(this, 'Execute', {
      lambdaFunction: getLambda('execute'),
      outputPath: '$.Payload',
    });

    const artefactUpdate = new tasks.LambdaInvoke(this, 'ArtefactUpdate', {
      lambdaFunction: getLambda('artefact-update'),
      outputPath: '$.Payload',
    });

    const housekeeping = new tasks.LambdaInvoke(this, 'Housekeeping', {
      lambdaFunction: getLambda('housekeeping'),
      outputPath: '$.Payload',
    });

    // Choice states
    const hasChanges = new sfn.Choice(this, 'HasChanges?')
      .when(sfn.Condition.booleanEquals('$.hasChanges', true), normalise)
      .otherwise(new sfn.Pass(this, 'NoChanges'));

    const needsReasoning = new sfn.Choice(this, 'NeedsReasoning?')
      .when(sfn.Condition.booleanEquals('$.needsComplexReasoning', true), reasoning)
      .otherwise(execute);

    const success = new sfn.Succeed(this, 'Success');

    // Chain states
    normalise.next(triageSanitise);
    triageSanitise.next(triageClassify);
    triageClassify.next(needsReasoning);
    reasoning.next(execute);
    execute.next(artefactUpdate);
    artefactUpdate.next(success);

    const definition = heartbeat.next(changeDetection).next(hasChanges);

    // Create log group
    const logGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/stepfunctions/agentic-pm-agent',
      retention:
        props.config.envName === 'prod'
          ? logs.RetentionDays.ONE_MONTH
          : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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
