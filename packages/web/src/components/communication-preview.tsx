'use client';

import { useState, useEffect } from 'react';
import {
  Mail,
  GitBranch,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  formatTimeRemaining,
  getActionTypeLabel,
  isEmailPayload,
  isJiraPayload,
} from '@/lib/hooks';
import type { HeldAction } from '@/types';

interface CommunicationPreviewProps {
  action: HeldAction;
  onApprove: () => void;
  onCancel: () => void;
  isApproving?: boolean;
  isCancelling?: boolean;
}

/**
 * Get icon component for action type
 */
function ActionTypeIcon({ actionType }: { actionType: HeldAction['actionType'] }) {
  switch (actionType) {
    case 'email_stakeholder':
      return <Mail className="h-5 w-5" />;
    case 'jira_status_change':
      return <GitBranch className="h-5 w-5" />;
    default:
      return <AlertCircle className="h-5 w-5" />;
  }
}

/**
 * Get badge variant based on urgency (time remaining)
 */
function getUrgencyVariant(heldUntil: string): 'error' | 'warning' | 'secondary' {
  const now = Date.now();
  const until = new Date(heldUntil).getTime();
  const diffMins = (until - now) / 60000;

  if (diffMins <= 5) {
    return 'error';
  } else if (diffMins <= 15) {
    return 'warning';
  }
  return 'secondary';
}

/**
 * Email preview section
 */
function EmailPreview({ payload }: { payload: HeldAction['payload'] }) {
  if (!isEmailPayload(payload)) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm">
        <div className="flex gap-2">
          <span className="font-medium text-muted-foreground w-16">To:</span>
          <span className="flex-1">{payload.to.join(', ')}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-medium text-muted-foreground w-16">Subject:</span>
          <span className="flex-1 font-medium">{payload.subject}</span>
        </div>
        {payload.context && (
          <div className="flex gap-2">
            <span className="font-medium text-muted-foreground w-16">Context:</span>
            <span className="flex-1 text-muted-foreground">{payload.context}</span>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Email Body:</p>
        <pre className="text-sm whitespace-pre-wrap font-sans">{payload.bodyText}</pre>
      </div>
    </div>
  );
}

/**
 * Jira status change preview section
 */
function JiraPreview({ payload }: { payload: HeldAction['payload'] }) {
  if (!isJiraPayload(payload)) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm">
        <div className="flex gap-2">
          <span className="font-medium text-muted-foreground w-20">Issue:</span>
          <span className="flex-1 font-mono font-medium">{payload.issueKey}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-medium text-muted-foreground w-20">Transition:</span>
          <span className="flex-1">{payload.transitionName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-muted-foreground w-20">Status:</span>
          <span className="flex items-center gap-2">
            <Badge variant="secondary">{payload.fromStatus}</Badge>
            <span className="text-muted-foreground">-&gt;</span>
            <Badge variant="success">{payload.toStatus}</Badge>
          </span>
        </div>
        {payload.reason && (
          <div className="flex gap-2">
            <span className="font-medium text-muted-foreground w-20">Reason:</span>
            <span className="flex-1 text-muted-foreground">{payload.reason}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Communication preview component
 *
 * Shows details of a held action with approve/cancel actions.
 * Includes countdown timer and expandable details.
 */
export function CommunicationPreview({
  action,
  onApprove,
  onCancel,
  isApproving = false,
  isCancelling = false,
}: CommunicationPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(formatTimeRemaining(action.heldUntil));

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(action.heldUntil));
    }, 1000);

    return () => clearInterval(interval);
  }, [action.heldUntil]);

  const isProcessing = isApproving || isCancelling;
  const urgencyVariant = getUrgencyVariant(action.heldUntil);

  // Get summary for collapsed view
  const getSummary = () => {
    if (isEmailPayload(action.payload)) {
      return action.payload.subject;
    }
    if (isJiraPayload(action.payload)) {
      return `${action.payload.issueKey}: ${action.payload.fromStatus} -> ${action.payload.toStatus}`;
    }
    return 'Unknown action';
  };

  // Get recipient for collapsed view
  const getRecipient = () => {
    if (isEmailPayload(action.payload)) {
      const recipients = action.payload.to;
      if (recipients.length === 1) {
        return recipients[0];
      }
      return `${recipients[0]} +${recipients.length - 1} more`;
    }
    if (isJiraPayload(action.payload)) {
      return action.payload.issueKey;
    }
    return '';
  };

  return (
    <Card className="transition-all hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Action type and summary */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <ActionTypeIcon actionType={action.actionType} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {getActionTypeLabel(action.actionType)}
                </Badge>
                <span className="text-xs text-muted-foreground">{getRecipient()}</span>
              </div>
              <p className="mt-1 font-medium truncate">{getSummary()}</p>
            </div>
          </div>

          {/* Time remaining badge */}
          <Badge variant={urgencyVariant} className="flex items-center gap-1 flex-shrink-0">
            <Clock className="h-3 w-3" />
            {timeRemaining}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Expandable details */}
        {isExpanded && (
          <div className="border-t pt-4">
            {isEmailPayload(action.payload) && <EmailPreview payload={action.payload} />}
            {isJiraPayload(action.payload) && <JiraPreview payload={action.payload} />}
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center justify-between gap-4">
          {/* Expand/collapse toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" />
                Show details
              </>
            )}
          </Button>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isProcessing}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {isCancelling ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-1 h-4 w-4" />
              )}
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={isProcessing}
            >
              {isApproving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Approve
            </Button>
          </div>
        </div>

        {/* Urgency warning */}
        {urgencyVariant === 'error' && (
          <p className="text-xs text-destructive">
            This action will execute automatically soon. Review and decide now.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for communication preview
 */
export function CommunicationPreviewSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                <div className="h-5 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-5 w-48 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="h-8 w-28 rounded bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded bg-muted animate-pulse" />
            <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
