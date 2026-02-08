'use client';

import { useCallback, useRef, useState } from 'react';
import { ulid } from 'ulid';

// ─── Types ───────────────────────────────────────────────────

export type CopilotMessageRole = 'user' | 'copilot';

export interface PersonaContribution {
  personaId: string;
  perspective: string;
  confidence: number;
  dissents?: boolean;
  dissentReason?: string;
}

export interface Conflict {
  between: [string, string];
  description: string;
}

export interface CopilotDeliberation {
  contributions: PersonaContribution[];
  synthesisedRecommendation?: string;
  conflicts?: Conflict[];
}

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  content: string;
  timestamp: string;
  mode?: string;
  showAttribution?: boolean;
  deliberation?: CopilotDeliberation;
}

interface UseCopilotOptions {
  sessionId?: string;
  projectId?: string;
}

// ─── Hook ────────────────────────────────────────────────────

export function useCopilot(options: UseCopilotOptions = {}) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(options.sessionId ?? `web-${ulid()}`);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // Add user message immediately
      const userMessage: CopilotMessage = {
        id: ulid(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await fetch('/api/copilot/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            projectId: options.projectId ?? 'proj-atlas-001',
            message: content.trim(),
          }),
        });

        if (!response.ok) {
          const errData = await response
            .json()
            .catch(() => ({ error: 'Network error' }));
          throw new Error(errData.error ?? `HTTP ${response.status}`);
        }

        const data = await response.json();

        const copilotMessage: CopilotMessage = {
          id: ulid(),
          role: 'copilot',
          content: data.message,
          timestamp: new Date().toISOString(),
          mode: data.mode,
          showAttribution: data.showAttribution,
          deliberation: data.deliberation,
        };
        setMessages((prev) => [...prev, copilotMessage]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to reach copilot';
        setError(errorMessage);

        // Add error message to chat
        setMessages((prev) => [
          ...prev,
          {
            id: ulid(),
            role: 'copilot',
            content: `Sorry, I couldn't process that request. ${errorMessage}`,
            timestamp: new Date().toISOString(),
            mode: 'error',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, options.projectId]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = `web-${ulid()}`;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
    sessionId: sessionIdRef.current,
  };
}
