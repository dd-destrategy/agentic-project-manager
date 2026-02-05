/**
 * Artefact module types
 */

import type { ArtefactContent, ArtefactType } from '../types/index.js';

/**
 * Result of updating an artefact
 */
export interface ArtefactUpdateResult {
  success: boolean;
  artefactType: ArtefactType;
  version: number;
  previousVersion?: ArtefactContent;
  error?: string;
}

/**
 * Input for artefact update
 */
export interface ArtefactUpdateInput {
  projectId: string;
  artefactType: ArtefactType;
  content: ArtefactContent;
  rationale: string;
}

/**
 * Merge strategy for combining artefact content
 */
export type MergeStrategy = 'merge' | 'replace';

/**
 * Input for merging partial updates into an artefact
 */
export interface ArtefactMergeInput {
  projectId: string;
  artefactType: ArtefactType;
  partialContent: Partial<ArtefactContent>;
  strategy?: MergeStrategy;
  rationale: string;
}

/**
 * A single change in an artefact diff
 */
export interface ArtefactChange {
  field: string;
  changeType: 'added' | 'modified' | 'removed';
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Diff between two artefact versions
 */
export interface ArtefactDiff {
  artefactType: ArtefactType;
  changes: ArtefactChange[];
  timestamp: string;
}

/**
 * Input for LLM artefact update tool
 */
export interface LlmArtefactUpdateInput {
  projectId: string;
  artefactType: ArtefactType;
  changesSummary: string;
  content: ArtefactContent;
  signalsIncorporated: string[];
}

/**
 * Result from LLM artefact update
 */
export interface LlmArtefactUpdateResult {
  success: boolean;
  artefactsUpdated: Array<{
    artefactType: ArtefactType;
    version: number;
    changesSummary: string;
  }>;
  error?: string;
}
