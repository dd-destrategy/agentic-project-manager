'use client';

import { useQuery } from '@tanstack/react-query';

import type { CatchupSummary } from '@/types';

/**
 * Fetch catch-up summary from the API
 */
async function fetchCatchup(): Promise<CatchupSummary> {
  const response = await fetch('/api/catchup');

  if (!response.ok) {
    throw new Error('Failed to fetch catch-up summary');
  }

  return response.json();
}

/**
 * Hook for fetching the "Since You Left" catch-up summary.
 *
 * Compiles recent events, artefact changes, and escalations
 * into a summary of what happened since the user's last visit.
 * Polls every 60 seconds to pick up new activity.
 */
export function useCatchup() {
  return useQuery({
    queryKey: ['catchup'],
    queryFn: fetchCatchup,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
