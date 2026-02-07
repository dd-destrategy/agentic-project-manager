'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface ReportContent {
  summary: string;
  healthStatus: string;
  keyHighlights: string[];
  risksAndBlockers: string[];
  decisionsNeeded: string[];
  upcomingMilestones: string[];
  metricsSnapshot: Record<string, string | number>;
}

export interface StatusReport {
  id: string;
  projectId: string;
  template: string;
  title: string;
  content: ReportContent;
  generatedAt: string;
  sentAt?: string;
  sentTo?: string[];
  status: string;
}

interface ReportsResponse {
  reports: StatusReport[];
  projectId: string;
}

interface GenerateReportResponse {
  report: StatusReport;
}

/**
 * Fetch reports for a project
 */
export function useReports(projectId: string | undefined) {
  return useQuery({
    queryKey: ['reports', projectId],
    queryFn: async (): Promise<ReportsResponse> => {
      const res = await fetch(`/api/reports/${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Generate a new report
 */
export function useGenerateReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: string): Promise<GenerateReportResponse> => {
      const res = await fetch(`/api/reports/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reports', projectId] }),
  });
}

/**
 * Send a report via email
 */
export function useSendReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reportId,
      recipients,
    }: {
      reportId: string;
      recipients: string[];
    }) => {
      const res = await fetch(`/api/reports/${projectId}/${reportId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', recipients }),
      });
      if (!res.ok) throw new Error('Failed to send report');
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reports', projectId] }),
  });
}
