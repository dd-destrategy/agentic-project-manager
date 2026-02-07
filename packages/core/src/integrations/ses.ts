/**
 * Amazon SES integration client
 */

import {
  SESClient as AWSSESClient,
  SendEmailCommand,
  GetSendQuotaCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';

import type { IntegrationHealthCheck } from './types.js';

/**
 * Configuration for SES client
 */
export interface SESConfig {
  region?: string;
  fromAddress: string;
}

/**
 * Amazon SES client for sending emails
 */
export class SESClient {
  private client: AWSSESClient;
  private fromAddress: string;

  constructor(config: SESConfig) {
    this.client = new AWSSESClient({
      region: config.region ?? 'ap-southeast-2',
    });
    this.fromAddress = config.fromAddress;
  }

  /**
   * Send an email
   */
  async sendEmail(params: {
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    deduplicationId?: string;
  }): Promise<{ messageId: string }> {
    const headers: string[] = [];
    if (params.deduplicationId) {
      headers.push(`X-Dedup-Id: ${params.deduplicationId}`);
    }

    const input: SendEmailCommandInput = {
      Source: this.fromAddress,
      Destination: {
        ToAddresses: params.to,
      },
      Message: {
        Subject: {
          Data: params.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: params.bodyText,
            Charset: 'UTF-8',
          },
          ...(params.bodyHtml && {
            Html: {
              Data: params.bodyHtml,
              Charset: 'UTF-8',
            },
          }),
        },
      },
      ...(headers.length > 0 && {
        Tags: [
          {
            Name: 'DeduplicationId',
            Value: params.deduplicationId!,
          },
        ],
      }),
    };

    const result = await this.client.send(new SendEmailCommand(input));

    return { messageId: result.MessageId ?? '' };
  }

  /**
   * Send the daily digest email
   */
  async sendDailyDigest(params: {
    to: string;
    projectSummaries: string[];
    actionsToday: number;
    pendingEscalations: number;
    budgetStatus: string;
  }): Promise<{ messageId: string }> {
    const subject = `[Agentic PM] Daily Digest - ${new Date().toLocaleDateString('en-AU')}`;

    const bodyText = `
Agentic PM Daily Digest
=======================

Actions taken today: ${params.actionsToday}
Pending escalations: ${params.pendingEscalations}
Budget status: ${params.budgetStatus}

Project Summaries:
${params.projectSummaries.join('\n\n')}

---
This is an automated message from Agentic PM Workbench.
    `.trim();

    return this.sendEmail({
      to: [params.to],
      subject,
      bodyText,
    });
  }

  /**
   * Check SES health by calling GetSendQuota
   */
  async healthCheck(): Promise<IntegrationHealthCheck> {
    const start = Date.now();

    try {
      const quota = await this.client.send(new GetSendQuotaCommand({}));

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          fromAddress: this.fromAddress,
          max24HourSend: quota.Max24HourSend,
          sentLast24Hours: quota.SentLast24Hours,
          maxSendRate: quota.MaxSendRate,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
