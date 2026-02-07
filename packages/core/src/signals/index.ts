/**
 * Signal normalisation module
 *
 * Converts raw API responses from integrations into NormalisedSignal objects.
 */

export { normaliseJiraSignal } from './jira.js';
// export { normaliseOutlookSignal } from './outlook.js'; // Phase 3

export type { SignalNormaliser } from './types.js';

export {
  extractActorsFromJiraSignal,
  extractActorsFromOutlookSignal,
  type ExtractedActor,
} from './stakeholder-extractor.js';

export { detectStaleItems, type StaleItemWarning } from './stale-watchdog.js';
