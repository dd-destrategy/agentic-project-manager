'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ExtractedItem,
  ExtractedItemsResponse,
  ExtractedItemStatus,
} from '@/types';

// ============================================================================
// Fetch functions
// ============================================================================

async function fetchExtractedItems(
  status?: ExtractedItemStatus,
  sessionId?: string
): Promise<ExtractedItemsResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (sessionId) params.set('sessionId', sessionId);
  params.set('limit', '100');

  const response = await fetch(`/api/extracted-items?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch extracted items');
  }
  return response.json();
}

async function updateExtractedItem({
  id,
  sessionId,
  updates,
}: {
  id: string;
  sessionId: string;
  updates: Record<string, unknown>;
}): Promise<ExtractedItem> {
  const response = await fetch(
    `/api/extracted-items/${id}?sessionId=${sessionId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok) throw new Error('Failed to update extracted item');
  return response.json();
}

async function approveExtractedItem({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}): Promise<ExtractedItem> {
  const response = await fetch(
    `/api/extracted-items/${id}/approve?sessionId=${sessionId}`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error('Failed to approve extracted item');
  return response.json();
}

async function dismissExtractedItem({
  id,
  sessionId,
  reason,
}: {
  id: string;
  sessionId: string;
  reason?: string;
}): Promise<ExtractedItem> {
  const response = await fetch(
    `/api/extracted-items/${id}/dismiss?sessionId=${sessionId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }
  );
  if (!response.ok) throw new Error('Failed to dismiss extracted item');
  return response.json();
}

async function deleteExtractedItem({
  id,
  sessionId,
}: {
  id: string;
  sessionId: string;
}): Promise<void> {
  const response = await fetch(
    `/api/extracted-items/${id}?sessionId=${sessionId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error('Failed to delete extracted item');
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch extracted items with optional status and session filters
 */
export function useExtractedItems(
  status?: ExtractedItemStatus,
  sessionId?: string
) {
  return useQuery({
    queryKey: ['extracted-items', status, sessionId],
    queryFn: () => fetchExtractedItems(status, sessionId),
    staleTime: 15 * 1000,
  });
}

/**
 * Fetch pending review items (convenience)
 */
export function usePendingExtractedItems() {
  return useExtractedItems('pending_review');
}

/**
 * Fetch items for a specific ingestion session
 */
export function useSessionExtractedItems(sessionId: string | null) {
  return useQuery({
    queryKey: ['extracted-items', undefined, sessionId],
    queryFn: () => fetchExtractedItems(undefined, sessionId!),
    enabled: !!sessionId,
    staleTime: 10 * 1000,
  });
}

/**
 * Update an extracted item
 */
export function useUpdateExtractedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateExtractedItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracted-items'] });
    },
  });
}

/**
 * Approve an extracted item
 */
export function useApproveExtractedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveExtractedItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracted-items'] });
    },
  });
}

/**
 * Dismiss an extracted item
 */
export function useDismissExtractedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissExtractedItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracted-items'] });
    },
  });
}

/**
 * Delete an extracted item
 */
export function useDeleteExtractedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExtractedItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extracted-items'] });
    },
  });
}
