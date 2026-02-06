'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  IngestionSession,
  IngestionSessionsResponse,
  IngestionMessageResponse,
  IngestionAttachment,
} from '@/types';

// ============================================================================
// Fetch functions
// ============================================================================

async function fetchIngestionSessions(
  status: 'active' | 'archived' = 'active'
): Promise<IngestionSessionsResponse> {
  const params = new URLSearchParams({ status, limit: '50' });
  const response = await fetch(`/api/ingest?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch ingestion sessions');
  }
  return response.json();
}

async function fetchIngestionSession(id: string): Promise<IngestionSession> {
  const response = await fetch(`/api/ingest/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ingestion session not found');
    }
    throw new Error('Failed to fetch ingestion session');
  }
  return response.json();
}

async function createIngestionSession(data: {
  title: string;
  projectId?: string;
}): Promise<IngestionSession> {
  const response = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create ingestion session');
  }
  return response.json();
}

async function sendIngestionMessage(data: {
  sessionId: string;
  content: string;
  attachments?: IngestionAttachment[];
}): Promise<IngestionMessageResponse> {
  const response = await fetch(`/api/ingest/${data.sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: data.content,
      attachments: data.attachments,
    }),
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error ?? 'Failed to send message');
  }
  return response.json();
}

async function archiveIngestionSession(id: string): Promise<void> {
  const response = await fetch(`/api/ingest/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Failed to archive ingestion session');
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch list of ingestion sessions
 */
export function useIngestionSessions(status: 'active' | 'archived' = 'active') {
  return useQuery({
    queryKey: ['ingestion-sessions', status],
    queryFn: () => fetchIngestionSessions(status),
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single ingestion session with full message history
 */
export function useIngestionSession(id: string | null) {
  return useQuery({
    queryKey: ['ingestion-session', id],
    queryFn: () => fetchIngestionSession(id!),
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}

/**
 * Create a new ingestion session
 */
export function useCreateIngestionSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIngestionSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingestion-sessions'] });
    },
  });
}

/**
 * Send a message to an ingestion session and get AI response
 */
export function useSendIngestionMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendIngestionMessage,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ingestion-session', variables.sessionId],
      });
    },
  });
}

/**
 * Archive an ingestion session
 */
export function useArchiveIngestionSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveIngestionSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingestion-sessions'] });
    },
  });
}
