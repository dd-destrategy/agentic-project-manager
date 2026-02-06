'use client';

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
  Target,
  Calendar,
  Plus,
  User,
  Bot,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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
 * Core schema types (matching backend)
 * These align with packages/core/src/schemas/index.ts
 */
interface SprintProgress {
  totalPoints: number;
  completedPoints: number;
  inProgressPoints: number;
  blockedPoints: number;
}

interface SprintInfo {
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  progress: SprintProgress;
}

interface Milestone {
  name: string;
  dueDate: string;
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
  notes?: string;
}

interface Blocker {
  id: string;
  description: string;
  owner: string;
  raisedDate: string;
  severity: 'high' | 'medium' | 'low';
  sourceTicket?: string;
}

interface KeyMetrics {
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  avgCycleTimeDays: number;
  openBlockers: number;
  activeRisks: number;
}

interface DeliveryStateContent {
  overallStatus: 'green' | 'amber' | 'red';
  statusSummary: string;
  currentSprint?: SprintInfo;
  milestones: Milestone[];
  blockers: Blocker[];
  keyMetrics: KeyMetrics;
  nextActions: string[];
}

interface RaidItem {
  id: string;
  type: 'risk' | 'assumption' | 'issue' | 'dependency';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'mitigating' | 'resolved' | 'accepted' | 'closed';
  owner: string;
  raisedDate: string;
  dueDate?: string;
  mitigation?: string;
  resolution?: string;
  resolvedDate?: string;
  source: 'agent_detected' | 'user_added' | 'integration_signal';
  sourceReference?: string;
  lastReviewed: string;
}

interface RaidLogContent {
  items: RaidItem[];
}

interface BacklogStats {
  totalItems: number;
  byStatus: {
    toDo: number;
    inProgress: number;
    doneThisSprint: number;
    blocked: number;
  };
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface BacklogHighlight {
  ticketId: string;
  title: string;
  flag: 'blocked' | 'stale' | 'missing_criteria' | 'scope_creep' | 'new';
  detail: string;
  suggestedAction?: string;
}

interface RefinementCandidate {
  ticketId: string;
  title: string;
  issue: string;
}

interface BacklogSummaryContent {
  source: string;
  lastSynced: string;
  summary: BacklogStats;
  highlights: BacklogHighlight[];
  refinementCandidates: RefinementCandidate[];
  scopeNotes?: string;
}

interface DecisionOption {
  option: string;
  pros: string[];
  cons: string[];
}

interface Decision {
  id: string;
  title: string;
  context: string;
  optionsConsidered: DecisionOption[];
  decision: string;
  rationale: string;
  madeBy: 'user' | 'agent';
  date: string;
  status: 'active' | 'superseded' | 'reversed';
  relatedRaidItems?: string[];
}

interface DecisionLogContent {
  decisions: Decision[];
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
export function ArtefactViewer({
  artefact,
  isLoading,
  className,
}: ArtefactViewerProps) {
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
              <p className="font-medium text-red-800">
                Invalid artefact content
              </p>
              <p className="text-sm text-red-700">
                Failed to parse artefact data.
              </p>
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
          <BacklogSummaryView
            content={parsedContent as BacklogSummaryContent}
          />
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
  const statusColors = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
  };

  const TrendIcon =
    content.keyMetrics.velocityTrend === 'increasing'
      ? TrendingUp
      : content.keyMetrics.velocityTrend === 'decreasing'
        ? TrendingDown
        : Minus;

