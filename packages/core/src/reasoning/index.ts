/**
 * Reasoning module
 *
 * Complex multi-source reasoning using Claude Sonnet for difficult signals
 * that require deeper analysis than the Haiku triage can provide.
 */

export {
  performReasoning,
  performReasoningWithClient,
  performBatchReasoning,
  requiresComplexReasoning,
} from './reasoning.js';

export type {
  ReasoningInput,
  ReasoningOutput,
  ReasoningContext,
  RecentAction,
  ProposedArtefactUpdate,
  SignalPattern,
  RiskAssessment,
  ReasoningTransparency,
  SourceSignalSummary,
  ConfidenceDetails,
  DimensionDetail,
  ReasoningResult,
} from './types.js';
