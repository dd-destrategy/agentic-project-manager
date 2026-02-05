'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  ListTodo,
  Shield,
  TrendingDown,
  TrendingUp,
  Minus,
  ExternalLink,
} from 'lucide-react';
import type { ArtefactType } from '@/types';

/**
 * Artefact data structure
 */
interface Artefact {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: string;
  version: number;
  updatedAt: string;
  createdAt: string;
}

/**
 * Delivery State content structure
 */
interface DeliveryStateContent {
  sprintName: string;
  sprintGoal: string;
  velocity: {
    current: number;
    average: number;
    trend: 'up' | 'down' | 'stable';
  };
  burndown: {
    planned: number;
    actual: number;
    remaining: number;
  };
  blockers: string[];
  highlights: string[];
}

/**
 * RAID Log content structure
 */
interface RaidLogContent {
  risks: Array<{
    id: string;
    description: string;
    probability: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
    status: 'open' | 'mitigated' | 'closed';
  }>;
  assumptions: Array<{
    id: string;
    description: string;
  }>;
  issues: Array<{
    id: string;
    description: string;
    assignee: string;
    status: 'open' | 'in_progress' | 'resolved';
  }>;
  dependencies: Array<{
    id: string;
    description: string;
    status: 'pending' | 'resolved' | 'blocked';
  }>;
}

/**
 * Backlog Summary content structure
 */
interface BacklogSummaryContent {
  totalItems: number;
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byStatus: {
    todo: number;
    in_progress: number;
    done: number;
  };
  recentAdditions: string[];
  staleItems: string[];
}

/**
 * Decision Log content structure
 */
interface DecisionLogContent {
  decisions: Array<{
    id: string;
    date: string;
    title: string;
    context: string;
    decision: string;
    rationale: string;
    participants: string[];
  }>;
}

interface ArtefactViewerProps {
  artefact: Artefact | undefined;
  isLoading?: boolean;
  className?: string;
}

/**
 * Artefact Viewer Component
 *
 * Renders artefact content with appropriate formatting based on artefact type.
 * Supports delivery state, RAID log, backlog summary, and decision log.
 */
