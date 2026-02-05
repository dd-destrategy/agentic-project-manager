'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProjectListResponse, ProjectSummary } from '@/types';

/**
 * Fetch projects from the API
 */
async function fetchProjects(): Promise<ProjectListResponse> {
  const response = await fetch('/api/projects');

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }

  return response.json();
}

/**
 * Hook for fetching all projects with polling
 *
 * Returns project summaries and polls every 30 seconds.
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });
}

/**
 * Get the count of pending escalations across all projects
 */
export function getTotalPendingEscalations(projects: ProjectSummary[]): number {
  return projects.reduce((total, project) => total + project.pendingEscalations, 0);
}

/**
 * Format the last activity time for a project
 */
export function formatLastActivity(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }
}
