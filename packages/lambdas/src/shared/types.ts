/**
 * Shared types for Lambda handlers
 */

import type { NormalisedSignal, ClassifiedSignal, SanitisedSignal } from '@agentic-pm/core';

/**
 * Input for the agent cycle state machine
 */
export interface AgentCycleInput {
  /** Trigger source */
  source: 'scheduled' | 'manual';
  /** Optional project ID filter */
  projectId?: string;
}

/**
 * Output from heartbeat Lambda
 */
export interface HeartbeatOutput {
  /** Cycle ID for tracking */
  cycleId: string;
  /** Timestamp of heartbeat */
  timestamp: string;
  /** Active project IDs */
  activeProjects: string[];
  /** Integration health status */
  integrations: IntegrationStatus[];
  /** Is housekeeping due this cycle? */
  housekeepingDue: boolean;
}

/**
 * Output from change-detection Lambda
 */
export interface ChangeDetectionOutput {
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** Raw signals from integrations */
  signals: RawSignalBatch[];
}

/**
 * Batch of raw signals from a single source
 */
export interface RawSignalBatch {
  projectId: string;
  source: string;
  signals: unknown[];
  checkpoint: string;
}

/**
 * Output from normalise Lambda
 */
export interface NormaliseOutput {
  /** Normalised signals */
  signals: NormalisedSignal[];
}

/**
 * Output from triage-sanitise Lambda
 */
export interface TriageSanitiseOutput {
  /** Sanitised signals */
  signals: SanitisedSignal[];
}

/**
 * Output from triage-classify Lambda
 */
export interface TriageClassifyOutput {
  /** Classified signals */
  signals: ClassifiedSignal[];
  /** Does any signal need complex reasoning? */
  needsComplexReasoning: boolean;
}

/**
 * Output from reasoning Lambda
 */
export interface ReasoningOutput {
  /** Signals with reasoning applied */
  signals: ClassifiedSignal[];
  /** Proposed actions */
  proposedActions: ProposedAction[];
}

/**
 * Proposed action from reasoning
 */
export interface ProposedAction {
  actionType: string;
  projectId: string;
  details: Record<string, unknown>;
  rationale: string;
}

/**
 * Output from execute Lambda
 */
export interface ExecuteOutput {
  /** Actions executed */
  executed: number;
  /** Actions held */
  held: number;
  /** Escalations created */
  escalations: number;
}

/**
 * Output from artefact-update Lambda
 */
export interface ArtefactUpdateOutput {
  /** Artefacts updated */
  updated: string[];
}

/**
 * Integration health status
 */
export interface IntegrationStatus {
  name: string;
  healthy: boolean;
  lastCheck: string;
  error?: string;
}
