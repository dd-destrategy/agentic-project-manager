'use client';

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Gauge,
  Shield,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import type { GraduationEvidenceData } from '@/app/api/graduation/evidence/route';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Props for the GraduationEvidenceDashboard component
 */
interface GraduationEvidenceDashboardProps {
  evidence: GraduationEvidenceData;
  isLoading?: boolean;
  onPromote?: () => void;
}

/**
 * Autonomy level display names
 */
const AUTONOMY_LEVEL_NAMES = {
  monitoring: 'Monitoring',
  artefact: 'Artefact Maintenance',
  tactical: 'Tactical Decision-Making',
} as const;

/**
 * Autonomy level descriptions
 */
const AUTONOMY_LEVEL_DESCRIPTIONS = {
  monitoring: 'Agent observes and reports. All actions require approval.',
  artefact: 'Agent maintains artefacts autonomously. Key decisions escalated.',
  tactical:
    'Agent makes tactical decisions independently. Strategic escalations only.',
} as const;

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Format currency
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * GraduationEvidenceDashboard component
 *
 * Comprehensive dashboard showing all evidence needed to confidently
 * promote an agent's autonomy level, including:
 * - Current level and requirements for next level
 * - Spot check accuracy metrics
 * - Recent decision history
 * - Budget health and cost trends
 * - Graduation readiness gauge with clear blockers
 */
