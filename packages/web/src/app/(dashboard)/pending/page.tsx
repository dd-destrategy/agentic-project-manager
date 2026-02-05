'use client';

import { Clock, CheckCircle2, Loader2, AlertCircle, Inbox } from 'lucide-react';
import {
  usePendingHeldActions,
  useApproveHeldAction,
  useCancelHeldAction,
} from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import {
  CommunicationPreview,
  CommunicationPreviewSkeleton,
} from '@/components/communication-preview';

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <h3 className="text-lg font-medium">No pending communications</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        All scheduled communications have been processed. New actions will appear here
        when the agent needs your approval before proceeding.
      </p>
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-medium">Failed to load pending actions</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Please try refreshing the page.
      </p>
    </div>
  );
}

/**
 * Loading skeleton
 */
function LoadingState() {
  return (
    <div className="space-y-4">
      <CommunicationPreviewSkeleton />
      <CommunicationPreviewSkeleton />
      <CommunicationPreviewSkeleton />
    </div>
  );
}

/**
 * Pending communications page
 *
 * Lists all held actions awaiting user approval.
 * Actions can be approved (execute immediately) or cancelled (prevent execution).
 */
export default function PendingPage() {
  const { data, isLoading, error } = usePendingHeldActions();
  const heldActions = data?.heldActions ?? [];

  const approveMutation = useApproveHeldAction();
  const cancelMutation = useCancelHeldAction();

  // Track which action is being processed
  const processingActionId = approveMutation.isPending
    ? approveMutation.variables
    : cancelMutation.isPending
      ? cancelMutation.variables?.id
      : null;

  const handleApprove = (actionId: string) => {
    approveMutation.mutate(actionId);
  };

  const handleCancel = (actionId: string) => {
    cancelMutation.mutate({ id: actionId });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader count={0} isLoading />
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader count={0} />
        <ErrorState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader count={heldActions.length} />

      {heldActions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {heldActions.map((action) => (
            <CommunicationPreview
              key={action.id}
              action={action}
              onApprove={() => handleApprove(action.id)}
              onCancel={() => handleCancel(action.id)}
              isApproving={processingActionId === action.id && approveMutation.isPending}
              isCancelling={processingActionId === action.id && cancelMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Info section */}
      {heldActions.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Inbox className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">About the hold queue</p>
              <p className="mt-1">
                These communications are scheduled to execute automatically after a hold period.
                You can approve them to execute immediately, or cancel to prevent execution.
                As you consistently approve actions, the hold times will gradually decrease
                through the graduation system.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Page header with title and count badge
 */
function PageHeader({ count, isLoading = false }: { count: number; isLoading?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Pending Communications</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve scheduled actions before they execute
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : count > 0 ? (
        <Badge variant="warning" className="text-sm">
          <Clock className="mr-1 h-3.5 w-3.5" />
          {count} pending
        </Badge>
      ) : null}
    </div>
  );
}
