'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { GraduationEvidenceData } from '@/components/graduation-evidence';

/**
 * Graduation confirmation response
 */
interface GraduationConfirmResponse {
  success: boolean;
  previousLevel: number;
  newLevel: number;
  message: string;
  graduatedAt: string;
}

/**
 * Fetch graduation evidence from API
 */
async function fetchGraduationEvidence(): Promise<GraduationEvidenceData> {
  const response = await fetch('/api/graduation');

  if (!response.ok) {
    throw new Error('Failed to fetch graduation evidence');
  }

  return response.json();
}

/**
 * Confirm graduation via API
 */
async function confirmGraduation(): Promise<GraduationConfirmResponse> {
  const response = await fetch('/api/graduation/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to confirm graduation');
  }

  return response.json();
}

/**
 * Hook for fetching graduation evidence
 *
 * Returns metrics, blockers, and whether graduation is possible.
 */
export function useGraduationEvidence() {
  const query = useQuery({
    queryKey: ['graduation', 'evidence'],
    queryFn: fetchGraduationEvidence,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  return {
    evidence: query.data,
    canGraduate: query.data?.canGraduate ?? false,
    blockers: query.data?.blockers ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for confirming graduation
 *
 * Returns a mutation function to trigger graduation confirmation.
 */
export function useConfirmGraduation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: confirmGraduation,
    onSuccess: () => {
      // Invalidate graduation evidence to refresh data
      queryClient.invalidateQueries({ queryKey: ['graduation'] });
      // Also invalidate autonomy settings as level may have changed
      queryClient.invalidateQueries({ queryKey: ['agent', 'autonomy'] });
    },
  });
}
