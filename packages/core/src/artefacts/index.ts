/**
 * Artefacts module
 *
 * Manages PM artefacts: Delivery State, RAID Log, Backlog Summary, Decision Log.
 */

export { updateArtefact } from './updater.js';
export { validateArtefactContent } from './validator.js';
export type { ArtefactUpdateResult } from './types.js';
