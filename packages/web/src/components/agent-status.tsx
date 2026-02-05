'use client';

import { useAgentStatus, formatLastHeartbeat } from '@/lib/hooks/use-agent-status';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AgentStatusType, BudgetStatus as BudgetStatusType } from '@/types';
import { Activity, Pause, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Agent status configuration
 */
const statusConfig: Record<AgentStatusType, {
  label: string;
  className: string;
  dotClassName: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
    dotClassName: 'bg-green-500',
    icon: Activity,
  },
  paused: {
    label: 'Paused',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dotClassName: 'bg-yellow-500',
    icon: Pause,
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
    dotClassName: 'bg-red-500',
    icon: AlertCircle,
  },
  starting: {
    label: 'Starting',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    dotClassName: 'bg-blue-500',
    icon: Loader2,
  },
};

/**
 * Agent status indicator with real-time updates
 *
 * Shows current agent state: Active, Paused, Starting, or Error.
 * Uses TanStack Query with 30-second polling.
 */
export function AgentStatus() {
  const { data, isLoading, isError } = useAgentStatus();

  if (isLoading) {
    return <AgentStatusLoading />;
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-100 px-3 py-1 text-sm text-red-800">
        <AlertCircle className="h-4 w-4" />
        <span>Unable to connect</span>
      </div>
    );
  }

  const config = statusConfig[data.status];
  const StatusIcon = config.icon;
  const isAnimated = data.status === 'starting';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${config.className}`}
          >
            {/* Animated dot indicator */}
            <span className="relative flex h-2 w-2">
              {data.status === 'active' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dotClassName}`} />
            </span>

            {/* Status icon and label */}
            <StatusIcon className={`h-4 w-4 ${isAnimated ? 'animate-spin' : ''}`} />
            <span>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <AgentStatusTooltip
            lastHeartbeat={data.lastHeartbeat}
            nextRun={data.nextScheduledRun}
            budgetStatus={data.budgetStatus}
            error={data.error}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Detailed tooltip content for agent status
 */
function AgentStatusTooltip({
  lastHeartbeat,
  nextRun,
  budgetStatus,
  error,
}: {
  lastHeartbeat: string | null;
  nextRun: string;
  budgetStatus: BudgetStatusType;
  error?: string;
}) {
  const formatNextRun = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins <= 0) {
      return 'Running now';
    } else if (diffMins < 60) {
      return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    } else {
      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const budgetPercentage = budgetStatus.dailyLimitUsd > 0
    ? Math.round((budgetStatus.dailySpendUsd / budgetStatus.dailyLimitUsd) * 100)
    : 0;

  return (
    <div className="space-y-2 text-sm">
      {error && (
        <div className="text-red-600">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Last heartbeat:</span>
        <span>{formatLastHeartbeat(lastHeartbeat)}</span>

        <span className="text-muted-foreground">Next run:</span>
        <span>{formatNextRun(nextRun)}</span>

        <span className="text-muted-foreground">Daily budget:</span>
        <span>
          ${budgetStatus.dailySpendUsd.toFixed(2)} / ${budgetStatus.dailyLimitUsd.toFixed(2)}
          <span className="ml-1 text-muted-foreground">({budgetPercentage}%)</span>
        </span>
      </div>

      {budgetStatus.degradationTier > 0 && (
        <div className="text-amber-600 text-xs">
          Budget degradation tier {budgetStatus.degradationTier} active
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for agent status
 */
function AgentStatusLoading() {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted px-3 py-1.5">
      <Skeleton className="h-2 w-2 rounded-full" />
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-12" />
    </div>
  );
}

/**
 * Compact agent status for use in headers/sidebars
 */
export function AgentStatusCompact() {
  const { data, isLoading, isError } = useAgentStatus();

  if (isLoading) {
    return <Skeleton className="h-3 w-3 rounded-full" />;
  }

  if (isError || !data) {
    return (
      <span className="relative flex h-3 w-3">
        <span className="h-3 w-3 rounded-full bg-red-500" />
      </span>
    );
  }

  const config = statusConfig[data.status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative flex h-3 w-3">
            {data.status === 'active' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            )}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${config.dotClassName}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>Agent: {config.label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
