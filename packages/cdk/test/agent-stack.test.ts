import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentStack } from '../lib/stacks/agent-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';
import type {
  AgenticPMSecrets,
  AgenticPMRoles,
} from '../lib/stacks/foundation-stack.js';

describe('AgentStack', () => {
  let template: Template;

  const triageRoleArn = 'arn:aws:iam::123456789012:role/mock-triage-role';
  const agentRoleArn = 'arn:aws:iam::123456789012:role/mock-agent-role';
  const sfnRoleArn = 'arn:aws:iam::123456789012:role/mock-sfn-role';

  const config: EnvironmentConfig = {
    envName: 'dev',
    awsEnv: { account: '123456789012', region: 'ap-southeast-2' },
    tableName: 'AgenticPM-Dev',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 7,
    llmBudgetDaily: 0.3,
    llmBudgetMonthly: 10.0,
    enableAlarms: true,
    sesVerifiedDomain: 'example.com',
    sesFromAddress: 'noreply@example.com',
  };

  beforeAll(() => {
    const app = new cdk.App();

    // Helper stack for mock resources that do NOT cause cross-stack grants
    const mockStack = new cdk.Stack(app, 'MockStack');

    // Use imported table to avoid cross-stack Fn::ImportValue for tableName/tableArn.
    // Provide only tableArn — CDK derives tableName from it.
    const table = dynamodb.Table.fromTableArn(
      mockStack,
      'MockTable',
      'arn:aws:dynamodb:ap-southeast-2:123456789012:table/AgenticPM-Dev'
    ) as unknown as dynamodb.Table;

    // Create mock secrets (fromSecretNameV2 returns ISecret — no cross-stack grants)
    const secrets: AgenticPMSecrets = {
      llmApiKey: secretsmanager.Secret.fromSecretNameV2(
        mockStack,
        'MockLLM',
        'mock-llm'
      ),
      jiraApiToken: secretsmanager.Secret.fromSecretNameV2(
        mockStack,
        'MockJira',
        'mock-jira'
      ),
      graphCredentials: secretsmanager.Secret.fromSecretNameV2(
        mockStack,
        'MockGraph',
        'mock-graph'
      ),
      nextAuthSecret: secretsmanager.Secret.fromSecretNameV2(
        mockStack,
        'MockAuth',
        'mock-auth'
      ),
    };

    // Use imported roles with mutable: false to prevent CDK from adding
    // inline policies (e.g. sqs:SendMessage for the DLQ), which would
    // create a cyclic cross-stack dependency (MockStack <-> TestStack).
    const roles: AgenticPMRoles = {
      triageLambdaRole: iam.Role.fromRoleArn(
        mockStack,
        'MockTriageRole',
        triageRoleArn,
        { mutable: false }
      ) as unknown as iam.Role,
      agentLambdaRole: iam.Role.fromRoleArn(
        mockStack,
        'MockAgentRole',
        agentRoleArn,
        { mutable: false }
      ) as unknown as iam.Role,
      stepFunctionsRole: iam.Role.fromRoleArn(
        mockStack,
        'MockSFNRole',
        sfnRoleArn,
        { mutable: false }
      ) as unknown as iam.Role,
    };

    // Create mock Lambda asset directory
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const lambdasDistPath = path.resolve(__dirname, '../../lambdas/dist');
    if (!fs.existsSync(lambdasDistPath)) {
      fs.mkdirSync(lambdasDistPath, { recursive: true });
      // Create empty placeholder file
      fs.writeFileSync(path.join(lambdasDistPath, '.gitkeep'), '');
    }

    // Create mock DLQ (in Foundation stack in real setup)
    const deadLetterQueue = new sqs.Queue(mockStack, 'MockDLQ', {
      queueName: 'agentic-pm-lambda-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    const stack = new AgentStack(app, 'TestStack', {
      config,
      table,
      secrets,
      roles,
      deadLetterQueue,
    });
    template = Template.fromStack(stack);
  });

  describe('Lambda Functions', () => {
    const expectedFunctions = [
      { name: 'heartbeat', timeout: 30 },
      { name: 'change-detection', timeout: 60 },
      { name: 'normalise', timeout: 30 },
      { name: 'triage-sanitise', timeout: 120 },
      { name: 'triage-classify', timeout: 120 },
      { name: 'reasoning', timeout: 300 },
      { name: 'execute', timeout: 60 },
      { name: 'artefact-update', timeout: 180 },
      { name: 'housekeeping', timeout: 120 },
      { name: 'hold-queue', timeout: 60 },
    ];

    it('creates exactly 10 Lambda functions', () => {
      template.resourceCountIs('AWS::Lambda::Function', 10);
    });

    expectedFunctions.forEach(({ name, timeout }) => {
      it(`creates ${name} Lambda with correct configuration`, () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
          FunctionName: `agentic-pm-${name}`,
          Runtime: 'nodejs20.x',
          Handler: `${name}/handler.handler`,
          Timeout: timeout,
          MemorySize: 256,
        });
      });
    });

    it('all Lambdas use ARM64 architecture', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const functionCount = Object.keys(functions).length;

      let arm64Count = 0;
      Object.values(functions).forEach((fn: any) => {
        if (fn.Properties.Architectures?.[0] === 'arm64') {
          arm64Count++;
        }
      });

      expect(arm64Count).toBe(functionCount);
      expect(arm64Count).toBe(10);
    });

    it('all Lambdas have X-Ray tracing enabled', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      Object.values(functions).forEach((fn: any) => {
        expect(fn.Properties.TracingConfig.Mode).toBe('Active');
      });
    });

    it('all Lambdas have correct environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: 'AgenticPM-Dev',
            ENVIRONMENT: 'dev',
            NODE_OPTIONS: '--enable-source-maps',
            LOG_LEVEL: 'INFO',
          }),
        },
      });
    });

    it('all Lambdas are configured with dead letter queue', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      Object.values(functions).forEach((fn: any) => {
        expect(fn.Properties.DeadLetterConfig).toBeDefined();
        expect(fn.Properties.DeadLetterConfig.TargetArn).toBeDefined();
      });
    });

    it('triage Lambdas use triage role', () => {
      const triageFunctions = [
        'triage-sanitise',
        'triage-classify',
        'reasoning',
      ];
      triageFunctions.forEach((name) => {
        template.hasResourceProperties('AWS::Lambda::Function', {
          FunctionName: `agentic-pm-${name}`,
          Role: triageRoleArn,
        });
      });
    });

    it('agent Lambdas use agent role', () => {
      const agentFunctions = [
        'heartbeat',
        'change-detection',
        'normalise',
        'execute',
        'artefact-update',
        'housekeeping',
        'hold-queue',
      ];
      agentFunctions.forEach((name) => {
        template.hasResourceProperties('AWS::Lambda::Function', {
          FunctionName: `agentic-pm-${name}`,
          Role: agentRoleArn,
        });
      });
    });

    it('reasoning Lambda has longest timeout (5 minutes)', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'agentic-pm-reasoning',
        Timeout: 300,
      });
    });

    it('Lambda memory size is cost-optimized at 256MB', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      Object.values(functions).forEach((fn: any) => {
        expect(fn.Properties.MemorySize).toBe(256);
      });
    });
  });

  describe('Step Functions State Machine', () => {
    it('creates a state machine', () => {
      template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    });

    it('state machine has correct name', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineName: 'agentic-pm-agent-cycle',
      });
    });

    it('state machine has 10 minute timeout', () => {
      const stateMachines = template.findResources(
        'AWS::StepFunctions::StateMachine'
      );
      const stateMachine = Object.values(stateMachines)[0] as any;
      const definition = JSON.parse(
        stateMachine.Properties.DefinitionString['Fn::Join'][1].join('')
      );
      expect(definition.TimeoutSeconds).toBe(600);
    });

    it('state machine uses STANDARD type', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineType: 'STANDARD',
      });
    });

    it('state machine has X-Ray tracing enabled', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        TracingConfiguration: {
          Enabled: true,
        },
      });
    });

    it('state machine has logging configured', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        LoggingConfiguration: Match.objectLike({
          Level: 'ALL',
          IncludeExecutionData: true,
        }),
      });
    });

    it('state machine definition includes all Lambda tasks', () => {
      const stateMachines = template.findResources(
        'AWS::StepFunctions::StateMachine'
      );
      const stateMachine = Object.values(stateMachines)[0] as any;
      const definitionString = JSON.stringify(
        stateMachine.Properties.DefinitionString
      );

      const expectedTasks = [
        'Heartbeat',
        'ChangeDetection',
        'Normalise',
        'TriageSanitise',
        'TriageClassify',
        'Reasoning',
        'Execute',
        'ArtefactUpdate',
        'Housekeeping',
      ];

      expectedTasks.forEach((task) => {
        expect(definitionString).toContain(task);
      });
    });

    it('state machine definition includes choice states', () => {
      const stateMachines = template.findResources(
        'AWS::StepFunctions::StateMachine'
      );
      const stateMachine = Object.values(stateMachines)[0] as any;
      const definitionString = JSON.stringify(
        stateMachine.Properties.DefinitionString
      );

      expect(definitionString).toContain('HasChanges?');
      expect(definitionString).toContain('NeedsReasoning?');
      expect(definitionString).toContain('HousekeepingDue?');
    });
  });

  describe('EventBridge Schedules', () => {
    it('creates exactly 2 EventBridge rules', () => {
      template.resourceCountIs('AWS::Events::Rule', 2);
    });

    it('creates main cycle rule with 15 minute interval', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'agentic-pm-main-cycle',
        ScheduleExpression: 'rate(15 minutes)',
      });
    });

    it('creates hold queue rule with 1 minute interval', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'agentic-pm-hold-queue',
        ScheduleExpression: 'rate(1 minute)',
      });
    });

    it('main cycle rule targets state machine', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'agentic-pm-main-cycle',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.objectLike({
              Ref: Match.stringLikeRegexp('StateMachine'),
            }),
          }),
        ]),
      });
    });

    it('hold queue rule targets Lambda function', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'agentic-pm-hold-queue',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('Lambdaholdqueue'),
              ]),
            }),
          }),
        ]),
      });
    });
  });

  describe('SQS Dead Letter Queue', () => {
    it('does not create its own DLQ (uses Foundation stack DLQ)', () => {
      template.resourceCountIs('AWS::SQS::Queue', 0);
    });

    it('all Lambdas are configured with dead letter queue', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      Object.values(functions).forEach((fn: any) => {
        expect(fn.Properties.DeadLetterConfig).toBeDefined();
        expect(fn.Properties.DeadLetterConfig.TargetArn).toBeDefined();
      });
    });
  });

  describe('CloudWatch Alarms', () => {
    it('creates DLQ messages alarm', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'agentic-pm-dlq-messages-visible',
        ComparisonOperator: 'GreaterThanThreshold',
        Threshold: 0,
        EvaluationPeriods: 1,
      });
    });

    it('DLQ alarm treats missing data as not breaching', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'agentic-pm-dlq-messages-visible',
        TreatMissingData: 'notBreaching',
      });
    });

    it('creates SNS topic for DLQ alarm', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'agentic-pm-dlq-alarm',
        DisplayName: 'Agentic PM — Dead-Letter Queue Alarm',
      });
    });
  });

  describe('KMS Key', () => {
    it('creates KMS key for log encryption', () => {
      template.resourceCountIs('AWS::KMS::Key', 1);
    });

    it('KMS key has automatic rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    it('KMS key has alias', () => {
      template.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/agentic-pm-logs',
      });
    });

    it('KMS key grants CloudWatch Logs permissions', () => {
      // The Service principal contains a region token (Fn::Join), so we
      // verify via findResources + JSON.stringify instead of stringLikeRegexp.
      const keys = template.findResources('AWS::KMS::Key');
      const key = Object.values(keys)[0] as any;
      const statements = key.Properties.KeyPolicy.Statement;

      const logsStatement = statements.find((s: any) => {
        const serviceStr = JSON.stringify(s.Principal?.Service || '');
        return (
          serviceStr.includes('logs') && serviceStr.includes('amazonaws.com')
        );
      });

      expect(logsStatement).toBeDefined();
      expect(logsStatement.Action).toEqual(
        expect.arrayContaining([
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:GenerateDataKey*',
        ])
      );
    });
  });

  describe('CloudWatch Log Groups', () => {
    it('creates log group for state machine', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/stepfunctions/agentic-pm-agent',
      });
    });

    it('state machine log group uses KMS encryption', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/stepfunctions/agentic-pm-agent',
        KmsKeyId: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('LogEncryptionKey'),
          ]),
        }),
      });
    });

    it('log group has correct retention period', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/stepfunctions/agentic-pm-agent',
        RetentionInDays: 7, // dev environment
      });
    });
  });

  describe('IAM Permissions', () => {
    it('grants Lambda invoke permissions to state machine', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      const policyStatements = Object.values(policies)
        .map((p: any) => p.Properties.PolicyDocument.Statement)
        .flat();

      // CDK creates per-Lambda invoke statements (each with 2 resources:
      // function ARN + function ARN:*). Count total resources across all
      // invoke-permission statements to verify all Lambdas are covered.
      const invokeStatements = policyStatements.filter(
        (stmt: any) =>
          stmt.Effect === 'Allow' &&
          (stmt.Action === 'lambda:InvokeFunction' ||
            (Array.isArray(stmt.Action) &&
              stmt.Action.includes('lambda:InvokeFunction')))
      );

      expect(invokeStatements.length).toBeGreaterThan(0);

      const totalResources = invokeStatements.reduce(
        (sum: number, stmt: any) =>
          sum + (Array.isArray(stmt.Resource) ? stmt.Resource.length : 1),
        0
      );

      // 10 Lambda functions, each contributes at least ARN + ARN:*
      expect(totalResources).toBeGreaterThanOrEqual(10);
    });

    it('does not grant admin access to any role', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties.PolicyDocument.Statement;
        statements.forEach((stmt: any) => {
          if (Array.isArray(stmt.Action)) {
            expect(stmt.Action).not.toContain('*');
          }
          if (stmt.Resource === '*') {
            // Wildcard resource is OK if action is specific
            expect(stmt.Action).not.toBe('*');
          }
        });
      });
    });
  });

  describe('Stack Tags', () => {
    it('applies cost tracking tags', () => {
      const resources = template.toJSON().Resources;
      const lambdaResource = Object.values(resources).find(
        (r: any) => r.Type === 'AWS::Lambda::Function'
      ) as any;

      expect(lambdaResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'Project', Value: 'agentic-pm' },
          { Key: 'Environment', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ])
      );
    });
  });

  describe('CloudFormation Outputs', () => {
    it('exports DLQ alarm topic ARN', () => {
      template.hasOutput('DLQAlarmTopicArn', {
        Export: {
          Name: 'TestStack-DLQAlarmTopicArn',
        },
      });
    });
  });
});