export function ArtefactViewer({ artefact, isLoading, className }: ArtefactViewerProps) {
  if (isLoading) {
    return <ArtefactViewerSkeleton />;
  }

  if (!artefact) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No artefact found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This artefact has not been created yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(artefact.content);
  } catch {
    return (
      <Card className={cn('border-red-200', className)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Invalid artefact content</p>
              <p className="text-sm text-red-700">Failed to parse artefact data.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {formatArtefactTitle(artefact.type)}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              v{artefact.version}
            </Badge>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimestamp(artefact.updatedAt)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {artefact.type === 'delivery_state' && (
          <DeliveryStateView content={parsedContent as DeliveryStateContent} />
        )}
        {artefact.type === 'raid_log' && (
          <RaidLogView content={parsedContent as RaidLogContent} />
        )}
        {artefact.type === 'backlog_summary' && (
          <BacklogSummaryView content={parsedContent as BacklogSummaryContent} />
        )}
        {artefact.type === 'decision_log' && (
          <DecisionLogView content={parsedContent as DecisionLogContent} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Delivery State View
 */
function DeliveryStateView({ content }: { content: DeliveryStateContent }) {
  const TrendIcon = content.velocity.trend === 'up'
    ? TrendingUp
    : content.velocity.trend === 'down'
    ? TrendingDown
    : Minus;

  const trendColor = content.velocity.trend === 'up'
    ? 'text-green-600'
    : content.velocity.trend === 'down'
    ? 'text-red-600'
    : 'text-muted-foreground';

  const burndownPercentage = Math.round(
    ((content.burndown.planned - content.burndown.remaining) / content.burndown.planned) * 100
  );

  return (
    <div className="space-y-6">
      {/* Sprint Info */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <h4 className="font-medium">{content.sprintName}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{content.sprintGoal}</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Velocity */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Velocity</span>
            <TrendIcon className={cn('h-4 w-4', trendColor)} />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{content.velocity.current}</span>
            <span className="ml-2 text-sm text-muted-foreground">
              / avg {content.velocity.average}
            </span>
          </div>
        </div>

        {/* Burndown */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Burndown</span>
            <span className="text-sm font-medium">{burndownPercentage}%</span>
          </div>
          <div className="mt-2">
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${burndownPercentage}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{content.burndown.actual} done</span>
              <span>{content.burndown.remaining} remaining</span>
            </div>
          </div>
        </div>
      </div>

      {/* Blockers */}
      {content.blockers.length > 0 && (
        <div className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Blockers ({content.blockers.length})
          </h5>
          <ul className="space-y-1">
            {content.blockers.map((blocker, i) => (
              <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-red-50 p-2 text-red-800">
                <span className="text-red-400">-</span>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Highlights */}
      {content.highlights.length > 0 && (
        <div className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle className="h-4 w-4" />
            Highlights ({content.highlights.length})
          </h5>
          <ul className="space-y-1">
            {content.highlights.map((highlight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-green-50 p-2 text-green-800">
                <span className="text-green-400">+</span>
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * RAID Log View
 */
function RaidLogView({ content }: { content: RaidLogContent }) {
  const priorityColors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-red-100 text-red-800',
  };

  const statusColors = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    mitigated: 'bg-green-100 text-green-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    pending: 'bg-amber-100 text-amber-800',
    blocked: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      {/* Risks */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-red-600" />
          Risks ({content.risks.length})
        </h5>
        {content.risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risks identified</p>
        ) : (
          <div className="space-y-2">
            {content.risks.map((risk) => (
              <div key={risk.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{risk.id}</span>
                      <Badge className={cn('text-xs', priorityColors[risk.probability])}>
                        P: {risk.probability}
                      </Badge>
                      <Badge className={cn('text-xs', priorityColors[risk.impact])}>
                        I: {risk.impact}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm">{risk.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mitigation: {risk.mitigation}
                    </p>
                  </div>
                  <Badge className={cn('text-xs', statusColors[risk.status])}>
                    {risk.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assumptions */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <ListTodo className="h-4 w-4 text-blue-600" />
          Assumptions ({content.assumptions.length})
        </h5>
        {content.assumptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assumptions documented</p>
        ) : (
          <ul className="space-y-1">
            {content.assumptions.map((assumption) => (
              <li key={assumption.id} className="flex items-start gap-2 text-sm rounded-md bg-blue-50 p-2">
                <span className="font-mono text-xs text-blue-600">{assumption.id}</span>
                <span className="text-blue-800">{assumption.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Issues */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Issues ({content.issues.length})
        </h5>
        {content.issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open issues</p>
        ) : (
          <div className="space-y-2">
            {content.issues.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{issue.id}</span>
                  <span className="text-sm">{issue.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{issue.assignee}</span>
                  <Badge className={cn('text-xs', statusColors[issue.status])}>
                    {issue.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dependencies */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <ExternalLink className="h-4 w-4 text-purple-600" />
          Dependencies ({content.dependencies.length})
        </h5>
        {content.dependencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dependencies tracked</p>
        ) : (
          <div className="space-y-2">
            {content.dependencies.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{dep.id}</span>
                  <span className="text-sm">{dep.description}</span>
                </div>
                <Badge className={cn('text-xs', statusColors[dep.status])}>
                  {dep.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Backlog Summary View
 */
function BacklogSummaryView({ content }: { content: BacklogSummaryContent }) {
  const priorityColors = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-gray-400',
  };

  const statusColors = {
    todo: 'bg-gray-400',
    in_progress: 'bg-blue-500',
    done: 'bg-green-500',
  };

  return (
    <div className="space-y-6">
      {/* Total Items */}
      <div className="text-center">
        <span className="text-4xl font-bold">{content.totalItems}</span>
        <p className="text-sm text-muted-foreground">Total backlog items</p>
      </div>

      {/* Priority Distribution */}
      <div className="space-y-3">
        <h5 className="text-sm font-medium">By Priority</h5>
        <div className="flex h-4 overflow-hidden rounded-full">
          {Object.entries(content.byPriority).map(([priority, count]) => (
            <div
              key={priority}
              className={cn(priorityColors[priority as keyof typeof priorityColors])}
              style={{ width: `${(count / content.totalItems) * 100}%` }}
              title={`${priority}: ${count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {Object.entries(content.byPriority).map(([priority, count]) => (
            <div key={priority} className="flex items-center gap-2">
              <div className={cn('h-3 w-3 rounded-full', priorityColors[priority as keyof typeof priorityColors])} />
              <span className="capitalize">{priority}: {count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Distribution */}
      <div className="space-y-3">
        <h5 className="text-sm font-medium">By Status</h5>
        <div className="flex h-4 overflow-hidden rounded-full">
          {Object.entries(content.byStatus).map(([status, count]) => (
            <div
              key={status}
              className={cn(statusColors[status as keyof typeof statusColors])}
              style={{ width: `${(count / content.totalItems) * 100}%` }}
              title={`${status}: ${count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {Object.entries(content.byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={cn('h-3 w-3 rounded-full', statusColors[status as keyof typeof statusColors])} />
              <span className="capitalize">{status.replace('_', ' ')}: {count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Additions */}
      {content.recentAdditions.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">Recently Added</h5>
          <ul className="space-y-1">
            {content.recentAdditions.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-blue-50 p-2 text-blue-800">
                <span className="text-blue-400">+</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stale Items */}
      {content.staleItems.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-amber-700">Stale Items</h5>
          <ul className="space-y-1">
            {content.staleItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-amber-50 p-2 text-amber-800">
                <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Decision Log View
 */
function DecisionLogView({ content }: { content: DecisionLogContent }) {
  return (
    <div className="space-y-4">
      {content.decisions.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No decisions logged yet</p>
      ) : (
        content.decisions.map((decision) => (
          <div key={decision.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{decision.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(decision.date)}
                  </span>
                </div>
                <h4 className="mt-1 font-medium">{decision.title}</h4>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Context: </span>
                <span>{decision.context}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Decision: </span>
                <span className="text-primary">{decision.decision}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Rationale: </span>
                <span>{decision.rationale}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">Participants: </span>
                <div className="flex flex-wrap gap-1">
                  {decision.participants.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Loading skeleton
 */
function ArtefactViewerSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

/**
 * Format artefact type for display
 */
function formatArtefactTitle(type: ArtefactType): string {
  const titles: Record<ArtefactType, string> = {
    delivery_state: 'Delivery State',
    raid_log: 'RAID Log',
    backlog_summary: 'Backlog Summary',
    decision_log: 'Decision Log',
  };
  return titles[type] || type;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: diffDays > 365 ? 'numeric' : undefined,
    });
  }
}

export type { Artefact, DeliveryStateContent, RaidLogContent, BacklogSummaryContent, DecisionLogContent };
