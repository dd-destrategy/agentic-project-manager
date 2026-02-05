'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { EventsResponse } from '@/types';

interface UseEventsOptions {
  projectId?: string;
  limit?: number;
}

/**
 * Fetch events from the API
 */
async function fetchEvents({
  projectId,
  limit = 20,
  cursor,
}: {
  projectId?: string;
  limit?: number;
  cursor?: string;
}): Promise<EventsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));

  if (projectId) {
    params.set('projectId', projectId);
  }

  if (cursor) {
    params.set('cursor', cursor);
  }

  const response = await fetch(`/api/events?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch events');
  }

  return response.json();
}

/**
 * Hook for fetching recent events with polling
 *
 * Returns the most recent events and polls every 30 seconds.
 */
export function useEvents(options: UseEventsOptions = {}) {
  const { projectId, limit = 20 } = options;

  return useQuery({
    queryKey: ['events', { projectId, limit }],
    queryFn: () => fetchEvents({ projectId, limit }),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for fetching events with infinite scroll pagination
 */
export function useInfiniteEvents(options: UseEventsOptions = {}) {
  const { projectId, limit = 20 } = options;

  return useInfiniteQuery({
    queryKey: ['events', 'infinite', { projectId, limit }],
    queryFn: ({ pageParam }) =>
      fetchEvents({ projectId, limit, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });
}

/**
 * Format event timestamp for display
 */
export function formatEventTime(timestamp: string): string {
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
    });
  }
}
