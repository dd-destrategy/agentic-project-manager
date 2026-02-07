/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReports, useGenerateReport, useSendReport } from '../use-reports';

global.fetch = vi.fn();

describe('useReports', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches reports successfully', async () => {
    const mockReports = {
      reports: [
        {
          id: 'rpt-1',
          projectId: 'proj-1',
          template: 'weekly',
          title: 'Weekly Status Report',
          content: {
            summary: 'All on track',
            healthStatus: 'green',
            keyHighlights: ['Sprint completed'],
            risksAndBlockers: [],
            decisionsNeeded: [],
            upcomingMilestones: [],
            metricsSnapshot: {},
          },
          generatedAt: '2026-01-15T09:00:00Z',
          status: 'draft',
        },
      ],
      projectId: 'proj-1',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockReports,
    });

    const { result } = renderHook(() => useReports('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockReports);
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useReports('proj-1'), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/reports/proj-1');
    });
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useReports('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useReports('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(() => useReports(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('useGenerateReport', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('generates report via POST', async () => {
    const mockResponse = {
      report: {
        id: 'rpt-2',
        projectId: 'proj-1',
        template: 'weekly',
        title: 'Generated Report',
        content: {
          summary: 'Summary',
          healthStatus: 'green',
          keyHighlights: [],
          risksAndBlockers: [],
          decisionsNeeded: [],
          upcomingMilestones: [],
          metricsSnapshot: {},
        },
        generatedAt: '2026-01-15T10:00:00Z',
        status: 'draft',
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useGenerateReport('proj-1'), {
      wrapper,
    });

    const data = await result.current.mutateAsync('weekly');

    expect(data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/reports/proj-1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles generate report errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useGenerateReport('proj-1'), {
      wrapper,
    });

    await expect(result.current.mutateAsync('weekly')).rejects.toThrow(
      'Failed to generate report'
    );
  });
});

describe('useSendReport', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('sends report via POST with correct endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useSendReport('proj-1'), { wrapper });

    await result.current.mutateAsync({
      reportId: 'rpt-1',
      recipients: ['user@example.com'],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/reports/proj-1/rpt-1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(callBody).toEqual({
      action: 'send',
      recipients: ['user@example.com'],
    });
  });

  it('handles send report errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useSendReport('proj-1'), { wrapper });

    await expect(
      result.current.mutateAsync({
        reportId: 'rpt-1',
        recipients: ['user@example.com'],
      })
    ).rejects.toThrow('Failed to send report');
  });
});
