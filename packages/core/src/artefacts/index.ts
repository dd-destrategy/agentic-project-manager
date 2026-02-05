/**
 * Artefacts module
 *
 * Manages PM artefacts: Delivery State, RAID Log, Backlog Summary, Decision Log.
 */

export {
  updateArtefact,
  mergeArtefact,
  revertArtefact,
  calculateDiff,
  setDynamoDBClient,
} from './updater.js';
export { validateArtefactContent } from './validator.js';
export type {
  ArtefactUpdateResult,
  ArtefactUpdateInput,
  ArtefactMergeInput,
  ArtefactDiff,
  ArtefactChange,
  MergeStrategy,
  LlmArtefactUpdateInput,
  LlmArtefactUpdateResult,
} from './types.js';
