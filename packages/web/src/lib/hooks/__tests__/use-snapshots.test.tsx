/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useArtefactTrend } from '../use-snapshots';

global.fetch = vi.fn();

describe('useArtefactTrend', () => {
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

  it('fetches trend data successfully', async () => {
    const mockTrend = {
      projectId: 'proj-1',
      artefactType: 'raid_log',
      dataPoints: [
        {
          timestamp: '2026-01-15T09:00:00Z',
          metrics: { openRisks: 3, openIssues: 2 },
        },
      ],
      count: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTrend,
    });

    const { result } = renderHook(
      () => useArtefactTrend('proj-1', 'raid_log' as any),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTrend);
  });

  it('builds URL with query params', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(
      () =>
        useArtefactTrend('proj-1', 'delivery_state' as any, {
          limit: 10,
          since: '2026-01-01T00:00:00Z',
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/snapshots/proj-1?')
      );
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('type=delivery_state');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('since=2026-01-01T00%3A00%3A00Z');
    });
  });

  it('calls endpoint with only type param when no options', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useArtefactTrend('proj-1', 'raid_log' as any), {
      wrapper,
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/snapshots/proj-1?type=raid_log'
      );
    });
  });

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(
      () => useArtefactTrend(undefined, 'raid_log' as any),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(
      () => useArtefactTrend('proj-1', 'raid_log' as any),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(
      () => useArtefactTrend('proj-1', 'raid_log' as any),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
