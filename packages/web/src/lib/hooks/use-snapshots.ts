'use client';

import { useQuery } from '@tanstack/react-query';

import type { ArtefactType } from '@/types';

export interface TrendDataPoint {
  timestamp: string;
  metrics: {
    overallStatus?: 'green' | 'amber' | 'red';
    blockerCount?: number;
    milestoneCount?: number;
    completedPoints?: number;
    totalPoints?: number;
    openRisks?: number;
    openIssues?: number;
    totalItems?: number;
    totalBacklogItems?: number;
    blockedItems?: number;
    totalDecisions?: number;
    activeDecisions?: number;
  };
}

interface SnapshotTrendResponse {
  projectId: string;
  artefactType: ArtefactType;
  dataPoints: TrendDataPoint[];
  count: number;
}

/**
 * Fetch artefact trend data from the API
 */
async function fetchArtefactTrend(
  projectId: string,
  artefactType: ArtefactType,
  options?: { limit?: number; since?: string }
): Promise<SnapshotTrendResponse> {
  const params = new URLSearchParams();
  params.set('type', artefactType);

  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  if (options?.since) {
    params.set('since', options.since);
  }

  const response = await fetch(
    `/api/snapshots/${projectId}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch artefact trend data');
  }

  return response.json();
}

/**
 * Hook for fetching artefact trend data with polling
 *
 * Returns trend data points for a specific artefact type over time.
 * Polls every 60 seconds to pick up new snapshots.
 */
export function useArtefactTrend(
  projectId: string | undefined,
  artefactType: ArtefactType,
  options?: { limit?: number; since?: string }
) {
  return useQuery({
    queryKey: ['artefact-trend', projectId, artefactType, options],
    queryFn: () => fetchArtefactTrend(projectId!, artefactType, options),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
