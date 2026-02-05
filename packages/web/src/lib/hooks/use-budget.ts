'use client';

import { useQuery } from '@tanstack/react-query';
import type { BudgetStatusData } from '@/components/budget-status';

/**
 * Fetch budget status from API
 */
async function fetchBudgetStatus(): Promise<BudgetStatusData> {
  const response = await fetch('/api/budget');

  if (!response.ok) {
    throw new Error('Failed to fetch budget status');
  }

  return response.json();
}

/**
 * Hook for fetching budget status
 *
 * Returns current budget metrics including daily/monthly spend,
 * degradation tier, and projections.
 */
export function useBudgetStatus() {
  return useQuery({
    queryKey: ['budget', 'status'],
    queryFn: fetchBudgetStatus,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}
