'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActivityStatsResponse } from '@/types';

/**
 * Fetch activity statistics from the API
 */
async function fetchActivityStats(): Promise<ActivityStatsResponse> {
  const response = await fetch('/api/stats');

  if (!response.ok) {
    throw new Error('Failed to fetch activity statistics');
  }

  return response.json();
}

/**
 * Hook for fetching 24-hour activity statistics with polling
 *
 * Returns activity stats and polls every 30 seconds to keep data fresh.
 */
export function useActivityStats() {
  return useQuery({
    queryKey: ['stats', 'activity'],
    queryFn: fetchActivityStats,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is not focused
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Format a number with compact notation (e.g., 1.2K, 3.5M)
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Format a change value with + or - prefix
 */
export function formatChange(value: number): string {
  if (value === 0) {
    return '0';
  }
  return value > 0 ? `+${value}` : value.toString();
}

/**
 * Get CSS class for change indicator (positive = green, negative = red)
 */
export function getChangeClassName(value: number): string {
  if (value > 0) {
    return 'text-green-600';
  }
  if (value < 0) {
    return 'text-red-600';
  }
  return 'text-muted-foreground';
}
