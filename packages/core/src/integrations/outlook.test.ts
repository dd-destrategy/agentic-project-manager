/**
 * Outlook Client Integration Tests
 *
 * Tests for the OutlookClient class with mock Graph API responses.
 * Covers SignalSource interface implementation, delta queries,
 * email sending, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OutlookClient,
  createOutlookClient,
  type OutlookConfig,
  type GraphMessage,
} from './outlook.js';
import { GraphClient, GraphRateLimiter } from './graph-client.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test configuration
const testConfig: OutlookConfig = {
  tenantId: 'test-tenant-id',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  userId: 'user@example.com',
  folderToMonitor: 'inbox',
  maxMessagesPerDelta: 50,
};

// Mock token response
const mockTokenResponse = {
  access_token: 'mock-access-token',
  token_type: 'Bearer',
  expires_in: 3600,
};

// Mock user response
const mockUserResponse = {
  id: 'user-id-123',
  displayName: 'Test User',
  mail: 'user@example.com',
  userPrincipalName: 'user@example.com',
};

// Mock email message
const mockMessage: GraphMessage = {
  id: 'message-id-123',
  createdDateTime: '2024-01-15T10:00:00.000Z',
  lastModifiedDateTime: '2024-01-15T10:00:00.000Z',
  receivedDateTime: '2024-01-15T10:00:00.000Z',
  hasAttachments: false,
  subject: 'Test Email Subject',
  bodyPreview: 'This is a preview of the email body...',
  importance: 'normal',
  parentFolderId: 'inbox-folder-id',
  conversationId: 'conversation-123',
  isRead: false,
  isDraft: false,
  flag: {
    flagStatus: 'notFlagged',
  },
  from: {
    emailAddress: {
      name: 'Sender Name',
      address: 'sender@example.com',
    },
  },
  toRecipients: [
    {
      emailAddress: {
        name: 'Test User',
        address: 'user@example.com',
      },
    },
  ],
};

// Mock delta response
const mockDeltaResponse = {
  value: [mockMessage],
  '@odata.deltaLink':
    'https://graph.microsoft.com/v1.0/users/user@example.com/mailFolders/inbox/messages/delta?$deltatoken=test-delta-token',
};

// Mock empty delta response
const mockEmptyDeltaResponse = {
  value: [],
  '@odata.deltaLink':
    'https://graph.microsoft.com/v1.0/users/user@example.com/mailFolders/inbox/messages/delta?$deltatoken=new-delta-token',
};

// Helper to create mock response
function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('GraphRateLimiter', () => {
  it('should allow requests under the limit', () => {
    const limiter = new GraphRateLimiter(1000, 60000);
    expect(limiter.canMakeRequest()).toBe(true);
    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should track request count', () => {
    const limiter = new GraphRateLimiter(1000, 60000);

    for (let i = 0; i < 10; i++) {
      limiter.recordRequest();
    }

    expect(limiter.getCurrentCount()).toBe(10);
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it('should block when at limit', () => {
    const limiter = new GraphRateLimiter(5, 60000);

    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }

    expect(limiter.canMakeRequest()).toBe(false);
    expect(limiter.getWaitTime()).toBeGreaterThan(0);
  });

  it('should reset correctly', () => {
    const limiter = new GraphRateLimiter(1000, 60000);

    for (let i = 0; i < 50; i++) {
      limiter.recordRequest();
    }

    expect(limiter.getCurrentCount()).toBe(50);

    limiter.reset();

    expect(limiter.getCurrentCount()).toBe(0);
  });
});

describe('GraphClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should get access token via client credentials', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse(mockTokenResponse));

    const client = new GraphClient(testConfig);
    const token = await client.getAccessToken();

    expect(token).toBe('mock-access-token');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('login.microsoftonline.com'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    );
  });

  it('should cache access token', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse(mockTokenResponse));

    const client = new GraphClient(testConfig);

    // First call gets token
    await client.getAccessToken();
    // Second call should use cache
    await client.getAccessToken();

    // Only one fetch call for token
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should make authenticated requests', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
      .mockResolvedValueOnce(createMockResponse(mockUserResponse));

    const client = new GraphClient(testConfig);
    const result = await client.get('/users/me');

    expect(result).toEqual(mockUserResponse);
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://graph.microsoft.com/v1.0/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-access-token',
        }),
      })
    );
  });
});

describe('OutlookClient', () => {
  let client: OutlookClient;

  beforeEach(() => {
    client = new OutlookClient(testConfig);
    mockFetch.mockReset();
    client.resetRateLimiter();
  });

  describe('authenticate', () => {
    it('should return true when authentication succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(mockUserResponse));

      const result = await client.authenticate();

      expect(result).toBe(true);
    });

    it('should return false when authentication fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'invalid_client' }, 401)
      );

      const result = await client.authenticate();

      expect(result).toBe(false);
    });

    it('should return false when user access fails', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(
          createMockResponse({ error: 'AccessDenied' }, 403)
        );

      const result = await client.authenticate();

      expect(result).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when Graph API responds', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(mockUserResponse));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details).toMatchObject({
        userId: 'user-id-123',
        displayName: 'Test User',
      });
    });

    it('should return unhealthy status when Graph API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('fetchDelta', () => {
    it('should fetch emails with initial delta query (no checkpoint)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(mockDeltaResponse));

      const result = await client.fetchDelta(null);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].source).toBe('outlook');
      expect(result.signals[0].rawPayload).toEqual(mockMessage);
      expect(result.newCheckpoint).toBe('test-delta-token');

      // Verify delta endpoint was called
      const calledUrl = mockFetch.mock.calls[1][0] as string;
      expect(calledUrl).toContain('/messages/delta');
      expect(calledUrl).not.toContain('$deltatoken');
    });

    it('should fetch emails with delta token (subsequent sync)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(mockDeltaResponse));

      const checkpoint = 'previous-delta-token';
      const result = await client.fetchDelta(checkpoint);

      expect(result.signals).toHaveLength(1);
      expect(result.newCheckpoint).toBe('test-delta-token');

      // Verify delta token was included
      const calledUrl = mockFetch.mock.calls[1][0] as string;
      expect(calledUrl).toContain('$deltatoken=previous-delta-token');
    });

    it('should return empty signals when no new emails', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(mockEmptyDeltaResponse));

      const result = await client.fetchDelta('some-token');

      expect(result.signals).toHaveLength(0);
      expect(result.newCheckpoint).toBe('new-delta-token');
    });

    it('should skip deleted messages', async () => {
      const deletedMessage = {
        ...mockMessage,
        id: 'deleted-message-id',
        '@removed': { reason: 'deleted' },
      };
      const responseWithDeleted = {
        value: [mockMessage, deletedMessage],
        '@odata.deltaLink':
          'https://graph.microsoft.com/...?$deltatoken=test-token',
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(responseWithDeleted));

      const result = await client.fetchDelta(null);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].rawPayload).toEqual(mockMessage);
    });

    it('should handle pagination with nextLink', async () => {
      const page1 = {
        value: [mockMessage],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/users/user@example.com/mailFolders/inbox/messages/delta?$skiptoken=page2',
      };
      const page2 = {
        value: [{ ...mockMessage, id: 'message-2' }],
        '@odata.deltaLink':
          'https://graph.microsoft.com/...?$deltatoken=final-token',
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse(page1))
        .mockResolvedValueOnce(createMockResponse(page2));

      const result = await client.fetchDelta(null);

      expect(result.signals).toHaveLength(2);
      expect(result.newCheckpoint).toBe('final-token');
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 token + 2 pages
    });
  });

  describe('sendEmail', () => {
    it('should send an email successfully', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 202));

      await client.sendEmail({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Test body content',
      });

      const [, sendMailCall] = mockFetch.mock.calls;
      const url = sendMailCall[0] as string;
      const options = sendMailCall[1] as RequestInit;

      expect(url).toContain('/sendMail');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.message.subject).toBe('Test Subject');
      expect(body.message.toRecipients[0].emailAddress.address).toBe(
        'recipient@example.com'
      );
      expect(body.saveToSentItems).toBe(true);
    });

    it('should send email with CC and BCC', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 202));

      await client.sendEmail({
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test',
        body: 'Test',
        importance: 'high',
      });

      const body = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      expect(body.message.ccRecipients[0].emailAddress.address).toBe(
        'cc@example.com'
      );
      expect(body.message.bccRecipients[0].emailAddress.address).toBe(
        'bcc@example.com'
      );
      expect(body.message.importance).toBe('high');
    });
  });

  describe('replyToEmail', () => {
    it('should reply to an email', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 202));

      await client.replyToEmail('message-123', 'Reply comment');

      const [, replyCall] = mockFetch.mock.calls;
      const url = replyCall[0] as string;
      const body = JSON.parse(replyCall[1].body as string);

      expect(url).toContain('/messages/message-123/reply');
      expect(body.comment).toBe('Reply comment');
    });

    it('should reply all when replyAll is true', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 202));

      await client.replyToEmail('message-123', 'Reply comment', true);

      const url = mockFetch.mock.calls[1][0] as string;
      expect(url).toContain('/replyAll');
    });
  });

  describe('forwardEmail', () => {
    it('should forward an email', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 202));

      await client.forwardEmail(
        'message-123',
        ['forward@example.com'],
        'FYI'
      );

      const [, forwardCall] = mockFetch.mock.calls;
      const url = forwardCall[0] as string;
      const body = JSON.parse(forwardCall[1].body as string);

      expect(url).toContain('/messages/message-123/forward');
      expect(body.comment).toBe('FYI');
      expect(body.toRecipients[0].emailAddress.address).toBe(
        'forward@example.com'
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark an email as read', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 200));

      await client.markAsRead('message-123', true);

      const [, patchCall] = mockFetch.mock.calls;
      const options = patchCall[1] as RequestInit;

      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body as string)).toEqual({ isRead: true });
    });
  });

  describe('setFlag', () => {
    it('should flag an email', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(createMockResponse({}, 200));

      await client.setFlag('message-123', 'flagged');

      const body = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      expect(body.flag.flagStatus).toBe('flagged');
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit response', async () => {
      const rateLimitedResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '1' }),
        json: () => Promise.resolve({ error: 'Rate limited' }),
        text: () => Promise.resolve('Rate limited'),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(createMockResponse(mockUserResponse));

      const result = await client.authenticate();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('rate limiting', () => {
    it('should expose rate limit status', () => {
      const status = client.getRateLimitStatus();

      expect(status.canMakeRequest).toBe(true);
      expect(status.waitTimeMs).toBe(0);
      expect(status.currentCount).toBe(0);
    });
  });
});

describe('SignalSource interface compliance', () => {
  let client: OutlookClient;

  beforeEach(() => {
    client = new OutlookClient(testConfig);
    mockFetch.mockReset();
  });

  it('should have source property', () => {
    expect(client.source).toBe('outlook');
  });

  it('should implement authenticate method', () => {
    expect(typeof client.authenticate).toBe('function');
  });

  it('should implement fetchDelta method', () => {
    expect(typeof client.fetchDelta).toBe('function');
  });

  it('should implement healthCheck method', () => {
    expect(typeof client.healthCheck).toBe('function');
  });

  it('should return correct types from fetchDelta', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
      .mockResolvedValueOnce(createMockResponse(mockDeltaResponse));

    const result = await client.fetchDelta(null);

    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('newCheckpoint');
    expect(Array.isArray(result.signals)).toBe(true);
    expect(typeof result.newCheckpoint).toBe('string');
  });

  it('should return correct types from healthCheck', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(mockTokenResponse))
      .mockResolvedValueOnce(createMockResponse(mockUserResponse));

    const result = await client.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('latencyMs');
    expect(typeof result.healthy).toBe('boolean');
    expect(typeof result.latencyMs).toBe('number');
  });
});

describe('createOutlookClient', () => {
  it('should create an OutlookClient with provided config', () => {
    const client = createOutlookClient(testConfig);

    expect(client).toBeInstanceOf(OutlookClient);
    expect(client.source).toBe('outlook');
    expect(client.getUserId()).toBe(testConfig.userId);
  });
});
