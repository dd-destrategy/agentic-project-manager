/**
 * Mode Classifier
 *
 * Determines which conversation mode to activate based on the user's
 * input and current context. This routes to the right ensemble
 * composition — quick queries go to the Operator alone, decisions
 * activate the full ensemble.
 */

import type { ConversationMode } from './types.js';

interface ClassificationContext {
  /** The user's current message */
  userMessage: string;
  /** Whether this is a background (scheduled) invocation */
  isBackground: boolean;
  /** Number of pending escalations */
  pendingEscalations: number;
  /** Whether the copilot has a draft awaiting approval */
  hasPendingDraft: boolean;
  /** Recent conversation turns (for multi-turn context) */
  recentTurns: number;
}

interface ClassificationResult {
  mode: ConversationMode;
  confidence: number;
  reason: string;
}

/**
 * Patterns that trigger specific conversation modes.
 * Checked in priority order — first match wins.
 */
const MODE_PATTERNS: Array<{
  mode: ConversationMode;
  patterns: RegExp[];
  description: string;
}> = [
  {
    mode: 'pre_mortem',
    patterns: [
      /pre[- ]?mortem/i,
      /stress[- ]?test/i,
      /what could go wrong/i,
      /devil'?s?\s+advocate/i,
      /what am i (not seeing|missing)/i,
      /challenge (this|the|my)/i,
      /poke holes/i,
      /worst[- ]?case/i,
    ],
    description: 'User explicitly requests adversarial analysis',
  },
  {
    mode: 'retrospective',
    patterns: [
      /retro(spective)?(\s+on)?/i,
      /what (did we|have we) learn/i,
      /lessons?\s+learn/i,
      /what went (well|wrong)/i,
      /post[- ]?mortem/i,
      /look(ing)? back (on|at)/i,
    ],
    description: 'User requests structured reflection',
  },
  {
    mode: 'decision',
    patterns: [
      /should (we|i|the team)/i,
      /decide (between|on|whether)/i,
      /what('s| is) the best (approach|option|path|way)/i,
      /trade[- ]?offs?\s+(between|for|of)/i,
      /recommend(ation)?/i,
      /option(s)?\s*(a|b|c|1|2|3)/i,
      /push (the|to) (launch|deadline|date|milestone)/i,
      /rescope|replan|descope/i,
      /escalat(e|ion)/i,
      /how should (i|we) handle/i,
    ],
    description: 'User faces a decision or seeks structured options',
  },
  {
    mode: 'action',
    patterns: [
      /draft (a |an |the )?(email|message|response|reply|update|comm)/i,
      /send (a |an |the )?(email|message|notification)/i,
      /create (a |an |the )?(ticket|issue|story|task|risk|item)/i,
      /update (the )?(raid|delivery|backlog|decision|artefact|status)/i,
      /add (a |an )?(comment|note|risk|issue|item|dependency)/i,
      /transition|move (the )?ticket/i,
      /chase (up|email)/i,
      /follow[- ]?up (with|on|email)/i,
      /approve|cancel|reject/i,
    ],
    description: 'User requests an external action',
  },
  {
    mode: 'analysis',
    patterns: [
      /what('s| is) the (state|status|health|progress)/i,
      /how('s| is) (the project|it going|things|progress)/i,
      /show (me )?(the )?(velocity|trend|metric|burn|sprint|risk|raid)/i,
      /summar(y|ise)/i,
      /catch (me )?up/i,
      /what (happened|changed|did i miss)/i,
      /risk (landscape|assessment|analysis|review)/i,
      /backlog (health|audit|quality|review)/i,
      /dependency (map|analysis|check)/i,
      /prep(are)? (me )?(for )?(the |a )?(meeting|standup|steering|review)/i,
      /weekly (status|report)/i,
      /briefing/i,
      /how many (open |active )?(blocker|risk|issue|ticket)/i,
      /cross[- ]?project/i,
    ],
    description: 'User requests data synthesis or project assessment',
  },
];

/**
 * Classify the user's input into a conversation mode.
 *
 * Uses pattern matching for deterministic routing. Falls back to
 * quick_query for anything that doesn't match a specific pattern.
 * The LLM-based classifier (in the orchestrator) can override this
 * for ambiguous cases.
 */
export function classifyMode(ctx: ClassificationContext): ClassificationResult {
  // Background cycles are always analysis mode
  if (ctx.isBackground) {
    return {
      mode: 'analysis',
      confidence: 1.0,
      reason: 'Background monitoring cycle',
    };
  }

  // Check for approval of a pending draft (inline action)
  if (ctx.hasPendingDraft && isApprovalResponse(ctx.userMessage)) {
    return {
      mode: 'action',
      confidence: 0.95,
      reason: 'Responding to pending draft action',
    };
  }

  // Pattern-based classification
  for (const { mode, patterns, description } of MODE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(ctx.userMessage)) {
        return {
          mode,
          confidence: 0.85,
          reason: description,
        };
      }
    }
  }

  // Default: quick query for short messages, analysis for longer ones
  const wordCount = ctx.userMessage.trim().split(/\s+/).length;
  if (wordCount <= 8) {
    return {
      mode: 'quick_query',
      confidence: 0.7,
      reason: 'Short message — defaulting to quick query',
    };
  }

  return {
    mode: 'analysis',
    confidence: 0.6,
    reason: 'Longer message — defaulting to analysis mode',
  };
}

function isApprovalResponse(message: string): boolean {
  const approvalPatterns = [
    /^(yes|yep|yeah|approve|approved|lgtm|go ahead|send it|looks good)/i,
    /^ok(ay)?$/i,
    /^do it$/i,
    /^confirm/i,
  ];
  return approvalPatterns.some((p) => p.test(message.trim()));
}

/**
 * Determine if the Sceptic should activate as an additional
 * perspective, even if the mode doesn't normally include it.
 *
 * Returns a trigger reason if the Sceptic should activate,
 * or null if it should stay quiet.
 */
export function shouldActivateSceptic(ctx: {
  userMessage: string;
  mode: ConversationMode;
  velocityGapPercent?: number;
  stalestBlockerDays?: number;
  scopeAddedWithoutTradeoff?: number;
  lastChallengeMs?: number;
  challengeCooldownMs: number;
}): string | null {
  // Sceptic already included in these modes
  if (ctx.mode === 'decision' || ctx.mode === 'pre_mortem') {
    return null;
  }

  // Respect cooldown
  if (
    ctx.lastChallengeMs &&
    Date.now() - ctx.lastChallengeMs < ctx.challengeCooldownMs
  ) {
    return null;
  }

  // Check automatic triggers
  if (ctx.velocityGapPercent && ctx.velocityGapPercent > 20) {
    if (expressesConfidence(ctx.userMessage)) {
      return 'timeline_confidence';
    }
  }

  if (ctx.stalestBlockerDays && ctx.stalestBlockerDays > 3) {
    return 'stale_blocker';
  }

  if (ctx.scopeAddedWithoutTradeoff && ctx.scopeAddedWithoutTradeoff >= 3) {
    return 'scope_creep';
  }

  return null;
}

function expressesConfidence(message: string): boolean {
  const confidencePatterns = [
    /we('ll| will| can) (make|hit|meet|deliver)/i,
    /on track/i,
    /no problem/i,
    /confident/i,
    /should be (fine|okay|ok)/i,
    /we('re| are) (good|fine)/i,
    /i think we('ll| will) make it/i,
  ];
  return confidencePatterns.some((p) => p.test(message));
}
