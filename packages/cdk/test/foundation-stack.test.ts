import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { FoundationStack } from '../lib/stacks/foundation-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';

describe('FoundationStack', () => {
  let devTemplate: Template;
  let prodTemplate: Template;

  const devConfig: EnvironmentConfig = {
    envName: 'dev',
    awsEnv: { account: '123456789012', region: 'ap-southeast-2' },
    tableName: 'AgenticPM-Dev',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 7,
    llmBudgetDaily: 0.3,
    llmBudgetMonthly: 10.0,
    enableAlarms: false,
    sesVerifiedDomain: 'example.com',
  };

  const prodConfig: EnvironmentConfig = {
    envName: 'prod',
    awsEnv: { account: '123456789012', region: 'ap-southeast-2' },
    tableName: 'AgenticPM',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 30,
    llmBudgetDaily: 0.23,
    llmBudgetMonthly: 8.0,
    enableAlarms: true,
    sesVerifiedDomain: 'example.com',
  };

  beforeAll(() => {
    const app = new cdk.App();
    const devStack = new FoundationStack(app, 'DevStack', {
      config: devConfig,
    });
    const prodStack = new FoundationStack(app, 'ProdStack', {
      config: prodConfig,
    });
    devTemplate = Template.fromStack(devStack);
    prodTemplate = Template.fromStack(prodStack);
  });

  describe('DynamoDB Table', () => {
    it('creates DynamoDB table with correct key schema', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: Match.arrayWith([
          Match.objectLike({ AttributeName: 'PK', KeyType: 'HASH' }),
          Match.objectLike({ AttributeName: 'SK', KeyType: 'RANGE' }),
        ]),
      });
    });

    it('creates GSI1 with correct key schema', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'GSI1',
            KeySchema: Match.arrayWith([
              Match.objectLike({ AttributeName: 'GSI1PK', KeyType: 'HASH' }),
              Match.objectLike({ AttributeName: 'GSI1SK', KeyType: 'RANGE' }),
            ]),
            ProjectionType: 'ALL',
          }),
        ]),
      });
    });

    it('uses on-demand billing mode', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('enables point-in-time recovery', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('enables TTL on correct attribute', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        TimeToLiveSpecification: {
          AttributeName: 'TTL',
          Enabled: true,
        },
      });
    });

    it('uses AWS managed encryption', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    it('has DESTROY removal policy in dev environment', () => {
      devTemplate.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
    });

    it('has RETAIN removal policy in prod environment', () => {
      prodTemplate.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });

    it('defines all required attributes', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ]),
      });
    });

    it('has correct table name for dev environment', () => {
      devTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'AgenticPM-Dev',
      });
    });

    it('has correct table name for prod environment', () => {
      prodTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'AgenticPM',
      });
    });
  });

  describe('Secrets Manager', () => {
    it('creates LLM API key secret', () => {
      devTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: '/agentic-pm/llm/api-key',
        Description: 'Claude API key for LLM operations',
      });
    });

    it('creates Jira API token secret', () => {
      devTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: '/agentic-pm/jira/api-token',
        Description: 'Jira Cloud API token',
      });
    });

    it('creates Graph credentials secret', () => {
      devTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: '/agentic-pm/graph/credentials',
        Description: 'Microsoft Graph API credentials for Outlook',
      });
    });

    it('creates NextAuth secret with auto-generated value', () => {
      devTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: '/agentic-pm/auth/nextauth-secret',
        Description: 'NextAuth.js session secret',
        GenerateSecretString: {
          ExcludePunctuation: false,
          PasswordLength: 64,
        },
      });
    });

    it('creates exactly 4 secrets', () => {
      devTemplate.resourceCountIs('AWS::SecretsManager::Secret', 4);
    });
  });

  describe('IAM Roles', () => {
    it('creates triage Lambda role', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'agentic-pm-triage-role',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            }),
          ]),
        }),
      });
    });

    it('creates agent Lambda role', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'agentic-pm-agent-role',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            }),
          ]),
        }),
      });
    });

    it('creates Step Functions role', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'agentic-pm-stepfunctions-role',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 'states.amazonaws.com',
              },
            }),
          ]),
        }),
      });
    });

    it('triage role has explicit DENY for integration secrets', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Action: ['secretsmanager:GetSecretValue'],
            }),
          ]),
        }),
      });
    });

    it('triage role has explicit DENY for SES', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Action: Match.arrayWith(['ses:SendEmail', 'ses:SendRawEmail']),
            }),
          ]),
        }),
      });
    });

    it('agent role has SES permissions restricted to verified domain', () => {
      devTemplate.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['ses:SendEmail', 'ses:SendRawEmail']),
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('.*ses.*identity.*example.com'),
              ]),
            }),
          ]),
        }),
      });
    });

    it('creates exactly 3 IAM roles', () => {
      devTemplate.resourceCountIs('AWS::IAM::Role', 3);
    });
  });

  describe('Stack Tags', () => {
    it('applies cost tracking tags', () => {
      const resources = devTemplate.toJSON().Resources;
      const tableResource = Object.values(resources).find(
        (r: any) => r.Type === 'AWS::DynamoDB::Table'
      ) as any;

      expect(tableResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'Project', Value: 'agentic-pm' },
          { Key: 'Environment', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ])
      );
    });
  });

  describe('CloudFormation Outputs', () => {
    it('exports table name', () => {
      devTemplate.hasOutput('TableName', {
        Export: {
          Name: 'DevStack-TableName',
        },
      });
    });

    it('exports table ARN', () => {
      devTemplate.hasOutput('TableArn', {
        Export: {
          Name: 'DevStack-TableArn',
        },
      });
    });
  });
});
