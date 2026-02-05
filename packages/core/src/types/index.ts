/**
 * Core TypeScript types for Agentic PM
 *
 * Types are derived from Zod schemas to ensure consistency between
 * runtime validation and compile-time type checking.
 */

import { z } from 'zod';
import {
  // Primitive schemas
  ProjectStatusSchema,
  IntegrationSourceSchema,
  AutonomyLevelSchema,
  ArtefactTypeSchema,
  EventSeveritySchema,
  EventTypeSchema,
  EscalationStatusSchema,
  ActionTypeSchema,
  IntegrationStatusSchema,
  SignalTypeSchema,
  SignalCategorySchema,
  RecommendedActionSchema,
  // Entity schemas
  ProjectSchema,
  ProjectConfigSchema,
  ArtefactSchema,
  EventSchema,
  EventDetailSchema,
  EscalationSchema,
  EscalationContextSchema,
  EscalationOptionSchema,
  SignalReferenceSchema,
  ArtefactExcerptSchema,
  AgentActionSchema,
  ActionDetailSchema,
  AgentCheckpointSchema,
  IntegrationConfigSchema,
  ConfidenceScoreSchema,
  ConfidenceDimensionsSchema,
  DimensionScoreSchema,
  // Signal schemas
  NormalisedSignalSchema,
  SignalMetadataSchema,
  SanitisedSignalSchema,
  ClassifiedSignalSchema,
  SignalClassificationSchema,
  // Artefact content schemas
  ArtefactContentSchema,
  DeliveryStateContentSchema,
  RaidLogContentSchema,
  BacklogSummaryContentSchema,
  DecisionLogContentSchema,
  SprintInfoSchema,
  SprintProgressSchema,
  MilestoneSchema,
  BlockerSchema,
  KeyMetricsSchema,
  RaidItemSchema,
  DecisionSchema,
  DecisionOptionSchema,
  BacklogStatsSchema,
  BacklogHighlightSchema,
  RefinementCandidateSchema,
  // Discriminated union schemas
  DiscriminatedArtefactContentSchema,
  // Credential schemas
  JiraCredentialsSchema,
  OutlookCredentialsSchema,
  AzureADCredentialsSchema,
  SESConfigSchema,
  // API schemas
  WorkingHoursSchema,
} from '../schemas/index.js';

// ============================================================================
// Primitive Types (derived from Zod schemas)
// ============================================================================

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type IntegrationSource = z.infer<typeof IntegrationSourceSchema>;
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;
export type ArtefactType = z.infer<typeof ArtefactTypeSchema>;
export type EventSeverity = z.infer<typeof EventSeveritySchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type EscalationStatus = z.infer<typeof EscalationStatusSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
export type SignalType = z.infer<typeof SignalTypeSchema>;
export type SignalCategory = z.infer<typeof SignalCategorySchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

// ============================================================================
// Entity Types (derived from Zod schemas)
// ============================================================================

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Artefact = z.infer<typeof ArtefactSchema>;
export type Event = z.infer<typeof EventSchema>;
export type EventDetail = z.infer<typeof EventDetailSchema>;
export type Escalation = z.infer<typeof EscalationSchema>;
export type EscalationContext = z.infer<typeof EscalationContextSchema>;
export type EscalationOption = z.infer<typeof EscalationOptionSchema>;
export type SignalReference = z.infer<typeof SignalReferenceSchema>;
export type ArtefactExcerpt = z.infer<typeof ArtefactExcerptSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type ActionDetail = z.infer<typeof ActionDetailSchema>;
export type AgentCheckpoint = z.infer<typeof AgentCheckpointSchema>;
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

// ============================================================================
// Confidence Scoring Types (derived from Zod schemas)
// ============================================================================

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;
export type ConfidenceDimensions = z.infer<typeof ConfidenceDimensionsSchema>;
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

// ============================================================================
// Signal Types (derived from Zod schemas)
// ============================================================================

export type NormalisedSignal = z.infer<typeof NormalisedSignalSchema>;
export type SignalMetadata = z.infer<typeof SignalMetadataSchema>;
export type SanitisedSignal = z.infer<typeof SanitisedSignalSchema>;
export type ClassifiedSignal = z.infer<typeof ClassifiedSignalSchema>;
export type SignalClassification = z.infer<typeof SignalClassificationSchema>;

// RawSignal is not in schemas - keep manual definition
export interface RawSignal {
  source: IntegrationSource;
  timestamp: string;
  rawPayload: unknown;
}

// ============================================================================
// Artefact Content Types (derived from Zod schemas)
// ============================================================================

