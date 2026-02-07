/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjectQuery } from '../use-query-project';

global.fetch = vi.fn();

describe('useProjectQuery', () => {
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

  it('sends query via POST', async () => {
    const mockResult = {
      question: 'What is the project status?',
      answer: 'The project is on track.',
      projectId: 'proj-1',
      contextUsed: 5,
      timestamp: '2026-01-15T09:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    const { result } = renderHook(() => useProjectQuery(), { wrapper });

    const data = await result.current.mutateAsync({
      question: 'What is the project status?',
      projectId: 'proj-1',
    });

    expect(data).toEqual(mockResult);
  });

  it('calls correct API endpoint with POST method', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useProjectQuery(), { wrapper });

    await result.current.mutateAsync({
      question: 'What are the blockers?',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/query',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('sends correct request body', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useProjectQuery(), { wrapper });

    await result.current.mutateAsync({
      question: 'What are the risks?',
      projectId: 'proj-2',
    });

    const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(callBody).toEqual({
      question: 'What are the risks?',
      projectId: 'proj-2',
    });
  });

  it('handles mutation errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useProjectQuery(), { wrapper });

    await expect(
      result.current.mutateAsync({
        question: 'Will this fail?',
      })
    ).rejects.toThrow('Failed to query');
  });

  it('handles network errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useProjectQuery(), { wrapper });

    await expect(
      result.current.mutateAsync({
        question: 'Will this fail?',
      })
    ).rejects.toThrow('Network error');
  });
});
