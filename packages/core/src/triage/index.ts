/**
 * Triage module
 *
 * Two-stage signal processing:
 * 1. Sanitise - Strip/neutralise untrusted content (security)
 * 2. Classify - Determine importance and recommend actions
 */

export { sanitiseSignal } from './sanitise.js';
export { classifySignal } from './classify.js';
