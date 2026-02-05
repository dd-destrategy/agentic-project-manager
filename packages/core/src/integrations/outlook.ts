/**
 * Outlook/Microsoft Graph integration client
 *
 * Implements the SignalSource interface for polling Microsoft Graph API.
 * Uses Azure AD client credentials flow for daemon application auth.
 *
 * Key features:
 * - Delta queries for efficient email change detection
 * - Email reading via GET /users/{userId}/messages/delta
 * - Email sending via POST /users/{userId}/sendMail
 * - Health check via GET /users/{userId}
 * - Delta token persistence in DynamoDB checkpoint
 */

import type { RawSignal, IntegrationSource } from '../types/index.js';
import type { IntegrationHealthCheck, SignalSource } from './types.js';
import {
  GraphClient,
  type AzureADConfig,
  type GraphResponse,
} from './graph-client.js';

/**
 * Configuration for Outlook client
 */
export interface OutlookConfig extends AzureADConfig {
  /** Folder to monitor (default: 'inbox') */
  folderToMonitor?: string;
  /** Maximum messages to fetch per delta call */
  maxMessagesPerDelta?: number;
}

/**
 * Microsoft Graph Message resource
 * @see https://learn.microsoft.com/en-us/graph/api/resources/message
 */
export interface GraphMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  receivedDateTime: string;
  sentDateTime?: string;
  hasAttachments: boolean;
  internetMessageId?: string;
  subject: string;
  bodyPreview: string;
  importance: 'low' | 'normal' | 'high';
  parentFolderId: string;
  conversationId: string;
  conversationIndex?: string;
  isDeliveryReceiptRequested?: boolean;
  isReadReceiptRequested?: boolean;
  isRead: boolean;
  isDraft: boolean;
  webLink?: string;
  inferenceClassification?: 'focused' | 'other';
  flag: {
    flagStatus: 'notFlagged' | 'complete' | 'flagged';
  };
  from?: EmailAddress;
  toRecipients: EmailAddress[];
  ccRecipients?: EmailAddress[];
  bccRecipients?: EmailAddress[];
  replyTo?: EmailAddress[];
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  categories?: string[];
  '@removed'?: { reason: string };
}

/**
 * Email address structure in Graph API
 */
export interface EmailAddress {
  emailAddress: {
    name?: string;
    address: string;
  };
}

/**
 * Microsoft Graph User resource (for health check)
 */
export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

/**
 * Email composition parameters
 */
export interface SendEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: 'text' | 'html';
  importance?: 'low' | 'normal' | 'high';
  saveToSentItems?: boolean;
}

/**
 * Delta query result with parsed delta token
 */
interface DeltaResult {
  messages: GraphMessage[];
  deltaToken: string | null;
  nextLink: string | null;
}

/**
 * Outlook client implementing SignalSource interface
 *
 * Uses Microsoft Graph API delta queries to efficiently detect email changes.
 * Delta tokens are persisted via the checkpoint repository.
 */
export class OutlookClient implements SignalSource {
  readonly source: IntegrationSource = 'outlook';
  private graphClient: GraphClient;
  private config: OutlookConfig;
  private lastError: Error | null = null;

  constructor(config: OutlookConfig) {
    this.config = {
      folderToMonitor: 'inbox',
      maxMessagesPerDelta: 50,
      ...config,
    };
    this.graphClient = new GraphClient(config);
  }

  /**
   * Authenticate with Microsoft Graph API
   *
   * Tests the Azure AD client credentials flow and verifies
   * access to the configured user's mailbox.
   */
  async authenticate(): Promise<boolean> {
    try {
      // Get token to verify credentials
      await this.graphClient.getAccessToken();

      // Verify access to user's mailbox
      const userId = this.graphClient.getUserId();
      await this.graphClient.get<GraphUser>(`/users/${userId}`);

      return true;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      return false;
    }
  }

