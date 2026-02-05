/**
 * Confidence scoring
 *
 * Four-dimensional confidence scoring that is NEVER based on LLM self-reporting.
 * All dimensions are computed deterministically.
 */

import type {
  ActionType,
  AgentAction,
  ClassifiedSignal,
  ConfidenceDimensions,
  ConfidenceScore,
  DimensionScore,
} from '../types/index.js';
import { DECISION_BOUNDARIES } from '../constants.js';

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

  // All dimensions must pass for overall pass
  const pass = Object.values(dimensions).every((d) => d.pass);

  return {
    pass,
    dimensions,
    scoredAt: new Date().toISOString(),
  };
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
  const canAuto = (DECISION_BOUNDARIES.canAutoExecute as readonly string[]).includes(actionType);
  const needsHold = (DECISION_BOUNDARIES.requireHoldQueue as readonly string[]).includes(actionType);
  const needsApproval = (DECISION_BOUNDARIES.requireApproval as readonly string[]).includes(actionType);
  const prohibited = (DECISION_BOUNDARIES.neverDo as readonly string[]).includes(actionType);

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
