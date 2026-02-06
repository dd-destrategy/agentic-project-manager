'use client';

import { AlertCircle, RotateCcw, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Dashboard page error boundary.
 * Catches errors specific to the mission-control dashboard view.
 */
export default function DashboardPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardPageError]', error);
  }, [error]);

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="glass-card w-full max-w-md rounded-xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle
            className="h-6 w-6 text-destructive"
            aria-hidden="true"
          />
        </div>

        <h2 className="mb-2 text-xl font-semibold">Dashboard failed to load</h2>

        <p className="mb-6 text-sm text-muted-foreground">
          {error.message || 'Could not load the dashboard. Please try again.'}
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button
            variant="glass"
            onClick={reset}
            aria-label="Try again — reload the dashboard"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>

          <Button variant="outline" asChild>
            <Link href="/dashboard" aria-label="Go to dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
