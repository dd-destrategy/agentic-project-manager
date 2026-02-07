'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle,
  Clock,
  FileEdit,
  PauseCircle,
  Radio,
  Sunrise,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatchup } from '@/lib/hooks';
import type { CatchupEvent } from '@/types';

/** Map event types to icons */
const eventTypeIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  escalation_created: AlertTriangle,
  escalation_decided: CheckCircle,
  artefact_updated: FileEdit,
  action_taken: Zap,
  action_executed: Zap,
  action_approved: CheckCircle,
  action_held: PauseCircle,
  signal_detected: Radio,
};

/** Map severity to badge variant */
function getSeverityVariant(
  severity: string
): 'default' | 'secondary' | 'warning' | 'error' {
  switch (severity) {
    case 'critical':
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'secondary';
  }
}

/** Format relative time */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Group events by category for display */
function groupEventsByCategory(
  events: CatchupEvent[]
): Record<string, CatchupEvent[]> {
  const groups: Record<string, CatchupEvent[]> = {};

  for (const event of events) {
    let category: string;

    if (event.eventType.startsWith('escalation')) {
      category = 'Escalations';
    } else if (event.eventType.startsWith('action')) {
      category = 'Actions';
    } else if (event.eventType === 'artefact_updated') {
      category = 'Artefact Updates';
    } else if (event.eventType === 'signal_detected') {
      category = 'Signals';
    } else if (
      event.eventType === 'integration_error' ||
      event.eventType === 'error'
    ) {
      category = 'Errors';
    } else {
      category = 'Other';
    }

    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(event);
  }

  return groups;
}

/**
 * "Since You Left" Catch-Up Page
 *
 * Shows what happened since the user's last visit. Compiles recent
 * events, artefact changes, and escalations into a summary.
 */
export default function CatchupPage() {
  const { data: summary, isLoading, error } = useCatchup();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Catch-up</h1>
          <p className="text-sm text-muted-foreground">Loading summary...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Catch-up</h1>
          <p className="text-sm text-destructive">
            Failed to load catch-up summary. Please try again.
          </p>
        </div>
      </div>
    );
  }

  const sinceDate = new Date(summary.since);
  const groupedEvents = groupEventsByCategory(summary.recentEvents);
  const categoryOrder = [
    'Escalations',
    'Actions',
    'Artefact Updates',
    'Signals',
    'Errors',
    'Other',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <Sunrise className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Since You Left</h1>
          <p className="text-sm text-muted-foreground">
            Catch-up summary since{' '}
            {sinceDate.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {/* Highlights */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Bell className="mr-2 inline-block h-4 w-4" />
            Key Highlights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {summary.highlights.map((highlight, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Escalations Created"
          value={summary.escalationsCreated}
          icon={AlertTriangle}
          variant={summary.escalationsCreated > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Escalations Decided"
          value={summary.escalationsDecided}
          icon={CheckCircle}
          variant={summary.escalationsDecided > 0 ? 'success' : 'default'}
        />
        <StatCard
          label="Artefacts Updated"
          value={summary.artefactsUpdated}
          icon={FileEdit}
          variant={summary.artefactsUpdated > 0 ? 'default' : 'default'}
        />
        <StatCard
          label="Actions Taken"
          value={summary.actionsTaken}
          icon={Zap}
          variant={summary.actionsTaken > 0 ? 'success' : 'default'}
        />
        <StatCard
          label="Actions Held"
          value={summary.actionsHeld}
          icon={PauseCircle}
          variant={summary.actionsHeld > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Signals Detected"
          value={summary.signalsDetected}
          icon={Radio}
          variant={summary.signalsDetected > 0 ? 'default' : 'default'}
        />
      </div>

      {/* Event Groups */}
      {summary.recentEvents.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          {categoryOrder.map((category) => {
            const events = groupedEvents[category];
            if (!events || events.length === 0) return null;

            return (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {category}
                    </CardTitle>
                    <Badge variant="secondary">{events.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {events.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <CardDescription>
              No significant activity during this period
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Stat card for the summary grid */
function StatCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'success' | 'warning';
}) {
  const colourMap = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-amber-600',
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${colourMap[variant]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Single event row in the activity list */
function EventRow({ event }: { event: CatchupEvent }) {
  const Icon = eventTypeIconMap[event.eventType] ?? Bell;

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{event.summary}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge
            variant={getSeverityVariant(event.severity)}
            className="text-[10px]"
          >
            {event.severity}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
