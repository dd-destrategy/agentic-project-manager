'use client';

import Link from 'next/link';
import { AlertCircle, Clock, CheckCircle2, XCircle, ChevronRight, Loader2 } from 'lucide-react';
import { useEscalations, formatEscalationTime, getRiskLevelVariant } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Escalation, EscalationStatus } from '@/types';

/**
 * Get status icon and styling
 */
function getStatusConfig(status: EscalationStatus) {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        label: 'Pending',
        variant: 'warning' as const,
        className: 'text-amber-600',
      };
    case 'decided':
      return {
        icon: CheckCircle2,
        label: 'Decided',
        variant: 'success' as const,
        className: 'text-green-600',
      };
    case 'expired':
      return {
        icon: XCircle,
        label: 'Expired',
        variant: 'secondary' as const,
        className: 'text-gray-500',
      };
    case 'superseded':
      return {
        icon: AlertCircle,
        label: 'Superseded',
        variant: 'secondary' as const,
        className: 'text-gray-500',
      };
  }
}

/**
 * Escalation card component
 */
function EscalationCard({ escalation }: { escalation: Escalation }) {
  const statusConfig = getStatusConfig(escalation.status);
  const StatusIcon = statusConfig.icon;

  // Find the recommended option for display
  const recommendedOption = escalation.options.find(
    (opt) => opt.id === escalation.agentRecommendation
  );

  return (
    <Link href={`/escalations/${escalation.id}`}>
      <Card className="transition-all hover:border-primary hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg">{escalation.title}</CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {escalation.context.summary}
              </CardDescription>
            </div>
            <Badge variant={statusConfig.variant} className="flex-shrink-0">
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              {/* Triggering signals summary */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">
                  {escalation.context.triggeringSignals.length} triggering signal
                  {escalation.context.triggeringSignals.length !== 1 ? 's' : ''}
                </span>
                <span>-</span>
                <span>{escalation.options.length} options</span>
              </div>

              {/* Agent recommendation preview */}
              {escalation.status === 'pending' && recommendedOption && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Recommended:</span>
                  <Badge variant={getRiskLevelVariant(recommendedOption.riskLevel)}>
                    {recommendedOption.label}
                  </Badge>
                </div>
              )}

              {/* Decision info for decided escalations */}
              {escalation.status === 'decided' && escalation.userDecision && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Decision:</span>
                  <span className="font-medium text-green-700">
                    {escalation.options.find((o) => o.id === escalation.userDecision)?.label ||
                      escalation.userDecision}
                  </span>
                </div>
              )}

              {/* Timestamp */}
              <div className="text-xs text-muted-foreground">
                Created {formatEscalationTime(escalation.createdAt)}
                {escalation.decidedAt && (
                  <> - Decided {formatEscalationTime(escalation.decidedAt)}</>
                )}
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Empty state component
 */
function EmptyState({ filter }: { filter: 'all' | 'pending' | 'decided' }) {
  const messages = {
    all: {
      title: 'No escalations yet',
      description:
        'When the agent encounters situations requiring your input, they will appear here.',
    },
    pending: {
      title: 'No pending escalations',
      description: 'Great! The agent has all the guidance it needs right now.',
    },
    decided: {
      title: 'No decisions recorded',
      description: 'Your past decisions will appear here for reference.',
    },
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
      <h3 className="text-lg font-medium">{messages[filter].title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{messages[filter].description}</p>
    </div>
  );
}

/**
 * Escalations list page
 *
 * Shows all escalations with filtering by status.
 */
export default function EscalationsPage() {
  const { data, isLoading, error } = useEscalations();
  const escalations = data?.escalations ?? [];

  // Separate pending and decided escalations
  const pendingEscalations = escalations.filter((e) => e.status === 'pending');
  const decidedEscalations = escalations.filter((e) => e.status !== 'pending');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h3 className="text-lg font-medium">Failed to load escalations</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Escalations</h1>
          <p className="text-sm text-muted-foreground">
            Review and decide on situations requiring your input
          </p>
        </div>

        {pendingEscalations.length > 0 && (
          <Badge variant="warning" className="text-sm">
            {pendingEscalations.length} pending
          </Badge>
        )}
      </div>

      {/* Pending escalations section */}
      {pendingEscalations.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Clock className="h-5 w-5 text-amber-600" />
            Needs Your Decision
          </h2>
          <div className="grid gap-4">
            {pendingEscalations.map((escalation) => (
              <EscalationCard key={escalation.id} escalation={escalation} />
            ))}
          </div>
        </section>
      )}

      {/* Decided escalations section */}
      {decidedEscalations.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Past Decisions
          </h2>
          <div className="grid gap-4">
            {decidedEscalations.map((escalation) => (
              <EscalationCard key={escalation.id} escalation={escalation} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {escalations.length === 0 && <EmptyState filter="all" />}
    </div>
  );
}
