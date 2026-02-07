/**
 * Universal Auth Provider
 *
 * Handles credential injection for HTTP requests based on the connector's
 * AuthDescriptor. Supports OAuth2, API keys, PATs, basic auth, and
 * webhook signature verification.
 */

import { createHmac } from 'crypto';

import type { AuthDescriptor } from './connector-schemas.js';

// ============================================================================
// Types
// ============================================================================

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface AuthResult {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

// ============================================================================
// Auth Provider
// ============================================================================

export class UniversalAuthProvider {
  /**
   * Apply authentication to an outgoing HTTP request.
   * Returns the additional headers and query params to include.
   */
  applyAuth(
    authDescriptor: AuthDescriptor,
    credentials: Record<string, string>
  ): AuthResult {
    const result: AuthResult = { headers: {}, queryParams: {} };

    switch (authDescriptor.method) {
      case 'oauth2': {
        const token = credentials.access_token ?? credentials.accessToken ?? '';
        if (!token) {
          throw new AuthError('No access_token found in credentials');
        }
        result.headers['Authorization'] = `Bearer ${token}`;
        break;
      }

      case 'api_key': {
        const { delivery, paramName } = authDescriptor.config;
        const key = credentials.apiKey ?? credentials.api_key ?? '';
        if (!key) {
          throw new AuthError('No API key found in credentials');
        }

        if (delivery === 'bearer') {
          result.headers['Authorization'] = `Bearer ${key}`;
        } else if (delivery === 'header') {
          result.headers[paramName] = key;
        } else if (delivery === 'query') {
          result.queryParams[paramName] = key;
        }
        break;
      }

      case 'pat': {
        const { delivery, paramName } = authDescriptor.config;
        const token = credentials.token ?? credentials.pat ?? '';
        if (!token) {
          throw new AuthError('No personal access token found in credentials');
        }

        if (delivery === 'bearer') {
          result.headers['Authorization'] = `Bearer ${token}`;
        } else {
          result.headers[paramName] = token;
        }
        break;
      }

      case 'basic': {
        const username = credentials.username ?? '';
        const password = credentials.password ?? credentials.apiToken ?? '';
        if (!username) {
          throw new AuthError('No username found in credentials');
        }
        const encoded = Buffer.from(`${username}:${password}`).toString(
          'base64'
        );
        result.headers['Authorization'] = `Basic ${encoded}`;
        break;
      }

      case 'webhook_secret':
        // Webhook auth is verified on the inbound side, not applied to outbound
        break;

      case 'none':
        break;

      default:
        throw new AuthError(
          `Unsupported auth method: ${(authDescriptor as { method: string }).method}`
        );
    }

    return result;
  }

  /**
   * Verify an inbound webhook signature.
   */
  verifyWebhookSignature(
    authDescriptor: AuthDescriptor,
    credentials: Record<string, string>,
    signature: string,
    body: string
  ): boolean {
    if (authDescriptor.method !== 'webhook_secret') {
      throw new AuthError(
        'verifyWebhookSignature requires webhook_secret auth method'
      );
    }

    const { algorithm } = authDescriptor.config;
    const secret = credentials.webhookSecret ?? credentials.secret ?? '';

    if (!secret) {
      throw new AuthError('No webhook secret found in credentials');
    }

    const algo = algorithm === 'hmac-sha256' ? 'sha256' : 'sha1';
    const expected = createHmac(algo, secret).update(body).digest('hex');

    // Handle prefix formats like "sha256=abc123"
    const signatureValue = signature.includes('=')
      ? signature.split('=').slice(1).join('=')
      : signature;

    // Constant-time comparison
    if (expected.length !== signatureValue.length) return false;

    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ signatureValue.charCodeAt(i);
    }
    return result === 0;
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
