/**
 * Tests for UniversalAuthProvider
 *
 * Covers: OAuth2, API key, PAT, basic auth, webhook signature verification.
 */

import { createHmac as nodeCreateHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { UniversalAuthProvider, AuthError } from '../auth-provider.js';
import type { AuthDescriptor } from '../connector-schemas.js';

describe('UniversalAuthProvider', () => {
  const provider = new UniversalAuthProvider();

  // --------------------------------------------------------------------------
  // OAuth2
  // --------------------------------------------------------------------------

  describe('oauth2', () => {
    const auth: AuthDescriptor = {
      method: 'oauth2',
      config: {
        authoriseUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        scopes: ['read'],
        credentialFields: [],
      },
    };

    it('adds Bearer token header', () => {
      const result = provider.applyAuth(auth, { access_token: 'tok_123' });
      expect(result.headers['Authorization']).toBe('Bearer tok_123');
      expect(result.queryParams).toEqual({});
    });

    it('supports accessToken key variant', () => {
      const result = provider.applyAuth(auth, { accessToken: 'tok_456' });
      expect(result.headers['Authorization']).toBe('Bearer tok_456');
    });

    it('throws if no token found', () => {
      expect(() => provider.applyAuth(auth, {})).toThrow(AuthError);
      expect(() => provider.applyAuth(auth, {})).toThrow('No access_token');
    });
  });

  // --------------------------------------------------------------------------
  // API Key
  // --------------------------------------------------------------------------

  describe('api_key', () => {
    it('delivers as bearer', () => {
      const auth: AuthDescriptor = {
        method: 'api_key',
        config: {
          delivery: 'bearer',
          paramName: 'Authorization',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { apiKey: 'key_abc' });
      expect(result.headers['Authorization']).toBe('Bearer key_abc');
    });

    it('delivers as header', () => {
      const auth: AuthDescriptor = {
        method: 'api_key',
        config: {
          delivery: 'header',
          paramName: 'X-Api-Key',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { apiKey: 'key_def' });
      expect(result.headers['X-Api-Key']).toBe('key_def');
    });

    it('delivers as query parameter', () => {
      const auth: AuthDescriptor = {
        method: 'api_key',
        config: {
          delivery: 'query',
          paramName: 'api_key',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { apiKey: 'key_ghi' });
      expect(result.queryParams['api_key']).toBe('key_ghi');
    });

    it('supports api_key credential key variant', () => {
      const auth: AuthDescriptor = {
        method: 'api_key',
        config: {
          delivery: 'bearer',
          paramName: 'Authorization',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { api_key: 'key_jkl' });
      expect(result.headers['Authorization']).toBe('Bearer key_jkl');
    });

    it('throws if no key found', () => {
      const auth: AuthDescriptor = {
        method: 'api_key',
        config: {
          delivery: 'bearer',
          paramName: 'Authorization',
          credentialFields: [],
        },
      };
      expect(() => provider.applyAuth(auth, {})).toThrow(AuthError);
    });
  });

  // --------------------------------------------------------------------------
  // PAT
  // --------------------------------------------------------------------------

  describe('pat', () => {
    it('delivers as bearer', () => {
      const auth: AuthDescriptor = {
        method: 'pat',
        config: {
          delivery: 'bearer',
          paramName: 'Authorization',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { token: 'ghp_abc123' });
      expect(result.headers['Authorization']).toBe('Bearer ghp_abc123');
    });

    it('delivers as custom header', () => {
      const auth: AuthDescriptor = {
        method: 'pat',
        config: {
          delivery: 'header',
          paramName: 'Private-Token',
          credentialFields: [],
        },
      };
      const result = provider.applyAuth(auth, { pat: 'glpat-xyz' });
      expect(result.headers['Private-Token']).toBe('glpat-xyz');
    });

    it('throws if no token found', () => {
      const auth: AuthDescriptor = {
        method: 'pat',
        config: {
          delivery: 'bearer',
          paramName: 'Authorization',
          credentialFields: [],
        },
      };
      expect(() => provider.applyAuth(auth, {})).toThrow(AuthError);
    });
  });

  // --------------------------------------------------------------------------
  // Basic Auth
  // --------------------------------------------------------------------------

  describe('basic', () => {
    const auth: AuthDescriptor = {
      method: 'basic',
      config: { credentialFields: [] },
    };

    it('encodes username:password as Base64', () => {
      const result = provider.applyAuth(auth, {
        username: 'user@example.com',
        password: 'secret123',
      });
      const expected = Buffer.from('user@example.com:secret123').toString(
        'base64'
      );
      expect(result.headers['Authorization']).toBe(`Basic ${expected}`);
    });

    it('supports apiToken as password fallback', () => {
      const result = provider.applyAuth(auth, {
        username: 'admin',
        apiToken: 'tok_abc',
      });
      const expected = Buffer.from('admin:tok_abc').toString('base64');
      expect(result.headers['Authorization']).toBe(`Basic ${expected}`);
    });

    it('throws if no username found', () => {
      expect(() => provider.applyAuth(auth, { password: 'x' })).toThrow(
        AuthError
      );
    });
  });

  // --------------------------------------------------------------------------
  // None
  // --------------------------------------------------------------------------

  describe('none', () => {
    it('returns empty headers and params', () => {
      const auth: AuthDescriptor = { method: 'none' };
      const result = provider.applyAuth(auth, {});
      expect(result.headers).toEqual({});
      expect(result.queryParams).toEqual({});
    });
  });

  // --------------------------------------------------------------------------
  // Webhook Signature Verification
  // --------------------------------------------------------------------------

  describe('verifyWebhookSignature', () => {
    const auth: AuthDescriptor = {
      method: 'webhook_secret',
      config: {
        signatureHeader: 'X-Hub-Signature-256',
        algorithm: 'hmac-sha256',
        credentialFields: [],
      },
    };

    const secret = 'my-webhook-secret';
    const body = '{"action":"opened","issue":{"id":1}}';

    // Pre-computed HMAC-SHA256 of the body with the secret
    function computeHmac(sec: string, b: string): string {
      return nodeCreateHmac('sha256', sec).update(b).digest('hex');
    }

    it('verifies a valid signature', () => {
      const sig = computeHmac(secret, body);
      expect(
        provider.verifyWebhookSignature(
          auth,
          { webhookSecret: secret },
          sig,
          body
        )
      ).toBe(true);
    });

    it('verifies signature with sha256= prefix', () => {
      const sig = `sha256=${computeHmac(secret, body)}`;
      expect(
        provider.verifyWebhookSignature(
          auth,
          { webhookSecret: secret },
          sig,
          body
        )
      ).toBe(true);
    });

    it('rejects invalid signature', () => {
      expect(
        provider.verifyWebhookSignature(
          auth,
          { webhookSecret: secret },
          'invalid-signature-value-that-is-64-chars-long-for-hex-comparison',
          body
        )
      ).toBe(false);
    });

    it('rejects wrong secret', () => {
      const sig = computeHmac('wrong-secret', body);
      expect(
        provider.verifyWebhookSignature(
          auth,
          { webhookSecret: secret },
          sig,
          body
        )
      ).toBe(false);
    });

    it('throws for non-webhook auth method', () => {
      const otherAuth: AuthDescriptor = { method: 'none' };
      expect(() =>
        provider.verifyWebhookSignature(otherAuth, {}, 'sig', body)
      ).toThrow(AuthError);
    });

    it('throws if no secret in credentials', () => {
      expect(() =>
        provider.verifyWebhookSignature(auth, {}, 'sig', body)
      ).toThrow(AuthError);
    });
  });
});
