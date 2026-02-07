'use client';

import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Clock,
  GitCompare,
  FileText,
  TrendingUp,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, use } from 'react';

import { ArtefactExport } from '@/components/artefact-export';
import { GraduationEvidenceDashboard } from '@/components/graduation-evidence-dashboard';
import { TrendChart } from '@/components/trend-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useArtefacts,
  formatArtefactType,
  getArtefactByType,
} from '@/lib/hooks/use-artefacts';
import {
  useGraduationEvidenceDashboard,
  usePromoteAutonomyLevel,
} from '@/lib/hooks/use-graduation';
import {
  useProject,
  getHealthVariant,
  formatHealthStatus,
} from '@/lib/hooks/use-project';
import { useArtefactTrend } from '@/lib/hooks/use-snapshots';
import { useToast } from '@/lib/hooks/use-toast';
import type { ArtefactType } from '@/types';

// Dynamic imports for heavy components to reduce initial bundle size
const ArtefactViewer = dynamic(
  () =>
    import('@/components/artefact-viewer').then((mod) => ({
      default: mod.ArtefactViewer,
    })),
  { loading: () => <Skeleton className="h-64" /> }
);

const ArtefactDiff = dynamic(
  () =>
    import('@/components/artefact-diff').then((mod) => ({
      default: mod.ArtefactDiff,
    })),
  { loading: () => <Skeleton className="h-64" /> }
);

const DecisionTracker = dynamic(
  () =>
    import('@/components/decision-tracker').then((mod) => ({
      default: mod.DecisionTracker,
    })),
  { loading: () => <Skeleton className="h-64" /> }
);

const StakeholderPanel = dynamic(
  () =>
    import('@/components/stakeholder-panel').then((mod) => ({
      default: mod.StakeholderPanel,
    })),
  { loading: () => <Skeleton className="h-64" /> }
);

const BriefingPanel = dynamic(
  () =>
    import('@/components/briefing-panel').then((mod) => ({
      default: mod.BriefingPanel,
    })),
  { loading: () => <Skeleton className="h-64" /> }
);

const ARTEFACT_TYPES: ArtefactType[] = [
  'delivery_state',
  'raid_log',
  'backlog_summary',
  'decision_log',
];

type TabValue = ArtefactType | 'graduation';

/**
 * Format timestamp for display
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minutes ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: diffDays > 365 ? 'numeric' : undefined,
    });
  }
}

/**
 * Project health trends using artefact snapshots
 */