  const trendColor =
    content.keyMetrics.velocityTrend === 'increasing'
      ? 'text-green-600'
      : content.keyMetrics.velocityTrend === 'decreasing'
        ? 'text-red-600'
        : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div
        className={cn(
          'rounded-lg border p-4',
          statusColors[content.overallStatus]
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h4 className="font-medium">Project Status</h4>
            <p className="mt-1 text-sm">{content.statusSummary}</p>
          </div>
          <Badge variant="outline" className="capitalize">
            {content.overallStatus}
          </Badge>
        </div>
      </div>

      {/* Current Sprint Info */}
      {content.currentSprint && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="font-medium">{content.currentSprint.name}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {content.currentSprint.goal}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(content.currentSprint.startDate)} -{' '}
              {formatDate(content.currentSprint.endDate)}
            </span>
          </div>
          {/* Sprint Progress */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Sprint Progress</span>
              <span>
                {content.currentSprint.progress.completedPoints} /{' '}
                {content.currentSprint.progress.totalPoints} points
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-green-500"
                style={{
                  width: `${(content.currentSprint.progress.completedPoints / content.currentSprint.progress.totalPoints) * 100}%`,
                }}
                title={`Completed: ${content.currentSprint.progress.completedPoints}`}
              />
              <div
                className="h-full bg-blue-500"
                style={{
                  width: `${(content.currentSprint.progress.inProgressPoints / content.currentSprint.progress.totalPoints) * 100}%`,
                }}
                title={`In Progress: ${content.currentSprint.progress.inProgressPoints}`}
              />
              <div
                className="h-full bg-red-500"
                style={{
                  width: `${(content.currentSprint.progress.blockedPoints / content.currentSprint.progress.totalPoints) * 100}%`,
                }}
                title={`Blocked: ${content.currentSprint.progress.blockedPoints}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Velocity Trend
            </span>
            <TrendIcon className={cn('h-4 w-4', trendColor)} />
          </div>
          <div className="mt-2 text-lg font-medium capitalize">
            {content.keyMetrics.velocityTrend}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <span className="text-sm text-muted-foreground">Avg Cycle Time</span>
          <div className="mt-2 text-2xl font-bold">
            {content.keyMetrics.avgCycleTimeDays}
          </div>
          <span className="text-xs text-muted-foreground">days</span>
        </div>
        <div className="rounded-lg border p-4">
          <span className="text-sm text-muted-foreground">Open Blockers</span>
          <div className="mt-2 text-2xl font-bold">
            {content.keyMetrics.openBlockers}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <span className="text-sm text-muted-foreground">Active Risks</span>
          <div className="mt-2 text-2xl font-bold">
            {content.keyMetrics.activeRisks}
          </div>
        </div>
      </div>

      {/* Milestones */}
      {content.milestones.length > 0 && (
        <div className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4" />
            Milestones ({content.milestones.length})
          </h5>
          <div className="space-y-2">
            {content.milestones.map((milestone, i) => {
              const statusColors = {
                on_track: 'bg-green-50 border-green-200 text-green-800',
                at_risk: 'bg-amber-50 border-amber-200 text-amber-800',
                delayed: 'bg-red-50 border-red-200 text-red-800',
                completed: 'bg-gray-50 border-gray-200 text-gray-800',
              };
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3',
                    statusColors[milestone.status]
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h6 className="font-medium">{milestone.name}</h6>
                      {milestone.notes && (
                        <p className="mt-1 text-xs">{milestone.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className="text-xs capitalize whitespace-nowrap"
                      >
                        {milestone.status.replace('_', ' ')}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3" />
                        {formatDate(milestone.dueDate)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Blockers */}
      {content.blockers.length > 0 && (
        <div className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Blockers ({content.blockers.length})
          </h5>
          <div className="space-y-2">
            {content.blockers.map((blocker) => {
              const severityColors = {
                high: 'bg-red-50 border-red-200 text-red-800',
                medium: 'bg-amber-50 border-amber-200 text-amber-800',
                low: 'bg-blue-50 border-blue-200 text-blue-800',
              };
              return (
                <div
                  key={blocker.id}
                  className={cn(
                    'rounded-lg border p-3',
                    severityColors[blocker.severity]
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{blocker.id}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {blocker.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{blocker.description}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span>Owner: {blocker.owner}</span>
                        {blocker.sourceTicket && (
                          <span className="text-muted-foreground">
                            Ticket: {blocker.sourceTicket}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Actions */}
      {content.nextActions.length > 0 && (
        <div className="space-y-2">
          <h5 className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            Next Actions ({content.nextActions.length})
          </h5>
          <ul className="space-y-1">
            {content.nextActions.map((action, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm rounded-md bg-blue-50 border border-blue-200 p-2 text-blue-800"
              >
                <span className="text-blue-400 mt-0.5">→</span>
                {action}
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
  // Separate items by type
  const risks = content.items.filter((item) => item.type === 'risk');
  const assumptions = content.items.filter(
    (item) => item.type === 'assumption'
  );
  const issues = content.items.filter((item) => item.type === 'issue');
  const dependencies = content.items.filter(
    (item) => item.type === 'dependency'
  );

  const severityColors = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const statusColors = {
    open: 'bg-blue-100 text-blue-800',
    mitigating: 'bg-amber-100 text-amber-800',
    resolved: 'bg-green-100 text-green-800',
    accepted: 'bg-gray-100 text-gray-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-6">
      {/* Risks */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-red-600" />
          Risks ({risks.length})
        </h5>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risks identified</p>
        ) : (
          <div className="space-y-2">
            {risks.map((risk) => (
              <div
                key={risk.id}
                className={cn(
                  'rounded-lg border p-3',
                  severityColors[risk.severity]
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{risk.id}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {risk.severity}
                      </Badge>
                      <Badge
                        className={cn('text-xs', statusColors[risk.status])}
                      >
                        {risk.status}
                      </Badge>
                      {risk.sourceReference && (
                        <span className="text-xs text-muted-foreground">
                          {risk.sourceReference}
                        </span>
                      )}
                    </div>
                    <h6 className="mt-1 font-medium text-sm">{risk.title}</h6>
                    <p className="mt-1 text-xs">{risk.description}</p>
                    {risk.mitigation && (
                      <p className="mt-2 text-xs">
                        <span className="font-medium">Mitigation:</span>{' '}
                        {risk.mitigation}
                      </p>
                    )}
                    {risk.resolution && (
                      <p className="mt-1 text-xs">
                        <span className="font-medium">Resolution:</span>{' '}
                        {risk.resolution}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Owner: {risk.owner}</span>
                      <span>Raised: {formatDate(risk.raisedDate)}</span>
                      {risk.dueDate && (
                        <span>Due: {formatDate(risk.dueDate)}</span>
                      )}
                    </div>
                  </div>
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
          Assumptions ({assumptions.length})
        </h5>
        {assumptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assumptions documented
          </p>
        ) : (
          <div className="space-y-2">
            {assumptions.map((assumption) => (
              <div
                key={assumption.id}
                className="rounded-md bg-blue-50 border border-blue-200 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-blue-600">
                    {assumption.id}
                  </span>
                  <div className="flex-1">
                    <h6 className="font-medium text-sm text-blue-800">
                      {assumption.title}
                    </h6>
                    <p className="mt-1 text-xs text-blue-700">
                      {assumption.description}
                    </p>
                    <div className="mt-2 text-xs text-blue-600">
                      Owner: {assumption.owner} • Raised:{' '}
                      {formatDate(assumption.raisedDate)}
                    </div>
                  </div>
                  <Badge
                    className={cn('text-xs', statusColors[assumption.status])}
                  >
                    {assumption.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issues */}
      <div className="space-y-3">
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Issues ({issues.length})
        </h5>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open issues</p>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={cn(
                  'rounded-lg border p-3',
                  severityColors[issue.severity]
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{issue.id}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {issue.severity}
                      </Badge>
                      {issue.sourceReference && (
                        <span className="text-xs text-muted-foreground">
                          {issue.sourceReference}
                        </span>
                      )}
                    </div>
                    <h6 className="mt-1 font-medium text-sm">{issue.title}</h6>
                    <p className="mt-1 text-xs">{issue.description}</p>
                    {issue.resolution && (
                      <p className="mt-2 text-xs">
                        <span className="font-medium">Resolution:</span>{' '}
                        {issue.resolution}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Owner: {issue.owner}</span>
                      <span>Raised: {formatDate(issue.raisedDate)}</span>
                    </div>
                  </div>
                  <Badge className={cn('text-xs', statusColors[issue.status])}>
                    {issue.status}
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
          Dependencies ({dependencies.length})
        </h5>
        {dependencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dependencies tracked
          </p>
        ) : (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div
                key={dep.id}
                className={cn(
                  'rounded-lg border p-3',
                  severityColors[dep.severity]
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{dep.id}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {dep.severity}
                      </Badge>
                      {dep.sourceReference && (
                        <span className="text-xs text-muted-foreground">
                          {dep.sourceReference}
                        </span>
                      )}
                    </div>
                    <h6 className="mt-1 font-medium text-sm">{dep.title}</h6>
                    <p className="mt-1 text-xs">{dep.description}</p>
                    {dep.resolution && (
                      <p className="mt-2 text-xs">
                        <span className="font-medium">Resolution:</span>{' '}
                        {dep.resolution}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Owner: {dep.owner}</span>
                      <span>Raised: {formatDate(dep.raisedDate)}</span>
                      {dep.dueDate && (
                        <span>Due: {formatDate(dep.dueDate)}</span>
                      )}
                    </div>
                  </div>
                  <Badge className={cn('text-xs', statusColors[dep.status])}>
                    {dep.status}
                  </Badge>
                </div>
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
    toDo: 'bg-gray-400',
    inProgress: 'bg-blue-500',
    doneThisSprint: 'bg-green-500',
    blocked: 'bg-red-500',
  };

  const flagColors = {
    blocked: 'bg-red-50 border-red-200 text-red-800',
    stale: 'bg-amber-50 border-amber-200 text-amber-800',
    missing_criteria: 'bg-orange-50 border-orange-200 text-orange-800',
    scope_creep: 'bg-purple-50 border-purple-200 text-purple-800',
    new: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const flagIcons = {
    blocked: AlertTriangle,
    stale: Clock,
    missing_criteria: FileText,
    scope_creep: TrendingUp,
    new: Plus,
  };

  // Type guard to access statusColors safely
  const getStatusColor = (status: string): string => {
    return statusColors[status as keyof typeof statusColors] || 'bg-gray-400';
  };

  return (
    <div className="space-y-6">
      {/* Source and Last Synced */}
      <div className="rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Source:</span>
          <span className="font-medium capitalize">{content.source}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last Synced:</span>
          <span className="font-medium">
            {formatTimestamp(content.lastSynced)}
          </span>
        </div>
      </div>

      {/* Total Items */}
      <div className="text-center">
        <span className="text-4xl font-bold">{content.summary.totalItems}</span>
        <p className="text-sm text-muted-foreground">Total backlog items</p>
      </div>

      {/* Status Distribution */}
      <div className="space-y-3">
        <h5 className="text-sm font-medium">By Status</h5>
        <div className="flex h-4 overflow-hidden rounded-full">
          {Object.entries(content.summary.byStatus).map(([status, count]) => {
            const percentage =
              content.summary.totalItems > 0
                ? (count / content.summary.totalItems) * 100
                : 0;
            return (
              <div
                key={status}
                className={cn(getStatusColor(status))}
                style={{ width: `${percentage}%` }}
                title={`${status}: ${count}`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(content.summary.byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <div
                className={cn('h-3 w-3 rounded-full', getStatusColor(status))}
              />
              <span className="capitalize">
                {status.replace(/([A-Z])/g, ' $1').trim()}: {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Distribution */}
      <div className="space-y-3">
        <h5 className="text-sm font-medium">By Priority</h5>
        <div className="flex h-4 overflow-hidden rounded-full">
          {Object.entries(content.summary.byPriority).map(
            ([priority, count]) => {
              const percentage =
                content.summary.totalItems > 0
                  ? (count / content.summary.totalItems) * 100
                  : 0;
              return (
                <div
                  key={priority}
                  className={cn(
                    priorityColors[priority as keyof typeof priorityColors]
                  )}
                  style={{ width: `${percentage}%` }}
                  title={`${priority}: ${count}`}
                />
              );
            }
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(content.summary.byPriority).map(
            ([priority, count]) => (
              <div key={priority} className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-3 w-3 rounded-full',
                    priorityColors[priority as keyof typeof priorityColors]
                  )}
                />
                <span className="capitalize">
                  {priority}: {count}
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Highlights */}
      {content.highlights.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">
            Highlights ({content.highlights.length})
          </h5>
          <div className="space-y-2">
            {content.highlights.map((highlight, i) => {
              const FlagIcon = flagIcons[highlight.flag] || FileText;
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3',
                    flagColors[highlight.flag]
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FlagIcon className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">
                          {highlight.ticketId}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {highlight.flag.replace('_', ' ')}
                        </Badge>
                      </div>
                      <h6 className="mt-1 font-medium text-sm">
                        {highlight.title}
                      </h6>
                      <p className="mt-1 text-xs">{highlight.detail}</p>
                      {highlight.suggestedAction && (
                        <p className="mt-2 text-xs font-medium">
                          → {highlight.suggestedAction}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refinement Candidates */}
      {content.refinementCandidates.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">
            Refinement Candidates ({content.refinementCandidates.length})
          </h5>
          <div className="space-y-2">
            {content.refinementCandidates.map((candidate, i) => (
              <div
                key={i}
                className="rounded-lg border p-3 bg-purple-50 border-purple-200"
              >
                <div className="flex items-start gap-2">
                  <ListTodo className="h-4 w-4 shrink-0 mt-0.5 text-purple-600" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-purple-600">
                        {candidate.ticketId}
                      </span>
                    </div>
                    <h6 className="mt-1 font-medium text-sm text-purple-800">
                      {candidate.title}
                    </h6>
                    <p className="mt-1 text-xs text-purple-700">
                      {candidate.issue}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scope Notes */}
      {content.scopeNotes && (
        <div className="rounded-lg border p-3 bg-muted/30">
          <h5 className="text-sm font-medium mb-2">Scope Notes</h5>
          <p className="text-sm text-muted-foreground">{content.scopeNotes}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Decision Log View
 */
function DecisionLogView({ content }: { content: DecisionLogContent }) {
  const statusColors = {
    active: 'bg-green-100 text-green-800',
    superseded: 'bg-gray-100 text-gray-800',
    reversed: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-4">
      {content.decisions.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No decisions logged yet
        </p>
      ) : (
        content.decisions.map((decision) => {
          const MadeByIcon = decision.madeBy === 'agent' ? Bot : User;
          return (
            <div key={decision.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">
                      {decision.id}
                    </span>
                    <Badge
                      className={cn('text-xs', statusColors[decision.status])}
                    >
                      {decision.status}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MadeByIcon className="h-3 w-3" />
                      {decision.madeBy}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(decision.date)}
                    </span>
                  </div>
                  <h4 className="mt-2 font-medium">{decision.title}</h4>
                </div>
              </div>

              <div className="mt-3 space-y-3 text-sm">
                {/* Context */}
                <div>
                  <span className="font-medium text-muted-foreground">
                    Context:{' '}
                  </span>
                  <span>{decision.context}</span>
                </div>

                {/* Options Considered */}
                {decision.optionsConsidered.length > 0 && (
                  <div>
                    <span className="font-medium text-muted-foreground block mb-2">
                      Options Considered:
                    </span>
                    <div className="space-y-2 ml-4">
                      {decision.optionsConsidered.map((opt, i) => (
                        <div
                          key={i}
                          className="rounded-md border p-2 bg-muted/30"
                        >
                          <h6 className="font-medium text-xs">{opt.option}</h6>
                          {opt.pros.length > 0 && (
                            <div className="mt-1">
                              <span className="text-xs text-green-700 font-medium">
                                Pros:
                              </span>
                              <ul className="ml-3 text-xs text-green-600">
                                {opt.pros.map((pro, j) => (
                                  <li key={j}>+ {pro}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {opt.cons.length > 0 && (
                            <div className="mt-1">
                              <span className="text-xs text-red-700 font-medium">
                                Cons:
                              </span>
                              <ul className="ml-3 text-xs text-red-600">
                                {opt.cons.map((con, j) => (
                                  <li key={j}>- {con}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decision */}
                <div>
                  <span className="font-medium text-muted-foreground">
                    Decision:{' '}
                  </span>
                  <span className="font-medium text-primary">
                    {decision.decision}
                  </span>
                </div>

                {/* Rationale */}
                <div>
                  <span className="font-medium text-muted-foreground">
                    Rationale:{' '}
                  </span>
                  <span>{decision.rationale}</span>
                </div>

                {/* Related RAID Items */}
                {decision.relatedRaidItems &&
                  decision.relatedRaidItems.length > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Related RAID Items:{' '}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {decision.relatedRaidItems.map((itemId, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs font-mono"
                          >
                            {itemId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          );
        })
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
 * Format timestamp for display (relative time)
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

/**
 * Format ISO date string for display (absolute date)
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type {
  Artefact,
  DeliveryStateContent,
  RaidLogContent,
  BacklogSummaryContent,
  DecisionLogContent,
};
