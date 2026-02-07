import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { MonitoringStack } from '../lib/stacks/monitoring-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';

describe('MonitoringStack', () => {
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
    // Create dev stack (alarms disabled) with separate app
    const devApp = new cdk.App();
    const mockDevStack = new cdk.Stack(devApp, 'MockDevStack');
    const devTable = new dynamodb.Table(mockDevStack, 'DevTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      tableName: 'AgenticPM-Dev',
    });
    const devStateMachine = new sfn.StateMachine(
      mockDevStack,
      'DevStateMachine',
      {
        definitionBody: sfn.DefinitionBody.fromChainable(
          new sfn.Pass(mockDevStack, 'DevPass')
        ),
      }
    );

    const devStack = new MonitoringStack(devApp, 'DevStack', {
      config: devConfig,
      table: devTable,
      stateMachine: devStateMachine,
    });
    devTemplate = Template.fromStack(devStack);

    // Create prod stack (alarms enabled) with separate app
    const prodApp = new cdk.App();
    const mockProdStack = new cdk.Stack(prodApp, 'MockProdStack');
    const prodTable = new dynamodb.Table(mockProdStack, 'ProdTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      tableName: 'AgenticPM',
    });
    const prodStateMachine = new sfn.StateMachine(
      mockProdStack,
      'ProdStateMachine',
      {
        definitionBody: sfn.DefinitionBody.fromChainable(
          new sfn.Pass(mockProdStack, 'ProdPass')
        ),
      }
    );

    const prodStack = new MonitoringStack(prodApp, 'ProdStack', {
      config: prodConfig,
      table: prodTable,
      stateMachine: prodStateMachine,
    });
    prodTemplate = Template.fromStack(prodStack);
  });

  describe('CloudWatch Dashboard', () => {
    it('creates dashboard in dev environment', () => {
      devTemplate.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });

    it('creates dashboard in prod environment', () => {
      prodTemplate.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });

    it('dashboard has environment-specific name', () => {
      devTemplate.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'agentic-pm-dev',
      });

      prodTemplate.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'agentic-pm-prod',
      });
    });

    it('dashboard includes state machine metrics', () => {
      const dashboards = prodTemplate.findResources(
        'AWS::CloudWatch::Dashboard'
      );
      const dashboard = Object.values(dashboards)[0] as any;
      const dashboardBody = JSON.parse(
        dashboard.Properties.DashboardBody['Fn::Join'][1].join('')
      );

      const widgetTitles = dashboardBody.widgets.map(
        (w: any) => w.properties.title
      );
      expect(widgetTitles).toContain('Agent Cycle Executions');
      expect(widgetTitles).toContain('Agent Cycle Duration');
    });

    it('dashboard includes DynamoDB metrics', () => {
      const dashboards = prodTemplate.findResources(
        'AWS::CloudWatch::Dashboard'
      );
      const dashboard = Object.values(dashboards)[0] as any;
      const dashboardBody = JSON.parse(
        dashboard.Properties.DashboardBody['Fn::Join'][1].join('')
      );

      const widgetTitles = dashboardBody.widgets.map(
        (w: any) => w.properties.title
      );
      expect(widgetTitles).toContain('DynamoDB Read/Write Capacity');
      expect(widgetTitles).toContain('DynamoDB Errors');
    });

    it('dashboard monitors throttling and errors', () => {
      const dashboards = prodTemplate.findResources(
        'AWS::CloudWatch::Dashboard'
      );
      const dashboard = Object.values(dashboards)[0] as any;
      const dashboardBody = JSON.parse(
        dashboard.Properties.DashboardBody['Fn::Join'][1].join('')
      );

      const dashboardString = JSON.stringify(dashboardBody);
      expect(dashboardString).toContain('ThrottledRequests');
      expect(dashboardString).toContain('SystemErrors');
    });
  });

  describe('SNS Alert Topic (Production Only)', () => {
    it('does not create SNS topic in dev environment', () => {
      devTemplate.resourceCountIs('AWS::SNS::Topic', 0);
    });

    it('creates SNS topic in prod environment', () => {
      prodTemplate.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('SNS topic has correct name and display name', () => {
      prodTemplate.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'agentic-pm-alerts',
        DisplayName: 'Agentic PM Alerts',
      });
    });

    it('SNS topic has email subscription', () => {
      prodTemplate.resourceCountIs('AWS::SNS::Subscription', 1);
      prodTemplate.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
      });
    });

    it('exports SNS topic ARN in prod', () => {
      prodTemplate.hasOutput('AlertTopicArn', {
        Export: {
          Name: 'ProdStack-AlertTopicArn',
        },
      });
    });
  });

  describe('CloudWatch Alarms (Production Only)', () => {
    it('does not create alarms in dev environment', () => {
      devTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 0);
    });

    it('creates exactly 3 alarms in prod environment', () => {
      prodTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 3);
    });

    it('creates state machine failure alarm', () => {
      prodTemplate.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'agentic-pm-state-machine-failures',
        AlarmDescription: 'Agent cycle state machine is failing',
        Threshold: 1,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      });
    });

    it('state machine alarm monitors ExecutionsFailed metric', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      const stateMachineAlarm = Object.values(alarms).find(
        (alarm: any) =>
          alarm.Properties.AlarmName === 'agentic-pm-state-machine-failures'
      ) as any;

      expect(stateMachineAlarm.Properties.MetricName).toBe('ExecutionsFailed');
      expect(stateMachineAlarm.Properties.Namespace).toBe('AWS/States');
    });

    it('creates DynamoDB throttle alarm', () => {
      prodTemplate.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'agentic-pm-dynamodb-throttles',
        AlarmDescription: 'DynamoDB is being throttled',
        Threshold: 5,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      });
    });

    it('DynamoDB alarm monitors ThrottledRequests metric', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      const dynamoAlarm = Object.values(alarms).find(
        (alarm: any) =>
          alarm.Properties.AlarmName === 'agentic-pm-dynamodb-throttles'
      ) as any;

      expect(dynamoAlarm.Properties.MetricName).toBe('ThrottledRequests');
      expect(dynamoAlarm.Properties.Namespace).toBe('AWS/DynamoDB');
    });

    it('DynamoDB alarm monitors correct table', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      const dynamoAlarm = Object.values(alarms).find(
        (alarm: any) =>
          alarm.Properties.AlarmName === 'agentic-pm-dynamodb-throttles'
      ) as any;

      const dimensions = dynamoAlarm.Properties.Dimensions;
      const tableNameDimension = dimensions.find(
        (d: any) => d.Name === 'TableName'
      );
      expect(tableNameDimension).toBeDefined();
      // Table is from a different stack, so the value is a cross-stack
      // reference (Fn::ImportValue) rather than a literal string.
      expect(tableNameDimension.Value).toBeDefined();
      const valueStr = JSON.stringify(tableNameDimension.Value);
      expect(valueStr).toContain('ProdTable');
    });

    it('alarms treat missing data appropriately', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      Object.values(alarms).forEach((alarm: any) => {
        // The heartbeat staleness alarm uses 'breaching' (missing data = agent stopped)
        // All other alarms use 'notBreaching'
        if (alarm.Properties.AlarmName === 'agentic-pm-heartbeat-staleness') {
          expect(alarm.Properties.TreatMissingData).toBe('breaching');
        } else {
          expect(alarm.Properties.TreatMissingData).toBe('notBreaching');
        }
      });
    });

    it('alarms are configured with SNS actions', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      Object.values(alarms).forEach((alarm: any) => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
      });
    });

    it('state machine alarm has 15 minute evaluation period', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      const stateMachineAlarm = Object.values(alarms).find(
        (alarm: any) =>
          alarm.Properties.AlarmName === 'agentic-pm-state-machine-failures'
      ) as any;

      expect(stateMachineAlarm.Properties.Period).toBe(900); // 15 minutes in seconds
    });

    it('DynamoDB alarm has 5 minute evaluation period', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      const dynamoAlarm = Object.values(alarms).find(
        (alarm: any) =>
          alarm.Properties.AlarmName === 'agentic-pm-dynamodb-throttles'
      ) as any;

      expect(dynamoAlarm.Properties.Period).toBe(300); // 5 minutes in seconds
    });
  });

  describe('Stack Tags', () => {
    it('applies cost tracking tags', () => {
      const resources = prodTemplate.toJSON().Resources;
      const dashboardResource = Object.values(resources).find(
        (r: any) => r.Type === 'AWS::CloudWatch::Dashboard'
      ) as any;

      // Dashboards don't support tags, but the stack should have them applied
      // Check on a resource that does support tags (SNS)
      const snsResource = Object.values(resources).find(
        (r: any) => r.Type === 'AWS::SNS::Topic'
      ) as any;

      expect(snsResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          { Key: 'Project', Value: 'agentic-pm' },
          { Key: 'Environment', Value: 'prod' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ])
      );
    });
  });

  describe('Cost Optimization', () => {
    it('dashboard uses 1 hour periods for metrics', () => {
      const dashboards = prodTemplate.findResources(
        'AWS::CloudWatch::Dashboard'
      );
      const dashboard = Object.values(dashboards)[0] as any;
      const dashboardBody = JSON.parse(
        dashboard.Properties.DashboardBody['Fn::Join'][1].join('')
      );

      const dashboardString = JSON.stringify(dashboardBody);
      // Metrics should use 3600 second (1 hour) periods to reduce costs
      expect(dashboardString).toContain('3600');
    });

    it('alarms use appropriate evaluation periods to minimize false positives', () => {
      const alarms = prodTemplate.findResources('AWS::CloudWatch::Alarm');
      Object.values(alarms).forEach((alarm: any) => {
        // All alarms should have evaluation periods set
        expect(alarm.Properties.EvaluationPeriods).toBeDefined();
        expect(alarm.Properties.EvaluationPeriods).toBeGreaterThan(0);
      });
    });
  });

  describe('Environment-Specific Behavior', () => {
    it('respects enableAlarms flag in dev', () => {
      expect(devConfig.enableAlarms).toBe(false);
      devTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 0);
      devTemplate.resourceCountIs('AWS::SNS::Topic', 0);
    });

    it('respects enableAlarms flag in prod', () => {
      expect(prodConfig.enableAlarms).toBe(true);
      prodTemplate.resourceCountIs('AWS::CloudWatch::Alarm', 3);
      prodTemplate.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('creates dashboard regardless of enableAlarms', () => {
      devTemplate.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
      prodTemplate.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });
  });
});
