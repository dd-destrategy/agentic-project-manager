/**
 * Confidence Scoring Tests
 *
 * Comprehensive tests for 4-dimensional confidence scoring.
 * Tests all dimensions: sourceAgreement, boundaryCompliance, schemaValidity, precedentMatch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkConfidence,
  computeConfidence,
  canAutoExecute,
  getBlockingReasons,
  formatConfidenceForDisplay,
  type ConfidenceInput,
  type ConfidenceDisplay,
} from './confidence.js';
import type {
  ActionType,
  AgentAction,
  ClassifiedSignal,
  ConfidenceScore,
  ConfidenceDimensions,
} from '../types/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSignal(
  source: 'jira' | 'outlook',
  overrides: Partial<ClassifiedSignal> = {}
): ClassifiedSignal {
  return {
    id: `signal-${Math.random().toString(36).substring(7)}`,
    source,
    timestamp: new Date().toISOString(),
    type: 'ticket_updated',
    summary: 'Test signal summary',
    raw: { key: 'TEST-1' },
    projectId: 'project-001',
    sanitised: true,
    sanitisedSummary: 'Test signal summary',
    classification: {
      importance: 'medium',
      categories: ['routine_update'],
      recommendedAction: 'update_artefact',
      requiresComplexReasoning: false,
      rationale: 'Standard update',
    },
    ...overrides,
  };
}

function createMockPrecedent(
  actionType: ActionType,
  executed: boolean = true
): AgentAction {
  return {
    id: `action-${Math.random().toString(36).substring(7)}`,
    projectId: 'project-001',
    actionType,
    description: 'Test action',
    executed,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// Source Agreement Dimension Tests
// ============================================================================

describe('Source Agreement Dimension', () => {
  it('should pass with at least one source', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.dimensions.sourceAgreement.pass).toBe(true);
    expect(result.dimensions.sourceAgreement.score).toBe(0.5); // 1/2 = 0.5
    expect(result.dimensions.sourceAgreement.evidence).toContain('1 source(s)');
  });

  it('should score higher with multiple sources', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('outlook'),
    ];
    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.dimensions.sourceAgreement.pass).toBe(true);
    expect(result.dimensions.sourceAgreement.score).toBe(1); // 2/2 = 1 (capped at 1)
    expect(result.dimensions.sourceAgreement.evidence).toContain('2 source(s)');
  });

  it('should max out score at 2 unique sources', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('jira'),
      createMockSignal('outlook'),
    ];
    const result = checkConfidence('artefact_update', signals, [], true);

    // 2 unique sources (jira, outlook), score = min(2/2, 1) = 1
    expect(result.dimensions.sourceAgreement.score).toBe(1);
  });

  it('should fail with no sources', () => {
    const result = checkConfidence('artefact_update', [], [], true);

    expect(result.dimensions.sourceAgreement.pass).toBe(false);
    expect(result.dimensions.sourceAgreement.score).toBe(0);
    expect(result.dimensions.sourceAgreement.evidence).toContain('0 source(s)');
  });

  it('should list source names in evidence', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('outlook'),
    ];
    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.dimensions.sourceAgreement.evidence).toContain('jira');
    expect(result.dimensions.sourceAgreement.evidence).toContain('outlook');
  });

  it('should count unique sources only', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('jira'),
      createMockSignal('jira'),
    ];
    const result = checkConfidence('artefact_update', signals, [], true);

    // Only 1 unique source
    expect(result.dimensions.sourceAgreement.score).toBe(0.5);
    expect(result.dimensions.sourceAgreement.evidence).toContain('1 source(s)');
  });
});

// ============================================================================
// Boundary Compliance Dimension Tests
// ============================================================================

describe('Boundary Compliance Dimension', () => {
  describe('auto-execute actions', () => {
    const autoExecuteActions: ActionType[] = ['artefact_update', 'heartbeat_log', 'notification_sent', 'jira_comment'];

    autoExecuteActions.forEach((action) => {
      it(`should pass for auto-execute action: ${action}`, () => {
        const signals = [createMockSignal('jira')];
        const result = checkConfidence(action, signals, [], true);

        expect(result.dimensions.boundaryCompliance.pass).toBe(true);
        expect(result.dimensions.boundaryCompliance.score).toBe(1);
        expect(result.dimensions.boundaryCompliance.evidence).toContain('can be auto-executed');
      });
    });
  });

  describe('hold queue actions', () => {
    const holdQueueActions: ActionType[] = ['email_sent'];

    holdQueueActions.forEach((action) => {
      it(`should pass for hold queue action: ${action}`, () => {
        const signals = [createMockSignal('jira')];
        const result = checkConfidence(action, signals, [], true);

        expect(result.dimensions.boundaryCompliance.pass).toBe(true);
        expect(result.dimensions.boundaryCompliance.score).toBe(0.7);
        expect(result.dimensions.boundaryCompliance.evidence).toContain('requires hold queue');
      });
    });
  });

  describe('approval-required actions', () => {
    const approvalActions: ActionType[] = ['escalation_created'];

    approvalActions.forEach((action) => {
      it(`should pass for approval-required action: ${action}`, () => {
        const signals = [createMockSignal('jira')];
        const result = checkConfidence(action, signals, [], true);

        expect(result.dimensions.boundaryCompliance.pass).toBe(true);
        expect(result.dimensions.boundaryCompliance.score).toBe(0.5);
        expect(result.dimensions.boundaryCompliance.evidence).toContain('requires user approval');
      });
    });
  });

  describe('prohibited actions', () => {
    it('should fail for neverDo actions', () => {
      const signals = [createMockSignal('jira')];
      // Using a type assertion since 'delete_data' is not in ActionType
      const result = checkConfidence('delete_data' as ActionType, signals, [], true);

      expect(result.dimensions.boundaryCompliance.pass).toBe(false);
      expect(result.dimensions.boundaryCompliance.score).toBe(0);
      expect(result.dimensions.boundaryCompliance.evidence).toContain('neverDo');
    });
  });

  describe('unknown actions', () => {
    it('should fail for unknown action types', () => {
      const signals = [createMockSignal('jira')];
      const result = checkConfidence('unknown_action' as ActionType, signals, [], true);

      expect(result.dimensions.boundaryCompliance.pass).toBe(false);
      expect(result.dimensions.boundaryCompliance.score).toBe(0);
      expect(result.dimensions.boundaryCompliance.evidence).toContain('not in any boundary list');
    });
  });
});

// ============================================================================
// Schema Validity Dimension Tests
// ============================================================================

describe('Schema Validity Dimension', () => {
  it('should pass when schema is valid', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.dimensions.schemaValidity.pass).toBe(true);
    expect(result.dimensions.schemaValidity.score).toBe(1);
    expect(result.dimensions.schemaValidity.evidence).toContain('passed Zod schema validation');
  });

  it('should fail when schema is invalid', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], false);

    expect(result.dimensions.schemaValidity.pass).toBe(false);
    expect(result.dimensions.schemaValidity.score).toBe(0);
    expect(result.dimensions.schemaValidity.evidence).toContain('failed Zod schema validation');
  });

  it('should be binary (0 or 1 score)', () => {
    const signals = [createMockSignal('jira')];

    const validResult = checkConfidence('artefact_update', signals, [], true);
    const invalidResult = checkConfidence('artefact_update', signals, [], false);

    expect(validResult.dimensions.schemaValidity.score).toBe(1);
    expect(invalidResult.dimensions.schemaValidity.score).toBe(0);
  });
});

// ============================================================================
// Precedent Match Dimension Tests
// ============================================================================

describe('Precedent Match Dimension', () => {
  it('should pass with at least one successful precedent', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.dimensions.precedentMatch.pass).toBe(true);
    expect(result.dimensions.precedentMatch.evidence).toContain('1 successful precedent(s)');
  });

  it('should score higher with more precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.dimensions.precedentMatch.pass).toBe(true);
    expect(result.dimensions.precedentMatch.score).toBe(1); // 3/3 = 1 (capped)
    expect(result.dimensions.precedentMatch.evidence).toContain('3 successful precedent(s)');
  });

  it('should fail with no precedents', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.dimensions.precedentMatch.pass).toBe(false);
    expect(result.dimensions.precedentMatch.score).toBe(0);
    expect(result.dimensions.precedentMatch.evidence).toContain('0 successful precedent(s)');
  });

  it('should only count executed precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('artefact_update', false), // Not executed
      createMockPrecedent('artefact_update', false), // Not executed
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.dimensions.precedentMatch.pass).toBe(false);
    expect(result.dimensions.precedentMatch.score).toBe(0);
  });

  it('should only count matching action types', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('heartbeat_log', true), // Different action type
      createMockPrecedent('notification_sent', true), // Different action type
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.dimensions.precedentMatch.pass).toBe(false);
    expect(result.dimensions.precedentMatch.evidence).toContain('0 successful precedent(s)');
  });

  it('should max score at 3 precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    // Score should cap at 1 (min(5/3, 1) = 1)
    expect(result.dimensions.precedentMatch.score).toBe(1);
  });

  it('should calculate partial score for 1-2 precedents', () => {
    const signals = [createMockSignal('jira')];

    // 1 precedent: score = 1/3 ≈ 0.33
    const result1 = checkConfidence(
      'artefact_update',
      signals,
      [createMockPrecedent('artefact_update', true)],
      true
    );
    expect(result1.dimensions.precedentMatch.score).toBeCloseTo(1 / 3, 2);

    // 2 precedents: score = 2/3 ≈ 0.67
    const result2 = checkConfidence(
      'artefact_update',
      signals,
      [
        createMockPrecedent('artefact_update', true),
        createMockPrecedent('artefact_update', true),
      ],
      true
    );
    expect(result2.dimensions.precedentMatch.score).toBeCloseTo(2 / 3, 2);
  });
});

// ============================================================================
// Overall Pass/Fail Tests
// ============================================================================

describe('Overall Confidence Pass/Fail', () => {
  it('should pass only when ALL four dimensions pass', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.pass).toBe(true);
    expect(result.dimensions.sourceAgreement.pass).toBe(true);
    expect(result.dimensions.boundaryCompliance.pass).toBe(true);
    expect(result.dimensions.schemaValidity.pass).toBe(true);
    expect(result.dimensions.precedentMatch.pass).toBe(true);
  });

  it('should fail if sourceAgreement fails', () => {
    // No signals = no source agreement
    const precedents = [createMockPrecedent('artefact_update', true)];

    const result = checkConfidence('artefact_update', [], precedents, true);

    expect(result.pass).toBe(false);
    expect(result.dimensions.sourceAgreement.pass).toBe(false);
  });

  it('should fail if boundaryCompliance fails', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    // Unknown action type fails boundary compliance
    const result = checkConfidence('unknown_action' as ActionType, signals, precedents, true);

    expect(result.pass).toBe(false);
    expect(result.dimensions.boundaryCompliance.pass).toBe(false);
  });

  it('should fail if schemaValidity fails', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    const result = checkConfidence('artefact_update', signals, precedents, false);

    expect(result.pass).toBe(false);
    expect(result.dimensions.schemaValidity.pass).toBe(false);
  });

  it('should fail if precedentMatch fails', () => {
    const signals = [createMockSignal('jira')];
    // No precedents

    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.pass).toBe(false);
    expect(result.dimensions.precedentMatch.pass).toBe(false);
  });

  it('should fail if multiple dimensions fail', () => {
    // No signals, no precedents, invalid schema
    const result = checkConfidence('artefact_update', [], [], false);

    expect(result.pass).toBe(false);
    expect(result.dimensions.sourceAgreement.pass).toBe(false);
    expect(result.dimensions.schemaValidity.pass).toBe(false);
    expect(result.dimensions.precedentMatch.pass).toBe(false);
  });
});

// ============================================================================
// canAutoExecute Tests
// ============================================================================

describe('canAutoExecute', () => {
  it('should return true when confidence passes', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    expect(canAutoExecute(confidence)).toBe(true);
  });

  it('should return false when confidence fails', () => {
    const confidence = checkConfidence('artefact_update', [], [], false);

    expect(canAutoExecute(confidence)).toBe(false);
  });

  it('should be equivalent to checking confidence.pass', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    const passingConfidence = checkConfidence('artefact_update', signals, precedents, true);
    const failingConfidence = checkConfidence('artefact_update', [], [], false);

    expect(canAutoExecute(passingConfidence)).toBe(passingConfidence.pass);
    expect(canAutoExecute(failingConfidence)).toBe(failingConfidence.pass);
  });
});

// ============================================================================
// getBlockingReasons Tests
// ============================================================================

describe('getBlockingReasons', () => {
  it('should return empty array when all dimensions pass', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const reasons = getBlockingReasons(confidence);

    expect(reasons).toHaveLength(0);
  });

  it('should include sourceAgreement failure reason', () => {
    const confidence = checkConfidence('artefact_update', [], [], true);

    const reasons = getBlockingReasons(confidence);

    expect(reasons.some((r) => r.includes('Source agreement failed'))).toBe(true);
  });

  it('should include boundaryCompliance failure reason', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('unknown_action' as ActionType, true)];
    const confidence = checkConfidence('unknown_action' as ActionType, signals, precedents, true);

    const reasons = getBlockingReasons(confidence);

    expect(reasons.some((r) => r.includes('Boundary compliance failed'))).toBe(true);
  });

  it('should include schemaValidity failure reason', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, false);

    const reasons = getBlockingReasons(confidence);

    expect(reasons.some((r) => r.includes('Schema validity failed'))).toBe(true);
  });

  it('should include precedentMatch failure reason', () => {
    const signals = [createMockSignal('jira')];
    const confidence = checkConfidence('artefact_update', signals, [], true);

    const reasons = getBlockingReasons(confidence);

    expect(reasons.some((r) => r.includes('Precedent match failed'))).toBe(true);
  });

  it('should include all failure reasons when multiple dimensions fail', () => {
    const confidence = checkConfidence('unknown_action' as ActionType, [], [], false);

    const reasons = getBlockingReasons(confidence);

    expect(reasons.length).toBeGreaterThanOrEqual(3); // At least source, schema, precedent
  });

  it('should include evidence in failure reasons', () => {
    const confidence = checkConfidence('artefact_update', [], [], false);

    const reasons = getBlockingReasons(confidence);

    // Each reason should include the evidence from the dimension
    reasons.forEach((reason) => {
      expect(reason).toContain(':'); // Format is "X failed: evidence"
    });
  });
});

// ============================================================================
// computeConfidence Tests
// ============================================================================

describe('computeConfidence', () => {
  it('should compute confidence from structured input', () => {
    const input: ConfidenceInput = {
      actionType: 'artefact_update',
      signals: [createMockSignal('jira')],
      precedents: [createMockPrecedent('artefact_update', true)],
      schemaValid: true,
    };

    const result = computeConfidence(input);

    expect(result.pass).toBe(true);
    expect(result.dimensions).toBeDefined();
    expect(result.scoredAt).toBeDefined();
  });

  it('should be equivalent to checkConfidence', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    const input: ConfidenceInput = {
      actionType: 'artefact_update',
      signals,
      precedents,
      schemaValid: true,
    };

    const resultFromCompute = computeConfidence(input);
    const resultFromCheck = checkConfidence('artefact_update', signals, precedents, true);

    expect(resultFromCompute.pass).toBe(resultFromCheck.pass);
    expect(resultFromCompute.dimensions.sourceAgreement.pass).toBe(
      resultFromCheck.dimensions.sourceAgreement.pass
    );
    expect(resultFromCompute.dimensions.boundaryCompliance.pass).toBe(
      resultFromCheck.dimensions.boundaryCompliance.pass
    );
    expect(resultFromCompute.dimensions.schemaValidity.pass).toBe(
      resultFromCheck.dimensions.schemaValidity.pass
    );
    expect(resultFromCompute.dimensions.precedentMatch.pass).toBe(
      resultFromCheck.dimensions.precedentMatch.pass
    );
  });

  it('should handle optional fields', () => {
    const input: ConfidenceInput = {
      actionType: 'artefact_update',
      signals: [createMockSignal('jira')],
      precedents: [],
      schemaValid: false,
      llmRationale: 'Test rationale',
      projectId: 'project-123',
    };

    const result = computeConfidence(input);

    // Optional fields don't affect the core computation
    expect(result).toBeDefined();
    expect(result.pass).toBe(false); // Fails due to no precedents and invalid schema
  });
});

// ============================================================================
// formatConfidenceForDisplay Tests
// ============================================================================

describe('formatConfidenceForDisplay', () => {
  it('should format passing confidence correctly', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const display: ConfidenceDisplay = formatConfidenceForDisplay(confidence);

    expect(display.canAutoExecute).toBe(true);
    expect(display.blockingReasons).toHaveLength(0);
    expect(display.scoredAt).toBe(confidence.scoredAt);
  });

  it('should format failing confidence correctly', () => {
    const confidence = checkConfidence('artefact_update', [], [], false);

    const display = formatConfidenceForDisplay(confidence);

    expect(display.canAutoExecute).toBe(false);
    expect(display.blockingReasons.length).toBeGreaterThan(0);
  });

  it('should include all dimension details', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const display = formatConfidenceForDisplay(confidence);

    expect(display.dimensions.sourceAgreement).toBeDefined();
    expect(display.dimensions.boundaryCompliance).toBeDefined();
    expect(display.dimensions.schemaValidity).toBeDefined();
    expect(display.dimensions.precedentMatch).toBeDefined();
  });

  it('should include labels for each dimension', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const display = formatConfidenceForDisplay(confidence);

    expect(display.dimensions.sourceAgreement.label).toBe('Source Agreement');
    expect(display.dimensions.boundaryCompliance.label).toBe('Boundary Compliance');
    expect(display.dimensions.schemaValidity.label).toBe('Schema Validity');
    expect(display.dimensions.precedentMatch.label).toBe('Precedent Match');
  });

  it('should include descriptions for each dimension', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const display = formatConfidenceForDisplay(confidence);

    expect(display.dimensions.sourceAgreement.description).toContain('sources');
    expect(display.dimensions.boundaryCompliance.description).toContain('boundaries');
    expect(display.dimensions.schemaValidity.description).toContain('structured output');
    expect(display.dimensions.precedentMatch.description).toContain('succeeded');
  });

  it('should calculate overall score as average', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const confidence = checkConfidence('artefact_update', signals, precedents, true);

    const display = formatConfidenceForDisplay(confidence);

    const expectedScore =
      (confidence.dimensions.sourceAgreement.score +
        confidence.dimensions.boundaryCompliance.score +
        confidence.dimensions.schemaValidity.score +
        confidence.dimensions.precedentMatch.score) /
      4;

    expect(display.overallScore).toBeCloseTo(expectedScore, 5);
  });
});

// ============================================================================
// ConfidenceScore Structure Tests
// ============================================================================

describe('ConfidenceScore structure', () => {
  it('should include all required fields', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];
    const result: ConfidenceScore = checkConfidence('artefact_update', signals, precedents, true);

    expect(result).toHaveProperty('pass');
    expect(result).toHaveProperty('dimensions');
    expect(result).toHaveProperty('scoredAt');
    expect(typeof result.pass).toBe('boolean');
    expect(typeof result.scoredAt).toBe('string');
  });

  it('should have valid timestamp in scoredAt', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], true);

    const timestamp = new Date(result.scoredAt);
    expect(timestamp.getTime()).not.toBeNaN();
  });

  it('should include all dimension scores', () => {
    const signals = [createMockSignal('jira')];
    const result = checkConfidence('artefact_update', signals, [], true);

    const dimensions: ConfidenceDimensions = result.dimensions;

    expect(dimensions.sourceAgreement).toHaveProperty('pass');
    expect(dimensions.sourceAgreement).toHaveProperty('score');
    expect(dimensions.sourceAgreement).toHaveProperty('evidence');

    expect(dimensions.boundaryCompliance).toHaveProperty('pass');
    expect(dimensions.boundaryCompliance).toHaveProperty('score');
    expect(dimensions.boundaryCompliance).toHaveProperty('evidence');

    expect(dimensions.schemaValidity).toHaveProperty('pass');
    expect(dimensions.schemaValidity).toHaveProperty('score');
    expect(dimensions.schemaValidity).toHaveProperty('evidence');

    expect(dimensions.precedentMatch).toHaveProperty('pass');
    expect(dimensions.precedentMatch).toHaveProperty('score');
    expect(dimensions.precedentMatch).toHaveProperty('evidence');
  });

  it('should have scores between 0 and 1', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('outlook'),
    ];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
    ];
    const result = checkConfidence('artefact_update', signals, precedents, true);

    Object.values(result.dimensions).forEach((dim) => {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge cases', () => {
  it('should handle empty action type', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('' as ActionType, true)];

    const result = checkConfidence('' as ActionType, signals, precedents, true);

    // Empty action type is not in any boundary list
    expect(result.dimensions.boundaryCompliance.pass).toBe(false);
  });

  it('should handle very large number of signals', () => {
    const signals = Array.from({ length: 100 }, () => createMockSignal('jira'));
    const precedents = [createMockPrecedent('artefact_update', true)];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    // Should still work, score capped at 1
    expect(result.dimensions.sourceAgreement.score).toBeLessThanOrEqual(1);
  });

  it('should handle very large number of precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = Array.from({ length: 100 }, () =>
      createMockPrecedent('artefact_update', true)
    );

    const result = checkConfidence('artefact_update', signals, precedents, true);

    // Should still work, score capped at 1
    expect(result.dimensions.precedentMatch.score).toBe(1);
  });

  it('should handle mixed executed/not-executed precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', false),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', false),
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    // Only 2 executed precedents count
    expect(result.dimensions.precedentMatch.pass).toBe(true);
    expect(result.dimensions.precedentMatch.score).toBeCloseTo(2 / 3, 2);
  });

  it('should handle mixed action type precedents', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('heartbeat_log', true),
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('notification_sent', true),
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    // Only 2 matching action types count
    expect(result.dimensions.precedentMatch.score).toBeCloseTo(2 / 3, 2);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration scenarios', () => {
  it('should correctly evaluate a typical artefact update', () => {
    const signals = [
      createMockSignal('jira', { type: 'ticket_updated' }),
    ];
    const precedents = [
      createMockPrecedent('artefact_update', true),
      createMockPrecedent('artefact_update', true),
    ];

    const result = checkConfidence('artefact_update', signals, precedents, true);

    expect(result.pass).toBe(true);
    expect(canAutoExecute(result)).toBe(true);
    expect(getBlockingReasons(result)).toHaveLength(0);
  });

  it('should correctly evaluate a new action type without precedents', () => {
    const signals = [
      createMockSignal('jira'),
      createMockSignal('outlook'),
    ];
    // No precedents for this action type

    const result = checkConfidence('artefact_update', signals, [], true);

    expect(result.pass).toBe(false);
    expect(canAutoExecute(result)).toBe(false);

    const reasons = getBlockingReasons(result);
    expect(reasons.some((r) => r.includes('Precedent'))).toBe(true);
  });

  it('should correctly evaluate with validation failure', () => {
    const signals = [createMockSignal('jira')];
    const precedents = [createMockPrecedent('artefact_update', true)];

    // Schema validation failed
    const result = checkConfidence('artefact_update', signals, precedents, false);

    expect(result.pass).toBe(false);
    expect(canAutoExecute(result)).toBe(false);

    const reasons = getBlockingReasons(result);
    expect(reasons.some((r) => r.includes('Schema'))).toBe(true);
  });

  it('should handle the full confidence workflow', () => {
    // Step 1: Build input
    const input: ConfidenceInput = {
      actionType: 'artefact_update',
      signals: [createMockSignal('jira'), createMockSignal('outlook')],
      precedents: [
        createMockPrecedent('artefact_update', true),
        createMockPrecedent('artefact_update', true),
        createMockPrecedent('artefact_update', true),
      ],
      schemaValid: true,
      projectId: 'project-123',
    };

    // Step 2: Compute confidence
    const confidence = computeConfidence(input);

    // Step 3: Check if can auto-execute
    const canExecute = canAutoExecute(confidence);

    // Step 4: Get blocking reasons if any
    const reasons = getBlockingReasons(confidence);

    // Step 5: Format for display
    const display = formatConfidenceForDisplay(confidence);

    // Assertions
    expect(confidence.pass).toBe(true);
    expect(canExecute).toBe(true);
    expect(reasons).toHaveLength(0);
    expect(display.canAutoExecute).toBe(true);
    expect(display.overallScore).toBeGreaterThan(0.8); // High confidence
  });
});
