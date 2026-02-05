/**
 * Confidence scoring
 *
 * Four-dimensional confidence scoring that is NEVER based on LLM self-reporting.
 * All dimensions are computed deterministically.
 *
 * The four dimensions are:
 * 1. Source Agreement - Do multiple sources corroborate the signal?
 * 2. Boundary Compliance - Is the action within defined decision boundaries?
 * 3. Schema Validity - Did Claude return valid structured output?
 * 4. Precedent Match - Has this type of action succeeded before?
 *
 * Auto-execution is ONLY allowed when ALL four dimensions pass.
 */

import type {
  ActionType,
  AgentAction,
  ClassifiedSignal,
  ConfidenceDimensions,
  ConfidenceScore,
  DimensionScore,
} from '../types/index.js';

import { DECISION_BOUNDARIES } from './boundaries.js';

/**
 * Input for confidence scoring with reasoning context
 */
export interface ConfidenceInput {
  /** The type of action being proposed */
  actionType: ActionType;
  /** Signals supporting this action */
  signals: ClassifiedSignal[];
  /** Historical actions of similar type */
  precedents: AgentAction[];
  /** Whether the action passed schema validation */
  schemaValid: boolean;
  /** Optional: LLM rationale for the action */
  llmRationale?: string;
  /** Optional: Project ID for context */
  projectId?: string;
}

/**
 * Compute confidence score for a proposed action
 *
 * @param actionType - The type of action being proposed
 * @param signals - Signals supporting this action
 * @param precedents - Historical actions of similar type
 * @param schemaValid - Whether the action passed schema validation
 * @returns Multi-dimensional confidence score
 */
