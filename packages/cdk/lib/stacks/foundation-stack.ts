import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface FoundationStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export interface AgenticPMSecrets {
  llmApiKey: secretsmanager.ISecret;
  jiraApiToken: secretsmanager.ISecret;
  graphCredentials: secretsmanager.ISecret;
  nextAuthSecret: secretsmanager.ISecret;
}

export interface AgenticPMRoles {
  triageLambdaRole: iam.Role;
  agentLambdaRole: iam.Role;
  stepFunctionsRole: iam.Role;
}

export class FoundationStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly secrets: AgenticPMSecrets;
  public readonly roles: AgenticPMRoles;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    // Create DynamoDB table
    this.table = this.createTable(props.config);

    // Create secrets
    this.secrets = this.createSecrets();

    // Create IAM roles
    this.roles = this.createRoles();
  }

  private createTable(config: EnvironmentConfig): dynamodb.Table {
    const table = new dynamodb.Table(this, 'Table', {
      tableName: config.tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'TTL',
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy:
        config.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1 for cross-project queries
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
      exportName: `${this.stackName}-TableName`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: table.tableArn,
      exportName: `${this.stackName}-TableArn`,
    });

    return table;
  }

  private createSecrets(): AgenticPMSecrets {
    const llmApiKey = new secretsmanager.Secret(this, 'LLMApiKey', {
      secretName: '/agentic-pm/llm/api-key',
      description: 'Claude API key for LLM operations',
    });

    const jiraApiToken = new secretsmanager.Secret(this, 'JiraApiToken', {
      secretName: '/agentic-pm/jira/api-token',
      description: 'Jira Cloud API token',
    });

    const graphCredentials = new secretsmanager.Secret(this, 'GraphCredentials', {
      secretName: '/agentic-pm/graph/credentials',
      description: 'Microsoft Graph API credentials for Outlook',
    });

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

  private createRoles(): AgenticPMRoles {
    // Triage Lambda Role - RESTRICTED: LLM access only
    const triageLambdaRole = new iam.Role(this, 'TriageLambdaRole', {
      roleName: 'agentic-pm-triage-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for Triage Lambda - LLM access only',
    });

    this.secrets.llmApiKey.grantRead(triageLambdaRole);
    this.table.grantReadWriteData(triageLambdaRole);

    triageLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole'
      )
    );

    // Explicit deny for integration secrets
    triageLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          this.secrets.jiraApiToken.secretArn,
          this.secrets.graphCredentials.secretArn,
        ],
      })
    );

    // Agent Lambda Role - Full integration access
    const agentLambdaRole = new iam.Role(this, 'AgentLambdaRole', {
      roleName: 'agentic-pm-agent-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for Agent Lambdas - full integration access',
    });

    this.secrets.jiraApiToken.grantRead(agentLambdaRole);
    this.secrets.graphCredentials.grantRead(agentLambdaRole);
    this.secrets.llmApiKey.grantRead(agentLambdaRole);
    this.table.grantReadWriteData(agentLambdaRole);

    agentLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail', 'ses:GetSendQuota'],
        resources: ['*'],
      })
    );

    agentLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicExecutionRole'
      )
    );

    // Step Functions Role
    const stepFunctionsRole = new iam.Role(this, 'StepFunctionsRole', {
      roleName: 'agentic-pm-stepfunctions-role',
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Role for Step Functions state machine',
    });

    return { triageLambdaRole, agentLambdaRole, stepFunctionsRole };
  }
}
