'use client';

import {
  Plus,
  Loader2,
  MessageSquare,
  Archive,
  ClipboardPaste,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';

import { ChatInput } from '@/components/ingest/chat-input';
import { ExtractedItemsPanel } from '@/components/ingest/extracted-items-panel';
import { MeetingMode } from '@/components/ingest/meeting-mode';
import { MessageBubble } from '@/components/ingest/message-bubble';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useIngestionSessions,
  useIngestionSession,
  useCreateIngestionSession,
  useSendIngestionMessage,
  useArchiveIngestionSession,
  toast,
} from '@/lib/hooks';
import type {
  IngestionAttachment,
  IngestionMessage,
  MeetingMetadata,
} from '@/types';
import { meetingTypeLabels } from '@/types';

// ============================================================================
// Session List Sidebar
// ============================================================================

function SessionList({
  activeSessionId,
  onSelectSession,
  onNewSession,
}: {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}) {
  const { data, isLoading } = useIngestionSessions('active');
  const archiveMutation = useArchiveIngestionSession();
  const sessions = data?.sessions ?? [];

  return (
    <div
      className="glass-sidebar flex h-full w-full flex-col md:w-72"
      role="complementary"
      aria-label="Session list"
    >
      <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] p-3">
        <h2 className="text-sm font-semibold">Sessions</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewSession}
          aria-label="Create new ingestion session"
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8" role="status">
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Loading sessions...</span>
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <MessageSquare
              className="mb-2 h-8 w-8 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              No sessions yet. Create one to start ingesting information.
            </p>
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            role="button"
            tabIndex={0}
            aria-current={activeSessionId === session.id ? 'true' : undefined}
            aria-label={`Session: ${session.title}`}
            className={`group flex cursor-pointer items-center justify-between border-b border-[var(--glass-border-subtle)] px-3 py-2 text-sm transition-colors hover:bg-[var(--glass-bg-hover)] ${
              activeSessionId === session.id ? 'bg-[var(--glass-bg-hover)]' : ''
            }`}
            onClick={() => onSelectSession(session.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSession(session.id);
              }
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{session.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(session.updatedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                archiveMutation.mutate(session.id);
              }}
              className="ml-2 hidden rounded-md p-1 hover:bg-muted group-hover:block"
              aria-label={`Archive session: ${session.title}`}
            >
              <Archive
                className="h-3 w-3 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Chat View
// ============================================================================

function ChatView({ sessionId }: { sessionId: string }) {
  const { data: session, isLoading } = useIngestionSession(sessionId);
  const sendMessage = useSendIngestionMessage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showExtracted, setShowExtracted] = useState(true);
  const [optimisticMessages, setOptimisticMessages] = useState<
    IngestionMessage[]
  >([]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, optimisticMessages]);

  const handleSend = useCallback(
    (content: string, attachments: IngestionAttachment[]) => {
      // Add optimistic user message
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
          onSuccess: (data) => {
            setOptimisticMessages([]);
            if (data.extractedItems && data.extractedItems.length > 0) {
              const count = data.extractedItems.length;
              toast.info({
                title: `${count} item${count !== 1 ? 's' : ''} extracted`,
                description:
                  'Check the extracted items panel to review and approve.',
              });
            }
          },
          onError: (error) => {
            setOptimisticMessages([]);
            toast.error({
              title: 'Message failed to send',
              description:
                error instanceof Error
                  ? error.message
                  : 'Could not send message. Please try again.',
            });
          },
        }
      );
    },
    [sessionId, sendMessage]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Loading session...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-muted-foreground"
        role="alert"
      >
        Session not found
      </div>
    );
  }

  const allMessages = [...session.messages, ...optimisticMessages];

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="glass-header flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="font-semibold">{session.title}</h2>
            <p className="text-xs text-muted-foreground">
              Created{' '}
              {new Date(session.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExtracted((v) => !v)}
            aria-label={
              showExtracted
                ? 'Hide extracted items panel'
                : 'Show extracted items panel'
            }
            aria-expanded={showExtracted}
          >
            {showExtracted ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="ml-1 text-xs">Extracted</span>
          </Button>
        </div>

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto p-4"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardPaste
                className="mb-4 h-12 w-12 text-muted-foreground/30"
                aria-hidden="true"
              />
              <h3 className="text-lg font-medium text-muted-foreground">
                Paste content to get started
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Paste screenshots (Ctrl+V), drag images, or type text from
                chats, emails, or meeting notes. The AI will help you extract
                and organise the information.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {allMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {sendMessage.isPending && (
              <div className="flex justify-start" role="status">
                <div className="glass-card rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Analysing...
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <ChatInput onSend={handleSend} isSending={sendMessage.isPending} />
      </div>

      {/* Extracted items panel — stacks below on mobile, side panel on md+ */}
      {showExtracted && (
        <div
          className="h-64 flex-shrink-0 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-sidebar-bg)] md:h-auto md:w-72 md:border-l md:border-t-0"
          role="complementary"
          aria-label="Extracted items"
        >
          <ExtractedItemsPanel sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({
  onNewSession,
  onMeetingSubmit,
  isMeetingLoading,
}: {
  onNewSession: () => void;
  onMeetingSubmit: (metadata: MeetingMetadata, transcript: string) => void;
  isMeetingLoading?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Tabs defaultValue="chat">
          <TabsList className="mb-4">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="meeting">Meeting</TabsTrigger>
          </TabsList>
          <TabsContent value="chat">
            <Card variant="glass" className="mx-auto max-w-md">
              <CardHeader className="text-center">
                <ClipboardPaste
                  className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <CardTitle>Ingestion Interface</CardTitle>
                <CardDescription>
                  Paste screenshots, chat logs, emails, or any project-related
                  content. The AI will help you extract action items, risks,
                  decisions, and status updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button
                  onClick={onNewSession}
                  aria-label="Start a new ingestion session"
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Start New Session
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="meeting">
            <MeetingMode
              onSubmit={onMeetingSubmit}
              isLoading={isMeetingLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// New Session Dialog (inline)
// ============================================================================

function NewSessionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const createSession = useCreateIngestionSession();

  const handleCreate = () => {
    const sessionTitle =
      title.trim() || `Session ${new Date().toLocaleDateString('en-GB')}`;
    createSession.mutate(
      { title: sessionTitle },
      {
        onSuccess: (session) => {
          onCreated(session.id);
          toast.success({
            title: 'Session created',
            description: `"${sessionTitle}" is ready for ingestion.`,
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card variant="glass" className="w-full max-w-md">
        <CardHeader>
          <CardTitle>New Ingestion Session</CardTitle>
          <CardDescription>
            Give your session a name to help you find it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="session-title" className="sr-only">
              Session title
            </label>
            <Textarea
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sprint review screenshots, Teams chat about API redesign..."
              className="min-h-[44px] resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSession.isPending}
              aria-label="Create new session"
            >
              {createSession.isPending ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default function IngestPage() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSessionList, setShowSessionList] = useState(true);
  const [meetingLoading, setMeetingLoading] = useState(false);

  const createSession = useCreateIngestionSession();
  const sendMessage = useSendIngestionMessage();

  const handleNewSession = () => {
    setActiveSessionId(null);
    setShowNewSession(true);
  };

  const handleSessionCreated = (id: string) => {
    setShowNewSession(false);
    setActiveSessionId(id);
    // On mobile, hide session list when a session is selected
    setShowSessionList(false);
  };

  const handleSelectSession = (id: string) => {
    setShowNewSession(false);
    setActiveSessionId(id);
    // On mobile, hide session list when a session is selected
    setShowSessionList(false);
  };

  const handleMeetingSubmit = (metadata: MeetingMetadata, transcript: string) => {
    setMeetingLoading(true);
    const title = `${meetingTypeLabels[metadata.meetingType]} — ${metadata.date}`;

    createSession.mutate(
      { title },
      {
        onSuccess: (session) => {
          // Build a meeting-context prefix for the first message
          const prefix = [
            `[Meeting Notes: ${meetingTypeLabels[metadata.meetingType]}]`,
            `Date: ${metadata.date}`,
            metadata.attendees.length > 0
              ? `Attendees: ${metadata.attendees.join(', ')}`
              : null,
            '---',
          ]
            .filter(Boolean)
            .join('\n');

          const content = `${prefix}\n${transcript}`;

          sendMessage.mutate(
            { sessionId: session.id, content },
            {
              onSuccess: (data) => {
                setMeetingLoading(false);
                setActiveSessionId(session.id);
                setShowSessionList(false);
                if (data.extractedItems && data.extractedItems.length > 0) {
                  const count = data.extractedItems.length;
                  toast.info({
                    title: `${count} item${count !== 1 ? 's' : ''} extracted from meeting`,
                    description:
                      'Check the extracted items panel to review and approve.',
                  });
                }
              },
              onError: () => {
                setMeetingLoading(false);
                // Still navigate to the session even if message fails
                setActiveSessionId(session.id);
                setShowSessionList(false);
                toast.error({
                  title: 'Meeting notes could not be processed',
                  description:
                    'The session was created but the notes could not be analysed. Try resending.',
                });
              },
            }
          );
        },
        onError: () => {
          setMeetingLoading(false);
          toast.error({
            title: 'Failed to create meeting session',
            description: 'Could not create a new session. Please try again.',
          });
        },
      }
    );
  };

  return (
    <div className="-m-6 -mt-20 flex h-screen flex-col md:-mt-6 md:flex-row">
      {/* Session list sidebar — full width on mobile when visible, fixed width on md+ */}
      <div
        className={`${
          showSessionList ? 'flex' : 'hidden'
        } md:flex md:w-72 md:flex-shrink-0`}
      >
        <SessionList
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </div>

      {/* Back button on mobile when session list is hidden */}
      {!showSessionList && (
        <div className="flex items-center border-b border-[var(--glass-border-subtle)] px-3 py-2 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSessionList(true)}
            aria-label="Back to session list"
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Sessions
          </Button>
        </div>
      )}

      {/* Main content area — hidden on mobile when session list is shown */}
      <div
        className={`${
          showSessionList ? 'hidden' : 'flex'
        } flex-1 flex-col md:flex`}
      >
        {showNewSession ? (
          <NewSessionForm
            onCreated={handleSessionCreated}
            onCancel={() => setShowNewSession(false)}
          />
        ) : activeSessionId ? (
          <ChatView sessionId={activeSessionId} />
        ) : (
          <EmptyState
            onNewSession={handleNewSession}
            onMeetingSubmit={handleMeetingSubmit}
            isMeetingLoading={meetingLoading}
          />
        )}
      </div>
    </div>
  );
}
