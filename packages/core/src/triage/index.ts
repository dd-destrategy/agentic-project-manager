/**
 * Triage module
 *
 * Two-stage signal processing:
 * 1. Sanitise - Strip/neutralise untrusted content (security)
 * 2. Classify - Determine importance and recommend actions
 *
 * Reference: solution-design/06-prompt-library.md
 */

export {
  sanitiseSignal,
  sanitiseSignalBatch,
  detectThreats,
  neutraliseThreats,
  stripDangerousMarkup,
  truncateContent,
  INJECTION_PATTERNS,
  type ThreatDetectionResult,
} from './sanitise.js';

export {
  classifySignal,
  classifySignalBatch,
  TRIAGE_CLASSIFY_SYSTEM_PROMPT,
} from './classify.js';
