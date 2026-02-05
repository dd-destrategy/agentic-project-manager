'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Budget status data from API
 */
export interface BudgetStatusData {
  /** Daily spend in USD */
  dailySpend: number;
  /** Daily budget limit in USD */
  dailyLimit: number;
  /** Monthly spend in USD */
  monthSpend: number;
  /** Monthly budget limit in USD */
  monthLimit: number;
  /** Average daily spend for the month */
  dailyAverage: number;
  /** Current degradation tier (0-3) */
  tier: 0 | 1 | 2 | 3;
  /** Tier description */
  tierName: string;
  /** Days remaining in the month */
  daysRemaining: number;
  /** Projected monthly spend based on current rate */
  projectedMonthSpend: number;
  /** Whether budget is on track */
  onTrack: boolean;
  /** Usage history for chart */
  usageHistory: Array<{
    date: string;
    spend: number;
    tokens: number;
  }>;
}

/**
 * Props for BudgetStatus component
 */
interface BudgetStatusProps {
  budget: BudgetStatusData;
}

/**
 * Tier colour mapping
 */
const TIER_COLOURS: Record<0 | 1 | 2 | 3, string> = {
  0: 'bg-green-500',
  1: 'bg-amber-500',
  2: 'bg-orange-500',
  3: 'bg-red-500',
};

/**
 * Tier badge variants
 */
const TIER_BADGE_VARIANTS: Record<0 | 1 | 2 | 3, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  0: 'default',
  1: 'secondary',
  2: 'secondary',
  3: 'destructive',
};

/**
 * BudgetStatus component
 *
 * Displays the current LLM budget status including daily/monthly spend,
 * degradation tier, and projections.
 */
export function BudgetStatus({ budget }: BudgetStatusProps) {
  const dailyPercent = (budget.dailySpend / budget.dailyLimit) * 100;
  const monthPercent = (budget.monthSpend / budget.monthLimit) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          LLM Budget
        </CardTitle>
        <CardDescription>
          Monthly budget ceiling: ${budget.monthLimit.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Monthly Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Month to date</span>
            <span className="font-medium">
              ${budget.monthSpend.toFixed(2)} / ${budget.monthLimit.toFixed(2)}
            </span>
          </div>
          <Progress
            value={monthPercent}
            className="h-3"
            indicatorClassName={cn(
              monthPercent > 90 && 'bg-red-500',
              monthPercent > 70 && monthPercent <= 90 && 'bg-amber-500'
            )}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{monthPercent.toFixed(1)}% used</span>
            <span>{budget.daysRemaining} days remaining</span>
          </div>
        </div>

        {/* Daily Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Today</span>
            <span className="font-medium">
              ${budget.dailySpend.toFixed(2)} / ${budget.dailyLimit.toFixed(2)}
            </span>
          </div>
          <Progress
            value={dailyPercent}
            className="h-2"
            indicatorClassName={cn(TIER_COLOURS[budget.tier])}
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Daily average</p>
            <p className="text-lg font-semibold">${budget.dailyAverage.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tier</p>
            <Badge variant={TIER_BADGE_VARIANTS[budget.tier]}>
              {budget.tier === 0 ? 'Normal' : `Degradation ${budget.tier}`}
            </Badge>
          </div>
        </div>

        {/* Projection */}
        <div className="rounded-lg border p-3">
          <div className="flex items-start gap-3">
            {budget.onTrack ? (
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {budget.onTrack ? 'On Track' : 'Over Budget'}
                </span>
                {budget.projectedMonthSpend > budget.monthSpend ? (
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Projected: ${budget.projectedMonthSpend.toFixed(2)} by month end
              </p>
            </div>
          </div>
        </div>

        {/* Tier Description */}
        {budget.tier > 0 && (
          <div className={cn(
            'rounded-lg p-3 text-sm',
            budget.tier === 1 && 'bg-amber-50 text-amber-800 border border-amber-200',
            budget.tier === 2 && 'bg-orange-50 text-orange-800 border border-orange-200',
            budget.tier === 3 && 'bg-red-50 text-red-800 border border-red-200'
          )}>
            <p className="font-medium">{budget.tierName}</p>
            <p className="mt-1 text-xs opacity-80">
              {budget.tier === 1 && 'Skipping low-priority signals to conserve budget.'}
              {budget.tier === 2 && 'Batching signals, Haiku-only mode active.'}
              {budget.tier === 3 && 'Monitoring only - no LLM calls until budget resets.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact budget status for dashboard
 */
export function BudgetStatusCompact({ budget }: BudgetStatusProps) {
  const monthPercent = (budget.monthSpend / budget.monthLimit) * 100;

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Budget</span>
          <span>${budget.monthSpend.toFixed(2)} / ${budget.monthLimit.toFixed(2)}</span>
        </div>
        <Progress value={monthPercent} className="h-2" />
      </div>
      <Badge variant={TIER_BADGE_VARIANTS[budget.tier]} className="shrink-0">
        Tier {budget.tier}
      </Badge>
    </div>
  );
}
