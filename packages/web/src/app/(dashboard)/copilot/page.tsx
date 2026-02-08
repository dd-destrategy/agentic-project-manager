'use client';

import { Bot, Loader2, RotateCcw, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CopilotMessageBubble } from '@/components/copilot/copilot-message';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useCopilot } from '@/lib/hooks/use-copilot';

const SUGGESTIONS = [
  "What's the state of Project Atlas?",
  'Show me the velocity trend for the last 5 sprints',
  'Should we push the beta launch to April?',
  'Run a pre-mortem on the March launch',
  'Draft an email to Sarah about the delay',
  'Catch me up',
];

export default function CopilotPage() {
  const { messages, isLoading, sendMessage, clearHistory } = useCopilot();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage(trimmed);
    setInput('');
    // Re-focus textarea after send
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      if (isLoading) return;
      sendMessage(suggestion);
    },
    [isLoading, sendMessage]
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">PM Copilot</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Thinking...'
                : 'Ask me anything about your projects'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearHistory}
          disabled={messages.length === 0}
          title="New conversation"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          New chat
        </Button>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Bot
                  className="h-8 w-8 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <h2 className="text-lg font-medium text-muted-foreground mb-2">
                PM Copilot
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                I can analyse your project status, help you make decisions,
                draft communications, and challenge your assumptions. Try one of
                these to get started:
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="glass rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <CopilotMessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="glass-card rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Deliberating...
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-[var(--glass-border-subtle)] bg-background p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your project, make a decision, or request an action..."
            className="min-h-[44px] max-h-[160px] resize-none"
            rows={1}
            disabled={isLoading}
            aria-label="Message"
          />
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !input.trim()}
            size="icon"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line. Responses include
          multi-persona reasoning for complex queries.
        </p>
      </div>
    </div>
  );
}
