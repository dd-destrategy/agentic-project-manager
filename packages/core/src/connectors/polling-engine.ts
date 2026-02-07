/**
 * Generic Polling Engine
 *
 * Executes polling-based data ingestion for any connector described by a
 * PollingDescriptor. Handles endpoint template resolution, auth injection,
 * delta/checkpoint strategies, and pagination.
 */

import { UniversalAuthProvider } from './auth-provider.js';
import type {
  AuthDescriptor,
  PollingConfig,
  DeltaStrategy,
} from './connector-schemas.js';

// ============================================================================
// Types
// ============================================================================

export interface PollingResult {
  /** Raw API response items */
  items: unknown[];
  /** New checkpoint value for next poll */
  newCheckpoint: string;
  /** Number of API calls made (for rate limit tracking) */
  apiCallCount: number;
}

export interface HttpClient {
  fetch(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    }
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }>;
}

export interface PollingEngineConfig {
  httpClient: HttpClient;
  authProvider?: UniversalAuthProvider;
  /** Maximum pages to fetch in a single poll (safety limit) */
  maxPages?: number;
}

// ============================================================================
// Polling Engine
// ============================================================================

export class GenericPollingEngine {
  private readonly httpClient: HttpClient;
  private readonly authProvider: UniversalAuthProvider;
  private readonly maxPages: number;

  constructor(config: PollingEngineConfig) {
    this.httpClient = config.httpClient;
    this.authProvider = config.authProvider ?? new UniversalAuthProvider();
    this.maxPages = config.maxPages ?? 10;
  }

  /**
   * Fetch delta (new/changed items) from a connector's API.
   */
  async fetchDelta(
    pollingConfig: PollingConfig,
    authDescriptor: AuthDescriptor,
    credentials: Record<string, string>,
    checkpoint: string | null,
    parameters: Record<string, string>
  ): Promise<PollingResult> {
    const allItems: unknown[] = [];
    let apiCallCount = 0;
    let pageToken: string | null = null;
    let newCheckpoint = checkpoint ?? '';

    for (let page = 0; page < this.maxPages; page++) {
      // Build URL from template
      const url = this.buildUrl(
        pollingConfig.endpoint,
        pollingConfig.delta,
        checkpoint,
        pageToken,
        parameters
      );

      // Apply auth
      const authResult = this.authProvider.applyAuth(
        authDescriptor,
        credentials
      );

      // Merge headers
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(pollingConfig.headers ?? {}),
        ...authResult.headers,
      };

      // Append auth query params to URL
      const finalUrl = this.appendQueryParams(url, authResult.queryParams);

      // Execute request
      const response = await this.httpClient.fetch(finalUrl, {
        method: pollingConfig.method,
        headers,
        body: pollingConfig.body
          ? this.resolveTemplate(pollingConfig.body, {
              ...parameters,
              checkpoint: checkpoint ?? '',
            })
          : undefined,
        timeoutMs: 30000,
      });

      apiCallCount++;

      if (response.status < 200 || response.status >= 300) {
        throw new PollingError(
          `API returned status ${response.status}`,
          response.status
        );
      }

      const body = response.body;

      // Extract items from response (handled by field mapping engine externally)
      // Here we just collect the raw response bodies
      allItems.push(body);

      // Extract new checkpoint from response
      const extractedCheckpoint = this.extractCheckpoint(
        body,
        pollingConfig.delta
      );
      if (extractedCheckpoint) {
        newCheckpoint = extractedCheckpoint;
      }

      // Check for next page
      if (!pollingConfig.pagination) break;

      const nextToken = this.extractNextPage(
        body,
        response.headers,
        pollingConfig.pagination
      );

      if (!nextToken) break;
      pageToken = nextToken;
    }

