'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { ArtefactType } from '@/types';

interface Artefact {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: string;
  previousVersion?: string;
  version: number;
  updatedAt: string;
  createdAt: string;
}

interface ArtefactsResponse {
  artefacts: Artefact[];
  projectId: string;
}

/**
 * Fetch artefacts for a project from the API
 */
async function fetchArtefacts(projectId: string): Promise<ArtefactsResponse> {
  const response = await fetch(`/api/artefacts/${projectId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch artefacts');
  }

  return response.json();
}

/**
 * Hook for fetching artefacts for a specific project
 */
export function useArtefacts(projectId: string | undefined) {
  return useQuery({
    queryKey: ['artefacts', projectId],
    queryFn: () => fetchArtefacts(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute - artefacts change less frequently
    refetchInterval: 60 * 1000, // Poll every minute
  });
}

/**
 * Parse artefact content from JSON string with Zod schema validation
 */
export function parseArtefactContent<T>(
  content: string,
  schema?: z.ZodType<T>
): T | null {
  try {
    const parsed = JSON.parse(content);
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        console.error('Artefact content validation failed:', result.error);
        return null;
      }
      return result.data;
    }
    // Fallback for backward compatibility when no schema provided
    return parsed as T;
  } catch {
    console.error('Failed to parse artefact content');
    return null;
  }
}

/**
 * Get a specific artefact by type from the artefacts list
 */
export function getArtefactByType(
  artefacts: Artefact[] | undefined,
  type: ArtefactType
): Artefact | undefined {
  return artefacts?.find((a) => a.type === type);
}

/**
 * Format artefact type for display
 */
export function formatArtefactType(type: ArtefactType): string {
  const labels: Record<ArtefactType, string> = {
    delivery_state: 'Delivery State',
    raid_log: 'RAID Log',
    backlog_summary: 'Backlog Summary',
    decision_log: 'Decision Log',
  };
  return labels[type] || type;
}
