#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/stacks/foundation-stack.js';
import { AgentStack } from '../lib/stacks/agent-stack.js';
import { MonitoringStack } from '../lib/stacks/monitoring-stack.js';
import { getEnvironmentConfig } from '../lib/config/environments.js';

const app = new cdk.App();

const envName = app.node.tryGetContext('env') || 'dev';
const config = getEnvironmentConfig(envName);

// Foundation stack: DynamoDB, Secrets Manager, IAM roles
const foundation = new FoundationStack(app, `AgenticPM-Foundation-${envName}`, {
  env: config.awsEnv,
  config,
});

// Agent stack: Lambda functions, Step Functions, EventBridge
const agent = new AgentStack(app, `AgenticPM-Agent-${envName}`, {
  env: config.awsEnv,
  config,
  table: foundation.table,
  secrets: foundation.secrets,
  roles: foundation.roles,
});

// Monitoring stack: CloudWatch alarms and dashboards
new MonitoringStack(app, `AgenticPM-Monitoring-${envName}`, {
  env: config.awsEnv,
  config,
  table: foundation.table,
  stateMachine: agent.stateMachine,
});
