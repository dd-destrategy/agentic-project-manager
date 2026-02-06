'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { GraduationEvidenceData as ComprehensiveEvidenceData } from '@/app/api/graduation/evidence/route';
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
 * Fetch graduation evidence from API (legacy - action type graduation)
 */
async function fetchGraduationEvidence(): Promise<GraduationEvidenceData> {
  const response = await fetch('/api/graduation');

  if (!response.ok) {
    throw new Error('Failed to fetch graduation evidence');
  }

  return response.json();
}

/**
 * Fetch comprehensive graduation evidence from API (autonomy level graduation)
 */
async function fetchComprehensiveEvidence(): Promise<ComprehensiveEvidenceData> {
  const response = await fetch('/api/graduation/evidence');

  if (!response.ok) {
    throw new Error('Failed to fetch comprehensive graduation evidence');
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
 * Promote autonomy level via API
 */
async function promoteAutonomyLevel(
  targetLevel: number
): Promise<{ success: boolean; newLevel: string }> {
  const response = await fetch('/api/graduation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLevel }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to promote autonomy level' }));
    throw new Error(error.message || 'Failed to promote autonomy level');
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

/**
 * Hook for fetching comprehensive graduation evidence
 *
 * Returns metrics for autonomy level graduation including:
 * - Spot check statistics
 * - Recent decisions
 * - Budget health
 * - Readiness assessment
 */
export function useGraduationEvidenceDashboard() {
  const query = useQuery({
    queryKey: ['graduation', 'evidence', 'comprehensive'],
    queryFn: fetchComprehensiveEvidence,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  return {
    evidence: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for promoting autonomy level
 *
 * Returns a mutation function to trigger autonomy level promotion.
 */
export function usePromoteAutonomyLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: promoteAutonomyLevel,
    onSuccess: () => {
      // Invalidate all graduation-related queries
      queryClient.invalidateQueries({ queryKey: ['graduation'] });
      // Invalidate autonomy settings
      queryClient.invalidateQueries({ queryKey: ['agent', 'autonomy'] });
      // Invalidate projects as they show autonomy level
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
