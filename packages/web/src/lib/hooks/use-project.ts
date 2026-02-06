'use client';

import { useQuery } from '@tanstack/react-query';

import type { Project, HealthStatus } from '@/types';

/**
 * Extended project response with health status
 */
interface ProjectDetailResponse {
  project: Project & {
    healthStatus: HealthStatus;
    pendingEscalations: number;
  };
}

/**
 * Fetch a single project from the API
 */
async function fetchProject(id: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`/api/projects/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch project');
  }

  return response.json();
}

/**
 * Hook for fetching a single project by ID
 *
 * Returns project details with health status.
 */
export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Get the variant for health status badge
 */
export function getHealthVariant(health: HealthStatus): 'success' | 'warning' | 'error' {
  switch (health) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'success';
  }
}

/**
 * Format health status for display
 */
export function formatHealthStatus(health: HealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'Healthy';
    case 'warning':
      return 'At Risk';
    case 'error':
      return 'Critical';
    default:
      return health;
  }
}
