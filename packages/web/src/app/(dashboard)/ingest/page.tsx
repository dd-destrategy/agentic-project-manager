'use client';

import {
  Plus,
  Send,
  ImagePlus,
  X,
  Loader2,
  MessageSquare,
  Archive,
  ClipboardPaste,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  useIngestionSessions,
  useIngestionSession,
  useCreateIngestionSession,
  useSendIngestionMessage,
  useArchiveIngestionSession,
} from '@/lib/hooks';
import type { IngestionAttachment, IngestionMessage } from '@/types';

// ============================================================================
// Message Bubble
// ============================================================================

function MessageBubble({ message }: { message: IngestionMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {/* Show attachment indicators for user messages */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.attachments.map((att) => (
              <Badge key={att.id} variant="secondary" className="text-xs">
                <ImagePlus className="mr-1 h-3 w-3" />
                {att.filename || 'Image'}
              </Badge>
            ))}
          </div>
        )}

        {/* Message content — render markdown-like formatting */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>

        <div
          className={`mt-1 text-xs ${
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          {new Date(message.createdAt).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Attachment Preview
// ============================================================================

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: IngestionAttachment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <img
        src={attachment.dataUrl}
        alt={attachment.filename || 'Attachment'}
        className="h-20 w-20 rounded-md border object-cover"
      />
      <button
        onClick={() => onRemove(attachment.id)}
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================================
// Chat Input
// ============================================================================

function ChatInput({
  onSend,
  isSending,
}: {
  onSend: (content: string, attachments: IngestionAttachment[]) => void;
  isSending: boolean;
}) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<IngestionAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      const imageFiles = Array.from(files).filter((f) =>
        f.type.match(/^image\/(png|jpeg|gif|webp)$/)
      );

      for (const file of imageFiles) {
        if (attachments.length >= 5) break;

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setAttachments((prev) => [
            ...prev,
            {
              id: ulid(),
              mimeType: file.type,
              dataUrl,
              filename: file.name,
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    },
    [attachments.length]
  );

  // Handle paste events for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.match(/^image\//)
      );

      if (imageItems.length > 0) {
        e.preventDefault();

        for (const item of imageItems) {
          if (attachments.length >= 5) break;

          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setAttachments((prev) => [
              ...prev,
              {
                id: ulid(),
                mimeType: file.type,
                dataUrl,
                filename: `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
              },
            ]);
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [attachments.length]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;

    onSend(trimmed || 'Please analyse these images.', attachments);
    setContent('');
    setAttachments([]);
  }, [content, attachments, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div
      className="border-t bg-background p-4"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <AttachmentPreview
              key={att.id}
              attachment={att}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File picker button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending || attachments.length >= 5}
          title="Attach images"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Text input */}
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Paste a screenshot, type a message, or drag an image here..."
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
          disabled={isSending}
        />

        {/* Send button */}
        <Button
          onClick={handleSubmit}
          disabled={
            isSending || (content.trim() === '' && attachments.length === 0)
          }
          size="icon"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line. Paste images with Ctrl+V.
        Max 5 images per message.
      </p>
    </div>
  );
}

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
    <div className="flex h-full w-72 flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">Sessions</h2>
        <Button variant="ghost" size="sm" onClick={onNewSession}>
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No sessions yet. Create one to start ingesting information.
            </p>
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex cursor-pointer items-center justify-between border-b px-3 py-2 text-sm transition-colors hover:bg-accent ${
              activeSessionId === session.id ? 'bg-accent' : ''
            }`}
            onClick={() => onSelectSession(session.id)}
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
              className="ml-2 hidden rounded p-1 hover:bg-muted group-hover:block"
              title="Archive session"
            >
              <Archive className="h-3 w-3 text-muted-foreground" />
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
          onSuccess: () => {
            setOptimisticMessages([]);
          },
          onError: () => {
            // Keep optimistic messages but could mark as failed
            setOptimisticMessages([]);
          },
        }
      );
    },
    [sessionId, sendMessage]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Session not found
      </div>
    );
  }

  const allMessages = [...session.messages, ...optimisticMessages];

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardPaste className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-lg font-medium text-muted-foreground">
              Paste content to get started
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Paste screenshots (Ctrl+V), drag images, or type text from chats,
              emails, or meeting notes. The AI will help you extract and
              organise the information.
            </p>
          </div>
        )}

        <div className="space-y-4">
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

      {/* Input area */}
      <ChatInput onSend={handleSend} isSending={sendMessage.isPending} />
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <ClipboardPaste className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
          <CardTitle>Ingestion Interface</CardTitle>
          <CardDescription>
            Paste screenshots, chat logs, emails, or any project-related
            content. The AI will help you extract action items, risks,
            decisions, and status updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={onNewSession}>
            <Plus className="mr-2 h-4 w-4" />
            Start New Session
          </Button>
        </CardContent>
      </Card>
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
        },
      }
    );
  };

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>New Ingestion Session</CardTitle>
          <CardDescription>
            Give your session a name to help you find it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Textarea
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
            <Button onClick={handleCreate} disabled={createSession.isPending}>
              {createSession.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
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

  const handleNewSession = () => {
    setActiveSessionId(null);
    setShowNewSession(true);
  };

  const handleSessionCreated = (id: string) => {
    setShowNewSession(false);
    setActiveSessionId(id);
  };

  const handleSelectSession = (id: string) => {
    setShowNewSession(false);
    setActiveSessionId(id);
  };

  return (
    <div className="-m-6 -mt-20 flex h-screen md:-mt-6">
      {/* Session list sidebar */}
      <SessionList
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />

      {/* Main content area */}
      {showNewSession ? (
        <NewSessionForm
          onCreated={handleSessionCreated}
          onCancel={() => setShowNewSession(false)}
        />
      ) : activeSessionId ? (
        <ChatView sessionId={activeSessionId} />
      ) : (
        <EmptyState onNewSession={handleNewSession} />
      )}
    </div>
  );
}
