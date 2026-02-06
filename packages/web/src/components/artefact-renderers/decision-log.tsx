'use client';

import { Badge } from '@/components/ui/badge';

/**
 * Decision Log content structure
 */
export interface DecisionLogContent {
  decisions: Array<{
    id: string;
    date: string;
    title: string;
    context: string;
    decision: string;
    rationale: string;
    participants: string[];
  }>;
}

interface DecisionLogViewProps {
  content: DecisionLogContent;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: diffDays > 365 ? 'numeric' : undefined,
    });
  }
}

/**
 * Decision Log Renderer
 *
 * Displays project decisions with context, rationale,
 * and participants.
 */
export function DecisionLogView({ content }: DecisionLogViewProps) {
  return (
    <div className="space-y-4">
      {content.decisions.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No decisions logged yet
        </p>
      ) : (
        <div role="list" aria-label="Project decisions">
          {content.decisions.map((decision) => (
            <article
              key={decision.id}
              className="rounded-lg border p-4"
              role="listitem"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {decision.id}
                    </span>
                    <time
                      dateTime={decision.date}
                      className="text-xs text-muted-foreground"
                    >
                      {formatTimestamp(decision.date)}
                    </time>
                  </div>
                  <h4 className="mt-1 font-medium">{decision.title}</h4>
                </div>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="inline font-medium text-muted-foreground">
                    Context:{' '}
                  </dt>
                  <dd className="inline">{decision.context}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-muted-foreground">
                    Decision:{' '}
                  </dt>
                  <dd className="inline text-primary">{decision.decision}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-muted-foreground">
                    Rationale:{' '}
                  </dt>
                  <dd className="inline">{decision.rationale}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="font-medium text-muted-foreground">
                    Participants:{' '}
                  </dt>
                  <dd className="flex flex-wrap gap-1">
                    {decision.participants.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
