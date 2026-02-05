/**
 * Signal sanitisation
 *
 * Strips/neutralises untrusted content from signals before they
 * are processed by the LLM. This is a security measure to prevent
 * prompt injection attacks.
 *
 * Defence Layer 2 in the prompt injection defence model.
 * Reference: solution-design/06-prompt-library.md Section 6
 */

import type { NormalisedSignal, SanitisedSignal } from '../types/index.js';

/**
 * Injection patterns that indicate prompt manipulation attempts
 *
 * These patterns detect:
 * - Direct instruction injection ("ignore previous instructions")
 * - System message spoofing ("SYSTEM:", "[INST]")
 * - Role manipulation ("you are now", "pretend to be")
 * - Social engineering ("as a test", "the admin said")
 * - Delimiter manipulation attempts
 */
export const INJECTION_PATTERNS: Array<{ pattern: RegExp; threat: string }> = [
  // Instruction override attempts
  { pattern: /ignore\s+(previous|above|all|prior)\s+instructions?/gi, threat: 'instruction_override' },
  { pattern: /disregard\s+(previous|above|all|prior|your)\s+(instructions?|rules?|guidelines?)/gi, threat: 'instruction_override' },
  { pattern: /forget\s+(everything|all|your)\s+(you|instructions?|rules?)/gi, threat: 'instruction_override' },
  { pattern: /override\s+(your|all|the)\s+(instructions?|rules?|constraints?)/gi, threat: 'instruction_override' },

  // System message spoofing
  { pattern: /\bSYSTEM\s*:/gi, threat: 'system_spoofing' },
  { pattern: /\bASSISTANT\s*:/gi, threat: 'system_spoofing' },
  { pattern: /\bUSER\s*:/gi, threat: 'system_spoofing' },
  { pattern: /\[INST\]/gi, threat: 'system_spoofing' },
  { pattern: /\[\/INST\]/gi, threat: 'system_spoofing' },
  { pattern: /<\|im_start\|>/gi, threat: 'system_spoofing' },
  { pattern: /<\|im_end\|>/gi, threat: 'system_spoofing' },
  { pattern: /<\|endoftext\|>/gi, threat: 'system_spoofing' },
  { pattern: /<\|system\|>/gi, threat: 'system_spoofing' },
  { pattern: /<\|user\|>/gi, threat: 'system_spoofing' },
  { pattern: /<\|assistant\|>/gi, threat: 'system_spoofing' },

  // Role manipulation
  { pattern: /you\s+are\s+now\s+(a|an|the)/gi, threat: 'role_manipulation' },
  { pattern: /pretend\s+(you're|to\s+be|you\s+are)/gi, threat: 'role_manipulation' },
  { pattern: /act\s+as\s+(if\s+you|a|an|the)/gi, threat: 'role_manipulation' },
  { pattern: /roleplay\s+as/gi, threat: 'role_manipulation' },
  { pattern: /switch\s+(to|into)\s+(a\s+)?different\s+(mode|role|persona)/gi, threat: 'role_manipulation' },
  { pattern: /enter\s+(admin|developer|debug|unrestricted)\s+mode/gi, threat: 'role_manipulation' },
  { pattern: /activate\s+(admin|debug|unrestricted)/gi, threat: 'role_manipulation' },
  { pattern: /enable\s+(admin|developer|debug)\s+(mode|access)/gi, threat: 'role_manipulation' },

  // Social engineering
  { pattern: /this\s+is\s+a\s+test\s+(from|by)\s+(the\s+)?(security|admin|team)/gi, threat: 'social_engineering' },
  { pattern: /just\s+(this\s+)?once/gi, threat: 'social_engineering' },
  { pattern: /the\s+(admin|administrator|developer|owner)\s+said/gi, threat: 'social_engineering' },
  { pattern: /\bfor\s+testing\s+purposes?\b/gi, threat: 'social_engineering' },
  { pattern: /trust\s+me\s+(on\s+this|,?\s+I'm)/gi, threat: 'social_engineering' },

  // Prompt leakage attempts
  { pattern: /output\s+(your|the)\s+(system\s+)?prompt/gi, threat: 'prompt_extraction' },
  { pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/gi, threat: 'prompt_extraction' },
  { pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?instructions?/gi, threat: 'prompt_extraction' },
  { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/gi, threat: 'prompt_extraction' },
  { pattern: /repeat\s+(your|the)\s+(system\s+)?prompt/gi, threat: 'prompt_extraction' },

  // Action injection
  { pattern: /send\s+(an?\s+)?email\s+to/gi, threat: 'action_injection' },
  { pattern: /email\s+(this\s+)?to\s+\S+@/gi, threat: 'action_injection' },
  { pattern: /forward\s+(this\s+)?(to|message)/gi, threat: 'action_injection' },
  { pattern: /create\s+(a\s+)?(jira\s+)?ticket/gi, threat: 'action_injection' },
  { pattern: /update\s+(the\s+)?(jira\s+)?ticket/gi, threat: 'action_injection' },
  { pattern: /delete\s+(the\s+)?(ticket|issue|item)/gi, threat: 'action_injection' },

  // Delimiter manipulation
  { pattern: /<\/signal_content>/gi, threat: 'delimiter_escape' },
  { pattern: /<signal_content>/gi, threat: 'delimiter_escape' },
  { pattern: /```\s*(system|assistant|user)/gi, threat: 'delimiter_escape' },

  // Priority/importance spoofing
  { pattern: /\bIMPORTANT\s*:/gi, threat: 'priority_spoofing' },
  { pattern: /\bURGENT\s*:/gi, threat: 'priority_spoofing' },
  { pattern: /\bCRITICAL\s*:/gi, threat: 'priority_spoofing' },
  { pattern: /\bHIGH\s+PRIORITY\s*:/gi, threat: 'priority_spoofing' },
];

/**
 * Patterns for Unicode tricks and obfuscation
 */
const UNICODE_PATTERNS: Array<{ pattern: RegExp; threat: string }> = [
  // Zero-width characters (often used to hide content)
  { pattern: /[\u200B\u200C\u200D\u2060\uFEFF]/g, threat: 'unicode_obfuscation' },
  // Right-to-left override
  { pattern: /[\u202A-\u202E\u2066-\u2069]/g, threat: 'unicode_obfuscation' },
  // Homoglyph characters (Cyrillic/Greek lookalikes)
  { pattern: /[\u0400-\u04FF]/g, threat: 'potential_homoglyph' }, // Cyrillic
];

/**
 * Maximum content lengths
 */
const MAX_SUMMARY_LENGTH = 2000;

/**
 * Result of threat detection
 */
export interface ThreatDetectionResult {
  threatsFound: string[];
  threatTypes: Set<string>;
  requiresHumanReview: boolean;
  reviewReason?: string;
}

/**
 * Detect threats in text content
 */
export function detectThreats(content: string): ThreatDetectionResult {
  const threatsFound: string[] = [];
  const threatTypes = new Set<string>();

  // Check injection patterns
  for (const { pattern, threat } of INJECTION_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      threatsFound.push(`Detected ${threat} pattern`);
      threatTypes.add(threat);
    }
  }

  // Check unicode patterns
  for (const { pattern, threat } of UNICODE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      threatsFound.push(`Detected ${threat}`);
      threatTypes.add(threat);
    }
  }

  // Determine if human review is needed
  const highRiskTypes = ['action_injection', 'prompt_extraction', 'delimiter_escape'];
  const requiresHumanReview = highRiskTypes.some((t) => threatTypes.has(t));

  let reviewReason: string | undefined;
  if (requiresHumanReview) {
    const found = highRiskTypes.filter((t) => threatTypes.has(t));
    reviewReason = `High-risk threat types detected: ${found.join(', ')}`;
  }

  return {
    threatsFound,
    threatTypes,
    requiresHumanReview,
    reviewReason,
  };
}

/**
 * Neutralise detected threats by replacing with safe markers
 */
export function neutraliseThreats(content: string): string {
  let sanitised = content;

  // Neutralise injection patterns
  for (const { pattern } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitised = sanitised.replace(pattern, '[REDACTED]');
  }

  // Remove zero-width and RTL characters
  for (const { pattern } of UNICODE_PATTERNS) {
    pattern.lastIndex = 0;
    sanitised = sanitised.replace(pattern, '');
  }

  return sanitised;
}

/**
 * Strip potentially dangerous HTML/XML content
 */
export function stripDangerousMarkup(content: string): { content: string; stripped: boolean } {
  let result = content;
  let stripped = false;

  // Strip HTML/XML tags
  const tagPattern = /<[^>]*>/g;
  if (tagPattern.test(result)) {
    result = result.replace(tagPattern, '');
    stripped = true;
  }

  // Strip JavaScript event handlers and data URIs
  result = result.replace(/on\w+\s*=/gi, '[REMOVED]=');
  result = result.replace(/data:[^,]*,/gi, '[DATA_URI]');

  // Escape any remaining angle brackets
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return { content: result, stripped };
}

/**
 * Truncate content to safe lengths
 */
export function truncateContent(
  content: string,
  maxLength: number
): { content: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }
  return {
    content: content.slice(0, maxLength) + '... [truncated]',
    truncated: true,
  };
}

/**
 * Sanitise a normalised signal for safe LLM processing
 *
 * This function:
 * 1. Detects potential injection threats
 * 2. Neutralises dangerous patterns
 * 3. Strips HTML/XML markup
 * 4. Truncates excessively long content
 *
 * @param signal - The normalised signal to sanitise
 * @returns The sanitised signal with threat detection notes
 */
export function sanitiseSignal(signal: NormalisedSignal): SanitisedSignal {
  const sanitisationNotes: string[] = [];

  // Start with the summary
  let sanitisedSummary = signal.summary;

  // Step 1: Detect threats
  const threatResult = detectThreats(sanitisedSummary);
  if (threatResult.threatsFound.length > 0) {
    sanitisationNotes.push(...threatResult.threatsFound);
  }

  // Step 2: Neutralise threats
  if (threatResult.threatTypes.size > 0) {
    sanitisedSummary = neutraliseThreats(sanitisedSummary);
    sanitisationNotes.push(`Neutralised ${threatResult.threatTypes.size} threat type(s)`);
  }

  // Step 3: Strip dangerous markup
  const markupResult = stripDangerousMarkup(sanitisedSummary);
  if (markupResult.stripped) {
    sanitisedSummary = markupResult.content;
    sanitisationNotes.push('Stripped HTML/XML markup');
  } else {
    // Even if no tags found, escape angle brackets
    sanitisedSummary = markupResult.content;
  }

  // Step 4: Truncate if needed
  const truncateResult = truncateContent(sanitisedSummary, MAX_SUMMARY_LENGTH);
  if (truncateResult.truncated) {
    sanitisedSummary = truncateResult.content;
    sanitisationNotes.push(`Truncated content to ${MAX_SUMMARY_LENGTH} characters`);
  }

  // Build result
  const result: SanitisedSignal = {
    ...signal,
    sanitised: true,
    sanitisedSummary,
    sanitisationNotes: sanitisationNotes.length > 0 ? sanitisationNotes : undefined,
  };

  return result;
}

/**
 * Batch sanitise multiple signals
 *
 * @param signals - Array of normalised signals
 * @returns Array of sanitised signals with batch statistics
 */
export function sanitiseSignalBatch(signals: NormalisedSignal[]): {
  signals: SanitisedSignal[];
  stats: {
    total: number;
    modified: number;
    threatsDetected: number;
    requiresReview: number;
  };
} {
  const sanitisedSignals: SanitisedSignal[] = [];
  let modified = 0;
  let threatsDetected = 0;
  let requiresReview = 0;

  for (const signal of signals) {
    const sanitised = sanitiseSignal(signal);
    sanitisedSignals.push(sanitised);

    if (sanitised.sanitisationNotes && sanitised.sanitisationNotes.length > 0) {
      modified++;
      // Count threats
      const threatNotes = sanitised.sanitisationNotes.filter((n) =>
        n.includes('Detected') || n.includes('Neutralised')
      );
      if (threatNotes.length > 0) {
        threatsDetected++;
      }
    }

    // Check if original content required review
    const threatCheck = detectThreats(signal.summary);
    if (threatCheck.requiresHumanReview) {
      requiresReview++;
    }
  }

  return {
    signals: sanitisedSignals,
    stats: {
      total: signals.length,
      modified,
      threatsDetected,
      requiresReview,
    },
  };
}
