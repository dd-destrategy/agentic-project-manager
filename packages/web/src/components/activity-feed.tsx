'use client';

import {
  Heart,
  HeartPulse,
  Radio,
  CheckCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Zap,
  AlertTriangle,
  CheckSquare,
  Clock,
  FileEdit,
  Settings,
  AlertOctagon,
  DollarSign,
  AlertCircle,
  Activity,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvents, formatEventTime } from '@/lib/hooks/use-events';
import type { Event, EventType, EventSeverity } from '@/types';

/**
 * Event type icon mapping
 */
const eventTypeIcons: Record<EventType, React.ComponentType<{ className?: string }>> = {
  heartbeat: Heart,
  heartbeat_with_changes: HeartPulse,
  signal_detected: Radio,
  action_taken: CheckCircle,
  action_held: PauseCircle,
  action_approved: CheckCircle2,
  action_rejected: XCircle,
  action_executed: Zap,
  escalation_created: AlertTriangle,
  escalation_decided: CheckSquare,
  escalation_expired: Clock,
  artefact_updated: FileEdit,
  autonomy_level_changed: Settings,
  integration_error: AlertOctagon,
  budget_warning: DollarSign,
  error: AlertCircle,
};

/**
 * Severity styling configuration
 */
const severityStyles: Record<EventSeverity, string> = {
  info: 'text-blue-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
  critical: 'text-red-800',
};

/**
 * Activity feed component
 *
 * Shows scrolling feed of recent agent events.
 * Uses TanStack Query with 30-second polling.
 */
export function ActivityFeed() {
  const { data, isLoading, isError } = useEvents({ limit: 10 });
  const events = data?.events ?? [];

  if (isLoading) {
    return <ActivityFeedLoading />;
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <p className="text-sm text-red-700">Unable to load activity feed</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
          <Link
            href="/events"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="max-h-80 overflow-auto">
          {events.length === 0 ? (
            <div className="p-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No recent activity
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Events will appear here when the agent starts running
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Individual event item in the feed
 */
function EventItem({ event }: { event: Event }) {
  const Icon = eventTypeIcons[event.eventType] ?? AlertCircle;
  const severityClass = severityStyles[event.severity];

  // Format event type for display (for future use)
  const _formatEventType = (type: EventType): string => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="flex gap-3 p-3 hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <div className={`mt-0.5 ${severityClass}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{event.summary}</p>

        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatEventTime(event.createdAt)}</span>

          {event.severity !== 'info' && (
            <Badge
              variant={event.severity === 'critical' ? 'destructive' : 'secondary'}
              className="text-[10px] px-1.5 py-0"
            >
              {event.severity}
            </Badge>
          )}

          {event.detail?.metrics?.costUsd !== undefined && (
            <span className="flex items-center gap-0.5">
              <DollarSign className="h-3 w-3" />
              {event.detail.metrics.costUsd.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for activity feed
 */
function ActivityFeedLoading() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 p-3">
              <Skeleton className="h-4 w-4 mt-0.5" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
