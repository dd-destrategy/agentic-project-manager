'use client';

import dynamic from 'next/dynamic';

import { AgentStatus } from '@/components/agent-status';
import { EscalationBanner } from '@/components/escalation-banner';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic imports for heavy components to reduce initial bundle size
const ActivityFeed = dynamic(
  () => import('@/components/activity-feed').then((mod) => ({ default: mod.ActivityFeed })),
  { loading: () => <Skeleton className="h-64" /> }
);

const ProjectCards = dynamic(
  () => import('@/components/project-cards').then((mod) => ({ default: mod.ProjectCards })),
  { loading: () => <Skeleton className="h-48" /> }
);

const EscalationSummary = dynamic(
  () => import('@/components/escalation-summary').then((mod) => ({ default: mod.EscalationSummary })),
  { loading: () => <Skeleton className="h-32" /> }
);

const ActivityStats = dynamic(
  () => import('@/components/activity-stats').then((mod) => ({ default: mod.ActivityStats })),
  { loading: () => <Skeleton className="h-32" /> }
);

/**
 * Mission Control Dashboard
 *
 * Primary dashboard showing real-time agent status, project health,
 * escalations requiring attention, and 24-hour activity statistics.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-sm text-muted-foreground">
            Real-time agent monitoring and project health
          </p>
        </div>
        <AgentStatus />
      </div>

      {/* Escalation Banner - shown prominently when escalations need attention */}
      <EscalationBanner />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column - Projects (8 cols) */}
        <div className="col-span-12 lg:col-span-8">
          <ProjectCards />
        </div>

        {/* Right Column - Status & Stats (4 cols) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <EscalationSummary />
          <ActivityStats />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
