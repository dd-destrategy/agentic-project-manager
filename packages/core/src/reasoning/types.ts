/**
 * Reasoning module types
 */

import type { Artefact, ClassifiedSignal } from '../types/index.js';

/**
 * Input for complex reasoning
 */
export interface ReasoningInput {
  /** The classified signal requiring complex reasoning */
  signal: ClassifiedSignal;
  /** Current project artefacts for context */
  artefacts: Artefact[];
  /** Recent signals for pattern detection */
  recentSignals: ClassifiedSignal[];
}

/**
 * Output from complex reasoning
 */
export interface ReasoningOutput {
  /** Recommended action to take */
  recommendedAction: string;
  /** Detailed rationale for the recommendation */
  rationale: string;
  /** Whether an escalation should be created */
  shouldEscalate: boolean;
  /** Proposed changes to artefacts */
  proposedArtefactUpdates?: ProposedArtefactUpdate[];
  /** Confidence in the recommendation (0-1) */
  confidence: number;
}

/**
 * Proposed update to an artefact
 */
export interface ProposedArtefactUpdate {
  artefactType: string;
  changes: Record<string, unknown>;
  rationale: string;
}
