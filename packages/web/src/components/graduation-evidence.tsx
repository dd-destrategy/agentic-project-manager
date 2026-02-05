'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Shield,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Graduation tier levels
 */
type GraduationTier = 0 | 1 | 2 | 3;

/**
 * Graduation state for a single action type
 */
interface GraduationStateItem {
  actionType: 'email_stakeholder' | 'jira_status_change';
  consecutiveApprovals: number;
  tier: GraduationTier;
  lastApprovalAt?: string;
  lastCancellationAt?: string;
}

/**
 * Graduation evidence data
 */
export interface GraduationEvidenceData {
  currentLevel: number;
  targetLevel: number;
  actionStates: GraduationStateItem[];
  spotCheckStats: {
    totalChecks: number;
    correctCount: number;
    incorrectCount: number;
    accuracyRate: number;
    daysSinceLastCheck: number | null;
  };
  blockers: string[];
  canGraduate: boolean;
  graduationRequirements: {
    minApprovals: number;
    minAccuracyRate: number;
    currentApprovals: number;
    currentAccuracyRate: number;
  };
}

/**
 * Props for the GraduationEvidence component
 */
interface GraduationEvidenceProps {
  evidence: GraduationEvidenceData;
}

/**
 * Tier descriptions and thresholds
 */
const TIER_INFO: Record<GraduationTier, { name: string; holdTime: string; threshold: number }> = {
  0: { name: 'Standard', holdTime: '30 min', threshold: 0 },
  1: { name: 'Trusted', holdTime: '15 min', threshold: 5 },
  2: { name: 'Highly Trusted', holdTime: '5 min', threshold: 10 },
  3: { name: 'Immediate', holdTime: 'None', threshold: 20 },
};

/**
 * Action type display names
 */
const ACTION_TYPE_NAMES: Record<string, string> = {
  email_stakeholder: 'Stakeholder Emails',
  jira_status_change: 'Jira Status Changes',
};

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * GraduationEvidence component
 *
 * Displays metrics and evidence for autonomy level graduation,
 * including action approval history, spot check statistics,
 * and graduation requirements.
 */
export function GraduationEvidence({ evidence }: GraduationEvidenceProps) {
  const {
    currentLevel,
    targetLevel,
    actionStates,
    spotCheckStats,
    graduationRequirements,
  } = evidence;

  const approvalProgress = Math.min(
    (graduationRequirements.currentApprovals / graduationRequirements.minApprovals) * 100,
    100
  );

  const accuracyProgress = Math.min(
    (graduationRequirements.currentAccuracyRate / graduationRequirements.minAccuracyRate) * 100,
    100
  );

  return (
    <div className="space-y-6">
      {/* Level Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Current Autonomy Level
          </CardTitle>
          <CardDescription>
            Progress towards Level {targetLevel} graduation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                {currentLevel}
              </div>
              <div>
                <p className="font-medium">Level {currentLevel}</p>
                <p className="text-sm text-muted-foreground">
                  {currentLevel === 1 && 'Observe mode'}
                  {currentLevel === 2 && 'Maintain mode'}
                  {currentLevel === 3 && 'Act mode'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={evidence.canGraduate ? 'default' : 'secondary'}>
                {evidence.canGraduate ? 'Ready to Graduate' : 'In Progress'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements Progress */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Approval Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Consecutive Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span className="font-medium">
                {graduationRequirements.currentApprovals} / {graduationRequirements.minApprovals}
              </span>
            </div>
            <Progress
              value={approvalProgress}
              className="h-2"
              indicatorClassName={approvalProgress >= 100 ? 'bg-green-500' : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {approvalProgress >= 100
                ? 'Requirement met'
                : `${graduationRequirements.minApprovals - graduationRequirements.currentApprovals} more needed`}
            </p>
          </CardContent>
        </Card>

        {/* Accuracy Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Spot Check Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Current Rate</span>
              <span className="font-medium">
                {(graduationRequirements.currentAccuracyRate * 100).toFixed(1)}%
              </span>
            </div>
            <Progress
              value={accuracyProgress}
              className="h-2"
              indicatorClassName={accuracyProgress >= 100 ? 'bg-green-500' : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {accuracyProgress >= 100
                ? 'Requirement met'
                : `Minimum ${(graduationRequirements.minAccuracyRate * 100).toFixed(0)}% required`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Type States */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action Trust Levels</CardTitle>
          <CardDescription>
            Trust tier for each action type, based on consecutive approvals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {actionStates.map((state) => (
              <ActionStateRow key={state.actionType} state={state} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Spot Check Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spot Check History</CardTitle>
          <CardDescription>
            Random action reviews to maintain trust calibration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBox
              label="Total Checks"
              value={spotCheckStats.totalChecks.toString()}
              icon={<Clock className="h-4 w-4" />}
            />
            <StatBox
              label="Correct"
              value={spotCheckStats.correctCount.toString()}
              icon={<CheckCircle className="h-4 w-4 text-green-500" />}
            />
            <StatBox
              label="Incorrect"
              value={spotCheckStats.incorrectCount.toString()}
              icon={<XCircle className="h-4 w-4 text-red-500" />}
            />
            <StatBox
              label="Last Check"
              value={
                spotCheckStats.daysSinceLastCheck !== null
                  ? `${spotCheckStats.daysSinceLastCheck}d ago`
                  : 'Never'
              }
              icon={<Clock className="h-4 w-4" />}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Action state row component
 */
function ActionStateRow({ state }: { state: GraduationStateItem }) {
  const tierInfo = TIER_INFO[state.tier];
  const nextTier = state.tier < 3 ? (state.tier + 1) as GraduationTier : null;
  const nextTierInfo = nextTier !== null ? TIER_INFO[nextTier] : null;
  const approvalsToNext = nextTierInfo
    ? Math.max(0, nextTierInfo.threshold - state.consecutiveApprovals)
    : 0;

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium">
          {ACTION_TYPE_NAMES[state.actionType] ?? state.actionType}
        </p>
        <p className="text-sm text-muted-foreground">
          {state.consecutiveApprovals} consecutive approvals
        </p>
        {state.lastApprovalAt && (
          <p className="text-xs text-muted-foreground">
            Last approved: {formatRelativeTime(state.lastApprovalAt)}
          </p>
        )}
      </div>
      <div className="text-right space-y-1">
        <Badge
          variant="outline"
          className={cn(
            state.tier >= 2 && 'border-green-500 text-green-700',
            state.tier === 1 && 'border-amber-500 text-amber-700'
          )}
        >
          Tier {state.tier}: {tierInfo.name}
        </Badge>
        <p className="text-xs text-muted-foreground">
          Hold time: {tierInfo.holdTime}
        </p>
        {nextTierInfo && (
          <p className="text-xs text-muted-foreground">
            {approvalsToNext} to Tier {nextTier}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Stat box component for spot check statistics
 */
function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
