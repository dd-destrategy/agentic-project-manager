'use client';

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';

import { Toaster } from '@/components/toaster';
import { toast } from '@/lib/hooks/use-toast';

/**
 * Extract a human-readable message from an unknown error value.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

/**
 * Simple debounce tracker so rapid-fire query errors don't flood the screen.
 * Keeps a set of query-key strings that have fired recently.
 */
const recentQueryErrors = new Set<string>();
const QUERY_ERROR_DEBOUNCE_MS = 5_000;

function showQueryErrorToast(error: unknown, queryKey?: unknown) {
  const key = queryKey ? JSON.stringify(queryKey) : '__global__';

  if (recentQueryErrors.has(key)) return;

  recentQueryErrors.add(key);
  setTimeout(() => recentQueryErrors.delete(key), QUERY_ERROR_DEBOUNCE_MS);

  toast.error({
    title: 'Failed to load data',
    description: getErrorMessage(error),
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchInterval: 30 * 1000, // 30 seconds
          },
          mutations: {
            onError: (error) => {
              toast.error({
                title: 'Action failed',
                description: getErrorMessage(error),
              });
            },
          },
        },
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Only show toast for queries that have already loaded once
            // (i.e. background refetch failures). Initial load errors are
            // typically handled by the component's own error UI.
            if (query.state.data !== undefined) {
              showQueryErrorToast(error, query.queryKey);
            }
          },
        }),
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
