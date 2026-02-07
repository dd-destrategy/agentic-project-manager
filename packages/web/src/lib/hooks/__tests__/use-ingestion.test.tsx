/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useIngestionSessions,
  useIngestionSession,
  useCreateIngestionSession,
  useSendIngestionMessage,
  useArchiveIngestionSession,
} from '../use-ingestion';

global.fetch = vi.fn();

describe('useIngestionSessions', () => {
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

  it('fetches sessions successfully', async () => {
    const mockSessions = {
      sessions: [
        { id: 'sess-1', title: 'Sprint Review Notes', status: 'active' },
      ],
      count: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessions,
    });

    const { result } = renderHook(() => useIngestionSessions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSessions);
  });

  it('calls correct API endpoint with default status', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useIngestionSessions(), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ingest?')
      );
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=active');
      expect(calledUrl).toContain('limit=50');
    });
  });

  it('calls API with archived status', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useIngestionSessions('archived'), { wrapper });

    await waitFor(() => {
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=archived');
    });
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useIngestionSessions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useIngestionSessions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useIngestionSession', () => {
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

  it('fetches a single session successfully', async () => {
    const mockSession = {
      id: 'sess-1',
      title: 'Sprint Review Notes',
      status: 'active',
      messages: [{ id: 'msg-1', content: 'Hello', role: 'user' }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSession,
    });

    const { result } = renderHook(() => useIngestionSession('sess-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSession);
  });

  it('calls correct API endpoint', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() => useIngestionSession('sess-1'), { wrapper });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ingest/sess-1');
    });
  });

  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useIngestionSession(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('API error'));

    const { result } = renderHook(() => useIngestionSession('sess-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useIngestionSession('sess-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateIngestionSession', () => {
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

  it('creates session via POST', async () => {
    const mockSession = {
      id: 'sess-new',
      title: 'New Session',
      status: 'active',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSession,
    });

    const { result } = renderHook(() => useCreateIngestionSession(), {
      wrapper,
    });

    const data = await result.current.mutateAsync({
      title: 'New Session',
      projectId: 'proj-1',
    });

    expect(data).toEqual(mockSession);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles create errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useCreateIngestionSession(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ title: 'New Session' })
    ).rejects.toThrow('Failed to create ingestion session');
  });
});

describe('useSendIngestionMessage', () => {
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

  it('sends message via POST', async () => {
    const mockResponse = {
      message: { id: 'msg-1', content: 'Processed', role: 'assistant' },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useSendIngestionMessage(), { wrapper });

    const data = await result.current.mutateAsync({
      sessionId: 'sess-1',
      content: 'Here are the sprint notes',
    });

    expect(data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ingest/sess-1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles send message errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    const { result } = renderHook(() => useSendIngestionMessage(), { wrapper });

    await expect(
      result.current.mutateAsync({
        sessionId: 'sess-1',
        content: 'Test message',
      })
    ).rejects.toThrow('Server error');
  });
});

describe('useArchiveIngestionSession', () => {
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

  it('archives session via DELETE', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    const { result } = renderHook(() => useArchiveIngestionSession(), {
      wrapper,
    });

    await result.current.mutateAsync('sess-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/ingest/sess-1', {
      method: 'DELETE',
    });
  });

  it('handles archive errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useArchiveIngestionSession(), {
      wrapper,
    });

    await expect(result.current.mutateAsync('sess-1')).rejects.toThrow(
      'Failed to archive ingestion session'
    );
  });
});