    return {
      items: allItems,
      newCheckpoint: newCheckpoint || new Date().toISOString(),
      apiCallCount,
    };
  }

  /**
   * Execute a health check against the connector's health endpoint.
   */
  async healthCheck(
    endpoint: string,
    method: 'GET' | 'HEAD',
    expectStatus: number,
    timeoutMs: number,
    authDescriptor: AuthDescriptor,
    credentials: Record<string, string>,
    parameters: Record<string, string>
  ): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const url = this.resolveTemplate(endpoint, parameters);
    const authResult = this.authProvider.applyAuth(authDescriptor, credentials);
    const finalUrl = this.appendQueryParams(url, authResult.queryParams);

    const start = Date.now();

    try {
      const response = await this.httpClient.fetch(finalUrl, {
        method,
        headers: {
          Accept: 'application/json',
          ...authResult.headers,
        },
        timeoutMs,
      });

      const latencyMs = Date.now() - start;

      return {
        healthy: response.status === expectStatus,
        latencyMs,
        error:
          response.status !== expectStatus
            ? `Expected ${expectStatus}, got ${response.status}`
            : undefined,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  // --------------------------------------------------------------------------
  // Private: URL Building
  // --------------------------------------------------------------------------

  private buildUrl(
    endpointTemplate: string,
    delta: DeltaStrategy,
    checkpoint: string | null,
    pageToken: string | null,
    parameters: Record<string, string>
  ): string {
    // Resolve template variables like {{baseUrl}}
    let url = this.resolveTemplate(endpointTemplate, parameters);

    // Apply delta strategy as query params
    if (checkpoint) {
      const deltaParams = this.buildDeltaParams(delta, checkpoint);
      url = this.appendQueryParams(url, deltaParams);
    }

    // Apply pagination token
    if (pageToken && parameters._paginationParam) {
      url = this.appendQueryParams(url, {
        [parameters._paginationParam]: pageToken,
      });
    }

    return url;
  }

  private buildDeltaParams(
    delta: DeltaStrategy,
    checkpoint: string
  ): Record<string, string> {
    switch (delta.type) {
      case 'timestamp_filter':
        return {
          [delta.queryParam]: this.formatCheckpoint(checkpoint, delta.format),
        };

      case 'delta_token':
        return { [delta.tokenParam]: checkpoint };

      case 'cursor':
        return { [delta.cursorParam]: checkpoint };

      case 'since_id':
        return { [delta.idParam]: checkpoint };

      default:
        return {};
    }
  }

  private formatCheckpoint(
    checkpoint: string,
    format: 'iso8601' | 'unix' | 'unix_ms'
  ): string {
    if (format === 'iso8601') return checkpoint;

    const date = new Date(checkpoint);
    if (isNaN(date.getTime())) return checkpoint;

    if (format === 'unix') return Math.floor(date.getTime() / 1000).toString();
    if (format === 'unix_ms') return date.getTime().toString();

    return checkpoint;
  }

  // --------------------------------------------------------------------------
  // Private: Checkpoint Extraction
  // --------------------------------------------------------------------------

  private extractCheckpoint(
    body: unknown,
    delta: DeltaStrategy
  ): string | null {
    if (!body || typeof body !== 'object') return null;

    switch (delta.type) {
      case 'delta_token':
        return this.getNestedValue(body, delta.tokenPath);

      case 'cursor':
        return this.getNestedValue(body, delta.cursorPath);

      case 'since_id':
        return this.getNestedValue(body, delta.idPath);

      case 'timestamp_filter':
        // For timestamp-based, use current time as next checkpoint
        return new Date().toISOString();

      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Private: Pagination
  // --------------------------------------------------------------------------

  private extractNextPage(
    body: unknown,
    headers: Record<string, string>,
    pagination: {
      type: string;
      nextPath?: string;
      nextParam?: string;
      totalPath?: string;
    }
  ): string | null {
    switch (pagination.type) {
      case 'cursor':
        if (pagination.nextPath) {
          return this.getNestedValue(body, pagination.nextPath);
        }
        return null;

      case 'link_header': {
        const link = headers['link'] ?? headers['Link'];
        if (!link) return null;
        const match = link.match(/<([^>]+)>;\s*rel="next"/);
        return match?.[1] ?? null;
      }

      case 'offset':
        // Offset pagination needs external tracking — not handled per-page
        return null;

      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Private: Utilities
  // --------------------------------------------------------------------------

  private resolveTemplate(
    template: string,
    parameters: Record<string, string>
  ): string {
    return template.replace(
      /\{\{([^}]+)\}\}/g,
      (_match, key: string) => parameters[key.trim()] ?? ''
    );
  }

  private appendQueryParams(
    url: string,
    params: Record<string, string>
  ): string {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== '' && v !== undefined
    );
    if (entries.length === 0) return url;

    const separator = url.includes('?') ? '&' : '?';
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    return `${url}${separator}${qs}`;
  }

  private getNestedValue(obj: unknown, path: string): string | null {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      if (typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }

    if (current === null || current === undefined) return null;
    return String(current);
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class PollingError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'PollingError';
  }
}
