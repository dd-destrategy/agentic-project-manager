'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Loader2,
  Save,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useExtractedItems,
  useApproveExtractedItem,
  useDismissExtractedItem,
  useUpdateExtractedItem,
  useDeleteExtractedItem,
  useApplyExtractedItem,
  useApplyAllApproved,
  useProjects,
} from '@/lib/hooks';
import type {
  ExtractedItem,
  ExtractedItemStatus,
  ExtractedItemType,
  TargetArtefact,
  ExtractedItemPriority,
} from '@/types';
import { extractedItemTypeLabels, targetArtefactLabels } from '@/types';

// ============================================================================
// Constants
// ============================================================================

const STATUS_TABS: { value: ExtractedItemStatus | 'all'; label: string }[] = [
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'applied', label: 'Applied' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

function priorityBadgeVariant(
  priority: ExtractedItemPriority
): 'destructive' | 'warning' | 'default' | 'secondary' {
  switch (priority) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'warning';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
  }
}

function statusIcon(status: ExtractedItemStatus) {
  switch (status) {
    case 'pending_review':
      return Clock;
    case 'approved':
      return CheckCircle2;
    case 'applied':
      return Zap;
    case 'dismissed':
      return XCircle;
  }
}

function typeIcon(_type: ExtractedItemType) {
  return AlertTriangle;
}

// ============================================================================
// Inline Edit Card
// ============================================================================

