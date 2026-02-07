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
  sesVerifiedDomain: string;
  sesFromAddress: string;
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
    llmBudgetDaily: 0.3,
    llmBudgetMonthly: 10.0,
    enableAlarms: false,
    sesVerifiedDomain: process.env.SES_VERIFIED_DOMAIN || 'example.com',
    sesFromAddress: process.env.SES_FROM_ADDRESS || 'noreply@example.com',
  },
  prod: {
    ...baseConfig,
    envName: 'prod',
    tableName: 'AgenticPM',
    pollingIntervalMinutes: 15,
    holdQueueCheckMinutes: 1,
    logRetentionDays: 30,
    llmBudgetDaily: 0.23,
    llmBudgetMonthly: 8.0,
    enableAlarms: true,
    sesVerifiedDomain: process.env.SES_VERIFIED_DOMAIN || 'example.com',
    sesFromAddress: process.env.SES_FROM_ADDRESS || 'noreply@example.com',
  },
};

export function getEnvironmentConfig(env: string): EnvironmentConfig {
  const config = environments[env];
  if (!config) {
    throw new Error(
      `Unknown environment: ${env}. Valid options: ${Object.keys(environments).join(', ')}`
    );
  }
  return config;
}
