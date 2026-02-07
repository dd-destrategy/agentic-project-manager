import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';

export interface MonitoringStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  table: dynamodb.Table;
  stateMachine: sfn.StateMachine;
}

export class MonitoringStack extends cdk.Stack {
  private alertTopic?: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Add cost tracking tags
    cdk.Tags.of(this).add('Project', 'agentic-pm');
    cdk.Tags.of(this).add('Environment', props.config.envName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Only create alarms in production
    if (props.config.enableAlarms) {
      this.createAlertTopic();
      this.createAlarms(props);
    }

    // Always create dashboard
    this.createDashboard(props);
  }

  private createAlertTopic(): void {
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'agentic-pm-alerts',
      displayName: 'Agentic PM Alerts',
    });

    // Add email subscription for alerts
    const alertEmail = process.env.ALERT_EMAIL || 'alerts@example.com';
    this.alertTopic.addSubscription(
      new subscriptions.EmailSubscription(alertEmail)
    );

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      exportName: `${this.stackName}-AlertTopicArn`,
    });
  }

  private createAlarms(props: MonitoringStackProps): void {
    // Step Functions failure alarm
    const stateMachineAlarm = new cloudwatch.Alarm(this, 'StateMachineFailureAlarm', {
      alarmName: 'agentic-pm-state-machine-failures',
      alarmDescription: 'Agent cycle state machine is failing',
      metric: props.stateMachine.metricFailed({
        period: cdk.Duration.minutes(15),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action for state machine alarm
    if (this.alertTopic) {
      stateMachineAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
    }

    // DynamoDB throttling alarm
    const dynamoDBAlarm = new cloudwatch.Alarm(this, 'DynamoDBThrottleAlarm', {
      alarmName: 'agentic-pm-dynamodb-throttles',
      alarmDescription: 'DynamoDB is being throttled',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: {
          TableName: props.table.tableName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action for DynamoDB alarm
    if (this.alertTopic) {
      dynamoDBAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
    }

    // Dead Man's Switch: fires when agent stops running
    const heartbeatStalenessAlarm = new cloudwatch.Alarm(this, 'HeartbeatStalenessAlarm', {
      alarmName: 'agentic-pm-heartbeat-staleness',
      alarmDescription: 'Agent has not emitted a heartbeat in 30 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AgenticPM',
        metricName: 'AgentHeartbeatEmitted',
        dimensionsMap: { Environment: props.config.envName },
        period: cdk.Duration.minutes(15),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    if (this.alertTopic) {
      heartbeatStalenessAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(this.alertTopic)
      );
    }
  }

  private createDashboard(props: MonitoringStackProps): void {
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `agentic-pm-${props.config.envName}`,
    });

    // State machine metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Agent Cycle Executions',
        width: 12,
        left: [
          props.stateMachine.metricSucceeded({ period: cdk.Duration.hours(1) }),
          props.stateMachine.metricFailed({ period: cdk.Duration.hours(1) }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Agent Cycle Duration',
        width: 12,
        left: [
          props.stateMachine.metricTime({ period: cdk.Duration.hours(1) }),
        ],
      })
    );

    // DynamoDB metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedReadCapacityUnits',
            dimensionsMap: { TableName: props.table.tableName },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedWriteCapacityUnits',
            dimensionsMap: { TableName: props.table.tableName },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Errors',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ThrottledRequests',
            dimensionsMap: { TableName: props.table.tableName },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'SystemErrors',
            dimensionsMap: { TableName: props.table.tableName },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
          }),
        ],
      })
    );
  }
}
