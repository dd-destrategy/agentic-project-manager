'use client';

import { cn } from '@/lib/utils';

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

interface TrendChartProps {
  /** Data points to display */
  data: TrendDataPoint[];
  /** Title shown above the chart */
  title: string;
  /** Colour for the bars */
  colour?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  /** Height of the chart area in pixels */
  height?: number;
  /** Whether to show the value labels above bars */
  showValues?: boolean;
  /** Optional className for the wrapper */
  className?: string;
}

const colourMap: Record<string, { bar: string; text: string }> = {
  blue: { bar: 'bg-blue-500', text: 'text-blue-600' },
  green: { bar: 'bg-green-500', text: 'text-green-600' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-600' },
  red: { bar: 'bg-red-500', text: 'text-red-600' },
  purple: { bar: 'bg-purple-500', text: 'text-purple-600' },
};

/**
 * A lightweight CSS-based trend chart component.
 *
 * Renders a sparkline-style mini bar chart using div elements.
 * No chart library required -- keeps the bundle small.
 */
export function TrendChart({
  data,
  title,
  colour = 'blue',
  height = 64,
  showValues = false,
  className,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div
          className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
          style={{ height }}
        >
          No data yet
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const colours = colourMap[colour] ?? colourMap.blue;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className={cn('text-sm font-semibold', colours.text)}>
          {data[data.length - 1]?.value ?? 0}
        </span>
      </div>

      <div
        className="flex items-end gap-px rounded-md"
        style={{ height }}
        role="img"
        aria-label={`${title} trend chart with ${data.length} data points`}
      >
        {data.map((point, index) => {
          const barHeight = Math.max((point.value / maxValue) * 100, 2);
          const dateLabel = formatTimestamp(point.timestamp);

          return (
            <div
              key={`${point.timestamp}-${index}`}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
            >
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
                {point.value} &middot; {dateLabel}
              </div>

              {/* Value label */}
              {showValues && (
                <span className="mb-0.5 text-[10px] text-muted-foreground">
                  {point.value}
                </span>
              )}

              {/* Bar */}
              <div
                className={cn(
                  'w-full min-w-[3px] rounded-t-sm transition-all duration-200',
                  colours.bar,
                  'opacity-70 hover:opacity-100'
                )}
                style={{ height: `${barHeight}%` }}
                aria-label={`${point.label ?? dateLabel}: ${point.value}`}
              />
            </div>
          );
        })}
      </div>

      {/* Time axis labels */}
      {data.length > 1 && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatTimestamp(data[0]!.timestamp)}</span>
          <span>{formatTimestamp(data[data.length - 1]!.timestamp)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Format an ISO timestamp for display in the chart axis.
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Status trend chart variant.
 *
 * Maps status strings (green/amber/red) to coloured segments
 * for a visual timeline of project health.
 */
export interface StatusDataPoint {
  timestamp: string;
  status: 'green' | 'amber' | 'red';
}

interface StatusTrendChartProps {
  data: StatusDataPoint[];
  title: string;
  height?: number;
  className?: string;
}

const statusColours: Record<string, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

export function StatusTrendChart({
  data,
  title,
  height = 24,
  className,
}: StatusTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div
          className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
          style={{ height }}
        >
          No data yet
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>

      <div
        className="flex gap-px overflow-hidden rounded-md"
        style={{ height }}
        role="img"
        aria-label={`${title} status timeline with ${data.length} data points`}
      >
        {data.map((point, index) => (
          <div
            key={`${point.timestamp}-${index}`}
            className={cn(
              'group relative flex-1 transition-opacity hover:opacity-80',
              statusColours[point.status] ?? 'bg-muted'
            )}
            title={`${formatTimestamp(point.timestamp)}: ${point.status}`}
          />
        ))}
      </div>

      {data.length > 1 && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatTimestamp(data[0]!.timestamp)}</span>
          <span>{formatTimestamp(data[data.length - 1]!.timestamp)}</span>
        </div>
      )}
    </div>
  );
}