function ProjectTrends({ projectId }: { projectId: string }) {
  const { data, isLoading } = useArtefactTrend(projectId, 'delivery_state', {
    limit: 14,
  });

  const chartData = (data?.dataPoints ?? []).map((dp) => ({
    timestamp: dp.timestamp,
    value: dp.metrics.blockerCount ?? 0,
  }));

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <Card>
      <CardContent className="pt-6">
        <TrendChart
          data={chartData}
          title="Blocker Trend (14 days)"
          colour="red"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Project Detail Page
 *
 * Displays project information and artefacts with tabs for each artefact type.
 * Includes diff view functionality to compare current vs previous versions.
 */
export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { toast } = useToast();
  const {
    data: projectData,
    isLoading: projectLoading,
    error: projectError,
  } = useProject(id);
  const {
    data: artefactsData,
    isLoading: artefactsLoading,
    error: artefactsError,
  } = useArtefacts(id);
  const { evidence: graduationEvidence, isLoading: graduationLoading } =
    useGraduationEvidenceDashboard();
  const promoteMutation = usePromoteAutonomyLevel();

  const [showDiff, setShowDiff] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('delivery_state');

  // Handle autonomy level promotion
  const handlePromote = () => {
    if (!graduationEvidence?.nextLevelNum) return;

    promoteMutation.mutate(graduationEvidence.nextLevelNum, {
      onSuccess: (data) => {
        toast({
          title: 'Autonomy level promoted',
          description: `Successfully promoted to ${data.newLevel} level. Spot check statistics have been reset.`,
        });
      },
      onError: (error) => {
        toast({
          title: 'Promotion failed',
          description:
            error.message ||
            'Failed to promote autonomy level. Please try again.',
          variant: 'destructive',
        });
      },
    });
  };

  const project = projectData?.project;
  const artefacts = artefactsData?.artefacts;

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h3 className="text-lg font-medium">Project not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This project may have been deleted or you don&apos;t have access to
          it.
        </p>
        <Link href="/dashboard" className="mt-4">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const currentArtefact =
    activeTab !== 'graduation'
      ? getArtefactByType(artefacts, activeTab)
      : undefined;
  const hasPreviousVersion = currentArtefact?.previousVersion !== undefined;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      {/* Project title and health status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {project.sourceProjectKey}
          </Badge>
          <Badge variant={getHealthVariant(project.healthStatus)}>
            {formatHealthStatus(project.healthStatus)}
          </Badge>
          {project.pendingEscalations > 0 && (
            <Badge variant="warning">
              {project.pendingEscalations} Escalation
              {project.pendingEscalations > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Project meta info */}
      <Card>
        <CardContent className="py-4">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Source:</span>
              <span className="ml-2 font-medium capitalize">
                {project.source}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Autonomy Level:</span>
              <span className="ml-2 font-medium capitalize">
                {project.autonomyLevel}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Last Updated:</span>
              <span className="ml-2 font-medium">
                {formatDate(project.updatedAt)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Artefacts tabs */}
      <Tabs
        defaultValue="delivery_state"
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as TabValue);
          setShowDiff(false); // Reset diff view when changing tabs
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            {ARTEFACT_TYPES.map((type) => (
              <TabsTrigger key={type} value={type}>
                {formatArtefactType(type)}
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="graduation"
              className="flex items-center gap-1.5"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Graduation
            </TabsTrigger>
          </TabsList>

          {/* Diff toggle and export buttons - only show for artefact tabs */}
          {activeTab !== 'graduation' && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDiff(!showDiff)}
                disabled={!hasPreviousVersion}
              >
                {showDiff ? (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Show Current
                  </>
                ) : (
                  <>
                    <GitCompare className="mr-2 h-4 w-4" />
                    Show Changes
                  </>
                )}
              </Button>
              {artefacts && artefacts.length > 0 && (
                <ArtefactExport
                  artefacts={artefacts.map((a) => ({
                    type: a.type,
                    content: a.content,
                  }))}
                  projectName={project.name}
                />
              )}
            </div>
          )}
        </div>

        {ARTEFACT_TYPES.map((type) => {
          const artefact = getArtefactByType(artefacts, type);

          return (
            <TabsContent key={type} value={type} className="mt-4">
              {artefactsError ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
                    <h3 className="text-lg font-medium">
                      Failed to load artefacts
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {artefactsError.message ||
                        'Please try refreshing the page'}
                    </p>
                  </CardContent>
                </Card>
              ) : artefactsLoading ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : showDiff && artefact ? (
                <ArtefactDiff
                  current={artefact.content}
                  previous={artefact.previousVersion}
                />
              ) : (
                <ArtefactViewer
                  artefact={artefact}
                  isLoading={artefactsLoading}
                />
              )}

              {/* Last updated info */}
              {artefact && (
                <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last updated: {formatDate(artefact.updatedAt)}
                  <span className="ml-2">(v{artefact.version})</span>
                </p>
              )}
            </TabsContent>
          );
        })}

        {/* Graduation Tab */}
        <TabsContent value="graduation" className="mt-4">
          {graduationLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : graduationEvidence ? (
            <GraduationEvidenceDashboard
              evidence={graduationEvidence}
              isLoading={graduationLoading}
              onPromote={handlePromote}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">
                  Unable to load graduation evidence
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Please try refreshing the page
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Project Intelligence */}
      <div className="grid gap-6 md:grid-cols-2">
        <DecisionTracker projectId={id} />
        <StakeholderPanel projectId={id} />
        <BriefingPanel projectId={id} />
        <ProjectTrends projectId={id} />
      </div>
    </div>
  );
}
