'use client';

import { ImagePlus, Send, X, Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ulid } from 'ulid';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { IngestionAttachment } from '@/types';

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: IngestionAttachment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
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

interface ChatInputProps {
  onSend: (content: string, attachments: IngestionAttachment[]) => void;
  isSending: boolean;
  /** Shorter hint text for compact layouts */
  compact?: boolean;
}

export function ChatInput({ onSend, isSending, compact }: ChatInputProps) {
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

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={
            compact
              ? 'Paste screenshot or type...'
              : 'Paste a screenshot, type a message, or drag an image here...'
          }
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
          disabled={isSending}
        />

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

      {!compact && (
        <p className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line. Paste images with
          Ctrl+V. Max 5 images per message.
        </p>
      )}
    </div>
  );
}
