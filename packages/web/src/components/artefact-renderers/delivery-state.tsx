'use client';

import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Delivery State content structure
 */
export interface DeliveryStateContent {
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

interface DeliveryStateViewProps {
  content: DeliveryStateContent;
}

/**
 * Delivery State Renderer
 *
 * Displays sprint information, velocity metrics, burndown progress,
 * blockers, and highlights.
 */
export function DeliveryStateView({ content }: DeliveryStateViewProps) {
  const TrendIcon =
    content.velocity.trend === 'up'
      ? TrendingUp
      : content.velocity.trend === 'down'
        ? TrendingDown
        : Minus;

  const trendColor =
    content.velocity.trend === 'up'
      ? 'text-green-600'
      : content.velocity.trend === 'down'
        ? 'text-red-600'
        : 'text-muted-foreground';

  const burndownPercentage = Math.round(
    ((content.burndown.planned - content.burndown.remaining) /
      content.burndown.planned) *
      100
  );

  return (
    <div className="space-y-6">
      {/* Sprint Info */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <h4 className="font-medium">{content.sprintName}</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {content.sprintGoal}
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Velocity */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Velocity</span>
            <TrendIcon
              className={cn('h-4 w-4', trendColor)}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">
              {content.velocity.current}
            </span>
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
            <div
              className="h-2 w-full rounded-full bg-muted"
              role="progressbar"
              aria-label="Sprint burndown progress"
              aria-valuenow={burndownPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
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
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Blockers ({content.blockers.length})
          </h5>
          <ul className="space-y-1" role="list" aria-label="Current blockers">
            {content.blockers.map((blocker, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm rounded-md bg-red-50 p-2 text-red-800"
              >
                <span className="text-red-400" aria-hidden="true">
                  -
                </span>
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
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            Highlights ({content.highlights.length})
          </h5>
          <ul className="space-y-1" role="list" aria-label="Sprint highlights">
            {content.highlights.map((highlight, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm rounded-md bg-green-50 p-2 text-green-800"
              >
                <span className="text-green-400" aria-hidden="true">
                  +
                </span>
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
