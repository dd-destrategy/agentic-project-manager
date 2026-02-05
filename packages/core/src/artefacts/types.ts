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
