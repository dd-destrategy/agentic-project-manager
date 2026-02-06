'use client';

import { AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects, getTotalPendingEscalations } from '@/lib/hooks/use-projects';

/**
 * Escalation summary card
 *
 * Shows count of pending escalations requiring user attention.
 * Links to escalation queue for review.
 */
export function EscalationSummary() {
  const { data, isLoading, isError } = useProjects();
  const projects = data?.projects ?? [];
  const pendingCount = getTotalPendingEscalations(projects);

  if (isLoading) {
    return <EscalationSummaryLoading />;
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <p className="text-sm text-red-700">Unable to load escalations</p>
        </CardContent>
      </Card>
    );
  }

  const hasEscalations = pendingCount > 0;

  return (
    <Card className={hasEscalations ? 'border-amber-200 bg-amber-50' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {hasEscalations ? (
            <AlertTriangle className="h-4 w-4 text-[#d97706]" />
          ) : (
            <CheckCircle className="h-4 w-4 text-[#22c55e]" />
          )}
          Escalations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold">
              {pendingCount}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasEscalations ? 'need your attention' : 'all clear'}
            </p>
          </div>

          {hasEscalations && (
            <Link
              href="/escalations"
              className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Review
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {hasEscalations && (
          <p className="mt-3 text-xs text-amber-700">
            The agent is waiting for your input to proceed with {pendingCount} decision
            {pendingCount !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for escalation summary
 */
function EscalationSummaryLoading() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
