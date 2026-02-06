'use client';

import { diffJson, Change } from 'diff';
import { FileText, Plus, Minus, Equal } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';


interface ArtefactDiffProps {
  current: string;
  previous: string | undefined;
  className?: string;
}

/**
 * Artefact Diff Component
 *
 * Displays a side-by-side or inline diff view comparing the current artefact
 * content with its previous version. Uses JSON-aware diffing for structured data.
 */
export function ArtefactDiff({ current, previous, className }: ArtefactDiffProps) {
  const [diffStats, setDiffStats] = React.useState({ added: 0, removed: 0, unchanged: 0 });

  const changes = React.useMemo(() => {
    if (!previous) {
      return null;
    }

    try {
      const currentParsed = JSON.parse(current);
      const previousParsed = JSON.parse(previous);
      const diff = diffJson(previousParsed, currentParsed);

      // Calculate stats
      let added = 0;
      let removed = 0;
      let unchanged = 0;

      diff.forEach((part: Change) => {
        const lines = part.value.split('\n').filter((line) => line.trim()).length;
        if (part.added) {
          added += lines;
        } else if (part.removed) {
          removed += lines;
        } else {
          unchanged += lines;
        }
      });

      setDiffStats({ added, removed, unchanged });
      return diff;
    } catch {
      // If JSON parsing fails, do text diff
      const diff = diffJson(previous, current);
      return diff;
    }
  }, [current, previous]);

  if (!previous) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No previous version</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the first version of this artefact.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!changes) {
    return (
      <Card className={cn('border-amber-200', className)}>
        <CardContent className="p-6">
          <p className="text-sm text-amber-800">Unable to compute diff.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Changes from Previous Version</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {diffStats.added} added
            </Badge>
            <Badge variant="error" className="flex items-center gap-1">
              <Minus className="h-3 w-3" />
              {diffStats.removed} removed
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Equal className="h-3 w-3" />
              {diffStats.unchanged} unchanged
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm font-mono">
          {changes.map((part: Change, index: number) => (
            <span
              key={index}
              className={cn(
                'whitespace-pre-wrap',
                part.added && 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
                part.removed && 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 line-through'
              )}
            >
              {part.value}
            </span>
          ))}
        </pre>
      </CardContent>
    </Card>
  );
}

/**
 * Inline diff line component for rendering individual diff lines
 */
function _DiffLine({
  type,
  content,
}: {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}) {
  const prefixMap = {
    added: '+',
    removed: '-',
    unchanged: ' ',
  };

  const classMap = {
    added: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    removed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    unchanged: '',
  };

  return (
    <div className={cn('flex', classMap[type])}>
      <span className="w-6 flex-shrink-0 select-none text-center text-muted-foreground">
        {prefixMap[type]}
      </span>
      <span className="flex-1">{content}</span>
    </div>
  );
}

export type { ArtefactDiffProps };
