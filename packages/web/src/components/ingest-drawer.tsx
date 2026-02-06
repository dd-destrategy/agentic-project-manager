'use client';

import {
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';

import { ChatInput } from '@/components/ingest/chat-input';
import { ExtractedItemsPanel } from '@/components/ingest/extracted-items-panel';
import { MessageBubble } from '@/components/ingest/message-bubble';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useIngestionSessions,
  useIngestionSession,
  useCreateIngestionSession,
  useSendIngestionMessage,
  useSessionExtractedItems,
} from '@/lib/hooks';
import type { IngestionAttachment, IngestionMessage } from '@/types';

// ============================================================================
// Session Picker Dropdown
// ============================================================================

function SessionPicker({
  activeSessionId,
  onSelect,
  onNew,
}: {
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useIngestionSessions('active');
  const sessions = data?.sessions ?? [];

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-left text-sm hover:bg-accent"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {isLoading
            ? 'Loading...'
            : activeSession
              ? activeSession.title
              : 'Select a session'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          <button
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-b px-3 py-2 text-sm text-primary hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            New session
          </button>
          {sessions.length === 0 && !isLoading && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No sessions yet
            </div>
          )}
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                onSelect(session.id);
                setOpen(false);
              }}
              className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent ${
                session.id === activeSessionId ? 'bg-accent' : ''
              }`}
            >
              <span className="truncate font-medium">{session.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(session.updatedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Drawer Chat View
// ============================================================================

function DrawerChatView({ sessionId }: { sessionId: string }) {
  const { data: session, isLoading } = useIngestionSession(sessionId);
  const sendMessage = useSendIngestionMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<
    IngestionMessage[]
  >([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, optimisticMessages]);

  const handleSend = useCallback(
    (content: string, attachments: IngestionAttachment[]) => {
      const tempUserMsg: IngestionMessage = {
        id: ulid(),
        role: 'user',
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: new Date().toISOString(),
      };
      setOptimisticMessages((prev) => [...prev, tempUserMsg]);

      sendMessage.mutate(
        {
          sessionId,
          content,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
        {
          onSuccess: () => setOptimisticMessages([]),
          onError: () => setOptimisticMessages([]),
        }
      );
    },
    [sessionId, sendMessage]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Session not found
      </div>
    );
  }

  const allMessages = [...session.messages, ...optimisticMessages];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardPaste className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Paste screenshots or type to start ingesting.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {allMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing...
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isSending={sendMessage.isPending}
        compact
      />
    </div>
  );
}

// ============================================================================
// Extracted Items Collapsible
// ============================================================================

function DrawerExtractedSection({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useSessionExtractedItems(sessionId);
  const pendingCount =
    data?.items?.filter((i) => i.status === 'pending_review').length ?? 0;

  return (
    <div className="border-t">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">Extracted Items</span>
          {pendingCount > 0 && (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
              {pendingCount} pending
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="max-h-64 overflow-y-auto border-t">
          <ExtractedItemsPanel sessionId={sessionId} hideHeader />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Ingest Drawer (main export)
// ============================================================================

interface IngestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IngestDrawer({ open, onOpenChange }: IngestDrawerProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const createSession = useCreateIngestionSession();

  // Auto-select the most recent session on first open
  const { data: sessionsData } = useIngestionSessions('active');
  const hasAutoSelected = useRef(false);

  useEffect(() => {
    if (
      open &&
      !hasAutoSelected.current &&
      !activeSessionId &&
      sessionsData?.sessions?.length
    ) {
      setActiveSessionId(sessionsData.sessions[0].id);
      hasAutoSelected.current = true;
    }
  }, [open, activeSessionId, sessionsData]);

  const handleNewSession = useCallback(() => {
    const title = `Session ${new Date().toLocaleDateString('en-GB')}`;
    createSession.mutate(
      { title },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
        },
      }
    );
  }, [createSession]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        {/* Header */}
        <SheetHeader className="space-y-0 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardPaste className="h-4 w-4" />
              Ingest
            </SheetTitle>
            <Link
              href="/ingest"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="Open full ingestion page"
            >
              <ExternalLink className="h-3 w-3" />
              Full view
            </Link>
          </div>
        </SheetHeader>

        {/* Session picker */}
        <div className="border-b px-3 py-2">
          <SessionPicker
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onNew={handleNewSession}
          />
        </div>

        {/* Content */}
        {activeSessionId ? (
          <>
            <DrawerChatView sessionId={activeSessionId} />
            <DrawerExtractedSection sessionId={activeSessionId} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <ClipboardPaste className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium">No active session</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a new session to start ingesting project information.
              </p>
            </div>
            <Button
              onClick={handleNewSession}
              disabled={createSession.isPending}
            >
              {createSession.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              New Session
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
