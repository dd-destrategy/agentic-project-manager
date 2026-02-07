/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBriefing, useGenerateBriefing } from '../use-briefings';

global.fetch = vi.fn();

describe('useBriefing', () => {
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

  it('fetches briefing successfully', async () => {
    const mockBriefing = {
      id: 'brief-1',
      projectId: 'proj-1',
      meetingType: 'standup',
      title: 'Daily Standup Briefing',
      generatedAt: '2026-01-15T09:00:00Z',
      sections: [
        { heading: 'Progress', content: 'Sprint on track', priority: 'high' },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBriefing,
    });

    const { result } = renderHook(() => useBriefing('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBriefing);
  });

  it('returns null on 404 response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useBriefing('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useBriefing('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response (non-404)', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useBriefing('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(() => useBriefing(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useBriefing('proj-1'), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/briefings/proj-1');
    });
  });
});

describe('useGenerateBriefing', () => {
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

  it('generates briefing via POST', async () => {
    const mockBriefing = {
      id: 'brief-2',
      projectId: 'proj-1',
      meetingType: 'standup',
      title: 'Generated Briefing',
      generatedAt: '2026-01-15T09:00:00Z',
      sections: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBriefing,
    });

    const { result } = renderHook(() => useGenerateBriefing(), { wrapper });

    const data = await result.current.mutateAsync({
      projectId: 'proj-1',
      meetingType: 'standup',
    });

    expect(data).toEqual(mockBriefing);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/briefings/proj-1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles mutation errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useGenerateBriefing(), { wrapper });

    await expect(
      result.current.mutateAsync({
        projectId: 'proj-1',
        meetingType: 'standup',
      })
    ).rejects.toThrow('Failed to generate briefing');
  });
});
