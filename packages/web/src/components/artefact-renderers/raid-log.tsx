'use client';

import { AlertTriangle, Shield, ListTodo, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * RAID Log content structure
 */
export interface RaidLogContent {
  risks: Array<{
    id: string;
    description: string;
    probability: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
    status: 'open' | 'mitigated' | 'closed';
  }>;
  assumptions: Array<{
    id: string;
    description: string;
  }>;
  issues: Array<{
    id: string;
    description: string;
    assignee: string;
    status: 'open' | 'in_progress' | 'resolved';
  }>;
  dependencies: Array<{
    id: string;
    description: string;
    status: 'pending' | 'resolved' | 'blocked';
  }>;
}

interface RaidLogViewProps {
  content: RaidLogContent;
}

const priorityColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  mitigated: 'bg-green-100 text-green-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
  pending: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-800',
};

/**
 * RAID Log Renderer
 *
 * Displays risks, assumptions, issues, and dependencies
 * with appropriate status indicators and priorities.
 */
export function RaidLogView({ content }: RaidLogViewProps) {
  return (
    <div className="space-y-6">
      {/* Risks */}
      <section aria-labelledby="raid-risks">
        <h5
          id="raid-risks"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Shield className="h-4 w-4 text-red-600" aria-hidden="true" />
          Risks ({content.risks.length})
        </h5>
        {content.risks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No risks identified
          </p>
        ) : (
          <div className="mt-3 space-y-2" role="list">
            {content.risks.map((risk) => (
              <div
                key={risk.id}
                className="rounded-lg border p-3"
                role="listitem"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {risk.id}
                      </span>
                      <Badge
                        className={cn(
                          'text-xs',
                          priorityColors[risk.probability]
                        )}
                        aria-label={`Probability: ${risk.probability}`}
                      >
                        P: {risk.probability}
                      </Badge>
                      <Badge
                        className={cn('text-xs', priorityColors[risk.impact])}
                        aria-label={`Impact: ${risk.impact}`}
                      >
                        I: {risk.impact}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm">{risk.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Mitigation:</span>{' '}
                      {risk.mitigation}
                    </p>
                  </div>
                  <Badge
                    className={cn('text-xs', statusColors[risk.status])}
                    aria-label={`Status: ${risk.status}`}
                  >
                    {risk.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assumptions */}
      <section aria-labelledby="raid-assumptions">
        <h5
          id="raid-assumptions"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <ListTodo className="h-4 w-4 text-blue-600" aria-hidden="true" />
          Assumptions ({content.assumptions.length})
        </h5>
        {content.assumptions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No assumptions documented
          </p>
        ) : (
          <ul className="mt-3 space-y-1" role="list">
            {content.assumptions.map((assumption) => (
              <li
                key={assumption.id}
                className="flex items-start gap-2 text-sm rounded-md bg-blue-50 p-2"
              >
                <span className="font-mono text-xs text-blue-600">
                  {assumption.id}
                </span>
                <span className="text-blue-800">{assumption.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Issues */}
      <section aria-labelledby="raid-issues">
        <h5
          id="raid-issues"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <AlertTriangle
            className="h-4 w-4 text-amber-600"
            aria-hidden="true"
          />
          Issues ({content.issues.length})
        </h5>
        {content.issues.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No open issues</p>
        ) : (
          <div className="mt-3 space-y-2" role="list">
            {content.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center justify-between rounded-lg border p-3"
                role="listitem"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {issue.id}
                  </span>
                  <span className="text-sm">{issue.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {issue.assignee}
                  </span>
                  <Badge
                    className={cn('text-xs', statusColors[issue.status])}
                    aria-label={`Status: ${issue.status.replace('_', ' ')}`}
                  >
                    {issue.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dependencies */}
      <section aria-labelledby="raid-dependencies">
        <h5
          id="raid-dependencies"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <ExternalLink
            className="h-4 w-4 text-purple-600"
            aria-hidden="true"
          />
          Dependencies ({content.dependencies.length})
        </h5>
        {content.dependencies.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No dependencies tracked
          </p>
        ) : (
          <div className="mt-3 space-y-2" role="list">
            {content.dependencies.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between rounded-lg border p-3"
                role="listitem"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {dep.id}
                  </span>
                  <span className="text-sm">{dep.description}</span>
                </div>
                <Badge
                  className={cn('text-xs', statusColors[dep.status])}
                  aria-label={`Status: ${dep.status}`}
                >
                  {dep.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
