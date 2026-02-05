/**
 * Signal sanitisation
 *
 * Strips/neutralises untrusted content from signals before they
 * are processed by the LLM. This is a security measure to prevent
 * prompt injection attacks.
 */

import type { NormalisedSignal, SanitisedSignal } from '../types/index.js';

/**
 * Patterns that could indicate prompt injection attempts
 */
const INJECTION_PATTERNS = [
  /IMPORTANT:/gi,
  /SYSTEM:/gi,
  /IGNORE PREVIOUS/gi,
  /DISREGARD/gi,
  /<system>/gi,
  /<\/system>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
];

/**
 * Sanitise a normalised signal for safe LLM processing
 */
export function sanitiseSignal(signal: NormalisedSignal): SanitisedSignal {
  const sanitisationNotes: string[] = [];

  // Sanitise the summary
  let sanitisedSummary = signal.summary;

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitisedSummary)) {
      sanitisedSummary = sanitisedSummary.replace(pattern, '[REDACTED]');
      sanitisationNotes.push(`Removed potential injection pattern: ${pattern.source}`);
    }
  }

  // Strip HTML tags
  const htmlTagPattern = /<[^>]*>/g;
  if (htmlTagPattern.test(sanitisedSummary)) {
    sanitisedSummary = sanitisedSummary.replace(htmlTagPattern, '');
    sanitisationNotes.push('Stripped HTML tags');
  }

  // Escape angle brackets that could be interpreted as XML/HTML
  sanitisedSummary = sanitisedSummary
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Truncate excessively long summaries
  const MAX_SUMMARY_LENGTH = 500;
  if (sanitisedSummary.length > MAX_SUMMARY_LENGTH) {
    sanitisedSummary = sanitisedSummary.slice(0, MAX_SUMMARY_LENGTH) + '...';
    sanitisationNotes.push(`Truncated summary to ${MAX_SUMMARY_LENGTH} characters`);
  }

  return {
    ...signal,
    sanitised: true,
    sanitisedSummary,
    sanitisationNotes: sanitisationNotes.length > 0 ? sanitisationNotes : undefined,
  };
}
