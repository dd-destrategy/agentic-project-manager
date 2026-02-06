/**
 * Email action executor
 *
 * Handles execution of email-related actions:
 * - Sending emails via SES
 * - Replying to emails via Graph API (future)
 */

import { SESClient } from '@agentic-pm/core/integrations/ses';
import type { EmailStakeholderPayload } from '@agentic-pm/core/db/repositories/held-action';
import { logger } from '../../shared/context.js';

/**
 * Execute an email stakeholder action
 */
export async function executeEmailStakeholder(
  client: SESClient,
  payload: EmailStakeholderPayload
): Promise<{ messageId: string }> {
  logger.info('Executing email stakeholder action', {
    to: payload.to,
    subject: payload.subject,
  });

  try {
    const result = await client.sendEmail({
      to: payload.to,
      subject: payload.subject,
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml,
    });

    logger.info('Email sent successfully', {
      messageId: result.messageId,
      to: payload.to,
    });

    return result;
  } catch (error) {
    logger.error(
      'Failed to send email',
      error instanceof Error ? error : new Error(String(error)),
      {
        to: payload.to,
        subject: payload.subject,
      }
    );
    throw error;
  }
}
