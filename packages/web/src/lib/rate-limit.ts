/**
 * Simple in-memory rate limiter using sliding window algorithm
 *
 * Uses Map to track request timestamps per identifier (IP address).
 * Auto-cleans expired entries to prevent memory leaks.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  /** Time window in milliseconds */
  interval: number;
  /** Maximum requests allowed in the interval */
  limit: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

/**
 * Cleanup expired entries from the rate limit store
 */
function cleanupExpiredEntries(maxAge: number): void {
  const now = Date.now();
  const cutoff = now - maxAge;

  for (const [key, entry] of rateLimitStore.entries()) {
    // Filter out expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    // Remove entry if no timestamps remain
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }

  lastCleanup = now;
}

/**
 * Rate limit a request based on identifier and options
 *
 * Uses sliding window algorithm:
 * - Tracks timestamps of recent requests
 * - Counts requests within the time window
 * - Removes expired timestamps
 *
 * @param identifier - Unique identifier (typically IP address)
 * @param options - Rate limit configuration
 * @returns Rate limit result with success status and metadata
 */
export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - options.interval;

  // Periodic cleanup to prevent memory leaks
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries(options.interval * 2);
  }

  // Get or create entry for this identifier
  let entry = rateLimitStore.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(identifier, entry);
  }

  // Remove expired timestamps (sliding window)
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  // Check if limit exceeded
  if (entry.timestamps.length >= options.limit) {
    const oldestTimestamp = entry.timestamps[0]!;
    const resetTime = oldestTimestamp + options.interval;

    return {
      success: false,
      remaining: 0,
      reset: Math.ceil(resetTime / 1000), // Unix timestamp in seconds
    };
  }

  // Add current request timestamp
  entry.timestamps.push(now);

  return {
    success: true,
    remaining: options.limit - entry.timestamps.length,
    reset: Math.ceil((now + options.interval) / 1000), // Unix timestamp in seconds
  };
}

/**
 * Extract client IP address from Next.js request
 *
 * Checks x-forwarded-for and x-real-ip headers, falls back to 'unknown'.
 * In production with AWS CloudFront/ALB, x-forwarded-for will contain the real IP.
 *
 * @param request - Next.js request object
 * @returns Client IP address or 'unknown'
 */
function getClientIp(request: NextRequest): string {
  // Check x-forwarded-for (AWS ALB/CloudFront)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  // Check x-real-ip (some reverse proxies)
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Fallback for local development or when headers are missing
  return 'unknown';
}

/**
 * Check rate limit for a request and return 429 response if exceeded
 *
 * Default limits:
 * - 60 requests per minute for general endpoints
 * - 10 requests per minute for auth endpoints
 * - 30 requests per minute for mutation endpoints
 *
 * @param request - Next.js request object
 * @param limit - Maximum requests per minute (default: 60)
 * @returns NextResponse with 429 status if rate limit exceeded, otherwise null
 */
export function checkRateLimit(
  request: NextRequest,
  limit: number = 60
): NextResponse | null {
  const ip = getClientIp(request);
  const identifier = `${ip}:${request.nextUrl.pathname}`;

  const result = rateLimit(identifier, {
    interval: 60 * 1000, // 1 minute
    limit,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.reset - Math.floor(Date.now() / 1000)),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.reset),
        },
      }
    );
  }

  return null;
}

/**
 * Clear rate limit store (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
  lastCleanup = Date.now();
}
