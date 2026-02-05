/**
 * Signal classification
 *
 * Uses Claude Haiku to classify signals and recommend actions.
 * This module will be implemented in Sprint 2 (LLM Integration).
 */

import type { ClassifiedSignal, SanitisedSignal, SignalClassification } from '../types/index.js';

/**
 * Classify a sanitised signal using Claude Haiku
 *
 * @param signal - The sanitised signal to classify
 * @returns The classified signal with importance and recommended action
 *
 * TODO: Implement in Sprint 2 with Claude API integration
 */
export async function classifySignal(
  signal: SanitisedSignal
): Promise<ClassifiedSignal> {
  // Stub implementation - returns a default classification
  // Real implementation will use Claude Haiku via @agentic-pm/core/llm

  const classification: SignalClassification = {
    importance: 'medium',
    categories: ['routine_update'],
    recommendedAction: 'update_artefact',
    requiresComplexReasoning: false,
    rationale: 'Stub classification - awaiting LLM integration',
  };

  return {
    ...signal,
    classification,
  };
}
