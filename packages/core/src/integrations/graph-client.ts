/**
 * Microsoft Graph API client
 *
 * Provides authenticated access to Microsoft Graph API using Azure AD
 * client credentials flow (daemon application).
 *
 * Key features:
 * - Azure AD client credentials authentication
 * - Automatic token refresh
 * - Rate limiting (Graph API throttling handling)
 * - Delta query support for incremental sync
 */

/**
 * Azure AD configuration for client credentials flow
 */
export interface AzureADConfig {
  /** Azure AD tenant ID */
  tenantId: string;
  /** Application (client) ID */
  clientId: string;
  /** Client secret */
  clientSecret: string;
  /** User ID (email) to access mailbox */
  userId: string;
}

/**
 * OAuth token response from Azure AD
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Graph API error response
 */
export interface GraphError {
  code: string;
  message: string;
  innerError?: {
    'request-id': string;
    date: string;
  };
}

/**
 * Graph API response wrapper
 */
export interface GraphResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * Rate limiter for Graph API
 *
 * Microsoft Graph has default throttling limits:
 * - 10,000 requests per 10 minutes per app
 * - Specific mailbox limits apply
 */
export class GraphRateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 1000, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(): boolean {
    this.pruneOldTimestamps();
    return this.timestamps.length < this.maxRequests;
  }

  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

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

  async waitForSlot(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  getCurrentCount(): number {
    this.pruneOldTimestamps();
    return this.timestamps.length;
  }

  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Microsoft Graph API client
 *
 * Handles authentication and requests to Microsoft Graph API.
 */
export class GraphClient {
  private config: AzureADConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private rateLimiter: GraphRateLimiter;
  private consecutiveErrors: number = 0;
  private readonly maxConsecutiveErrors: number = 3;

  private static readonly GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
  private static readonly TOKEN_ENDPOINT =
    'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
  private static readonly SCOPE = 'https://graph.microsoft.com/.default';

  constructor(config: AzureADConfig) {
    this.config = config;
    this.rateLimiter = new GraphRateLimiter(1000, 60000);
  }

  /**
   * Get an access token using client credentials flow
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    const tokenUrl = GraphClient.TOKEN_ENDPOINT.replace(
      '{tenant}',
      this.config.tenantId
    );

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: GraphClient.SCOPE,
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Azure AD token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + tokenData.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * Make an authenticated request to Graph API
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const token = await this.getAccessToken();
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${GraphClient.GRAPH_BASE_URL}${endpoint}`;

    try {
      this.rateLimiter.recordRequest();

      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(
          `Graph API error: ${response.status} ${response.statusText} - ${errorText}`
        );
        this.consecutiveErrors++;

        // Handle throttling (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return this.request<T>(endpoint, options);
        }

        throw error;
      }

      // Reset error counter on success
      this.consecutiveErrors = 0;

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.consecutiveErrors++;

      // Exponential backoff on network errors
      if (this.consecutiveErrors <= this.maxConsecutiveErrors) {
        const backoffMs = Math.min(
          1000 * Math.pow(2, this.consecutiveErrors),
          30000
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      throw error;
    }
  }

  /**
   * GET request helper
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * POST request helper
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Get the configured user ID
   */
  getUserId(): string {
    return this.config.userId;
  }

  /**
   * Get current rate limit status
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
   * Clear cached token (for testing or on auth errors)
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Get consecutive error count
   */
  getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }
}

/**
 * Create a Graph client from Azure AD configuration
 */
export function createGraphClient(config: AzureADConfig): GraphClient {
  return new GraphClient(config);
}
