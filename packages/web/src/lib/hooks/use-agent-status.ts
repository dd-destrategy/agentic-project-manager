'use client';

import { useQuery } from '@tanstack/react-query';
import type { AgentStatusResponse } from '@/types';

/**
 * Fetch agent status from the API
 */
async function fetchAgentStatus(): Promise<AgentStatusResponse> {
  const response = await fetch('/api/agent/status');

  if (!response.ok) {
    throw new Error('Failed to fetch agent status');
  }

  return response.json();
}

/**
 * Hook for fetching and polling agent status
 *
 * Polls every 30 seconds to keep the UI updated with the latest agent state.
 */
export function useAgentStatus() {
  return useQuery({
    queryKey: ['agent', 'status'],
    queryFn: fetchAgentStatus,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Don't poll when tab is not focused
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Helper to format the last heartbeat time as a human-readable string
 */
export function formatLastHeartbeat(timestamp: string | null): string {
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
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
