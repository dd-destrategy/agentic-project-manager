'use client';

import { ImagePlus, Bot, User } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import type { IngestionMessage } from '@/types';

/**
 * Lightweight inline markdown renderer for assistant messages.
 * Handles: **bold**, paragraphs, and `- ` bullet lists.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    const lines = para.split('\n');

    // Check if this paragraph is a bullet list
    const isList = lines.every(
      (l) => l.trim().startsWith('- ') || l.trim() === ''
    );

    if (isList) {
      const items = lines
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '));
      nodes.push(
        <ul key={i} className="my-1 list-none space-y-0.5 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-1.5">
              <span className="mt-0.5 shrink-0 text-muted-foreground/60">
                &bull;
              </span>
              <span>{renderInline(item.slice(2))}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      nodes.push(
        <p key={i} className={i > 0 ? 'mt-2' : undefined}>
          {renderInline(para.replace(/\n/g, ' '))}
        </p>
      );
    }
  }

  return nodes;
}

/** Render inline formatting: **bold** */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function MessageBubble({ message }: { message: IngestionMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
          isUser
            ? 'rounded-tr-md bg-primary text-primary-foreground'
            : 'rounded-tl-md bg-muted/70 text-foreground'
        }`}
      >
        {/* Attachment indicators */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {message.attachments.map((att) => (
              <Badge key={att.id} variant="secondary" className="text-[10px]">
                <ImagePlus className="mr-1 h-2.5 w-2.5" />
                {att.filename || 'Image'}
              </Badge>
            ))}
          </div>
        )}

        {/* Message content */}
        <div className="text-sm leading-relaxed">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            renderMarkdown(message.content)
          )}
        </div>

        {/* Timestamp */}
        <div
          className={`mt-1 text-[10px] ${
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground/70'
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
