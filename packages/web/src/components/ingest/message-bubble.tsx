'use client';

import { ImagePlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { IngestionMessage } from '@/types';

export function MessageBubble({ message }: { message: IngestionMessage }) {
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

        {/* Message content */}
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