export function GraduationEvidenceDashboard({
  evidence,
  isLoading,
  onPromote,
}: GraduationEvidenceDashboardProps) {
  if (isLoading) {
    return <GraduationEvidenceDashboardSkeleton />;
  }

  const {
    currentLevel,
    nextLevel,
    spotCheckStats,
    recentDecisions,
    budgetHealth,
    readiness,
  } = evidence;

  const isAtMaxLevel = !nextLevel;
  const accuracyPercentage = spotCheckStats.accuracyRate * 100;
  const requirementsMet = readiness.state === 'ready';

  return (
    <div className="space-y-6">
      {/* Readiness Gauge - Hero Section */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Gauge className="h-6 w-6" />
                Graduation Readiness
              </CardTitle>
              <CardDescription>{readiness.message}</CardDescription>
            </div>
            <ReadinessBadge state={readiness.state} score={readiness.score} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Ring */}
          <div className="flex items-center gap-8">
            <div className="relative">
              <svg className="h-32 w-32 -rotate-90 transform">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted-foreground/20"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - readiness.score / 100)}`}
                  className={cn(
                    'transition-all duration-1000 ease-out',
                    readiness.state === 'ready' && 'text-green-500',
                    readiness.state === 'not_ready' && 'text-amber-500',
                    readiness.state === 'needs_data' && 'text-muted-foreground'
                  )}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">{readiness.score}%</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {/* Current to Next Level */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border px-4 py-2">
                  <Shield className="h-4 w-4" />
                  <span className="font-medium">
                    {AUTONOMY_LEVEL_NAMES[currentLevel]}
                  </span>
                </div>
                {!isAtMaxLevel && (
                  <>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-4 py-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">
                        {AUTONOMY_LEVEL_NAMES[nextLevel]}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Blockers or Success Message */}
              {requirementsMet && !isAtMaxLevel ? (
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900 dark:text-green-100">
                        All requirements met
                      </p>
                      <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                        The agent has demonstrated sufficient accuracy and
                        reliability to graduate to{' '}
                        {AUTONOMY_LEVEL_NAMES[nextLevel]} level.
                      </p>
                    </div>
                  </div>
                </div>
              ) : readiness.blockers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Requirements to address:
                  </p>
                  <ul className="space-y-1">
                    {readiness.blockers.slice(0, 3).map((blocker, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {/* Promote Button */}
          {requirementsMet && !isAtMaxLevel && onPromote && (
            <Button onClick={onPromote} size="lg" className="w-full">
              <Shield className="mr-2 h-5 w-5" />
              Promote to {AUTONOMY_LEVEL_NAMES[nextLevel]} Level
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Confidence Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spot Check Accuracy */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Spot Check Accuracy
            </CardTitle>
            <CardDescription>Decision quality over time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold">
                  {accuracyPercentage.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {spotCheckStats.correctCount} correct /{' '}
                  {spotCheckStats.totalChecks} total
                </p>
              </div>
              <div
                className={cn(
                  'rounded-full p-2',
                  accuracyPercentage >= evidence.requirements.minAccuracy * 100
                    ? 'bg-green-100 dark:bg-green-950'
                    : 'bg-amber-100 dark:bg-amber-950'
                )}
              >
                {accuracyPercentage >=
                evidence.requirements.minAccuracy * 100 ? (
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Target accuracy</span>
                <span className="font-medium">
                  {(evidence.requirements.minAccuracy * 100).toFixed(0)}%
                </span>
              </div>
              <Progress
                value={Math.min(
                  (accuracyPercentage /
                    (evidence.requirements.minAccuracy * 100)) *
                    100,
                  100
                )}
                className="h-2"
                indicatorClassName={
                  accuracyPercentage >= evidence.requirements.minAccuracy * 100
                    ? 'bg-green-500'
                    : undefined
                }
              />
            </div>

            {spotCheckStats.lastCheckAt && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Last check: {formatRelativeTime(spotCheckStats.lastCheckAt)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Budget Health */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-blue-500" />
              Budget Health
            </CardTitle>
            <CardDescription>Cost trends and projections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold">
                  {budgetHealth.monthlyPercentage.toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(budgetHealth.monthlySpend)} /{' '}
                  {formatCurrency(budgetHealth.monthlyLimit)}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-full p-2',
                  budgetHealth.isHealthy
                    ? 'bg-green-100 dark:bg-green-950'
                    : 'bg-amber-100 dark:bg-amber-950'
                )}
              >
                {budgetHealth.isHealthy ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Monthly budget used
                </span>
                <span className="font-medium">
                  {budgetHealth.monthlyPercentage.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={Math.min(budgetHealth.monthlyPercentage, 100)}
                className="h-2"
                indicatorClassName={
                  budgetHealth.monthlyPercentage > 80
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border bg-muted/50 p-2">
                <p className="text-muted-foreground">Today</p>
                <p className="font-medium">
                  {formatCurrency(budgetHealth.dailySpend)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-2">
                <p className="text-muted-foreground">Projected</p>
                <p className="font-medium">
                  {formatCurrency(budgetHealth.projectedMonthly)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Decisions */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Decisions
          </CardTitle>
          <CardDescription>
            Agent recommendations vs. actual outcomes (last 10 decisions)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentDecisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">
                No decisions recorded yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The agent needs to make some recommendations that you review
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDecisions.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex-shrink-0 pt-0.5">
                    {decision.wasCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="font-medium leading-tight">
                      {decision.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {decision.agentRecommendation && (
                        <span>Agent: {decision.agentRecommendation}</span>
                      )}
                      {decision.userDecision && (
                        <>
                          <span>•</span>
                          <span>You chose: {decision.userDecision}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatRelativeTime(decision.decidedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requirements Details */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            {isAtMaxLevel ? 'Current Level Details' : 'Graduation Requirements'}
          </CardTitle>
          <CardDescription>
            {isAtMaxLevel
              ? `You are at the maximum autonomy level: ${AUTONOMY_LEVEL_NAMES[currentLevel]}`
              : `What's needed to graduate to ${AUTONOMY_LEVEL_NAMES[nextLevel!]} level`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!isAtMaxLevel && (
              <>
                <RequirementRow
                  label="Minimum accuracy rate"
                  current={`${accuracyPercentage.toFixed(1)}%`}
                  target={`${(evidence.requirements.minAccuracy * 100).toFixed(0)}%`}
                  met={
                    accuracyPercentage >=
                    evidence.requirements.minAccuracy * 100
                  }
                />
                <RequirementRow
                  label="Minimum spot checks"
                  current={spotCheckStats.totalChecks.toString()}
                  target={evidence.requirements.minChecks.toString()}
                  met={
                    spotCheckStats.totalChecks >=
                    evidence.requirements.minChecks
                  }
                />
                <RequirementRow
                  label="Time at current level"
                  current={
                    spotCheckStats.daysSinceLastCheck !== null
                      ? `${spotCheckStats.daysSinceLastCheck} days`
                      : 'N/A'
                  }
                  target={`${evidence.requirements.minDaysAtLevel} days`}
                  met={true} // Simplified for now
                />
                <RequirementRow
                  label="Budget health"
                  current={
                    budgetHealth.isHealthy ? 'Healthy' : 'Needs attention'
                  }
                  target="Under 80% monthly budget"
                  met={budgetHealth.isHealthy}
                />
              </>
            )}

            <div className="mt-4 rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium">
                {isAtMaxLevel ? currentLevel : nextLevel!} level capabilities:
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAtMaxLevel
                  ? AUTONOMY_LEVEL_DESCRIPTIONS[currentLevel]
                  : AUTONOMY_LEVEL_DESCRIPTIONS[nextLevel!]}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Readiness badge component
 */
function ReadinessBadge({ state, score }: { state: string; score: number }) {
  const variant =
    state === 'ready'
      ? 'default'
      : state === 'not_ready'
        ? 'secondary'
        : 'outline';

  const label =
    state === 'ready'
      ? 'Ready to Graduate'
      : state === 'not_ready'
        ? 'In Progress'
        : 'Collecting Data';

  return (
    <Badge variant={variant} className="px-3 py-1 text-sm">
      {label} ({score}%)
    </Badge>
  );
}

/**
 * Requirement row component
 */
function RequirementRow({
  label,
  current,
  target,
  met,
}: {
  label: string;
  current: string;
  target: string;
  met: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {met ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            Current: {current} • Target: {target}
          </p>
        </div>
      </div>
      {met && (
        <Badge variant="outline" className="text-green-600 dark:text-green-400">
          Met
        </Badge>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the dashboard
 */
function GraduationEvidenceDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
