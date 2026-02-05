/**
 * Zod validation schemas for Agentic PM
 *
 * These schemas provide runtime validation for all data structures.
 * Derived from SPEC.md and solution-design/02-api-schemas.md
 */

import { z } from 'zod';

// ============================================================================
// Primitive Schemas
// ============================================================================

export const ProjectStatusSchema = z.enum(['active', 'paused', 'archived']);

export const IntegrationSourceSchema = z.enum([
  'jira',
  'outlook',
  'asana',
  'ses',
]);

export const AutonomyLevelSchema = z.enum([
  'monitoring',
  'artefact',
  'tactical',
]);

export const ArtefactTypeSchema = z.enum([
  'delivery_state',
  'raid_log',
  'backlog_summary',
  'decision_log',
]);

export const EventSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'critical',
]);

export const EventTypeSchema = z.enum([
  'heartbeat',
  'heartbeat_with_changes',
  'signal_detected',
  'action_taken',
  'action_held',
  'action_approved',
  'action_rejected',
  'escalation_created',
  'escalation_decided',
  'escalation_expired',
  'artefact_updated',
  'integration_error',
  'budget_warning',
  'error',
]);

export const EscalationStatusSchema = z.enum([
  'pending',
  'decided',
  'expired',
  'superseded',
]);

export const ActionTypeSchema = z.enum([
  'artefact_update',
  'email_sent',
  'email_held',
  'jira_comment',
  'jira_status_change',
  'jira_status_change_held',
  'escalation_created',
  'notification_sent',
]);

export const IntegrationStatusSchema = z.enum(['active', 'inactive', 'error']);

export const SignalTypeSchema = z.enum([
  'ticket_created',
  'ticket_updated',
  'ticket_status_changed',
  'ticket_assigned',
  'ticket_commented',
  'sprint_started',
  'sprint_closed',
  'sprint_scope_changed',
  'email_received',
  'email_thread_updated',
  'unknown',
]);

export const SignalCategorySchema = z.enum([
  'blocker',
  'risk',
  'scope_change',
  'deadline_impact',
  'stakeholder_communication',
  'routine_update',
  'noise',
]);

export const RecommendedActionSchema = z.enum([
  'update_artefact',
  'create_escalation',
  'send_notification',
  'hold_for_review',
  'ignore',
]);

// ISO 8601 datetime string
export const IsoDateTimeSchema = z.string().datetime();

// UUID v4
export const UuidSchema = z.string().uuid();

// ULID (26 character base32 string)
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

// ============================================================================
// Entity Schemas
// ============================================================================

export const ProjectConfigSchema = z.object({
  pollingIntervalMinutes: z.number().min(5).max(60).optional(),
  holdQueueMinutes: z.number().min(1).max(120).optional(),
  jiraBoardId: z.string().optional(),
  monitoredEmails: z.array(z.string().email()).optional(),
});

export const ProjectSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: ProjectStatusSchema,
  source: IntegrationSourceSchema,
  sourceProjectKey: z.string().min(1).max(50),
  autonomyLevel: AutonomyLevelSchema,
  config: ProjectConfigSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const EventDetailSchema = z.object({
  source: z.string().optional(),
  relatedIds: z
    .object({
      artefactId: z.string().optional(),
      escalationId: z.string().optional(),
      actionId: z.string().optional(),
      signalId: z.string().optional(),
    })
    .optional(),
  metrics: z
    .object({
      durationMs: z.number().optional(),
      tokensUsed: z.number().optional(),
      costUsd: z.number().optional(),
    })
    .optional(),
  context: z.record(z.unknown()).optional(),
});

export const EventSchema = z.object({
  id: UlidSchema,
  projectId: UuidSchema.optional(),
  eventType: EventTypeSchema,
  severity: EventSeveritySchema,
  summary: z.string().min(1).max(500),
  detail: EventDetailSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const SignalReferenceSchema = z.object({
  source: IntegrationSourceSchema,
  type: z.string(),
  summary: z.string(),
  timestamp: IsoDateTimeSchema,
});

export const ArtefactExcerptSchema = z.object({
  artefactType: ArtefactTypeSchema,
  excerpt: z.string(),
});

export const EscalationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  description: z.string().max(1000),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export const EscalationContextSchema = z.object({
  summary: z.string().min(1).max(2000),
  triggeringSignals: z.array(SignalReferenceSchema),
  relevantArtefacts: z.array(ArtefactExcerptSchema).optional(),
  precedents: z.array(z.string()).optional(),
});

export const EscalationSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  title: z.string().min(1).max(200),
  context: EscalationContextSchema,
  options: z.array(EscalationOptionSchema).min(2).max(5),
  agentRecommendation: z.string().optional(),
  agentRationale: z.string().max(1000).optional(),
  status: EscalationStatusSchema,
  userDecision: z.string().optional(),
  userNotes: z.string().max(2000).optional(),
  decidedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const DimensionScoreSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  evidence: z.string(),
});