export type ArtefactContent = z.infer<typeof ArtefactContentSchema>;
export type DeliveryStateContent = z.infer<typeof DeliveryStateContentSchema>;
export type RaidLogContent = z.infer<typeof RaidLogContentSchema>;
export type BacklogSummaryContent = z.infer<typeof BacklogSummaryContentSchema>;
export type DecisionLogContent = z.infer<typeof DecisionLogContentSchema>;
export type SprintInfo = z.infer<typeof SprintInfoSchema>;
export type SprintProgress = z.infer<typeof SprintProgressSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Blocker = z.infer<typeof BlockerSchema>;
export type KeyMetrics = z.infer<typeof KeyMetricsSchema>;
export type RaidItem = z.infer<typeof RaidItemSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type DecisionOption = z.infer<typeof DecisionOptionSchema>;
export type BacklogStats = z.infer<typeof BacklogStatsSchema>;
export type BacklogHighlight = z.infer<typeof BacklogHighlightSchema>;
export type RefinementCandidate = z.infer<typeof RefinementCandidateSchema>;

// ============================================================================
// Discriminated Artefact Content Union
// ============================================================================

/**
 * Discriminated union for artefact content with explicit type field.
 * Use this for type-safe content handling with narrowing support.
 */
export type DiscriminatedArtefactContent = z.infer<
  typeof DiscriminatedArtefactContentSchema
>;

export type DiscriminatedDeliveryState = {
  type: 'delivery_state';
  data: DeliveryStateContent;
};

export type DiscriminatedRaidLog = {
  type: 'raid_log';
  data: RaidLogContent;
};

export type DiscriminatedBacklogSummary = {
  type: 'backlog_summary';
  data: BacklogSummaryContent;
};

export type DiscriminatedDecisionLog = {
  type: 'decision_log';
  data: DecisionLogContent;
};

// ============================================================================
// Credential Types (derived from Zod schemas)
// ============================================================================

export type JiraCredentials = z.infer<typeof JiraCredentialsSchema>;
export type OutlookCredentials = z.infer<typeof OutlookCredentialsSchema>;
export type AzureADCredentials = z.infer<typeof AzureADCredentialsSchema>;
export type SESConfig = z.infer<typeof SESConfigSchema>;

// ============================================================================
// API Types
// ============================================================================

export type WorkingHours = z.infer<typeof WorkingHoursSchema>;

// These types don't have schemas yet - keep manual definitions
export interface LlmSplit {
  haikuPercent: number;
  sonnetPercent: number;
}

export interface AgentConfig {
  pollingIntervalMinutes: number;
  budgetCeilingDailyUsd: number;
  holdQueueMinutes: number;
  workingHours: WorkingHours;
  llmSplit: LlmSplit;
  /** Global autonomy level for the agent */
  autonomyLevel: AutonomyLevel;
  /** Whether dry-run mode is enabled (log but don't execute) */
  dryRun: boolean;
}

/**
 * Autonomy settings for UI and API
 */
export interface AutonomySettings {
  /** Current autonomy level */
  autonomyLevel: AutonomyLevel;
  /** Whether dry-run mode is enabled */
  dryRun: boolean;
  /** Timestamp of last autonomy level change */
  lastLevelChange?: string;
  /** Acknowledgement required for level change */
  pendingAcknowledgement?: AutonomyChangeAcknowledgement;
}

/**
 * Acknowledgement for autonomy level change
 */
export interface AutonomyChangeAcknowledgement {
  /** Previous autonomy level */
  fromLevel: AutonomyLevel;
  /** New autonomy level */
  toLevel: AutonomyLevel;
  /** When the change was requested */
  requestedAt: string;
  /** Whether the agent has acknowledged the change */
  acknowledged: boolean;
  /** When the agent acknowledged */
  acknowledgedAt?: string;
}

/**
 * Dry-run execution result
 */
export interface DryRunResult {
  /** The action that would have been executed */
  actionType: string;
  /** Whether execution was skipped due to dry-run */
  executed: false;
  /** Reason for not executing */
  reason: 'dry_run';
  /** What would have happened */
  wouldExecute: boolean;
  /** Details about what would have been done */
  plannedAction?: Record<string, unknown>;
}

export interface BudgetStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}

export interface IntegrationHealthStatus {
  name: IntegrationSource;
  status: 'healthy' | 'degraded' | 'error';
  lastCheck: string;
  errorMessage?: string;
}

// ============================================================================
// Type Guards (using Zod for runtime validation)
// ============================================================================

/**
 * Type guard for Project using Zod schema validation
 */
export function isProject(data: unknown): data is Project {
  return ProjectSchema.safeParse(data).success;
}

/**
 * Type guard for Artefact using Zod schema validation
 */
