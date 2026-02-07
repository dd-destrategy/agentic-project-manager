'use client';

import {
  CheckCircle2,
  XCircle,
  Loader2,
  ListChecks,
  Trash2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useSessionExtractedItems,
  useApproveExtractedItem,
  useDismissExtractedItem,
  useDeleteExtractedItem,
  useApplyExtractedItem,
  useProjects,
} from '@/lib/hooks';
import { extractedItemTypeLabels } from '@/types';

interface ExtractedItemsPanelProps {
  sessionId: string;
  /** Hides the header with "View all" link — useful in the drawer */
  hideHeader?: boolean;
}

export function ExtractedItemsPanel({
  sessionId,
  hideHeader,
}: ExtractedItemsPanelProps) {
  const { data, isLoading } = useSessionExtractedItems(sessionId);
  const { data: projectsData } = useProjects();
  const approveMutation = useApproveExtractedItem();
  const dismissMutation = useDismissExtractedItem();
  const deleteMutation = useDeleteExtractedItem();
  const applyMutation = useApplyExtractedItem();

  const items = data?.items ?? [];
  const pendingCount = items.filter(
    (i) => i.status === 'pending_review'
  ).length;

  const defaultProjectId = projectsData?.projects?.find(
    (p) => p.status === 'active'
  )?.id;

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between border-b px-3 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Extracted Items</h3>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pendingCount}
              </Badge>
            )}
          </div>
          <Link
            href="/extracted"
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <ListChecks className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Items extracted from your conversation will appear here for
              review.
            </p>
          </div>
        )}

        <div className="space-y-2 p-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-md border bg-card p-2.5 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.content}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                  {extractedItemTypeLabels[item.type]}
                </Badge>
                <Badge
                  variant={
                    item.priority === 'critical'
                      ? 'destructive'
                      : item.priority === 'high'
                        ? 'warning'
                        : 'secondary'
                  }
                  className="px-1 py-0 text-[10px]"
                >
                  {item.priority}
                </Badge>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {item.status.replace('_', ' ')}
                </span>
              </div>
              {item.status === 'pending_review' && (
                <div className="mt-1.5 flex gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 flex-1 text-[10px]"
                    onClick={() =>
                      approveMutation.mutate({
                        id: item.id,
                        sessionId: item.sessionId,
                      })
                    }
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 className="mr-0.5 h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 flex-1 text-[10px]"
                    onClick={() =>
                      dismissMutation.mutate({
                        id: item.id,
                        sessionId: item.sessionId,
                      })
                    }
                    disabled={dismissMutation.isPending}
                  >
                    <XCircle className="mr-0.5 h-3 w-3" />
                    Dismiss
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() =>
                      deleteMutation.mutate({
                        id: item.id,
                        sessionId: item.sessionId,
                      })
                    }
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {item.status === 'approved' && defaultProjectId && (
                <div className="mt-1.5 flex gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 flex-1 text-[10px]"
                    onClick={() =>
                      applyMutation.mutate({
                        id: item.id,
                        sessionId: item.sessionId,
                        projectId: item.projectId ?? defaultProjectId,
                      })
                    }
                    disabled={applyMutation.isPending}
                  >
                    <Zap className="mr-0.5 h-3 w-3" />
                    Apply to Artefact
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
