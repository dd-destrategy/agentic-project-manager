'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Escalation, EscalationsResponse } from '@/types';

interface UseEscalationsOptions {
  status?: Escalation['status'];
  projectId?: string;
  limit?: number;
}

/**
 * Fetch escalations from the API
 */
async function fetchEscalations({
  status,
  projectId,
  limit = 20,
}: UseEscalationsOptions = {}): Promise<EscalationsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));

  if (status) {
    params.set('status', status);
  }

  if (projectId) {
    params.set('projectId', projectId);
  }

  const response = await fetch(`/api/escalations?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch escalations');
  }

  return response.json();
}

/**
 * Fetch a single escalation by ID
 */
async function fetchEscalation(id: string): Promise<Escalation> {
  const response = await fetch(`/api/escalations/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Escalation not found');
    }
    throw new Error('Failed to fetch escalation');
  }

  return response.json();
}

/**
 * Record a decision on an escalation
 */
async function recordDecision({
  id,
  decision,
  notes,
}: {
  id: string;
  decision: string;
  notes?: string;
}): Promise<Escalation> {
  const response = await fetch(`/api/escalations/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ decision, notes }),
  });

  if (!response.ok) {
    throw new Error('Failed to record decision');
  }

  return response.json();
}

/**
 * Hook for fetching escalations with optional filtering
 */
export function useEscalations(options: UseEscalationsOptions = {}) {
  const { status, projectId, limit = 20 } = options;

  return useQuery({
    queryKey: ['escalations', { status, projectId, limit }],
    queryFn: () => fetchEscalations({ status, projectId, limit }),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for fetching pending escalations (convenience wrapper)
 */
export function usePendingEscalations(options: Omit<UseEscalationsOptions, 'status'> = {}) {
  return useEscalations({ ...options, status: 'pending' });
}

/**
 * Hook for fetching pending escalation count
 */
export function usePendingEscalationCount() {
  const { data, isLoading, error } = usePendingEscalations({ limit: 100 });

  return {
    count: data?.count ?? 0,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching a single escalation
 */
export function useEscalation(id: string) {
  return useQuery({
    queryKey: ['escalation', id],
    queryFn: () => fetchEscalation(id),
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}

/**
 * Hook for recording a decision on an escalation
 */
export function useRecordDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recordDecision,
    onSuccess: (updatedEscalation) => {
      // Update the single escalation cache
      queryClient.setQueryData(['escalation', updatedEscalation.id], updatedEscalation);

      // Invalidate escalations list to refresh counts
      queryClient.invalidateQueries({ queryKey: ['escalations'] });
    },
  });
}

/**
 * Format escalation creation time for display
 */
export function formatEscalationTime(timestamp: string): string {
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
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }
}

/**
 * Get risk level badge variant
 */
export function getRiskLevelVariant(
  riskLevel: 'low' | 'medium' | 'high'
): 'success' | 'warning' | 'error' {
  switch (riskLevel) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
      return 'error';
  }
}