export const ConfidenceDimensionsSchema = z.object({
  sourceAgreement: DimensionScoreSchema,
  boundaryCompliance: DimensionScoreSchema,
  schemaValidity: DimensionScoreSchema,
  precedentMatch: DimensionScoreSchema,
});

export const ConfidenceScoreSchema = z.object({
  pass: z.boolean(),
  dimensions: ConfidenceDimensionsSchema,
  scoredAt: IsoDateTimeSchema,
});

export const ActionDetailSchema = z.object({
  target: z
    .object({
      type: z.enum(['artefact', 'jira_ticket', 'email', 'escalation']),
      id: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  changes: z
    .object({
      before: z.unknown().optional(),
      after: z.unknown().optional(),
    })
    .optional(),
  draftContent: z.string().optional(),
  holdReason: z.string().optional(),
});

export const AgentActionSchema = z.object({
  id: UlidSchema,
  projectId: UuidSchema.optional(),
  actionType: ActionTypeSchema,
  description: z.string().min(1).max(500),
  detail: ActionDetailSchema.optional(),
  confidence: ConfidenceScoreSchema.optional(),
  executed: z.boolean(),
  heldUntil: IsoDateTimeSchema.optional(),
  executedAt: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
});

export const AgentCheckpointSchema = z.object({
  projectId: UuidSchema,
  integration: IntegrationSourceSchema,
  checkpointKey: z.string().min(1).max(100),
  checkpointValue: z.string(),
  updatedAt: IsoDateTimeSchema,
});

export const IntegrationConfigSchema = z.object({
  id: UuidSchema,
  integration: IntegrationSourceSchema,
  configEncrypted: z.string(),
  status: IntegrationStatusSchema,
  lastHealthCheck: IsoDateTimeSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

// ============================================================================
// Signal Schemas
// ============================================================================

export const SignalMetadataSchema = z.object({
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  participants: z.array(z.string()).optional(),
  relatedTickets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const NormalisedSignalSchema = z.object({
  id: UlidSchema,
  source: IntegrationSourceSchema,
  timestamp: IsoDateTimeSchema,
  type: SignalTypeSchema,
  summary: z.string().min(1).max(500),
  raw: z.record(z.unknown()),
  projectId: UuidSchema,
  metadata: SignalMetadataSchema.optional(),
});

export const SanitisedSignalSchema = NormalisedSignalSchema.extend({
  sanitised: z.literal(true),
  sanitisedSummary: z.string().min(1).max(500),
  sanitisationNotes: z.array(z.string()).optional(),
});

export const SignalClassificationSchema = z.object({
  importance: z.enum(['critical', 'high', 'medium', 'low', 'noise']),
  categories: z.array(SignalCategorySchema),
  recommendedAction: RecommendedActionSchema,
  requiresComplexReasoning: z.boolean(),
  rationale: z.string().max(500),
});

export const ClassifiedSignalSchema = SanitisedSignalSchema.extend({
  classification: SignalClassificationSchema,
});

// ============================================================================
// Artefact Content Schemas
// ============================================================================

export const SprintProgressSchema = z.object({
  totalPoints: z.number().min(0),
  completedPoints: z.number().min(0),
  inProgressPoints: z.number().min(0),
  blockedPoints: z.number().min(0),
});

export const SprintInfoSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: IsoDateTimeSchema,
  endDate: IsoDateTimeSchema,
  goal: z.string().max(500),
  progress: SprintProgressSchema,
});

export const MilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  dueDate: IsoDateTimeSchema,
  status: z.enum(['on_track', 'at_risk', 'delayed', 'completed']),
  notes: z.string().max(500).optional(),
});

export const BlockerSchema = z.object({
  id: z.string().min(1).max(20),
  description: z.string().min(1).max(500),
  owner: z.string().min(1).max(100),
  raisedDate: IsoDateTimeSchema,
  severity: z.enum(['high', 'medium', 'low']),
  sourceTicket: z.string().max(50).optional(),
});

export const KeyMetricsSchema = z.object({
  velocityTrend: z.enum(['increasing', 'stable', 'decreasing']),
  avgCycleTimeDays: z.number().min(0),
  openBlockers: z.number().min(0),
  activeRisks: z.number().min(0),
});

export const DeliveryStateContentSchema = z.object({
  overallStatus: z.enum(['green', 'amber', 'red']),
  statusSummary: z.string().min(1).max(1000),
  currentSprint: SprintInfoSchema.optional(),
  milestones: z.array(MilestoneSchema),
  blockers: z.array(BlockerSchema),
  keyMetrics: KeyMetricsSchema,
  nextActions: z.array(z.string().max(200)).max(10),
});

export const RaidItemSchema = z.object({
  id: z.string().min(1).max(20),
  type: z.enum(['risk', 'assumption', 'issue', 'dependency']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'mitigating', 'resolved', 'accepted', 'closed']),
  owner: z.string().min(1).max(100),
  raisedDate: IsoDateTimeSchema,
  dueDate: IsoDateTimeSchema.optional(),
  mitigation: z.string().max(1000).optional(),
  resolution: z.string().max(1000).optional(),
  resolvedDate: IsoDateTimeSchema.optional(),
  source: z.enum(['agent_detected', 'user_added', 'integration_signal']),
  sourceReference: z.string().max(100).optional(),
  lastReviewed: IsoDateTimeSchema,
});

export const RaidLogContentSchema = z.object({
  items: z.array(RaidItemSchema),
});

export const DecisionOptionSchema = z.object({
  option: z.string().min(1).max(200),
  pros: z.array(z.string().max(200)),
  cons: z.array(z.string().max(200)),
});

export const DecisionSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  context: z.string().max(2000),
  optionsConsidered: z.array(DecisionOptionSchema).min(1),
  decision: z.string().min(1).max(200),
  rationale: z.string().max(1000),
  madeBy: z.enum(['user', 'agent']),
  date: IsoDateTimeSchema,
  status: z.enum(['active', 'superseded', 'reversed']),
  relatedRaidItems: z.array(z.string()).optional(),
});

