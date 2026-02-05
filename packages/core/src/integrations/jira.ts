/**
 * Jira Cloud integration client
 *
 * Implements the SignalSource interface for polling Jira Cloud REST API v3.
 * Key features:
 * - Rate limiting (max 100 requests/minute)
 * - Exponential backoff on errors
 * - Delta detection via JQL updated filter
 * - Health check via /myself endpoint
 */

import type { RawSignal, IntegrationSource, Project } from '../types/index.js';
import { parseJiraCredentials } from '../types/index.js';

import type { IntegrationHealthCheck, SignalSource } from './types.js';

/**
 * Configuration for Jira client
 */
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

/**
 * Rate limiter for Jira API (100 requests/minute)
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request can be made
   */
  canMakeRequest(): boolean {
    this.pruneOldTimestamps();
    return this.timestamps.length < this.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Get time until next request is allowed (ms)
   */
  getWaitTime(): number {
    this.pruneOldTimestamps();
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }
    const oldestInWindow = this.timestamps[0];
    if (oldestInWindow === undefined) {
      return 0;
    }
    return oldestInWindow + this.windowMs - Date.now();
  }

  /**
   * Wait until a request can be made
   */
  async waitForSlot(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get current request count in window
   */
  getCurrentCount(): number {
    this.pruneOldTimestamps();
    return this.timestamps.length;
  }

  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Jira issue from API response
 */
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
      id: string;
    };
    priority?: {
      name: string;
      id: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
    };
    labels?: string[];
    created: string;
    updated: string;
    description?: unknown;
    issuetype: {
      name: string;
      id: string;
    };
    project: {
      key: string;
      name: string;
    };
    comment?: {
      comments: JiraComment[];
      total: number;
    };
  };
  changelog?: {
    histories: JiraChangelogHistory[];
  };
}

/**
 * Jira changelog history entry
 */
export interface JiraChangelogHistory {
  id: string;
  created: string;
  author?: {
    displayName: string;
    emailAddress?: string;
  };
  items: JiraChangelogItem[];
}

/**
 * Jira changelog item
 */
export interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

/**
 * Jira comment
 */
export interface JiraComment {
  id: string;
  self: string;
  author: {
    displayName: string;
    emailAddress?: string;
  };
  body: unknown;
  created: string;
  updated: string;
}

/**
 * Jira search response
 */
interface JiraSearchResponse {
  expand?: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

/**
 * Jira sprint from API response
 */
export interface JiraSprint {
  id: number;
  self: string;
  state: 'active' | 'closed' | 'future';
  name: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

/**
 * Jira board sprints response
 */
interface JiraBoardSprintsResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}

/**
 * Jira project from API response
 */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  self: string;
  projectTypeKey: string;
}

/**
 * Jira board from API response
 */
export interface JiraBoard {
  id: number;
  name: string;
  type: 'scrum' | 'kanban';
  self: string;
  location?: {
    projectId: number;
    projectKey: string;
    projectName: string;
  };
}

/**
 * Jira webhook event payload
 */
export interface JiraWebhookEvent {
  webhookEvent: string;
  timestamp: number;
  issue?: JiraIssue;
  comment?: JiraComment;
  changelog?: {
    id: string;
    items: JiraChangelogItem[];
  };
  sprint?: JiraSprint;
  user?: {
    displayName: string;
    emailAddress?: string;
  };
}

/**
 * Jira Cloud API client
 */
export class JiraClient implements SignalSource {
  readonly source: IntegrationSource = 'jira';
  protected config: JiraConfig;
  protected authHeader: string;
  protected rateLimiter: RateLimiter;
  protected lastError: Error | null = null;
  protected consecutiveErrors: number = 0;
  protected readonly maxConsecutiveErrors: number = 3;

  constructor(config: JiraConfig) {
    this.config = config;
    this.authHeader = Buffer.from(
      `${config.email}:${config.apiToken}`
    ).toString('base64');
    this.rateLimiter = new RateLimiter(100, 60000);
  }

