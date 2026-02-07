/**
 * Jira Client Integration Tests
 *
 * Tests for the JiraClient class with mock responses.
 * Covers SignalSource interface implementation, rate limiting,
 * and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  JiraClient,
  RateLimiter,
  formatJiraTimestamp,
  createJiraClient,
  type JiraConfig,
  type JiraIssue,
  type JiraSprint,
} from './jira.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test configuration
const testConfig: JiraConfig = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-token',
};

// Mock responses
const mockMyselfResponse = {
  accountId: '12345',
  displayName: 'Test User',
  emailAddress: 'test@example.com',
};

const mockServerInfoResponse = {
  version: '1001.0.0',
  baseUrl: 'https://test.atlassian.net',
  serverTitle: 'Test Jira',
};

const mockIssue: JiraIssue = {
  id: '10001',
  key: 'TEST-1',
  self: 'https://test.atlassian.net/rest/api/3/issue/10001',
  fields: {
    summary: 'Test Issue',
    status: { name: 'In Progress', id: '3' },
    priority: { name: 'High', id: '2' },
    assignee: { displayName: 'Test User', emailAddress: 'test@example.com' },
    reporter: {
      displayName: 'Reporter User',
      emailAddress: 'reporter@example.com',
    },
    labels: ['backend', 'urgent'],
    created: '2024-01-01T10:00:00.000Z',
    updated: '2024-01-02T15:30:00.000Z',
    issuetype: { name: 'Story', id: '10001' },
    project: { key: 'TEST', name: 'Test Project' },
  },
  changelog: {
    histories: [
      {
        id: '1001',
        created: '2024-01-02T15:30:00.000Z',
        author: { displayName: 'Test User' },
        items: [
          {
            field: 'status',
            fieldtype: 'jira',
            from: '1',
            fromString: 'To Do',
            to: '3',
            toString: 'In Progress',
          },
        ],
      },
    ],
  },
};

const mockSearchResponse = {
  expand: 'changelog',
  startAt: 0,
  maxResults: 50,
  total: 1,
  issues: [mockIssue],
};

const mockSprint: JiraSprint = {
  id: 100,
  self: 'https://test.atlassian.net/rest/agile/1.0/sprint/100',
  state: 'active',
  name: 'Sprint 1',
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-01-14T00:00:00.000Z',
  goal: 'Complete MVP features',
};

const mockBoardSprintsResponse = {
  maxResults: 50,
  startAt: 0,
  isLast: true,
  values: [mockSprint],
};

const mockProjectsResponse = {
  values: [
    {
      id: '10000',
      key: 'TEST',
      name: 'Test Project',
      self: 'url',
      projectTypeKey: 'software',
    },
  ],
};

const mockBoardsResponse = {
  values: [{ id: 1, name: 'Test Board', type: 'scrum' as const, self: 'url' }],
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

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests under the limit', () => {
    const limiter = new RateLimiter(100, 60000);
    expect(limiter.canMakeRequest()).toBe(true);
    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should track request count', () => {
    const limiter = new RateLimiter(100, 60000);

    for (let i = 0; i < 10; i++) {
      limiter.recordRequest();
    }

    expect(limiter.getCurrentCount()).toBe(10);
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it('should block when at limit', () => {
    const limiter = new RateLimiter(5, 60000);

    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }

    expect(limiter.canMakeRequest()).toBe(false);
    expect(limiter.getWaitTime()).toBeGreaterThan(0);
  });

  it('should allow requests after window expires', () => {
    const limiter = new RateLimiter(5, 60000);

    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }

    expect(limiter.canMakeRequest()).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61000);

    expect(limiter.canMakeRequest()).toBe(true);
    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should reset correctly', () => {
    const limiter = new RateLimiter(100, 60000);

    for (let i = 0; i < 50; i++) {
      limiter.recordRequest();
    }

    expect(limiter.getCurrentCount()).toBe(50);

    limiter.reset();

    expect(limiter.getCurrentCount()).toBe(0);
  });

  it('should calculate wait time correctly', () => {
    const limiter = new RateLimiter(3, 60000);

    limiter.recordRequest();
    vi.advanceTimersByTime(10000);
    limiter.recordRequest();
    vi.advanceTimersByTime(10000);
    limiter.recordRequest();

    expect(limiter.canMakeRequest()).toBe(false);
    // Should wait until first request expires (40 seconds from now)
    const waitTime = limiter.getWaitTime();
    expect(waitTime).toBeGreaterThan(39000);
    expect(waitTime).toBeLessThanOrEqual(40000);
  });
});

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient(testConfig);
    mockFetch.mockReset();
    client.resetRateLimiter();
  });

  describe('authenticate', () => {
    it('should return true when authentication succeeds', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMyselfResponse));

      const result = await client.authenticate();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${testConfig.baseUrl}/rest/api/3/myself`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should return false when authentication fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Unauthorized' }, 401)
      );

      const result = await client.authenticate();

      expect(result).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when API responds', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          accountId: '12345',
          displayName: 'Test User',
          emailAddress: 'test@example.com',
          active: true,
        })
      );

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details).toMatchObject({
        accountId: '12345',
        displayName: 'Test User',
      });
    });

    it('should return unhealthy status when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('fetchDelta', () => {
    it('should fetch issues updated since checkpoint', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockSearchResponse));

      const checkpoint = '2024-01-01T00:00:00.000Z';
      const result = await client.fetchDelta(checkpoint, 'TEST');

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].source).toBe('jira');
      expect(result.signals[0].rawPayload).toEqual(mockIssue);
      expect(result.newCheckpoint).toBe(mockIssue.fields.updated);

      // Verify JQL query
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('updated%20%3E%3D%20%22');
      expect(calledUrl).toContain('project%20%3D%20%22TEST%22');
    });

    it('should return empty signals when no changes', async () => {
      const emptyResponse = { ...mockSearchResponse, total: 0, issues: [] };
      mockFetch.mockResolvedValueOnce(createMockResponse(emptyResponse));

      const result = await client.fetchDelta('2024-01-01T00:00:00.000Z');

      expect(result.signals).toHaveLength(0);
      expect(result.newCheckpoint).toBeDefined();
    });

    it('should use default query when no checkpoint provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockSearchResponse));

      await client.fetchDelta(null);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('updated%20%3E%3D%20-1d');
    });

    it('should skip issues that have not actually changed since checkpoint', async () => {
      const checkpoint = '2024-01-03T00:00:00.000Z'; // After the issue's updated time
      mockFetch.mockResolvedValueOnce(createMockResponse(mockSearchResponse));

      const result = await client.fetchDelta(checkpoint);

      expect(result.signals).toHaveLength(0);
    });

    it('should paginate through results', async () => {
      const page1 = {
        ...mockSearchResponse,
        total: 75,
        issues: Array(50)
          .fill(mockIssue)
          .map((issue, i) => ({
            ...issue,
            id: `1000${i}`,
            key: `TEST-${i}`,
            fields: {
              ...issue.fields,
              updated: `2024-01-02T15:${30 + Math.floor(i / 60)}:${i % 60}0.000Z`,
            },
          })),
      };
      const page2 = {
        ...mockSearchResponse,
        startAt: 50,
        total: 75,
        issues: Array(25)
          .fill(mockIssue)
          .map((issue, i) => ({
            ...issue,
            id: `2000${i}`,
            key: `TEST-${50 + i}`,
            fields: {
              ...issue.fields,
              updated: `2024-01-02T16:${i % 60}0:00.000Z`,
            },
          })),
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(page1))
        .mockResolvedValueOnce(createMockResponse(page2));

      const result = await client.fetchDelta(null);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.signals.length).toBe(75);
    });
  });

  describe('fetchIssue', () => {
    it('should fetch a single issue by key', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockIssue));

      const result = await client.fetchIssue('TEST-1');

      expect(result).toEqual(mockIssue);
      expect(mockFetch).toHaveBeenCalledWith(
        `${testConfig.baseUrl}/rest/api/3/issue/TEST-1?expand=changelog`,
        expect.any(Object)
      );
    });
  });

  describe('fetchSprintsForBoard', () => {
    it('should fetch sprints for a board', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockBoardSprintsResponse)
      );

      const result = await client.fetchSprintsForBoard('1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockSprint);
    });

    it('should filter by state when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockBoardSprintsResponse)
      );

      await client.fetchSprintsForBoard('1', 'active');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('state=active');
    });
  });

  describe('fetchActiveSprint', () => {
    it('should fetch the active sprint for a board', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(mockBoardSprintsResponse)
      );

      const result = await client.fetchActiveSprint('1');

      expect(result).toEqual(mockSprint);
    });

    it('should return null when no active sprint', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ...mockBoardSprintsResponse, values: [] })
      );

      const result = await client.fetchActiveSprint('1');

      expect(result).toBeNull();
    });
  });

  describe('fetchSprintIssues', () => {
    it('should fetch issues for a sprint', async () => {
      const sprintIssuesResponse = {
        startAt: 0,
        maxResults: 50,
        total: 1,
        issues: [mockIssue],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(sprintIssuesResponse));

      const result = await client.fetchSprintIssues(100);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockIssue);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/agile/1.0/sprint/100/issue'),
        expect.any(Object)
      );
    });
  });

  describe('fetchProjects', () => {
    it('should fetch all accessible projects', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockProjectsResponse));

      const result = await client.fetchProjects();

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TEST');
    });
  });

  describe('fetchBoardsForProject', () => {
    it('should fetch boards for a project', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockBoardsResponse));

      const result = await client.fetchBoardsForProject('TEST');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('scrum');
    });
  });

  describe('addComment', () => {
    it('should add a comment to an issue', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: '12345' }, 201));

      await client.addComment('TEST-1', 'This is a test comment');

      expect(mockFetch).toHaveBeenCalledWith(
        `${testConfig.baseUrl}/rest/api/3/issue/TEST-1/comment`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('This is a test comment'),
        })
      );
    });
  });

  describe('transitionIssue', () => {
    it('should transition an issue', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 204));

      await client.transitionIssue('TEST-1', '21');

      expect(mockFetch).toHaveBeenCalledWith(
        `${testConfig.baseUrl}/rest/api/3/issue/TEST-1/transitions`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ transition: { id: '21' } }),
        })
      );
    });
  });

  describe('getTransitions', () => {
    it('should get available transitions for an issue', async () => {
      const mockTransitions = {
        transitions: [
          { id: '21', name: 'In Progress' },
          { id: '31', name: 'Done' },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTransitions));

      const result = await client.getTransitions('TEST-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '21', name: 'In Progress' });
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

  describe('error handling', () => {
    it('should handle 429 rate limit response', async () => {
      const rateLimitedResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '1' }),
        json: () => Promise.resolve({ message: 'Rate limited' }),
        text: () => Promise.resolve('Rate limited'),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(createMockResponse(mockMyselfResponse));

      const result = await client.authenticate();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should track consecutive errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.authenticate()).resolves.toBe(false);
      // The client should have tracked the error internally
    });
  });
});

describe('formatJiraTimestamp', () => {
  it('should format ISO timestamp to Jira JQL format', () => {
    const result = formatJiraTimestamp('2024-01-15T14:30:00.000Z');

    // Note: Result depends on local timezone, so we check the format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('should handle different timestamps correctly', () => {
    // Use a UTC time to make the test predictable
    const date = new Date('2024-06-01T08:00:00.000Z');
    const isoString = date.toISOString();
    const result = formatJiraTimestamp(isoString);

    // Should be in format "yyyy-MM-dd HH:mm"
    expect(result).toMatch(/^2024-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('createJiraClient', () => {
  it('should create a JiraClient with provided config', () => {
    const client = createJiraClient(testConfig);

    expect(client).toBeInstanceOf(JiraClient);
    expect(client.source).toBe('jira');
    expect(client.getBaseUrl()).toBe(testConfig.baseUrl);
  });
});

describe('SignalSource interface compliance', () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient(testConfig);
    mockFetch.mockReset();
  });

  it('should have source property', () => {
    expect(client.source).toBe('jira');
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
    mockFetch.mockResolvedValueOnce(createMockResponse(mockSearchResponse));

    const result = await client.fetchDelta(null);

    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('newCheckpoint');
    expect(Array.isArray(result.signals)).toBe(true);
    expect(typeof result.newCheckpoint).toBe('string');
  });

  it('should return correct types from healthCheck', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse(mockServerInfoResponse));

    const result = await client.healthCheck();

    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('latencyMs');
    expect(typeof result.healthy).toBe('boolean');
    expect(typeof result.latencyMs).toBe('number');
  });
});