export const DecisionLogContentSchema = z.object({
  decisions: z.array(DecisionSchema),
});

export const BacklogStatsSchema = z.object({
  totalItems: z.number().min(0),
  byStatus: z.object({
    toDo: z.number().min(0),
    inProgress: z.number().min(0),
    doneThisSprint: z.number().min(0),
    blocked: z.number().min(0),
  }),
  byPriority: z.object({
    critical: z.number().min(0),
    high: z.number().min(0),
    medium: z.number().min(0),
    low: z.number().min(0),
  }),
});

export const BacklogHighlightSchema = z.object({
  ticketId: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  flag: z.enum(['blocked', 'stale', 'missing_criteria', 'scope_creep', 'new']),
  detail: z.string().max(500),
  suggestedAction: z.string().max(200).optional(),
});

export const RefinementCandidateSchema = z.object({
  ticketId: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  issue: z.string().max(500),
});

export const BacklogSummaryContentSchema = z.object({
  source: IntegrationSourceSchema,
  lastSynced: IsoDateTimeSchema,
  summary: BacklogStatsSchema,
  highlights: z.array(BacklogHighlightSchema),
  refinementCandidates: z.array(RefinementCandidateSchema),
  scopeNotes: z.string().max(500).optional(),
});

// Non-discriminated union for backward compatibility
export const ArtefactContentSchema = z.union([
  DeliveryStateContentSchema,
  RaidLogContentSchema,
  BacklogSummaryContentSchema,
  DecisionLogContentSchema,
]);

// Discriminated union schemas with type field for type-safe content handling
export const DiscriminatedDeliveryStateSchema = z.object({
  type: z.literal('delivery_state'),
  data: DeliveryStateContentSchema,
});

export const DiscriminatedRaidLogSchema = z.object({
  type: z.literal('raid_log'),
  data: RaidLogContentSchema,
});

export const DiscriminatedBacklogSummarySchema = z.object({
  type: z.literal('backlog_summary'),
  data: BacklogSummaryContentSchema,
});

export const DiscriminatedDecisionLogSchema = z.object({
  type: z.literal('decision_log'),
  data: DecisionLogContentSchema,
});

export const DiscriminatedArtefactContentSchema = z.discriminatedUnion('type', [
  DiscriminatedDeliveryStateSchema,
  DiscriminatedRaidLogSchema,
  DiscriminatedBacklogSummarySchema,
  DiscriminatedDecisionLogSchema,
]);

// ============================================================================
// Credential Schemas (for Zod validation after JSON.parse)
// ============================================================================

export const JiraCredentialsSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
});

export const AzureADCredentialsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  userId: z.string().min(1),
});

export const OutlookCredentialsSchema = AzureADCredentialsSchema.extend({
  folderToMonitor: z.string().optional(),
  maxMessagesPerDelta: z.number().int().positive().optional(),
});

export const SESConfigSchema = z.object({
  fromAddress: z.string().email(),
  region: z.string().optional(),
});

export const ArtefactSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  type: ArtefactTypeSchema,
  content: ArtefactContentSchema,
  previousVersion: ArtefactContentSchema.optional(),
  version: z.number().int().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

// ============================================================================
// API Request/Response Schemas
// ============================================================================

export const WorkingHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timezone: z.string().min(1),
});

export const AgentConfigUpdateRequestSchema = z.object({
  pollingIntervalMinutes: z.number().int().min(5).max(60).optional(),
  holdQueueMinutes: z.number().int().min(1).max(120).optional(),
  workingHours: WorkingHoursSchema.optional(),
});

export const EscalationDecisionRequestSchema = z.object({
  projectId: UuidSchema,
  decision: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

export const AutonomyUpdateRequestSchema = z.object({
  level: AutonomyLevelSchema,
  reason: z.string().max(500).optional(),
});
