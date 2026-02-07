'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Integration health config from the API
 */
export interface IntegrationHealthConfig {
  name: string;
  healthy: boolean;
  lastHealthCheck: string;
  consecutiveFailures: number;
  lastError?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response from /api/integrations/health
 */
interface IntegrationHealthResponse {
  integrations: IntegrationHealthConfig[];
  timestamp: string;
  error?: string;
}

/**
 * Fetch integration health from the API
 */
async function fetchIntegrationHealth(): Promise<IntegrationHealthResponse> {
  const response = await fetch('/api/integrations/health');

  if (!response.ok) {
    throw new Error('Failed to fetch integration health');
  }

  return response.json();
}

/**
 * Hook for fetching and polling integration health status
 *
 * Polls every 30 seconds to keep the UI updated with the latest integration health.
 */
export function useIntegrationHealth() {
  return useQuery({
    queryKey: ['integrations', 'health'],
    queryFn: fetchIntegrationHealth,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is not focused
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Format the last health check time as a human-readable string
 */
export function formatLastHealthCheck(timestamp: string | undefined): string {
  if (!timestamp) {
    return 'Never';
  }

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Get a status variant based on health state
 */
export function getHealthStatusVariant(
  healthy: boolean,
  consecutiveFailures: number
): 'healthy' | 'degraded' | 'error' {
  if (healthy) return 'healthy';
  if (consecutiveFailures >= 3) return 'error';
  return 'degraded';
}