export function checkConfidence(
  actionType: ActionType,
  signals: ClassifiedSignal[],
  precedents: AgentAction[],
  schemaValid: boolean
): ConfidenceScore {
  const dimensions: ConfidenceDimensions = {
    sourceAgreement: computeSourceAgreement(signals),
    boundaryCompliance: computeBoundaryCompliance(actionType),
    schemaValidity: computeSchemaValidity(schemaValid),
    precedentMatch: computePrecedentMatch(actionType, precedents),
  };

  // All dimensions must pass for overall pass (auto-execute eligibility)
  const pass = Object.values(dimensions).every((d) => d.pass);

  return {
    pass,
    dimensions,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Compute confidence score with extended input
 *
 * @param input - Structured confidence input
 * @returns Multi-dimensional confidence score with rationale
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceScore {
  return checkConfidence(
    input.actionType,
    input.signals,
    input.precedents,
    input.schemaValid
  );
}

/**
 * Check if an action can be auto-executed based on confidence score
 *
 * Auto-execution requires ALL four dimensions to pass:
 * - Multiple sources agreeing (at least 1 source)
 * - Action within decision boundaries
 * - Valid schema from LLM
 * - Historical precedent of success
 *
 * @param confidence - The confidence score to check
 * @returns true if all dimensions pass
 */
export function canAutoExecute(confidence: ConfidenceScore): boolean {
  return confidence.pass;
}

/**
 * Get a human-readable summary of why an action cannot be auto-executed
 *
 * @param confidence - The confidence score
 * @returns Array of reasons why auto-execution is blocked
 */
export function getBlockingReasons(confidence: ConfidenceScore): string[] {
  const reasons: string[] = [];

  if (!confidence.dimensions.sourceAgreement.pass) {
    reasons.push(
      `Source agreement failed: ${confidence.dimensions.sourceAgreement.evidence}`
    );
  }
  if (!confidence.dimensions.boundaryCompliance.pass) {
    reasons.push(
      `Boundary compliance failed: ${confidence.dimensions.boundaryCompliance.evidence}`
    );
  }
  if (!confidence.dimensions.schemaValidity.pass) {
    reasons.push(
      `Schema validity failed: ${confidence.dimensions.schemaValidity.evidence}`
    );
  }
  if (!confidence.dimensions.precedentMatch.pass) {
    reasons.push(
      `Precedent match failed: ${confidence.dimensions.precedentMatch.evidence}`
    );
  }

  return reasons;
}

/**
 * Format confidence score for display in activity feed
 *
 * @param confidence - The confidence score
 * @returns Formatted display object
 */
export function formatConfidenceForDisplay(
  confidence: ConfidenceScore
): ConfidenceDisplay {
  const { dimensions } = confidence;

  return {
    canAutoExecute: confidence.pass,
    overallScore: calculateOverallScore(dimensions),
    dimensions: {
      sourceAgreement: {
        label: 'Source Agreement',
        pass: dimensions.sourceAgreement.pass,
        score: dimensions.sourceAgreement.score,
        evidence: dimensions.sourceAgreement.evidence,
        description: 'Do multiple sources corroborate?',
      },
      boundaryCompliance: {
        label: 'Boundary Compliance',
        pass: dimensions.boundaryCompliance.pass,
        score: dimensions.boundaryCompliance.score,
        evidence: dimensions.boundaryCompliance.evidence,
        description: 'Is action within defined boundaries?',
      },
      schemaValidity: {
        label: 'Schema Validity',
        pass: dimensions.schemaValidity.pass,
        score: dimensions.schemaValidity.score,
        evidence: dimensions.schemaValidity.evidence,
        description: 'Did Claude return valid structured output?',
      },
      precedentMatch: {
        label: 'Precedent Match',
        pass: dimensions.precedentMatch.pass,
        score: dimensions.precedentMatch.score,
        evidence: dimensions.precedentMatch.evidence,
        description: 'Has this type of action succeeded before?',
      },
    },
    blockingReasons: getBlockingReasons(confidence),
    scoredAt: confidence.scoredAt,
  };
}

/**
 * Display format for confidence score
 */
export interface ConfidenceDisplay {
  canAutoExecute: boolean;
  overallScore: number;
  dimensions: {
    sourceAgreement: DimensionDisplay;
    boundaryCompliance: DimensionDisplay;
    schemaValidity: DimensionDisplay;
    precedentMatch: DimensionDisplay;
  };
  blockingReasons: string[];
  scoredAt: string;
}

/**
 * Display format for a single dimension
 */
export interface DimensionDisplay {
  label: string;
  pass: boolean;
  score: number;
  evidence: string;
  description: string;
}

/**
 * Calculate overall score as average of dimension scores
 */
function calculateOverallScore(dimensions: ConfidenceDimensions): number {
  const scores = [
    dimensions.sourceAgreement.score,
    dimensions.boundaryCompliance.score,
    dimensions.schemaValidity.score,
    dimensions.precedentMatch.score,
  ];
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Source Agreement: Do multiple sources corroborate?
 */
function computeSourceAgreement(signals: ClassifiedSignal[]): DimensionScore {
  // Count unique sources
  const sources = new Set(signals.map((s) => s.source));
  const sourceCount = sources.size;

  // Score based on number of corroborating sources
  const score = Math.min(sourceCount / 2, 1); // Max score at 2+ sources
  const pass = sourceCount >= 1; // At least one source required

  return {
    pass,
    score,
    evidence: `${sourceCount} source(s): ${Array.from(sources).join(', ')}`,
  };
}

/**
 * Boundary Compliance: Is action within defined boundaries?
 */
function computeBoundaryCompliance(actionType: ActionType): DimensionScore {
  const canAuto = (
    DECISION_BOUNDARIES.autoExecute as readonly string[]
  ).includes(actionType);
  const needsHold = (
    DECISION_BOUNDARIES.requireHoldQueue as readonly string[]
  ).includes(actionType);
  const needsApproval = (
    DECISION_BOUNDARIES.requireApproval as readonly string[]
  ).includes(actionType);
  const prohibited = (
    DECISION_BOUNDARIES.neverDo as readonly string[]
  ).includes(actionType);

  if (prohibited) {
    return {
      pass: false,
      score: 0,
      evidence: `Action "${actionType}" is in neverDo list`,
    };
  }

  if (canAuto) {
    return {
      pass: true,
      score: 1,
      evidence: `Action "${actionType}" can be auto-executed`,
    };
  }

  if (needsHold) {
    return {
      pass: true,
      score: 0.7,
      evidence: `Action "${actionType}" requires hold queue`,
    };
  }

  if (needsApproval) {
    return {
      pass: true,
      score: 0.5,
      evidence: `Action "${actionType}" requires user approval`,
    };
  }

  // Unknown action type
  return {
    pass: false,
    score: 0,
    evidence: `Action "${actionType}" not in any boundary list`,
  };
}

/**
 * Schema Validity: Did the LLM return valid structured output?
 */
function computeSchemaValidity(schemaValid: boolean): DimensionScore {
  return {
    pass: schemaValid,
    score: schemaValid ? 1 : 0,
    evidence: schemaValid
      ? 'Output passed Zod schema validation'
      : 'Output failed Zod schema validation',
  };
}

/**
 * Precedent Match: Has this type of action succeeded before?
 */
function computePrecedentMatch(
  actionType: ActionType,
  precedents: AgentAction[]
): DimensionScore {
  // Filter to matching action types that were executed successfully
  const matchingPrecedents = precedents.filter(
    (p) => p.actionType === actionType && p.executed
  );

  const count = matchingPrecedents.length;
  const score = Math.min(count / 3, 1); // Max score at 3+ precedents
  const pass = count >= 1; // At least one precedent recommended

  return {
    pass,
    score,
    evidence: `${count} successful precedent(s) for "${actionType}"`,
  };
}
