/**
 * Shared context and utilities for Lambda handlers
 */

import type { Context } from 'aws-lambda';

/**
 * Environment configuration
 */
export interface LambdaEnv {
  TABLE_NAME: string;
  TABLE_ARN: string;
  ENVIRONMENT: string;
  LOG_LEVEL: string;
}

/**
 * Get environment configuration
 */
export function getEnv(): LambdaEnv {
  return {
    TABLE_NAME: process.env.TABLE_NAME ?? 'AgenticPM',
    TABLE_ARN: process.env.TABLE_ARN ?? '',
    ENVIRONMENT: process.env.ENVIRONMENT ?? 'dev',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'INFO',
  };
}

/**
 * Logger with structured output
 */
export class Logger {
  private context: Context | null = null;

  setContext(context: Context): void {
    this.context = context;
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('ERROR', message, {
      ...data,
      error: error?.message,
      stack: error?.stack,
    });
  }

  private log(
    level: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    console.log(
      JSON.stringify({
        level,
        message,
        requestId: this.context?.awsRequestId,
        functionName: this.context?.functionName,
        ...data,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

export const logger = new Logger();
