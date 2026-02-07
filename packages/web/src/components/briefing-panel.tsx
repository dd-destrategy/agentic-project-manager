'use client';

import { FileText, RefreshCw, Copy, Check } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useBriefing,
  useGenerateBriefing,
  type BriefingSection,
} from '@/lib/hooks/use-briefings';

const MEETING_TYPES = [
  { value: 'standup', label: 'Standup' },
  { value: 'sprint_review', label: 'Sprint Review' },
  { value: 'retrospective', label: 'Retrospective' },
  { value: 'stakeholder_update', label: 'Stakeholder Update' },
  { value: 'planning', label: 'Planning' },
] as const;

function getPriorityVariant(
  priority: BriefingSection['priority']
): 'destructive' | 'default' | 'secondary' {
  switch (priority) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
  }
}

interface BriefingPanelProps {
  projectId: string | undefined;
}

export function BriefingPanel({ projectId }: BriefingPanelProps) {
  const [meetingType, setMeetingType] = useState('standup');
  const [copied, setCopied] = useState(false);

  const { data: briefing, isLoading } = useBriefing(projectId);
  const generateBriefing = useGenerateBriefing();

  const handleGenerate = () => {
    if (!projectId) return;
    generateBriefing.mutate({ projectId, meetingType });
  };

  const handleCopyToClipboard = async () => {
    if (!briefing) return;

    const text = [
      `# ${briefing.title}`,
      `Generated: ${new Date(briefing.generatedAt).toLocaleString()}`,
      '',
      ...briefing.sections.flatMap((section) => [
        `## ${section.heading}`,
        section.content,
        '',
      ]),
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!projectId) {
    return (
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Meeting Briefing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a project to generate a briefing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Meeting Briefing
          </CardTitle>
          {briefing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyToClipboard}
              aria-label={
                copied ? 'Copied to clipboard' : 'Copy briefing to clipboard'
              }
            >
              {copied ? (
                <Check className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Select value={meetingType} onValueChange={setMeetingType}>
            <SelectTrigger className="w-48" aria-label="Meeting type">
              <SelectValue placeholder="Select meeting type" />
            </SelectTrigger>
            <SelectContent>
              {MEETING_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleGenerate}
            disabled={generateBriefing.isPending}
            size="sm"
          >
            <RefreshCw
              className={`mr-1 h-3 w-3 ${generateBriefing.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {generateBriefing.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {generateBriefing.isError && (
          <p className="text-sm text-destructive">
            Failed to generate briefing. Please try again.
          </p>
        )}

        {/* Briefing content */}
        {briefing && !isLoading && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{briefing.title}</span>
              <span>{new Date(briefing.generatedAt).toLocaleString()}</span>
            </div>

            {/* Sections */}
            {briefing.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No data available for this project yet.
              </p>
            ) : (
              briefing.sections.map((section, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--glass-border-subtle)] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">{section.heading}</h4>
                    <Badge variant={getPriorityVariant(section.priority)}>
                      {section.priority}
                    </Badge>
                  </div>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">
                    {section.content}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
