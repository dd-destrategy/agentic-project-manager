'use client';

import {
  Activity,
  Radio,
  CheckCircle,
  PauseCircle,
  FileEdit,
  AlertTriangle,
  DollarSign,
  Cpu,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useActivityStats,
  formatCompactNumber,
  formatChange,
  getChangeClassName,
} from '@/lib/hooks/use-activity-stats';


/**
 * Activity statistics component
 *
 * Shows 24-hour activity summary including cycles run,
 * signals detected, actions taken, and LLM costs.
 * Uses TanStack Query with 30-second polling.
 */
export function ActivityStats() {
  const { data, isLoading, isError } = useActivityStats();

  if (isLoading) {
    return <ActivityStatsLoading />;
  }

  if (isError || !data) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <p className="text-sm text-red-700">Unable to load activity stats</p>
        </CardContent>
      </Card>
    );
  }

  const stats = data.last24Hours;
  const comparison = data.comparison;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Last 24 Hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatItem
            icon={Cpu}
            label="Cycles"
            value={stats.cyclesRun}
            change={comparison.cyclesChange}
            tooltip="Agent monitoring cycles completed"
          />
          <StatItem
            icon={Radio}
            label="Signals"
            value={stats.signalsDetected}
            change={comparison.signalsChange}
            tooltip="Changes detected from Jira and Outlook"
          />
          <StatItem
            icon={CheckCircle}
            label="Actions"
            value={stats.actionsTaken}
            change={comparison.actionsChange}
            tooltip="Actions executed autonomously"
          />
          <StatItem
            icon={PauseCircle}
            label="Held"
            value={stats.actionsHeld}
            tooltip="Actions held for your review"
          />
        </div>

        {/* Secondary Stats */}
        <div className="border-t pt-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Artefacts:</span>
              <span className="font-medium">{stats.artefactsUpdated}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Escalations:</span>
              <span className="font-medium">{stats.escalationsCreated}</span>
            </div>
          </div>
        </div>

        {/* Cost Summary */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">LLM Cost:</span>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium">
                    ${stats.llmCostUsd.toFixed(2)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{formatCompactNumber(stats.tokensUsed)} tokens used</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Individual stat item with optional change indicator
 */
function StatItem({
  icon: Icon,
  label,
  value,
  change,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  change?: number;
  tooltip: string;
}) {
  const TrendIcon = change !== undefined && change !== 0
    ? (change > 0 ? TrendingUp : TrendingDown)
    : Minus;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-lg border bg-muted/50 p-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold">{value}</span>
              {change !== undefined && (
                <span className={`flex items-center text-xs ${getChangeClassName(change)}`}>
                  <TrendIcon className="h-3 w-3" />
                  {formatChange(change)}
                </span>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Loading skeleton for activity stats
 */
function ActivityStatsLoading() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-28" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border bg-muted/50 p-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-1 h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="border-t pt-3">
          <Skeleton className="h-4 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}
