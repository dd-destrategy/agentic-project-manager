'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Briefing {
  id: string;
  projectId: string;
  meetingType: string;
  title: string;
  generatedAt: string;
  sections: BriefingSection[];
}

export interface BriefingSection {
  heading: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
}

export function useBriefing(projectId: string | undefined) {
  return useQuery<Briefing | null>({
    queryKey: ['briefing', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/briefings/${projectId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch briefing');
      }
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient();

  return useMutation<
    Briefing,
    Error,
    { projectId: string; meetingType: string }
  >({
    mutationFn: async ({ projectId, meetingType }) => {
      const res = await fetch(`/api/briefings/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingType }),
      });
      if (!res.ok) throw new Error('Failed to generate briefing');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['briefing', data.projectId] });
    },
  });
}
