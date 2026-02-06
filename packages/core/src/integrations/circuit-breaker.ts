/**
 * Circuit breaker for external integration calls
 *
 * Prevents cascading failures by short-circuiting requests to
 * unhealthy services. Implements the standard three-state pattern:
 *
 * - **Closed**: Requests pass through normally. Failures are counted.
 * - **Open**: Requests are rejected immediately (fail fast).
 *   After the reset timeout, transitions to half-open.
 * - **Half-open**: A single probe request is allowed through.
 *   If it succeeds, the breaker closes. If it fails, it re-opens.
 */

/** Circuit breaker state */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Error thrown when the circuit breaker is open */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly retryAfterMs: number
  ) {
    super(
      `Circuit breaker open for ${serviceName}. ` +
        `Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

/** Configuration options for the circuit breaker */
export interface CircuitBreakerOptions {
  /** Human-readable name of the protected service (for logging) */
  serviceName?: string;
  /** Number of consecutive failures before opening the breaker */
  failureThreshold?: number;
  /** Time in ms to wait before transitioning from open to half-open */
  resetTimeoutMs?: number;
}

/**
 * Simple circuit breaker for wrapping external service calls.
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ serviceName: 'jira' });
 * const result = await breaker.execute(() => jiraClient.fetchIssue('KEY-1'));
 * ```
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: CircuitBreakerState = 'closed';

  private readonly serviceName: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options?: CircuitBreakerOptions) {
    this.serviceName = options?.serviceName ?? 'unknown';
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 60_000;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @param fn - The async function to protect
   * @returns The result of the function
   * @throws {CircuitBreakerOpenError} if the breaker is open
   * @throws The original error if the function fails and the breaker is closed/half-open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new CircuitBreakerOpenError(
          this.serviceName,
          this.resetTimeoutMs - elapsed
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Handle a successful call */
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  /** Handle a failed call */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  /** Get the current breaker state (for monitoring/health checks) */
  getState(): CircuitBreakerState {
    // Re-evaluate open -> half-open transition on read
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        return 'half-open';
      }
    }
    return this.state;
  }

  /** Get the current consecutive failure count */
  getFailureCount(): number {
    return this.failures;
  }

  /** Reset the breaker to closed state (for testing) */
  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }
}
