/**
 * Reasoning module types
 *
 * Types for complex multi-source reasoning using Claude Sonnet.
 */

import type { TokenUsage } from '../llm/types.js';
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
  /** Optional additional context */
  context?: ReasoningContext;
}

/**
 * Additional context for reasoning
 */
export interface ReasoningContext {
  /** Project ID */
  projectId: string;
  /** Current autonomy level */
  autonomyLevel?: 'monitoring' | 'artefact' | 'tactical';
  /** Recent actions taken */
  recentActions?: RecentAction[];
  /** User preferences or notes */
  userNotes?: string;
}

/**
 * Recent action for context
 */
export interface RecentAction {
  actionType: string;
  timestamp: string;
  success: boolean;
  description?: string;
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
  /** Reason for escalation (if shouldEscalate is true) */
  escalationReason?: string;
  /** Proposed changes to artefacts */
  proposedArtefactUpdates?: ProposedArtefactUpdate[];
  /** Patterns identified across signals */
  identifiedPatterns?: SignalPattern[];
  /** Risk assessment */
  riskAssessment?: RiskAssessment;
  /** Confidence in the recommendation (0-1) */
  confidence: number;
  /** Key evidence supporting the recommendation */
  supportingEvidence?: string[];
  /** Token usage for cost tracking */
  usage?: TokenUsage;
}

/**
 * Proposed update to an artefact
 */
export interface ProposedArtefactUpdate {
  /** Type of artefact to update */
  artefactType: string;
  /** The changes to make */
  changes: Record<string, unknown>;
  /** Why this change is recommended */
  rationale: string;
}

/**
 * Pattern identified across signals
 */
export interface SignalPattern {
  /** Type of pattern */
  patternType: 'escalating_risk' | 'recurring_blocker' | 'scope_drift' | 'communication_gap' | 'velocity_trend';
  /** Description of the pattern */
  description: string;
  /** Signal IDs involved in this pattern */
  signalsInvolved: string[];
  /** Severity of the pattern */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Risk assessment from reasoning
 */
export interface RiskAssessment {
  /** Overall risk level */
  level: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  /** Factors contributing to the risk */
  factors: string[];
  /** Possible mitigation options */
  mitigationOptions?: string[];
}

/**
 * Reasoning transparency data for activity feed
 *
 * This is stored with each action to enable the "why" view in the UI.
 */
export interface ReasoningTransparency {
  /** The reasoning output that led to this action */
  reasoning: ReasoningOutput;
  /** Source signals that triggered the reasoning */
  sourceSignals: SourceSignalSummary[];
  /** Confidence score details */
  confidenceDetails?: ConfidenceDetails;
  /** Timestamp of reasoning */
  reasonedAt: string;
  /** Model used for reasoning */
  model: 'haiku' | 'sonnet';
  /** Token usage */
  usage?: TokenUsage;
}

/**
 * Summary of a source signal for transparency display
 */
export interface SourceSignalSummary {
  /** Signal ID */
  id: string;
  /** Integration source */
  source: string;
  /** Signal type */
  type: string;
  /** Brief summary */
  summary: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Confidence details for transparency display
 */
export interface ConfidenceDetails {
  /** Whether auto-execution was allowed */
  canAutoExecute: boolean;
  /** Overall confidence score (0-1) */
  overallScore: number;
  /** Individual dimension scores */
  dimensions: {
    sourceAgreement: DimensionDetail;
    boundaryCompliance: DimensionDetail;
    schemaValidity: DimensionDetail;
    precedentMatch: DimensionDetail;
  };
  /** Reasons why auto-execution was blocked (if applicable) */
  blockingReasons?: string[];
}

/**
 * Detail for a single confidence dimension
 */
export interface DimensionDetail {
  /** Human-readable label */
  label: string;
  /** Whether this dimension passed */
  pass: boolean;
  /** Numeric score (0-1) */
  score: number;
  /** Evidence/explanation */
  evidence: string;
}

/**
 * Reasoning result with all transparency data
 *
 * Used by the reasoning Lambda to return complete results.
 */
export interface ReasoningResult {
  /** The primary reasoning output */
  output: ReasoningOutput;
  /** Transparency data for the activity feed */
  transparency: ReasoningTransparency;
  /** Whether the action should proceed */
  shouldProceed: boolean;
  /** If not proceeding, the reason */
  holdReason?: string;
}
