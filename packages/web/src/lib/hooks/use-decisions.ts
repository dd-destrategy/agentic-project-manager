'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { DecisionsResponse, DecisionOutcomeStatus } from '@/types';

/**
 * Fetch decisions for a project from the API
 */
async function fetchDecisions(projectId: string): Promise<DecisionsResponse> {
  const response = await fetch(`/api/decisions/${projectId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch decisions');
  }

  return response.json();
}

/**
 * Update a decision's outcome
 */
interface UpdateDecisionOutcomeParams {
  projectId: string;
  decisionId: string;
  outcome?: string;
  outcomeDate?: string;
  outcomeStatus?: DecisionOutcomeStatus;
  reviewDate?: string;
  lessonsLearned?: string;
}

async function updateDecisionOutcome(
  params: UpdateDecisionOutcomeParams
): Promise<{ success: boolean }> {
  const { projectId, ...body } = params;

  const response = await fetch(`/api/decisions/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Failed to update decision outcome');
  }

  return response.json();
}

/**
 * Hook for fetching decisions for a specific project
 */
export function useDecisions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['decisions', projectId],
    queryFn: () => fetchDecisions(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Poll every minute
  });
}

/**
 * Hook for updating a decision's outcome fields
 */
export function useUpdateDecisionOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDecisionOutcome,
    onSuccess: (_data, variables) => {
      // Invalidate the decisions query for this project
      queryClient.invalidateQueries({
        queryKey: ['decisions', variables.projectId],
      });
      // Also invalidate artefacts since the decision log artefact was updated
      queryClient.invalidateQueries({
        queryKey: ['artefacts', variables.projectId],
      });
    },
  });
}
