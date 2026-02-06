/**
 * Circuit Breaker Tests
 *
 * Tests for the circuit breaker pattern implementation.
 * Covers open/closed/half-open states, threshold behaviour, and reset timers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerState,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Construction', () => {
    it('should create with default options', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should create with custom options', () => {
      const breaker = new CircuitBreaker({
        serviceName: 'test-service',
        failureThreshold: 5,
        resetTimeoutMs: 30000,
      });
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Closed State', () => {
    it('should execute function successfully when closed', async () => {
      const breaker = new CircuitBreaker();
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe('closed');
    });

    it('should track failure count on errors', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      expect(breaker.getFailureCount()).toBe(0);

      await expect(breaker.execute(mockFn)).rejects.toThrow('Test error');
      expect(breaker.getFailureCount()).toBe(1);

      await expect(breaker.execute(mockFn)).rejects.toThrow('Test error');
      expect(breaker.getFailureCount()).toBe(2);

      expect(breaker.getState()).toBe('closed');
    });

    it('should remain closed if below failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      for (let i = 0; i < 4; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      }

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(4);
    });
  });

  describe('Open State', () => {
    it('should open after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      }

      expect(breaker.getState()).toBe('open');
      expect(breaker.getFailureCount()).toBe(3);
    });

    it('should reject immediately when open', async () => {
      const breaker = new CircuitBreaker({
        serviceName: 'test-service',
        failureThreshold: 2,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');

      expect(breaker.getState()).toBe('open');

      // Next call should be rejected immediately
      await expect(breaker.execute(mockFn)).rejects.toThrow(
        CircuitBreakerOpenError
      );
      await expect(breaker.execute(mockFn)).rejects.toThrow(
        'Circuit breaker open for test-service'
      );

      // Original function should not be called when circuit is open
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw CircuitBreakerOpenError with retry time', async () => {
      const breaker = new CircuitBreaker({
        serviceName: 'my-service',
        failureThreshold: 1,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      try {
        await breaker.execute(mockFn);
        expect.fail('Should have thrown CircuitBreakerOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        if (error instanceof CircuitBreakerOpenError) {
          expect(error.serviceName).toBe('my-service');
          expect(error.retryAfterMs).toBeGreaterThan(0);
          expect(error.retryAfterMs).toBeLessThanOrEqual(60000);
        }
      }
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(61000);

      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('Half-open State', () => {
    it('should allow one probe request in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce('success');

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('open');

      // Advance time to trigger half-open
      vi.advanceTimersByTime(61000);

      // Probe request should succeed and close the circuit
      const result = await breaker.execute(mockFn);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should re-open if half-open probe fails', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('open');

      // Advance time to trigger half-open
      vi.advanceTimersByTime(61000);

      // Probe request fails, should re-open
      await expect(breaker.execute(mockFn)).rejects.toThrow('Failure');
      expect(breaker.getState()).toBe('open');
      expect(breaker.getFailureCount()).toBe(3);
    });

    it('should transition to closed on successful probe', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 30000,
      });

      // Open the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('open');

      // Wait for reset timeout
      vi.advanceTimersByTime(31000);

      // Successful probe should close circuit
      const successFn = vi.fn().mockResolvedValue('recovered');
      const result = await breaker.execute(successFn);

      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('State transitions with getState()', () => {
    it('should report half-open when reading state after timeout', () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      breaker.execute(mockFn).catch(() => {
        /* ignore */
      });

      expect(breaker.getState()).toBe('open');

      // Advance time
      vi.advanceTimersByTime(61000);

      // Reading state should show half-open
      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('Reset', () => {
    it('should reset to closed state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should allow requests after reset', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce('success');

      // Open the circuit
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Reset and try again
      breaker.reset();
      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Error propagation', () => {
    it('should propagate original error when circuit is closed', async () => {
      const breaker = new CircuitBreaker();
      const customError = new Error('Custom error message');
      const mockFn = vi.fn().mockRejectedValue(customError);

      await expect(breaker.execute(mockFn)).rejects.toThrow(
        'Custom error message'
      );
    });

    it('should propagate error from half-open probe', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 100,
      });

      // Open the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('Initial failure'));
      await expect(breaker.execute(failFn)).rejects.toThrow('Initial failure');

      // Wait for half-open
      vi.advanceTimersByTime(101);

      // Probe with different error
      const probeFn = vi.fn().mockRejectedValue(new Error('Probe failure'));
      await expect(breaker.execute(probeFn)).rejects.toThrow('Probe failure');
    });
  });

  describe('Multiple failure scenarios', () => {
    it('should handle alternating success and failure', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const mockFn = vi
        .fn()
        .mockResolvedValueOnce('success-1')
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockResolvedValueOnce('success-2')
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce('success-3');

      await breaker.execute(mockFn);
      expect(breaker.getFailureCount()).toBe(0);

      await expect(breaker.execute(mockFn)).rejects.toThrow('fail-1');
      expect(breaker.getFailureCount()).toBe(1);

      await breaker.execute(mockFn);
      expect(breaker.getFailureCount()).toBe(0); // Reset on success

      await expect(breaker.execute(mockFn)).rejects.toThrow('fail-2');
      expect(breaker.getFailureCount()).toBe(1);

      await breaker.execute(mockFn);
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should reset failure count on success before threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail-3'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      await breaker.execute(mockFn);
      expect(breaker.getFailureCount()).toBe(0);

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(1);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Timing edge cases', () => {
    it('should handle exact reset timeout boundary', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Advance to exactly the timeout
      vi.advanceTimersByTime(60000);
      expect(breaker.getState()).toBe('half-open');
    });

    it('should reject if called just before reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      // Advance to just before timeout (59.9 seconds)
      vi.advanceTimersByTime(59900);

      await expect(breaker.execute(mockFn)).rejects.toThrow(
        CircuitBreakerOpenError
      );
    });
  });

  describe('Service name in errors', () => {
    it('should include service name in error message', async () => {
      const breaker = new CircuitBreaker({
        serviceName: 'payment-api',
        failureThreshold: 1,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();
      expect(breaker.getState()).toBe('open');

      try {
        await breaker.execute(mockFn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as Error).message).toContain('payment-api');
      }
    });

    it('should use default service name', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(breaker.execute(mockFn)).rejects.toThrow();

      try {
        await breaker.execute(mockFn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as Error).message).toContain('unknown');
      }
    });
  });
});
