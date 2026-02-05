/**
 * Core TypeScript types for Agentic PM
 *
 * These types are derived from SPEC.md and solution-design/02-api-schemas.md
 */

// ============================================================================
// Primitive Types
// ============================================================================

export type ProjectStatus = 'active' | 'paused' | 'archived';

export type IntegrationSource = 'jira' | 'outlook' | 'asana' | 'ses';

export type AutonomyLevel = 'monitoring' | 'artefact' | 'tactical';

export type ArtefactType =
  | 'delivery_state'
  | 'raid_log'
  | 'backlog_summary'
  | 'decision_log';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type EventType =
  | 'heartbeat'
  | 'heartbeat_with_changes'
  | 'signal_detected'
  | 'action_taken'
  | 'action_held'
  | 'action_approved'
  | 'action_rejected'
  | 'escalation_created'
  | 'escalation_decided'
  | 'escalation_expired'
  | 'artefact_updated'
  | 'integration_error'
  | 'budget_warning'
  | 'error';

export type EscalationStatus = 'pending' | 'decided' | 'expired' | 'superseded';

export type ActionType =
  | 'artefact_update'
  | 'email_sent'
  | 'email_held'
  | 'jira_comment'
  | 'jira_status_change'
  | 'jira_status_change_held'
  | 'escalation_created'
  | 'notification_sent';

export type IntegrationStatus = 'active' | 'inactive' | 'error';

export type SignalType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_status_changed'
  | 'ticket_assigned'
  | 'ticket_commented'
  | 'sprint_started'
  | 'sprint_closed'
  | 'sprint_scope_changed'
  | 'email_received'
  | 'email_thread_updated'
  | 'unknown';

export type SignalCategory =
  | 'blocker'
  | 'risk'
  | 'scope_change'
  | 'deadline_impact'
  | 'stakeholder_communication'
  | 'routine_update'
  | 'noise';

export type RecommendedAction =
  | 'update_artefact'
  | 'create_escalation'
  | 'send_notification'
  | 'hold_for_review'
  | 'ignore';

// ============================================================================
// Entity Interfaces
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  config: ProjectConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  pollingIntervalMinutes?: number;
  holdQueueMinutes?: number;
  jiraBoardId?: string;
  monitoredEmails?: string[];
}

export interface Artefact<T extends ArtefactContent = ArtefactContent> {
  id: string;
  projectId: string;
  type: ArtefactType;
  content: T;
  previousVersion?: T;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  projectId?: string;
  eventType: EventType;
  severity: EventSeverity;
  summary: string;
  detail?: EventDetail;
  createdAt: string;
}

export interface EventDetail {
  source?: string;
  relatedIds?: {
    artefactId?: string;
    escalationId?: string;
    actionId?: string;
    signalId?: string;
  };
  metrics?: {
    durationMs?: number;
    tokensUsed?: number;
    costUsd?: number;
  };
  context?: Record<string, unknown>;
}