  /**
   * Make an authenticated request to Jira API with rate limiting
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Wait for rate limit slot
    await this.rateLimiter.waitForSlot();

    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      this.rateLimiter.recordRequest();

      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Basic ${this.authHeader}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(
          `Jira API error: ${response.status} ${response.statusText} - ${errorText}`
        );
        this.lastError = error;
        this.consecutiveErrors++;

        // Check if we should back off
        if (response.status === 429) {
          // Rate limited by Jira - wait and retry
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return this.request<T>(endpoint, options);
        }

        throw error;
      }

      // Success - reset error counter
      this.consecutiveErrors = 0;
      this.lastError = null;

      return (await response.json()) as T;
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      this.consecutiveErrors++;

      // Exponential backoff on network errors
      if (this.consecutiveErrors <= this.maxConsecutiveErrors) {
        const backoffMs = Math.min(1000 * Math.pow(2, this.consecutiveErrors), 30000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      throw error;
    }
  }

  /**
   * Authenticate with Jira
   */
  async authenticate(): Promise<boolean> {
    try {
      await this.request('/rest/api/3/myself');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch issues updated since checkpoint
   *
   * @param checkpoint - ISO 8601 timestamp of last sync (or null for first sync)
   * @param projectKey - Optional project key to filter issues
   */
  async fetchDelta(
    checkpoint: string | null,
    projectKey?: string
  ): Promise<{
    signals: RawSignal[];
    newCheckpoint: string;
  }> {
    const now = new Date().toISOString();

    // Build JQL query for recently updated issues
    let jql = checkpoint
      ? `updated >= "${formatJiraTimestamp(checkpoint)}" ORDER BY updated ASC`
      : 'updated >= -1d ORDER BY updated ASC';

    // Filter by project if specified
    if (projectKey) {
      jql = checkpoint
        ? `project = "${projectKey}" AND updated >= "${formatJiraTimestamp(checkpoint)}" ORDER BY updated ASC`
        : `project = "${projectKey}" AND updated >= -1d ORDER BY updated ASC`;
    }

    const signals: RawSignal[] = [];
    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const data = await this.request<JiraSearchResponse>(
        `/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog`
      );

      for (const issue of data.issues) {
        // Skip issues that haven't actually changed since checkpoint
        // (Jira JQL updated >= is inclusive)
        if (checkpoint && issue.fields.updated <= checkpoint) {
          continue;
        }

        signals.push({
          source: 'jira',
          timestamp: issue.fields.updated,
          rawPayload: issue,
        });
      }

      hasMore = startAt + data.issues.length < data.total;
      startAt += maxResults;

      // Safety limit to prevent infinite loops
      if (startAt > 1000) {
        console.warn('Jira fetch hit safety limit of 1000 issues');
        break;
      }
    }

    // Sort by updated timestamp to ensure consistent ordering
    signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // New checkpoint is the latest issue update time, or now if no issues
    const lastSignal = signals[signals.length - 1];
    const newCheckpoint = lastSignal ? lastSignal.timestamp : now;

    return {
      signals,
      newCheckpoint,
    };
  }

  /**
   * Fetch a single issue by key
   */
  async fetchIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/rest/api/3/issue/${issueKey}?expand=changelog`
    );
  }

  /**
   * Fetch issue changelog
   */
  async fetchIssueChangelog(
    issueKey: string,
    since?: string
  ): Promise<JiraChangelogHistory[]> {
    const data = await this.request<{
      values: JiraChangelogHistory[];
      maxResults: number;
      startAt: number;
      total: number;
    }>(`/rest/api/3/issue/${issueKey}/changelog`);

    const histories = since
      ? data.values.filter((h) => h.created > since)
      : data.values;

    return histories;
  }

  /**
   * Fetch all accessible projects
   */
  async fetchProjects(): Promise<JiraProject[]> {
    const data = await this.request<{ values: JiraProject[] }>(
      '/rest/api/3/project/search'
    );
    return data.values;
  }

  /**
   * Fetch boards for a project
   */
  async fetchBoardsForProject(projectKey: string): Promise<JiraBoard[]> {
    const data = await this.request<{ values: JiraBoard[] }>(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`
    );
    return data.values;
  }

  /**
   * Fetch active sprint for a board
   */
  async fetchActiveSprint(boardId: string): Promise<JiraSprint | null> {
    const data = await this.request<JiraBoardSprintsResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active`
    );

    return data.values[0] ?? null;
  }

  /**
   * Fetch all sprints for a board
   */
  async fetchSprintsForBoard(
    boardId: string,
    state?: 'active' | 'closed' | 'future'
  ): Promise<JiraSprint[]> {
    const stateParam = state ? `?state=${state}` : '';
    const data = await this.request<JiraBoardSprintsResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint${stateParam}`
    );
    return data.values;
  }

  /**
   * Fetch sprint issues
   */
  async fetchSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const data = await this.request<JiraSearchResponse>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}`
      );

      issues.push(...data.issues);
      hasMore = startAt + data.issues.length < data.total;
      startAt += maxResults;

      // Safety limit
      if (startAt > 500) {
        break;
      }
    }

    return issues;
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: body,
                },
              ],
            },
          ],
        },
      }),
    });
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    });
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(
    issueKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<{
      transitions: Array<{ id: string; name: string }>;
    }>(`/rest/api/3/issue/${issueKey}/transitions`);

    return data.transitions;
  }

  /**
   * Check Jira API health
   */
  async healthCheck(): Promise<IntegrationHealthCheck> {
    const start = Date.now();

    try {
      const data = await this.request<{
        version: string;
        baseUrl: string;
        serverTitle?: string;
      }>('/rest/api/3/serverInfo');

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        details: {
          version: data.version,
          baseUrl: data.baseUrl,
          serverTitle: data.serverTitle,
          consecutiveErrors: this.consecutiveErrors,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          consecutiveErrors: this.consecutiveErrors,
          lastError: this.lastError?.message,
        },
      };
    }
  }

  /**
   * Get the current rate limiter state (for monitoring)
   */
  getRateLimitStatus(): {
    canMakeRequest: boolean;
    waitTimeMs: number;
    currentCount: number;
  } {
    return {
      canMakeRequest: this.rateLimiter.canMakeRequest(),
      waitTimeMs: this.rateLimiter.getWaitTime(),
      currentCount: this.rateLimiter.getCurrentCount(),
    };
  }

  /**
   * Reset rate limiter (for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
  }

  /**
   * Get base URL (for webhook configuration)
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }
}

/**
 * Format a timestamp for Jira JQL query
 * Jira expects: "yyyy-MM-dd HH:mm"
 */
export function formatJiraTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Create a Jira client from integration config
 */
export function createJiraClient(config: {
  baseUrl: string;
  email: string;
  apiToken: string;
}): JiraClient {
  return new JiraClient(config);
}

/**
 * Create a Jira client for a project
 */
export async function createJiraClientForProject(
  _project: Project,
  getSecret: (secretId: string) => Promise<string>
): Promise<JiraClient> {
  // Retrieve credentials from secrets manager
  const credentials = parseJiraCredentials(
    JSON.parse(await getSecret('/agentic-pm/jira/credentials'))
  );

  return new JiraClient(credentials);
}
