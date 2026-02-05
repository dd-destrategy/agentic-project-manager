/**
 * Context Assembly Module
 *
 * Provides cache-friendly prompt assembly for LLM calls.
 * Reference: solution-design/06-prompt-library.md Section 5
 */

export {
  // Types
  type ProjectContext,
  type ArtefactStateSummary,
  type HistoricalActionsSummary,
  type AssembledPrompt,
  type AssemblyOptions,
  // Functions
  estimateTokens,
  buildProjectContextBlock,
  buildArtefactStateBlock,
  buildHistoricalActionsBlock,
  buildSignalsBlock,
  assemblePrompt,
  buildArtefactSummaryFromContent,
  buildActionsSummary,
} from './assembly.js';