export interface Escalation {
  id: string;
  projectId: string;
  title: string;
  context: EscalationContext;
  options: EscalationOption[];
  agentRecommendation?: string;
  agentRationale?: string;
  status: EscalationStatus;
  userDecision?: string;
  userNotes?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface EscalationContext {
  summary: string;
  triggeringSignals: SignalReference[];
  relevantArtefacts?: ArtefactExcerpt[];
  precedents?: string[];
}

export interface EscalationOption {
  id: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SignalReference {
  source: IntegrationSource;
  type: string;
  summary: string;
  timestamp: string;
}

export interface ArtefactExcerpt {
  artefactType: ArtefactType;
  excerpt: string;
}

export interface AgentAction {
  id: string;
  projectId?: string;
  actionType: ActionType;
  description: string;
  detail?: ActionDetail;
  confidence?: ConfidenceScore;
  executed: boolean;
  heldUntil?: string;
  executedAt?: string;
  createdAt: string;
}

export interface ActionDetail {
  target?: {
    type: 'artefact' | 'jira_ticket' | 'email' | 'escalation';
    id: string;
    name?: string;
  };
  changes?: {
    before?: unknown;
    after?: unknown;
  };
  draftContent?: string;
  holdReason?: string;
}

export interface AgentCheckpoint {
  projectId: string;
  integration: IntegrationSource;
  checkpointKey: string;
  checkpointValue: string;
  updatedAt: string;
}

export interface IntegrationConfig {
  id: string;
  integration: IntegrationSource;
  configEncrypted: string;
  status: IntegrationStatus;
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Confidence Scoring Types
// ============================================================================

export interface ConfidenceScore {
  pass: boolean;
  dimensions: ConfidenceDimensions;
  scoredAt: string;
}

export interface ConfidenceDimensions {
  sourceAgreement: DimensionScore;
  boundaryCompliance: DimensionScore;
  schemaValidity: DimensionScore;
  precedentMatch: DimensionScore;
}

export interface DimensionScore {
  pass: boolean;
  score: number;
  evidence: string;
}

// ============================================================================
// Signal Types
// ============================================================================

export interface RawSignal {
  source: IntegrationSource;
  timestamp: string;
  rawPayload: unknown;
}

export interface NormalisedSignal {
  id: string;
  source: IntegrationSource;
  timestamp: string;
  type: SignalType;
  summary: string;
  raw: Record<string, unknown>;
  projectId: string;
  metadata?: SignalMetadata;
}

export interface SignalMetadata {
  priority?: 'critical' | 'high' | 'medium' | 'low';
  participants?: string[];
  relatedTickets?: string[];
  tags?: string[];
}

export interface SanitisedSignal extends NormalisedSignal {
  sanitised: true;
  sanitisedSummary: string;
  sanitisationNotes?: string[];
}

export interface ClassifiedSignal extends SanitisedSignal {
  classification: SignalClassification;
}

export interface SignalClassification {
  importance: 'critical' | 'high' | 'medium' | 'low' | 'noise';
  categories: SignalCategory[];
  recommendedAction: RecommendedAction;
  requiresComplexReasoning: boolean;
  rationale: string;
}

// ============================================================================
// Artefact Content Types
// ============================================================================

export type ArtefactContent =
  | DeliveryStateContent
  | RaidLogContent
  | BacklogSummaryContent
  | DecisionLogContent;

export interface DeliveryStateContent {
  overallStatus: 'green' | 'amber' | 'red';
  statusSummary: string;
  currentSprint?: SprintInfo;
  milestones: Milestone[];
  blockers: Blocker[];
  keyMetrics: KeyMetrics;
  nextActions: string[];
}

export interface SprintInfo {
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  progress: SprintProgress;
}

export interface SprintProgress {
  totalPoints: number;
  completedPoints: number;
  inProgressPoints: number;
  blockedPoints: number;
}

export interface Milestone {
  name: string;
  dueDate: string;
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
  notes?: string;
}

export interface Blocker {
  id: string;
  description: string;
  owner: string;
  raisedDate: string;
  severity: 'high' | 'medium' | 'low';
  sourceTicket?: string;
}

export interface KeyMetrics {
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  avgCycleTimeDays: number;
  openBlockers: number;
  activeRisks: number;
}

export interface RaidLogContent {
  items: RaidItem[];
}

export interface RaidItem {
  id: string;
  type: 'risk' | 'assumption' | 'issue' | 'dependency';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'mitigating' | 'resolved' | 'accepted' | 'closed';
  owner: string;
  raisedDate: string;
  dueDate?: string;
  mitigation?: string;
  resolution?: string;
  resolvedDate?: string;
  source: 'agent_detected' | 'user_added' | 'integration_signal';
  sourceReference?: string;
  lastReviewed: string;
}

export interface DecisionLogContent {
  decisions: Decision[];
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  optionsConsidered: DecisionOption[];
  decision: string;
  rationale: string;
  madeBy: 'user' | 'agent';
  date: string;
  status: 'active' | 'superseded' | 'reversed';
  relatedRaidItems?: string[];
}

export interface DecisionOption {
  option: string;
  pros: string[];
  cons: string[];
}

export interface BacklogSummaryContent {
  source: IntegrationSource;
  lastSynced: string;
  summary: BacklogStats;
  highlights: BacklogHighlight[];
  refinementCandidates: RefinementCandidate[];
  scopeNotes?: string;
}

export interface BacklogStats {
  totalItems: number;
  byStatus: {
    toDo: number;
    inProgress: number;
    doneThisSprint: number;
    blocked: number;
  };
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface BacklogHighlight {
  ticketId: string;
  title: string;
  flag: 'blocked' | 'stale' | 'missing_criteria' | 'scope_creep' | 'new';
  detail: string;
  suggestedAction?: string;
}

export interface RefinementCandidate {
  ticketId: string;
  title: string;
  issue: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface AgentConfig {
  pollingIntervalMinutes: number;
  budgetCeilingDailyUsd: number;
  holdQueueMinutes: number;
  workingHours: WorkingHours;
  llmSplit: LlmSplit;
}

export interface WorkingHours {
  start: string;
  end: string;
  timezone: string;
}

export interface LlmSplit {
  haikuPercent: number;
  sonnetPercent: number;
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
