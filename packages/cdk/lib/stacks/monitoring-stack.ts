import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface MonitoringStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  table: dynamodb.Table;
  stateMachine: sfn.StateMachine;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Only create alarms in production
    if (props.config.enableAlarms) {
      this.createAlarms(props);
    }

    // Always create dashboard
    this.createDashboard(props);
  }

  private createAlarms(props: MonitoringStackProps): void {
    // Step Functions failure alarm
    new cloudwatch.Alarm(this, 'StateMachineFailureAlarm', {
      alarmName: 'agentic-pm-state-machine-failures',
      alarmDescription: 'Agent cycle state machine is failing',
      metric: props.stateMachine.metricFailed({
        period: cdk.Duration.minutes(15),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // DynamoDB throttling alarm
    new cloudwatch.Alarm(this, 'DynamoDBThrottleAlarm', {
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
