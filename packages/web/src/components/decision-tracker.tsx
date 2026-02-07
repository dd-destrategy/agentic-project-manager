'use client';

import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  User,
  Bot,
  Calendar,
  FileText,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useDecisions,
  useUpdateDecisionOutcome,
} from '@/lib/hooks/use-decisions';
import { cn } from '@/lib/utils';
import type { DecisionWithOutcome, DecisionOutcomeStatus } from '@/types';
import { outcomeStatusConfig } from '@/types';

// ============================================================================
// Sub-components
// ============================================================================

function OutcomeStatusBadge({ status }: { status?: DecisionOutcomeStatus }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-slate-500">
        No outcome recorded
      </Badge>
    );
  }

  const config = outcomeStatusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function DecisionStatusBadge({ status }: { status: string }) {
  const statusStyles: Record<string, string> = {
    active: 'text-green-600 bg-green-50',
    superseded: 'text-amber-600 bg-amber-50',
    reversed: 'text-red-600 bg-red-50',
  };

  return (
    <Badge variant="outline" className={statusStyles[status] ?? ''}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function MadeByIcon({ madeBy }: { madeBy: 'user' | 'agent' }) {
  if (madeBy === 'user') {
    return <User className="h-3.5 w-3.5 text-blue-500" />;
  }
  return <Bot className="h-3.5 w-3.5 text-purple-500" />;
}

// ============================================================================
// Decision Card
// ============================================================================

interface DecisionCardProps {
  decision: DecisionWithOutcome;
  projectId: string;
}

function DecisionCard({ decision, projectId }: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [outcomeText, setOutcomeText] = useState(decision.outcome ?? '');
  const [lessonsText, setLessonsText] = useState(decision.lessonsLearned ?? '');
  const [selectedStatus, setSelectedStatus] = useState<DecisionOutcomeStatus>(
    decision.outcomeStatus ?? 'pending'
  );

  const updateOutcome = useUpdateDecisionOutcome();

  const handleSaveOutcome = () => {
    updateOutcome.mutate(
      {
        projectId,
        decisionId: decision.id,
        outcome: outcomeText || undefined,
        outcomeStatus: selectedStatus,
        outcomeDate: new Date().toISOString(),
        lessonsLearned: lessonsText || undefined,
      },
      {
        onSuccess: () => {
          setEditingOutcome(false);
        },
      }
    );
  };

  const formattedDate = new Date(decision.date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const reviewDateFormatted = decision.reviewDate
    ? new Date(decision.reviewDate).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <Card className="mb-3">
      <CardContent className="pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MadeByIcon madeBy={decision.madeBy} />
              <span className="text-xs text-muted-foreground">
                {formattedDate}
              </span>
              <DecisionStatusBadge status={decision.status} />
              <OutcomeStatusBadge status={decision.outcomeStatus} />
            </div>
            <h4 className="font-medium text-sm leading-tight">
              {decision.title}
            </h4>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {decision.decision}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3">
            {/* Context */}
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">
                Context
              </h5>
              <p className="text-sm">{decision.context}</p>
            </div>

            {/* Rationale */}
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">
                Rationale
              </h5>
              <p className="text-sm">{decision.rationale}</p>
            </div>

            {/* Options considered */}
            {decision.optionsConsidered &&
              decision.optionsConsidered.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-muted-foreground mb-1">
                    Options Considered
                  </h5>
                  <div className="space-y-2">
                    {decision.optionsConsidered.map((opt, i) => (
                      <div key={i} className="text-sm bg-muted/50 rounded p-2">
                        <p className="font-medium text-xs">{opt.option}</p>
                        {opt.pros.length > 0 && (
                          <p className="text-xs text-green-600 mt-0.5">
                            Pros: {opt.pros.join(', ')}
                          </p>
                        )}
                        {opt.cons.length > 0 && (
                          <p className="text-xs text-red-600 mt-0.5">
                            Cons: {opt.cons.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Review date */}
            {reviewDateFormatted && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Review scheduled: {reviewDateFormatted}</span>
              </div>
            )}

            {/* Existing outcome display */}
            {decision.outcome && !editingOutcome && (
              <div className="bg-muted/50 rounded p-3">
                <h5 className="text-xs font-medium text-muted-foreground mb-1">
                  Outcome
                </h5>
                <p className="text-sm">{decision.outcome}</p>
                {decision.lessonsLearned && (
                  <>
                    <h5 className="text-xs font-medium text-muted-foreground mt-2 mb-1">
                      Lessons Learned
                    </h5>
                    <p className="text-sm">{decision.lessonsLearned}</p>
                  </>
                )}
              </div>
            )}

            {/* Outcome editing form */}
            {editingOutcome ? (
              <div className="space-y-3 bg-muted/30 rounded p-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Outcome Status
                  </label>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {(
                      Object.keys(
                        outcomeStatusConfig
                      ) as DecisionOutcomeStatus[]
                    ).map((status) => (
                      <Button
                        key={status}
                        variant={
                          selectedStatus === status ? 'default' : 'outline'
                        }
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setSelectedStatus(status)}
                      >
                        {outcomeStatusConfig[status].label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Outcome Description
                  </label>
                  <Textarea
                    value={outcomeText}
                    onChange={(e) => setOutcomeText(e.target.value)}
                    placeholder="Describe the outcome of this decision..."
                    className="mt-1 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Lessons Learned
                  </label>
                  <Textarea
                    value={lessonsText}
                    onChange={(e) => setLessonsText(e.target.value)}
                    placeholder="What did we learn from this decision?"
                    className="mt-1 text-sm"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveOutcome}
                    disabled={updateOutcome.isPending}
                  >
                    {updateOutcome.isPending ? 'Saving...' : 'Save Outcome'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingOutcome(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => setEditingOutcome(true)}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {decision.outcome ? 'Edit Outcome' : 'Record Outcome'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function DecisionTrackerSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-3/4 mb-1" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface DecisionTrackerProps {
  projectId: string;
}

export function DecisionTracker({ projectId }: DecisionTrackerProps) {
  const { data, isLoading, error } = useDecisions(projectId);
  const [filter, setFilter] = useState<
    'all' | 'active' | 'review' | 'completed'
  >('all');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision Outcome Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <DecisionTrackerSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision Outcome Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load decisions</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const decisions = data?.decisions ?? [];

  // Group and filter decisions
  const activeDecisions = decisions.filter(
    (d) => d.status === 'active' && !d.outcomeStatus
  );
  const pendingReview = decisions.filter(
    (d) =>
      d.status === 'active' &&
      d.outcomeStatus &&
      d.outcomeStatus !== 'successful' &&
      d.outcomeStatus !== 'unsuccessful'
  );
  const completedDecisions = decisions.filter(
    (d) =>
      d.status !== 'active' ||
      d.outcomeStatus === 'successful' ||
      d.outcomeStatus === 'unsuccessful'
  );

  const filteredDecisions =
    filter === 'active'
      ? activeDecisions
      : filter === 'review'
        ? pendingReview
        : filter === 'completed'
          ? completedDecisions
          : decisions;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Decision Outcome Tracker</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>
              {decisions.length} decision{decisions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1 mt-2">
          {[
            { key: 'all' as const, label: 'All', count: decisions.length },
            {
              key: 'active' as const,
              label: 'Active',
              count: activeDecisions.length,
            },
            {
              key: 'review' as const,
              label: 'Pending Review',
              count: pendingReview.length,
            },
            {
              key: 'completed' as const,
              label: 'Completed',
              count: completedDecisions.length,
            },
          ].map((tab) => (
            <Button
              key={tab.key}
              variant={filter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={cn(
                    'ml-1 rounded-full px-1.5 text-[10px]',
                    filter === tab.key
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filteredDecisions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No decisions in this category</p>
          </div>
        ) : (
          <div>
            {filteredDecisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                projectId={projectId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
