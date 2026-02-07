/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStakeholders } from '../use-stakeholders';

global.fetch = vi.fn();

describe('useStakeholders', () => {
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

  it('fetches stakeholders successfully', async () => {
    const mockStakeholders = {
      stakeholders: [
        {
          id: 'sh-1',
          projectId: 'proj-1',
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'Product Owner',
          interactionCount: 12,
          lastSeenAt: '2026-01-15T09:00:00Z',
          firstSeenAt: '2025-12-01T09:00:00Z',
          sources: ['jira', 'email'],
          communicationFrequency: 3.5,
          lastInteractionTypes: ['comment', 'email'],
          isActive: true,
        },
      ],
      anomalies: [],
      count: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStakeholders,
    });

    const { result } = renderHook(() => useStakeholders('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockStakeholders);
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useStakeholders('proj-1'), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/stakeholders/proj-1');
    });
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useStakeholders('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useStakeholders('proj-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(() => useStakeholders(undefined), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
