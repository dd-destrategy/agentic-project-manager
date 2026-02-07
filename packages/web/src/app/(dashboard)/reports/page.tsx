'use client';

import { FileText, Loader2, Send } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useProjects } from '@/lib/hooks';
import {
  useReports,
  useGenerateReport,
  type StatusReport,
} from '@/lib/hooks/use-reports';

// ============================================================================
// Template options
// ============================================================================

const TEMPLATES = [
  { value: 'executive', label: 'Executive' },
  { value: 'team', label: 'Team' },
  { value: 'steering_committee', label: 'Steering Committee' },
] as const;

function statusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'sent':
      return 'default';
    case 'draft':
      return 'secondary';
    default:
      return 'outline';
  }
}

function healthBadgeVariant(
  health: string
): 'default' | 'destructive' | 'secondary' | 'warning' {
  switch (health) {
    case 'green':
      return 'default';
    case 'amber':
      return 'warning';
    case 'red':
      return 'destructive';
    default:
      return 'secondary';
  }
}

// ============================================================================
// Report Preview Panel
// ============================================================================

function ReportPreview({ report }: { report: StatusReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{report.title}</CardTitle>
            <CardDescription>
              Generated{' '}
              {new Date(report.generatedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant={statusBadgeVariant(report.status)}>
              {report.status}
            </Badge>
            <Badge variant={healthBadgeVariant(report.content.healthStatus)}>
              {report.content.healthStatus}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div>
          <h4 className="text-sm font-semibold mb-1">Summary</h4>
          <p className="text-sm text-muted-foreground">
            {report.content.summary}
          </p>
        </div>

        {/* Key Highlights */}
        {report.content.keyHighlights.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Key Highlights</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {report.content.keyHighlights.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks & Blockers */}
        {report.content.risksAndBlockers.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Risks & Blockers</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {report.content.risksAndBlockers.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Decisions Needed */}
        {report.content.decisionsNeeded.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Decisions</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {report.content.decisionsNeeded.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Upcoming Milestones */}
        {report.content.upcomingMilestones.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Upcoming Milestones</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {report.content.upcomingMilestones.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Metrics Snapshot */}
        {Object.keys(report.content.metricsSnapshot).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Metrics</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(report.content.metricsSnapshot).map(
                ([key, value]) => (
                  <div
                    key={key}
                    className="rounded-md bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </span>
                    <p className="font-medium">{String(value)}</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Sent info */}
        {report.sentAt && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Sent{' '}
            {new Date(report.sentAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {report.sentTo && report.sentTo.length > 0 && (
              <> to {report.sentTo.join(', ')}</>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default function ReportsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('executive');
  const [selectedReport, setSelectedReport] = useState<StatusReport | null>(
    null
  );

  const { data: projectsData } = useProjects();
  const activeProject = projectsData?.projects?.find(
    (p) => p.status === 'active'
  );
  const projectId = activeProject?.id;

  const { data, isLoading, error } = useReports(projectId);
  const generateMutation = useGenerateReport(projectId ?? '');

  const reports = data?.reports ?? [];

  const handleGenerate = () => {
    if (!projectId) return;
    generateMutation.mutate(selectedTemplate, {
      onSuccess: (data) => {
        setSelectedReport(data.report);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Status Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate and manage status reports from project artefacts
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          {/* Project display */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-1 block">Project</label>
            <p className="text-sm text-muted-foreground">
              {activeProject?.name ?? 'No active project'}
            </p>
          </div>

          {/* Template selector */}
          <div>
            <label className="text-sm font-medium mb-1 block">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Generate button */}
          <div className="pt-5">
            <Button
              onClick={handleGenerate}
              disabled={!projectId || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Report list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-lg font-semibold">Past Reports</h2>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                Failed to load reports
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && reports.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No reports generated yet
                </p>
              </CardContent>
            </Card>
          )}

          {reports.map((report) => (
            <Card
              key={report.generatedAt}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedReport?.generatedAt === report.generatedAt
                  ? 'border-primary'
                  : ''
              }`}
              onClick={() => setSelectedReport(report)}
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {report.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(report.generatedAt).toLocaleDateString(
                        'en-GB',
                        {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge
                      variant={statusBadgeVariant(report.status)}
                      className="text-xs"
                    >
                      {report.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <ReportPreview report={selectedReport} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Send className="mb-4 h-12 w-12 text-muted-foreground/20" />
                <h3 className="text-lg font-medium text-muted-foreground">
                  Select a report to preview
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate a new report or select an existing one from the list
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