export function isArtefact(data: unknown): data is Artefact {
  return ArtefactSchema.safeParse(data).success;
}

/**
 * Type guard for Event using Zod schema validation
 */
export function isEvent(data: unknown): data is Event {
  return EventSchema.safeParse(data).success;
}

/**
 * Type guard for Escalation using Zod schema validation
 */
export function isEscalation(data: unknown): data is Escalation {
  return EscalationSchema.safeParse(data).success;
}

/**
 * Type guard for AgentAction using Zod schema validation
 */
export function isAgentAction(data: unknown): data is AgentAction {
  return AgentActionSchema.safeParse(data).success;
}

/**
 * Type guard for NormalisedSignal using Zod schema validation
 */
export function isNormalisedSignal(data: unknown): data is NormalisedSignal {
  return NormalisedSignalSchema.safeParse(data).success;
}

/**
 * Type guard for SanitisedSignal using Zod schema validation
 */
export function isSanitisedSignal(data: unknown): data is SanitisedSignal {
  return SanitisedSignalSchema.safeParse(data).success;
}

/**
 * Type guard for ClassifiedSignal using Zod schema validation
 */
export function isClassifiedSignal(data: unknown): data is ClassifiedSignal {
  return ClassifiedSignalSchema.safeParse(data).success;
}

/**
 * Type guard for JiraCredentials using Zod schema validation
 */
export function isJiraCredentials(data: unknown): data is JiraCredentials {
  return JiraCredentialsSchema.safeParse(data).success;
}

/**
 * Type guard for OutlookCredentials using Zod schema validation
 */
export function isOutlookCredentials(
  data: unknown
): data is OutlookCredentials {
  return OutlookCredentialsSchema.safeParse(data).success;
}

/**
 * Type guard for SESConfig using Zod schema validation
 */
export function isSESConfig(data: unknown): data is SESConfig {
  return SESConfigSchema.safeParse(data).success;
}

// ============================================================================
// Artefact Content Type Guards
// ============================================================================

/**
 * Type guard for DeliveryStateContent
 */
export function isDeliveryStateContent(
  data: unknown
): data is DeliveryStateContent {
  return DeliveryStateContentSchema.safeParse(data).success;
}

/**
 * Type guard for RaidLogContent
 */
export function isRaidLogContent(data: unknown): data is RaidLogContent {
  return RaidLogContentSchema.safeParse(data).success;
}

/**
 * Type guard for BacklogSummaryContent
 */
export function isBacklogSummaryContent(
  data: unknown
): data is BacklogSummaryContent {
  return BacklogSummaryContentSchema.safeParse(data).success;
}

/**
 * Type guard for DecisionLogContent
 */
export function isDecisionLogContent(
  data: unknown
): data is DecisionLogContent {
  return DecisionLogContentSchema.safeParse(data).success;
}

// ============================================================================
// Parse Functions (Zod validation with error handling)
// ============================================================================

/**
 * Parse and validate JSON as Project, throwing on invalid data
 */
export function parseProject(data: unknown): Project {
  return ProjectSchema.parse(data);
}

/**
 * Parse and validate JSON as Artefact, throwing on invalid data
 */
export function parseArtefact(data: unknown): Artefact {
  return ArtefactSchema.parse(data);
}

/**
 * Parse and validate JSON as Event, throwing on invalid data
 */
export function parseEvent(data: unknown): Event {
  return EventSchema.parse(data);
}

/**
 * Parse and validate JSON as JiraCredentials, throwing on invalid data
 */
export function parseJiraCredentials(data: unknown): JiraCredentials {
  return JiraCredentialsSchema.parse(data);
}

/**
 * Parse and validate JSON as OutlookCredentials, throwing on invalid data
 */
export function parseOutlookCredentials(data: unknown): OutlookCredentials {
  return OutlookCredentialsSchema.parse(data);
}

/**
 * Parse and validate JSON as SESConfig, throwing on invalid data
 */
export function parseSESConfig(data: unknown): SESConfig {
  return SESConfigSchema.parse(data);
}

// ============================================================================
// Re-export schemas for direct access
// ============================================================================

export {
  ProjectSchema,
  ArtefactSchema,
  EventSchema,
  EscalationSchema,
  AgentActionSchema,
  NormalisedSignalSchema,
  SanitisedSignalSchema,
  ClassifiedSignalSchema,
  JiraCredentialsSchema,
  OutlookCredentialsSchema,
  SESConfigSchema,
  DiscriminatedArtefactContentSchema,
  DeliveryStateContentSchema,
  RaidLogContentSchema,
  BacklogSummaryContentSchema,
  DecisionLogContentSchema,
};
