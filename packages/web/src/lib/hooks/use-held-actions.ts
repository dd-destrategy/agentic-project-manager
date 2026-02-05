'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HeldAction, HeldActionsResponse, HeldActionResponse } from '@/types';

interface UseHeldActionsOptions {
  status?: HeldAction['status'];
  projectId?: string;
  limit?: number;
}

/**
 * Fetch held actions from the API
 */
async function fetchHeldActions({
  status = 'pending',
  projectId,
  limit = 50,
}: UseHeldActionsOptions = {}): Promise<HeldActionsResponse> {
  const params = new URLSearchParams();
  params.set('status', status);
  params.set('limit', String(limit));

  if (projectId) {
    params.set('projectId', projectId);
  }

  const response = await fetch(`/api/held-actions?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch held actions');
  }

  return response.json();
}

/**
 * Approve a held action
 */
async function approveHeldAction(id: string): Promise<HeldActionResponse> {
  const response = await fetch(`/api/held-actions/${id}/approve`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to approve held action');
  }

  return response.json();
}

/**
 * Cancel a held action
 */
async function cancelHeldAction({
  id,
  reason,
}: {
  id: string;
  reason?: string;
}): Promise<HeldActionResponse> {
  const response = await fetch(`/api/held-actions/${id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error('Failed to cancel held action');
  }

  return response.json();
}

/**
 * Hook for fetching held actions with optional filtering
 */
export function useHeldActions(options: UseHeldActionsOptions = {}) {
  const { status = 'pending', projectId, limit = 50 } = options;

  return useQuery({
    queryKey: ['held-actions', { status, projectId, limit }],
    queryFn: () => fetchHeldActions({ status, projectId, limit }),
    staleTime: 10 * 1000, // 10 seconds - more frequent updates for pending actions
    refetchInterval: 10 * 1000, // Poll every 10 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook for fetching pending held actions (convenience wrapper)
 */
export function usePendingHeldActions(options: Omit<UseHeldActionsOptions, 'status'> = {}) {
  return useHeldActions({ ...options, status: 'pending' });
}

/**
 * Hook for fetching pending held action count
 */
export function usePendingHeldActionCount() {
  const { data, isLoading, error } = usePendingHeldActions({ limit: 100 });

  return {
    count: data?.count ?? 0,
    isLoading,
    error,
  };
}

/**
 * Hook for approving a held action
 */
export function useApproveHeldAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveHeldAction,
    onSuccess: () => {
      // Invalidate held actions list to refresh
      queryClient.invalidateQueries({ queryKey: ['held-actions'] });
    },
  });
}

/**
 * Hook for cancelling a held action
 */
export function useCancelHeldAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelHeldAction,
    onSuccess: () => {
      // Invalidate held actions list to refresh
      queryClient.invalidateQueries({ queryKey: ['held-actions'] });
    },
  });
}

/**
 * Format time remaining until action executes
 */
export function formatTimeRemaining(heldUntil: string): string {
  const now = Date.now();
  const until = new Date(heldUntil).getTime();
  const diffMs = until - now;

  if (diffMs <= 0) {
    return 'Executing...';
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor((diffMs % 60000) / 1000);

  if (diffMins === 0) {
    return `${diffSecs}s`;
  }

  if (diffMins < 60) {
    return `${diffMins}m ${diffSecs}s`;
  }

  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  if (diffHours < 24) {
    return `${diffHours}h ${remainingMins}m`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

/**
 * Get action type display label
 */
export function getActionTypeLabel(actionType: HeldAction['actionType']): string {
  switch (actionType) {
    case 'email_stakeholder':
      return 'Email';
    case 'jira_status_change':
      return 'Jira Status Change';
    default:
      return actionType;
  }
}

/**
 * Get action type icon name (for lucide-react)
 */
export function getActionTypeIcon(actionType: HeldAction['actionType']): string {
  switch (actionType) {
    case 'email_stakeholder':
      return 'mail';
    case 'jira_status_change':
      return 'git-branch';
    default:
      return 'circle';
  }
}

/**
 * Check if payload is email type
 */
export function isEmailPayload(
  payload: HeldAction['payload']
): payload is import('@/types').EmailStakeholderPayload {
  return 'to' in payload && 'subject' in payload && 'bodyText' in payload;
}

/**
 * Check if payload is Jira status change type
 */
export function isJiraPayload(
  payload: HeldAction['payload']
): payload is import('@/types').JiraStatusChangePayload {
  return 'issueKey' in payload && 'transitionId' in payload;
}
