/**
 * In-memory cache for AWS Secrets Manager values
 *
 * Lambda containers are reused across invocations, so caching secrets
 * in module-level state avoids redundant Secrets Manager API calls.
 * The cache uses a TTL to ensure secrets are eventually refreshed.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/** Cached secret entry with expiry */
interface CachedSecret {
  value: string;
  expiresAt: number;
}

/** Default cache TTL: 5 minutes */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Secrets cache that wraps AWS Secrets Manager with in-memory TTL caching.
 *
 * Designed for Lambda environments where the same container handles
 * multiple invocations. Secrets are fetched once and reused until
 * the TTL expires, reducing Secrets Manager API calls and latency.
 */
export class SecretsCache {
  private cache = new Map<string, CachedSecret>();
  private client: SecretsManagerClient;
  private ttlMs: number;

  constructor(options?: { client?: SecretsManagerClient; ttlMs?: number }) {
    this.client = options?.client ?? new SecretsManagerClient({});
    this.ttlMs = options?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Retrieve a secret value, returning a cached copy if still valid.
   *
   * @param secretId - The ARN or name of the secret
   * @returns The secret string value
   * @throws If the secret cannot be retrieved from Secrets Manager
   */
  async getSecret(secretId: string): Promise<string> {
    const cached = this.cache.get(secretId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await this.client.send(command);

    const value = response.SecretString;
    if (!value) {
      throw new Error(`Secret ${secretId} has no string value`);
    }

    this.cache.set(secretId, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });

    return value;
  }

  /**
   * Invalidate a specific cached secret, forcing a fresh fetch next time.
   */
  invalidate(secretId: string): void {
    this.cache.delete(secretId);
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

/** Singleton instance shared across all Lambda handler invocations */
export const secretsCache = new SecretsCache();

/**
 * Convenience function to retrieve a cached secret.
 *
 * Uses the module-level singleton SecretsCache instance so that
 * cached values persist across invocations within the same container.
 *
 * @param secretId - The ARN or name of the secret
 * @returns The secret string value
 */
export async function getCachedSecret(secretId: string): Promise<string> {
  return secretsCache.getSecret(secretId);
}
