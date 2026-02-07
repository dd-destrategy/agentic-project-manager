/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCatchup } from '../use-catchup';

global.fetch = vi.fn();

describe('useCatchup', () => {
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

  it('fetches catch-up summary successfully', async () => {
    const mockCatchup = {
      events: [{ id: '1', type: 'status_change', summary: 'Sprint started' }],
      artefactChanges: [],
      escalations: [],
      lastVisit: '2026-01-01T00:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCatchup,
    });

    const { result } = renderHook(() => useCatchup(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockCatchup);
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useCatchup(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useCatchup(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useCatchup(), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/catchup');
    });
  });
});