function ExtractedItemCard({
  item,
  onApprove,
  onDismiss,
  onApply,
  isApplying,
}: {
  item: ExtractedItem;
  onApprove: (item: ExtractedItem) => void;
  onDismiss: (item: ExtractedItem) => void;
  onApply?: (item: ExtractedItem) => void;
  isApplying?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editContent, setEditContent] = useState(item.content);
  const [editType, setEditType] = useState(item.type);
  const [editTarget, setEditTarget] = useState(item.targetArtefact);
  const [editPriority, setEditPriority] = useState(item.priority);
  const updateMutation = useUpdateExtractedItem();
  const deleteMutation = useDeleteExtractedItem();

  const StatusIcon = statusIcon(item.status);
  const TypeIcon = typeIcon(item.type);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      {
        id: item.id,
        sessionId: item.sessionId,
        updates: {
          title: editTitle,
          content: editContent,
          type: editType,
          targetArtefact: editTarget,
          priority: editPriority,
        },
      },
      {
        onSuccess: () => setIsEditing(false),
      }
    );
  }, [
    item.id,
    item.sessionId,
    editTitle,
    editContent,
    editType,
    editTarget,
    editPriority,
    updateMutation,
  ]);

  const handleDelete = useCallback(() => {
    deleteMutation.mutate({ id: item.id, sessionId: item.sessionId });
  }, [item.id, item.sessionId, deleteMutation]);

  if (isEditing) {
    return (
      <Card className="border-primary">
        <CardContent className="space-y-3 pt-4">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="font-medium"
          />
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            className="resize-none text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as ExtractedItemType)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {Object.entries(extractedItemTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={editTarget}
              onChange={(e) => setEditTarget(e.target.value as TargetArtefact)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {Object.entries(targetArtefactLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={editPriority}
              onChange={(e) =>
                setEditPriority(e.target.value as ExtractedItemPriority)
              }
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <h3 className="font-medium text-sm truncate">{item.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {item.content}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={priorityBadgeVariant(item.priority)}>
                {item.priority}
              </Badge>
              <Badge variant="outline">
                {extractedItemTypeLabels[item.type]}
              </Badge>
              <Badge variant="secondary">
                {targetArtefactLabels[item.targetArtefact]}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <StatusIcon className="h-3 w-3" />
                {item.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {item.status === 'pending_review' && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onApprove(item)}
                  className="h-7 text-xs"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDismiss(item)}
                  className="h-7 text-xs"
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  Dismiss
                </Button>
              </>
            )}
            {item.status === 'approved' && onApply && (
              <Button
                variant="default"
                size="sm"
                onClick={() => onApply(item)}
                disabled={isApplying}
                className="h-7 text-xs"
              >
                <Zap className="mr-1 h-3 w-3" />
                Apply
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 text-xs"
            >
              <Edit3 className="mr-1 h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="h-7 text-xs text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>

        {/* Provenance */}
        <div className="mt-2 text-xs text-muted-foreground">
          Extracted{' '}
          {new Date(item.createdAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {item.appliedAt && (
            <>
              {' '}
              — Applied{' '}
              {new Date(item.appliedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </>
          )}
          {item.dismissedAt && (
            <>
              {' '}
              — Dismissed
              {item.dismissReason && `: ${item.dismissReason}`}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default function ExtractedItemsPage() {
  const [activeTab, setActiveTab] = useState<ExtractedItemStatus | 'all'>(
    'pending_review'
  );
  const [typeFilter, setTypeFilter] = useState<ExtractedItemType | 'all'>(
    'all'
  );

  const statusParam = activeTab === 'all' ? undefined : activeTab;
  const { data, isLoading, error } = useExtractedItems(statusParam);
  const { data: projectsData } = useProjects();
  const approveMutation = useApproveExtractedItem();
  const dismissMutation = useDismissExtractedItem();
  const applyMutation = useApplyExtractedItem();
  const applyAllMutation = useApplyAllApproved();

  const items = data?.items ?? [];
  const filteredItems =
    typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter);

  // Use the first active project as the default projectId
  const defaultProjectId = projectsData?.projects?.find(
    (p) => p.status === 'active'
  )?.id;

  const approvedItems = filteredItems.filter((i) => i.status === 'approved');

  const handleApprove = useCallback(
    (item: ExtractedItem) => {
      approveMutation.mutate({ id: item.id, sessionId: item.sessionId });
    },
    [approveMutation]
  );

  const handleDismiss = useCallback(
    (item: ExtractedItem) => {
      dismissMutation.mutate({ id: item.id, sessionId: item.sessionId });
    },
    [dismissMutation]
  );

  const handleApply = useCallback(
    (item: ExtractedItem) => {
      const projectId = item.projectId ?? defaultProjectId;
      if (!projectId) return;
      applyMutation.mutate({
        id: item.id,
        sessionId: item.sessionId,
        projectId,
      });
    },
    [applyMutation, defaultProjectId]
  );

  const handleApplyAll = useCallback(() => {
    if (!defaultProjectId || approvedItems.length === 0) return;
    applyAllMutation.mutate({
      itemIds: approvedItems.map((i) => ({
        id: i.id,
        sessionId: i.sessionId,
      })),
      projectId: defaultProjectId,
    });
  }, [applyAllMutation, approvedItems, defaultProjectId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Extracted Items</h1>
          <p className="text-sm text-muted-foreground">
            Review items extracted from ingestion sessions before applying to
            artefacts
          </p>
        </div>
        {activeTab === 'approved' &&
          approvedItems.length > 0 &&
          defaultProjectId && (
            <Button
              onClick={handleApplyAll}
              disabled={applyAllMutation.isPending}
            >
              {applyAllMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Apply All Approved ({approvedItems.length})
            </Button>
          )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={activeTab === tab.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
            {tab.value === 'pending_review' &&
              items.length > 0 &&
              activeTab === 'pending_review' && (
                <Badge variant="secondary" className="ml-2">
                  {items.length}
                </Badge>
              )}
          </Button>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as ExtractedItemType | 'all')
          }
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All types</option>
          {Object.entries(extractedItemTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {filteredItems.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">
              Failed to load items
            </CardTitle>
            <CardDescription>Please try refreshing the page.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isLoading && !error && filteredItems.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-lg font-medium text-muted-foreground">
              {activeTab === 'pending_review'
                ? 'No items pending review'
                : `No ${activeTab === 'all' ? '' : activeTab.replace('_', ' ')} items`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === 'pending_review'
                ? 'Items extracted from ingestion sessions will appear here for your review.'
                : 'Try a different filter to see items.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Items grid */}
      <div className="grid gap-3">
        {filteredItems.map((item) => (
          <ExtractedItemCard
            key={item.id}
            item={item}
            onApprove={handleApprove}
            onDismiss={handleDismiss}
            onApply={defaultProjectId ? handleApply : undefined}
            isApplying={applyMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
