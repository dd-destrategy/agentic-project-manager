'use client';

import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Backlog Summary content structure
 */
export interface BacklogSummaryContent {
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

interface BacklogSummaryViewProps {
  content: BacklogSummaryContent;
}

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

/**
 * Backlog Summary Renderer
 *
 * Displays backlog statistics, priority distribution,
 * status breakdown, recent additions, and stale items.
 */
export function BacklogSummaryView({ content }: BacklogSummaryViewProps) {
  return (
    <div className="space-y-6">
      {/* Total Items */}
      <div className="text-center">
        <span
          className="text-4xl font-bold"
          aria-label={`${content.totalItems} total backlog items`}
        >
          {content.totalItems}
        </span>
        <p className="text-sm text-muted-foreground">Total backlog items</p>
      </div>

      {/* Priority Distribution */}
      <section aria-labelledby="priority-distribution">
        <h5 id="priority-distribution" className="text-sm font-medium">
          By Priority
        </h5>
        <div
          className="mt-3 flex h-4 overflow-hidden rounded-full"
          role="group"
          aria-label="Priority distribution"
        >
          {Object.entries(content.byPriority).map(([priority, count]) => (
            <div
              key={priority}
              className={cn(
                priorityColors[priority as keyof typeof priorityColors]
              )}
              style={{ width: `${(count / content.totalItems) * 100}%` }}
              title={`${priority}: ${count}`}
              aria-label={`${priority}: ${count} items`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {Object.entries(content.byPriority).map(([priority, count]) => (
            <div key={priority} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-3 w-3 rounded-full',
                  priorityColors[priority as keyof typeof priorityColors]
                )}
                aria-hidden="true"
              />
              <span className="capitalize">
                {priority}: {count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Status Distribution */}
      <section aria-labelledby="status-distribution">
        <h5 id="status-distribution" className="text-sm font-medium">
          By Status
        </h5>
        <div
          className="mt-3 flex h-4 overflow-hidden rounded-full"
          role="group"
          aria-label="Status distribution"
        >
          {Object.entries(content.byStatus).map(([status, count]) => (
            <div
              key={status}
              className={cn(statusColors[status as keyof typeof statusColors])}
              style={{ width: `${(count / content.totalItems) * 100}%` }}
              title={`${status}: ${count}`}
              aria-label={`${status.replace('_', ' ')}: ${count} items`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {Object.entries(content.byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-3 w-3 rounded-full',
                  statusColors[status as keyof typeof statusColors]
                )}
                aria-hidden="true"
              />
              <span className="capitalize">
                {status.replace('_', ' ')}: {count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Additions */}
      {content.recentAdditions.length > 0 && (
        <section aria-labelledby="recent-additions">
          <h5 id="recent-additions" className="text-sm font-medium">
            Recently Added
          </h5>
          <ul className="mt-2 space-y-1" role="list">
            {content.recentAdditions.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm rounded-md bg-blue-50 p-2 text-blue-800"
              >
                <span className="text-blue-400" aria-hidden="true">
                  +
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stale Items */}
      {content.staleItems.length > 0 && (
        <section aria-labelledby="stale-items">
          <h5 id="stale-items" className="text-sm font-medium text-amber-700">
            Stale Items
          </h5>
          <ul className="mt-2 space-y-1" role="list">
            {content.staleItems.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm rounded-md bg-amber-50 p-2 text-amber-800"
              >
                <Clock
                  className="h-4 w-4 text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
