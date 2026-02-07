'use client';

import { useState } from 'react';
import {
  Users,
  AlertTriangle,
  ArrowUpDown,
  Clock,
  Hash,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useStakeholders,
  type Stakeholder,
} from '@/lib/hooks/use-stakeholders';

type SortMode = 'interactions' | 'lastSeen';

/**
 * Stakeholder panel component
 *
 * Shows a list of stakeholders extracted from signals,
 * sorted by interaction count or last seen. Highlights
 * engagement anomalies (people who have gone silent).
 */
export function StakeholderPanel({
  projectId,
}: {
  projectId: string | undefined;
}) {
  const { data, isLoading, isError } = useStakeholders(projectId);
  const [sortMode, setSortMode] = useState<SortMode>('interactions');

  if (isLoading) {
    return <StakeholderPanelLoading />;
  }

  if (isError || !data) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <p className="text-sm text-red-700">
            Unable to load stakeholder data
          </p>
        </CardContent>
      </Card>
    );
  }

  const anomalyNames = new Set(data.anomalies.map((a) => a.name));

  const sorted = [...data.stakeholders].sort((a, b) => {
    if (sortMode === 'interactions') {
      return b.interactionCount - a.interactionCount;
    }
    return (
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );
  });

  const toggleSort = () => {
    setSortMode((prev) =>
      prev === 'interactions' ? 'lastSeen' : 'interactions'
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Stakeholders
            {data.count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {data.count}
              </Badge>
            )}
          </CardTitle>
          <button
            onClick={toggleSort}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={`Sort by ${sortMode === 'interactions' ? 'last seen' : 'interaction count'}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortMode === 'interactions' ? 'By count' : 'By recency'}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {data.anomalies.length > 0 && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-800">
              <AlertTriangle className="h-4 w-4" />
              {data.anomalies.length} stakeholder
              {data.anomalies.length !== 1 ? 's' : ''} gone silent
            </div>
            <p className="mt-1 text-xs text-yellow-700">
              These people have been unusually quiet compared to their normal
              communication pattern.
            </p>
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stakeholders detected yet. They will appear as the agent
            processes signals from Jira and Outlook.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((stakeholder) => (
              <StakeholderRow
                key={stakeholder.id}
                stakeholder={stakeholder}
                isAnomaly={anomalyNames.has(stakeholder.name)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Individual stakeholder row
 */
function StakeholderRow({
  stakeholder,
  isAnomaly,
}: {
  stakeholder: Stakeholder;
  isAnomaly: boolean;
}) {
  const initials = stakeholder.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const lastSeenText = formatRelativeTime(stakeholder.lastSeenAt);

  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-3 ${
        isAnomaly ? 'border-yellow-300 bg-yellow-50/50' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar with initials */}
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
            isAnomaly
              ? 'bg-yellow-200 text-yellow-800'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {initials}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{stakeholder.name}</span>
            {stakeholder.role && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {stakeholder.role}
              </Badge>
            )}
            {isAnomaly && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                Silent
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {stakeholder.interactionCount} interaction
              {stakeholder.interactionCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastSeenText}
            </span>
            {stakeholder.sources.length > 0 && (
              <span>
                via {stakeholder.sources.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a timestamp as a relative time string
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Loading skeleton for stakeholder panel
 */
function StakeholderPanelLoading() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <div>
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
