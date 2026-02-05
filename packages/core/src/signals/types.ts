/**
 * Signal normalisation types
 */

import type { IntegrationSource, NormalisedSignal, RawSignal } from '../types/index.js';

/**
 * Interface for signal normalisation functions
 */
export interface SignalNormaliser {
  source: IntegrationSource;
  normalise(raw: RawSignal, projectId: string): NormalisedSignal;
}
