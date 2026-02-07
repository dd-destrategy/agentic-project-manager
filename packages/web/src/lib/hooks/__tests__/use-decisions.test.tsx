/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDecisions, useUpdateDecisionOutcome } from '../use-decisions';

global.fetch = vi.fn();

describe('useDecisions', () => {
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

  it('fetches decisions successfully', async () => {
    const mockDecisions = {
      decisions: [{ id: 'dec-1', title: 'Use DynamoDB', status: 'approved' }],
      projectId: 'proj-1',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDecisions,
    });

    const { result } = renderHook(() => useDecisions('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDecisions);
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useDecisions('proj-1'), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/decisions/proj-1');
    });
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useDecisions('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useDecisions('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(() => useDecisions(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('useUpdateDecisionOutcome', () => {
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

  it('calls correct API endpoint with PATCH method', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useUpdateDecisionOutcome(), {
      wrapper,
    });

    await result.current.mutateAsync({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      outcome: 'Approved by committee',
      outcomeStatus: 'successful',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/decisions/proj-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles mutation errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useUpdateDecisionOutcome(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({
        projectId: 'proj-1',
        decisionId: 'dec-1',
        outcome: 'Failed update',
      })
    ).rejects.toThrow('Failed to update decision outcome');
  });
});
