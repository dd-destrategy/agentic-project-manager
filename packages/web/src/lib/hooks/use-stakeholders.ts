'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Stakeholder from the API
 */
export interface Stakeholder {
  id: string;
  projectId: string;
  name: string;
  email?: string;
  role?: string;
  interactionCount: number;
  lastSeenAt: string;
  firstSeenAt: string;
  sources: string[];
  communicationFrequency: number;
  lastInteractionTypes: string[];
  isActive: boolean;
}

/**
 * Response from /api/stakeholders/[projectId]
 */
interface StakeholderResponse {
  stakeholders: Stakeholder[];
  anomalies: Stakeholder[];
  count: number;
}

/**
 * Fetch stakeholders for a project from the API
 */
async function fetchStakeholders(
  projectId: string
): Promise<StakeholderResponse> {
  const response = await fetch(`/api/stakeholders/${projectId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch stakeholders');
  }

  return response.json();
}

/**
 * Hook for fetching stakeholders for a specific project.
 *
 * Polls every 60 seconds — stakeholder data changes infrequently.
 */
export function useStakeholders(projectId: string | undefined) {
  return useQuery({
    queryKey: ['stakeholders', projectId],
    queryFn: () => fetchStakeholders(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Poll every minute
    refetchIntervalInBackground: false,
  });
}
