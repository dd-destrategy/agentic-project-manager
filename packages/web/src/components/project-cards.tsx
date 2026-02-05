'use client';

import Link from 'next/link';
import { useProjects, formatLastActivity } from '@/lib/hooks/use-projects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { HealthStatus, AutonomyLevel, ProjectSummary } from '@/types';
import { AlertTriangle, CheckCircle, XCircle, Activity, Clock, Settings } from 'lucide-react';

/**
 * RAG status configuration with AA-compliant colours
 * - Green: #22c55e (default success)
 * - Amber: #d97706 (NOT #f59e0b - fails AA contrast)
 * - Red: #dc2626 (default destructive)
 */
const healthStatusConfig: Record<HealthStatus, {
  label: string;
  className: string;
  bgClassName: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  healthy: {
    label: 'Healthy',
    className: 'text-[#22c55e]',
    bgClassName: 'bg-green-50 border-green-200',
    icon: CheckCircle,
  },
  warning: {
    label: 'At Risk',
    className: 'text-[#d97706]',
    bgClassName: 'bg-amber-50 border-amber-200',
    icon: AlertTriangle,
  },
  error: {
    label: 'Critical',
    className: 'text-[#dc2626]',
    bgClassName: 'bg-red-50 border-red-200',
    icon: XCircle,
  },
};

const autonomyLevelConfig: Record<AutonomyLevel, { label: string; description: string }> = {
  monitoring: { label: 'Monitoring', description: 'Observe only' },
  artefact: { label: 'Artefact', description: 'Auto-update artefacts' },
  tactical: { label: 'Tactical', description: 'Full autonomy with hold queue' },
};

/**
 * Project cards component
 *
 * Shows summary cards for active projects with health status (RAG),
 * autonomy level, and pending escalation counts.
 * Uses TanStack Query with 30-second polling.
 */
export function ProjectCards() {
  const { data, isLoading, isError, error } = useProjects();
  const projects = data?.projects ?? [];

  if (isLoading) {
    return <ProjectCardsLoading />;
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Failed to load projects</p>
              <p className="text-sm text-red-700">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active Projects</h2>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect to Jira to start monitoring your first project
            </p>
            <Link
              href="/settings/integrations"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Settings className="h-4 w-4" />
              Configure Integrations
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual project card with RAG health indicator
 */
function ProjectCard({ project }: { project: ProjectSummary }) {
  const healthConfig = healthStatusConfig[project.healthStatus];
  const autonomyConfig = autonomyLevelConfig[project.autonomyLevel];
  const StatusIcon = healthConfig.icon;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card
        className={`transition-shadow hover:shadow-md ${healthConfig.bgClassName}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">{project.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {project.sourceProjectKey} via {project.source}
              </p>
            </div>
            <HealthBadge status={project.healthStatus} />
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Autonomy Level */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Mode</span>
            <Badge variant="secondary" className="text-xs">
              {autonomyConfig.label}
            </Badge>
          </div>

          {/* Last Activity */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last activity</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatLastActivity(project.lastActivity)}
            </span>
          </div>

          {/* Pending Escalations */}
          {project.pendingEscalations > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-100 p-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-[#d97706]" />
              <span className="text-amber-800">
                {project.pendingEscalations} pending escalation
                {project.pendingEscalations !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Health Status Indicator */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <StatusIcon className={`h-4 w-4 ${healthConfig.className}`} />
            <span className={`text-sm font-medium ${healthConfig.className}`}>
              {healthConfig.label}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * RAG status badge with accessible colours
 */
function HealthBadge({ status }: { status: HealthStatus }) {
  const config = healthStatusConfig[status];
  const Icon = config.icon;

  const badgeStyles: Record<HealthStatus, string> = {
    healthy: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20',
    warning: 'bg-[#d97706]/10 text-[#d97706] border-[#d97706]/20',
    error: 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/20',
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${badgeStyles[status]}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </div>
  );
}

/**
 * Loading skeleton for project cards
 */
function ProjectCardsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="pt-2 border-t">
                <Skeleton className="h-4 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