  /**
   * Fetch email changes since last checkpoint using delta query
   *
   * @param checkpoint - Delta token from previous sync (or null for initial sync)
   * @returns Array of raw signals and new checkpoint (delta token)
   */
  async fetchDelta(checkpoint: string | null): Promise<{
    signals: RawSignal[];
    newCheckpoint: string;
  }> {
    const userId = this.graphClient.getUserId();
    const now = new Date().toISOString();
    const signals: RawSignal[] = [];

    try {
      // Build the delta query endpoint
      const endpoint = this.buildDeltaEndpoint(checkpoint);

      // Fetch all pages of delta results
      const result = await this.fetchAllDeltaPages(endpoint);

      // Convert messages to raw signals
      for (const message of result.messages) {
        // Skip deleted messages (they have @removed property)
        if (message['@removed']) {
          continue;
        }

        signals.push({
          source: 'outlook',
          timestamp: message.receivedDateTime || message.lastModifiedDateTime,
          rawPayload: message,
        });
      }

      // Sort by timestamp
      signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Use the delta token as the new checkpoint
      const newCheckpoint = result.deltaToken || now;

      return {
        signals,
        newCheckpoint,
      };
    } catch (error) {
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Build the delta query endpoint
   */
  private buildDeltaEndpoint(deltaToken: string | null): string {
    const userId = this.graphClient.getUserId();
    const folder = this.config.folderToMonitor || 'inbox';

    // Base endpoint for mail folder delta
    let endpoint = `/users/${userId}/mailFolders/${folder}/messages/delta`;

    // Add select to limit returned fields
    const selectFields = [
      'id',
      'createdDateTime',
      'lastModifiedDateTime',
      'receivedDateTime',
      'sentDateTime',
      'hasAttachments',
      'subject',
      'bodyPreview',
      'importance',
      'parentFolderId',
      'conversationId',
      'isRead',
      'isDraft',
      'flag',
      'from',
      'toRecipients',
      'ccRecipients',
      'categories',
      'inferenceClassification',
    ].join(',');

    if (deltaToken) {
      // Use delta token for subsequent syncs
      endpoint += `?$deltatoken=${encodeURIComponent(deltaToken)}`;
    } else {
      // Initial sync - get recent messages
      endpoint += `?$select=${selectFields}&$top=${this.config.maxMessagesPerDelta}`;
    }

    return endpoint;
  }

  /**
   * Fetch all pages of delta results
   */
  private async fetchAllDeltaPages(initialEndpoint: string): Promise<DeltaResult> {
    const allMessages: GraphMessage[] = [];
    let currentEndpoint: string | null = initialEndpoint;
    let deltaToken: string | null = null;
    let pageCount = 0;
    const maxPages = 20; // Safety limit

    while (currentEndpoint && pageCount < maxPages) {
      const response = await this.graphClient.get<GraphResponse<GraphMessage>>(
        currentEndpoint
      );

      if (response.value) {
        allMessages.push(...response.value);
      }

      // Check for next page
      if (response['@odata.nextLink']) {
        currentEndpoint = response['@odata.nextLink'];
      } else {
        currentEndpoint = null;
      }

      // Extract delta token from delta link
      if (response['@odata.deltaLink']) {
        deltaToken = this.extractDeltaToken(response['@odata.deltaLink']);
      }

      pageCount++;
    }

    if (pageCount >= maxPages) {
      console.warn('Outlook delta fetch hit page limit');
    }

    return {
      messages: allMessages,
      deltaToken,
      nextLink: null,
    };
  }

  /**
   * Extract delta token from delta link URL
   */
  private extractDeltaToken(deltaLink: string): string | null {
    try {
      const url = new URL(deltaLink);
      return url.searchParams.get('$deltatoken');
    } catch {
      // Try regex extraction as fallback
      const match = deltaLink.match(/\$deltatoken=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }

  /**
   * Fetch a single email message by ID
   */
  async fetchMessage(messageId: string): Promise<GraphMessage> {
    const userId = this.graphClient.getUserId();
    return this.graphClient.get<GraphMessage>(
      `/users/${userId}/messages/${messageId}`
    );
  }

  /**
   * Fetch message body (full content)
   */
  async fetchMessageBody(
    messageId: string
  ): Promise<{ contentType: 'text' | 'html'; content: string }> {
    const userId = this.graphClient.getUserId();
    const message = await this.graphClient.get<GraphMessage>(
      `/users/${userId}/messages/${messageId}?$select=body`
    );
    return message.body || { contentType: 'text', content: '' };
  }

  /**
   * Send an email via Microsoft Graph API
   */
  async sendEmail(params: SendEmailParams): Promise<void> {
    const userId = this.graphClient.getUserId();

    const message = {
      subject: params.subject,
      body: {
        contentType: params.bodyType || 'text',
        content: params.body,
      },
      toRecipients: params.to.map((email) => ({
        emailAddress: { address: email },
      })),
      ccRecipients: params.cc?.map((email) => ({
        emailAddress: { address: email },
      })),
      bccRecipients: params.bcc?.map((email) => ({
        emailAddress: { address: email },
      })),
      importance: params.importance || 'normal',
    };

    await this.graphClient.post(`/users/${userId}/sendMail`, {
      message,
      saveToSentItems: params.saveToSentItems ?? true,
    });
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    messageId: string,
    comment: string,
    replyAll: boolean = false
  ): Promise<void> {
    const userId = this.graphClient.getUserId();
    const endpoint = replyAll
      ? `/users/${userId}/messages/${messageId}/replyAll`
      : `/users/${userId}/messages/${messageId}/reply`;

    await this.graphClient.post(endpoint, {
      comment,
    });
  }

  /**
   * Forward an email
   */
  async forwardEmail(
    messageId: string,
    to: string[],
    comment?: string
  ): Promise<void> {
    const userId = this.graphClient.getUserId();

    await this.graphClient.post(`/users/${userId}/messages/${messageId}/forward`, {
      comment,
      toRecipients: to.map((email) => ({
        emailAddress: { address: email },
      })),
    });
  }

  /**
   * Mark an email as read or unread
   */
  async markAsRead(messageId: string, isRead: boolean = true): Promise<void> {
    const userId = this.graphClient.getUserId();

    await this.graphClient.request(
      `/users/${userId}/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isRead }),
      }
    );
  }

  /**
   * Flag or unflag an email
   */
  async setFlag(
    messageId: string,
    flagStatus: 'notFlagged' | 'complete' | 'flagged'
  ): Promise<void> {
    const userId = this.graphClient.getUserId();

    await this.graphClient.request(
      `/users/${userId}/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          flag: { flagStatus },
        }),
      }
    );
  }

  /**
   * Check Outlook/Graph API health
   *
   * Verifies authentication and access to the configured user's mailbox.
   */
  async healthCheck(): Promise<IntegrationHealthCheck> {
    const start = Date.now();

    try {
      const userId = this.graphClient.getUserId();
      const user = await this.graphClient.get<GraphUser>(`/users/${userId}`);

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          userId: user.id,
          displayName: user.displayName,
          mail: user.mail,
          rateLimitStatus: this.graphClient.getRateLimitStatus(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          consecutiveErrors: this.graphClient.getConsecutiveErrors(),
          lastError: this.lastError?.message,
        },
      };
    }
  }

  /**
   * Get the configured user ID
   */
  getUserId(): string {
    return this.graphClient.getUserId();
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): {
    canMakeRequest: boolean;
    waitTimeMs: number;
    currentCount: number;
  } {
    return this.graphClient.getRateLimitStatus();
  }

  /**
   * Reset rate limiter (for testing)
   */
  resetRateLimiter(): void {
    this.graphClient.resetRateLimiter();
  }

  /**
   * Get last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }
}

/**
 * Create an Outlook client from configuration
 */
export function createOutlookClient(config: OutlookConfig): OutlookClient {
  return new OutlookClient(config);
}

/**
 * Create an Outlook client for a project
 *
 * Retrieves Azure AD credentials from Secrets Manager.
 */
export async function createOutlookClientForProject(
  getSecret: (secretId: string) => Promise<string>
): Promise<OutlookClient> {
  const credentials = JSON.parse(
    await getSecret('/agentic-pm/outlook/credentials')
  ) as OutlookConfig;

  return new OutlookClient(credentials);
}
