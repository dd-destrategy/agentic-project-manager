'use client';

import {
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Eye,
  Scale,
  Shield,
  History,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import type {
  CopilotMessage,
  PersonaContribution,
} from '@/lib/hooks/use-copilot';
import { cn } from '@/lib/utils';

// ─── Persona Display Config ─────────────────────────────────

const PERSONA_CONFIG: Record<
  string,
  { label: string; icon: typeof Bot; colour: string }
> = {
  operator: { label: 'Operator', icon: Bot, colour: 'text-blue-600' },
  analyst: { label: 'Analyst', icon: Eye, colour: 'text-emerald-600' },
  sceptic: { label: 'Sceptic', icon: AlertTriangle, colour: 'text-amber-600' },
  advocate: { label: 'Advocate', icon: Shield, colour: 'text-violet-600' },
  historian: { label: 'Historian', icon: History, colour: 'text-orange-600' },
  synthesiser: { label: 'Synthesiser', icon: Scale, colour: 'text-indigo-600' },
};

const MODE_LABELS: Record<string, string> = {
  quick_query: 'Quick',
  analysis: 'Analysis',
  decision: 'Decision',
  action: 'Action',
  pre_mortem: 'Pre-mortem',
  retrospective: 'Retrospective',
  error: 'Error',
};

// ─── Contribution Card ──────────────────────────────────────

function ContributionCard({
  contribution,
}: {
  contribution: PersonaContribution;
}) {
  const config = PERSONA_CONFIG[contribution.personaId] ?? {
    label: contribution.personaId,
    icon: Bot,
    colour: 'text-muted-foreground',
  };
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        contribution.dissents
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
          : 'border-border bg-muted/50'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-3.5 w-3.5', config.colour)} aria-hidden="true" />
        <span className={cn('font-medium text-xs', config.colour)}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {Math.round(contribution.confidence * 100)}% confidence
        </span>
      </div>
      {contribution.dissents && contribution.dissentReason && (
        <div className="mb-1">
          <Badge variant="warning" className="text-[10px]">
            dissents
          </Badge>
          <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-300">
            {contribution.dissentReason}
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {contribution.perspective}
      </p>
    </div>
  );
}

// ─── Deliberation Panel ─────────────────────────────────────

function DeliberationPanel({ message }: { message: CopilotMessage }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!message.deliberation || !message.showAttribution) return null;

  const { contributions, synthesisedRecommendation, conflicts } =
    message.deliberation;

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {contributions.length} persona{contributions.length !== 1 ? 's' : ''}{' '}
        deliberated
        {conflicts && conflicts.length > 0 && (
          <Badge variant="outline" className="ml-1 text-[10px] py-0">
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2">
          {contributions.map((c) => (
            <ContributionCard key={c.personaId} contribution={c} />
          ))}

          {conflicts && conflicts.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                Conflicts identified
              </p>
              {conflicts.map((conflict, i) => (
                <p
                  key={i}
                  className="text-xs text-amber-600 dark:text-amber-400"
                >
                  {conflict.between[0]} vs {conflict.between[1]}:{' '}
                  {conflict.description}
                </p>
              ))}
            </div>
          )}

          {synthesisedRecommendation && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950">
              <div className="flex items-center gap-1.5 mb-1">
                <Scale className="h-3 w-3 text-indigo-600" aria-hidden="true" />
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  Synthesised recommendation
                </span>
              </div>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed whitespace-pre-wrap">
                {synthesisedRecommendation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Message Component ─────────────────────────────────

interface CopilotMessageBubbleProps {
  message: CopilotMessage;
}

export function CopilotMessageBubble({ message }: CopilotMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.mode === 'error';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isError
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Message body */}
      <div
        className={cn(
          'max-w-[80%] space-y-1',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Mode badge for copilot messages */}
        {!isUser && message.mode && message.mode !== 'error' && (
          <Badge variant="glass" className="text-[10px] mb-1">
            {MODE_LABELS[message.mode] ?? message.mode}
          </Badge>
        )}

        <div
          className={cn(
            'rounded-lg px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : isError
                ? 'bg-destructive/10 text-destructive border border-destructive/20'
                : 'glass-card'
          )}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>

          {/* Deliberation panel (copilot only) */}
          {!isUser && <DeliberationPanel message={message} />}
        </div>

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground px-1">
          {new Date(message.timestamp).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
