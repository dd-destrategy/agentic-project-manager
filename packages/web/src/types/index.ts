/**
 * Frontend types for Agentic PM Workbench
 * These mirror the types from @agentic-pm/core for frontend use
 */

// ============================================================================
// Core Entity Types
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
  | 'action_executed'
  | 'escalation_created'
  | 'escalation_decided'
  | 'escalation_expired'
  | 'artefact_updated'
  | 'autonomy_level_changed'
  | 'integration_error'
  | 'budget_warning'
  | 'error';

export type EscalationStatus = 'pending' | 'decided' | 'expired' | 'superseded';

export type HealthStatus = 'healthy' | 'warning' | 'error';

export type AgentStatusType =
  | 'active'
  | 'paused'
  | 'error'
  | 'starting'
  | 'stopped'
  | 'never_run';

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

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  source: IntegrationSource;
  sourceProjectKey: string;
  autonomyLevel: AutonomyLevel;
  healthStatus: HealthStatus;
  pendingEscalations: number;
  lastActivity: string;
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

// ============================================================================
// API Response Types
// ============================================================================

export interface AgentStatusResponse {
  status: AgentStatusType;
  lastHeartbeat: string | null;
  nextScheduledRun: string;
  currentCycleState: string | null;
  integrations: IntegrationHealth[];
  budgetStatus: BudgetStatus;
  error?: string;
}

export interface IntegrationHealth {
  name: IntegrationSource;
  status: 'healthy' | 'degraded' | 'error';
  lastCheck: string;
  errorMessage?: string;
}

export interface BudgetStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}

export interface EventsResponse {
  events: Event[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}

export interface EscalationsResponse {
  escalations: Escalation[];
  count: number;
}

/**
 * 24-hour activity statistics response
 */
export interface ActivityStatsResponse {
  /** Statistics for the last 24 hours */
  last24Hours: ActivityStats;
  /** Statistics for today (since midnight) */
  today: ActivityStats;
  /** Comparison with previous period */
  comparison: ActivityComparison;
}

export interface ActivityStats {
  /** Total agent cycles run */
  cyclesRun: number;
  /** Total signals detected */
  signalsDetected: number;
  /** Actions taken autonomously */
  actionsTaken: number;
  /** Actions held for review */
  actionsHeld: number;
  /** Artefacts updated */
  artefactsUpdated: number;
  /** Escalations created */
  escalationsCreated: number;
  /** Escalations resolved */
  escalationsResolved: number;
  /** Total LLM cost in USD */
  llmCostUsd: number;
  /** Total tokens used */
  tokensUsed: number;
}

export interface ActivityComparison {
  /** Change in cycles from previous period */
  cyclesChange: number;
  /** Change in signals from previous period */
  signalsChange: number;
  /** Change in actions from previous period */
  actionsChange: number;
}

// ============================================================================
// UI Helper Types
// ============================================================================

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface StatusConfig {
  label: string;
  className: string;
  dot: string;
}

export const eventTypeIcons: Record<EventType, string> = {
  heartbeat: 'heart',
  heartbeat_with_changes: 'heart-pulse',
  signal_detected: 'radio',
  action_taken: 'check-circle',
  action_held: 'pause-circle',
  action_approved: 'check-circle-2',
  action_rejected: 'x-circle',
  action_executed: 'zap',
  escalation_created: 'alert-triangle',
  escalation_decided: 'check-square',
  escalation_expired: 'clock',
  artefact_updated: 'file-edit',
  autonomy_level_changed: 'settings',
  integration_error: 'alert-octagon',
  budget_warning: 'dollar-sign',
  error: 'alert-circle',
};

export const severityConfig: Record<
  EventSeverity,
  { className: string; label: string }
> = {
  info: { className: 'text-blue-600 bg-blue-50', label: 'Info' },
  warning: { className: 'text-amber-600 bg-amber-50', label: 'Warning' },
  error: { className: 'text-red-600 bg-red-50', label: 'Error' },
  critical: { className: 'text-red-800 bg-red-100', label: 'Critical' },
};

export const autonomyLevelConfig: Record<
  AutonomyLevel,
  { label: string; description: string }
> = {
  monitoring: { label: 'Monitoring', description: 'Observe and log only' },
  artefact: { label: 'Artefact', description: 'Update artefacts autonomously' },
  tactical: {
    label: 'Tactical',
    description: 'Send communications via hold queue',
  },
};

// ============================================================================
// Autonomy Settings Types
// ============================================================================

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
 * Autonomy settings API response
 */
export interface AutonomySettingsResponse extends AutonomySettings {}

/**
 * Autonomy settings update request
 */
export interface AutonomySettingsUpdateRequest {
  autonomyLevel?: AutonomyLevel;
  dryRun?: boolean;
}

// ============================================================================
// Held Action Types (Hold Queue)
// ============================================================================

/**
 * Held action types that can be queued
 */
export type HeldActionType = 'email_stakeholder' | 'jira_status_change';

/**
 * Held action status
 */
export type HeldActionStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'executed';

/**
 * Email stakeholder payload
 */
export interface EmailStakeholderPayload {
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  context?: string;
}

/**
 * Jira status change payload
 */
export interface JiraStatusChangePayload {
  issueKey: string;
  transitionId: string;
  transitionName: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}

/**
 * Union of all held action payload types
 */
export type HeldActionPayload =
  | EmailStakeholderPayload
  | JiraStatusChangePayload;

/**
 * Held action entity
 */
export interface HeldAction {
  id: string;
  projectId: string;
  actionType: HeldActionType;
  payload: HeldActionPayload;
  heldUntil: string;
  status: HeldActionStatus;
  createdAt: string;
  approvedAt?: string;
  cancelledAt?: string;
  executedAt?: string;
  cancelReason?: string;
  /** User who approved/cancelled (if applicable) */
  decidedBy?: string;
}

/**
 * Held actions API response
 */
export interface HeldActionsResponse {
  heldActions: HeldAction[];
  count: number;
}

/**
 * Held action approve/cancel response
 */
export interface HeldActionResponse {
  heldAction: HeldAction;
  success: boolean;
}

// ============================================================================
// Ingestion Session Types
// ============================================================================

export type IngestionSessionStatus = 'active' | 'archived';

export type IngestionMessageRole = 'user' | 'assistant';

/**
 * An attachment on a user message (pasted screenshot, dragged image, etc.)
 */
export interface IngestionAttachment {
  /** Unique ID for the attachment */
  id: string;
  /** MIME type (image/png, image/jpeg, etc.) */
  mimeType: string;
  /** Base64-encoded data URL */
  dataUrl: string;
  /** Optional filename */
  filename?: string;
}

/**
 * A single message in an ingestion conversation
 */
export interface IngestionMessage {
  id: string;
  role: IngestionMessageRole;
  content: string;
  attachments?: IngestionAttachment[];
  createdAt: string;
}

/**
 * An ingestion session — a conversation where the user pastes content
 * and discusses it with the AI to extract PM-relevant information.
 */
export interface IngestionSession {
  id: string;
  title: string;
  status: IngestionSessionStatus;
  messages: IngestionMessage[];
  /** Optional project this session relates to */
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API response for listing ingestion sessions
 */
export interface IngestionSessionsResponse {
  sessions: Omit<IngestionSession, 'messages'>[];
  count: number;
}

/**
 * API response for sending a message
 */
export interface IngestionMessageResponse {
  userMessage: IngestionMessage;
  assistantMessage: IngestionMessage;
  extractedItems?: ExtractedItem[];
}

// ============================================================================
// Extracted Item Types
// ============================================================================

export type ExtractedItemType =
  | 'risk'
  | 'action_item'
  | 'decision'
  | 'blocker'
  | 'status_update'
  | 'dependency'
  | 'stakeholder_request';

export type ExtractedItemStatus =
  | 'pending_review'
  | 'approved'
  | 'applied'
  | 'dismissed';

export type TargetArtefact =
  | 'raid_log'
  | 'delivery_state'
  | 'backlog_summary'
  | 'decision_log';

export type ExtractedItemPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * A structured item extracted from an ingestion conversation by the AI.
 * These sit in a staging area for PM review before being applied to artefacts.
 */
export interface ExtractedItem {
  id: string;
  /** The ingestion session this item was extracted from */
  sessionId: string;
  /** The specific message that triggered extraction */
  messageId: string;
  /** Category of the extracted item */
  type: ExtractedItemType;
  /** One-line summary */
  title: string;
  /** Full detail / description */
  content: string;
  /** Which PM artefact this should be added to */
  targetArtefact: TargetArtefact;
  /** Urgency / importance */
  priority: ExtractedItemPriority;
  /** Review status */
  status: ExtractedItemStatus;
  /** Optional project association */
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  /** When the item was applied to an artefact */
  appliedAt?: string;
  /** When the item was dismissed */
  dismissedAt?: string;
  /** Why the item was dismissed */
  dismissReason?: string;
}

/**
 * API response for listing extracted items
 */
export interface ExtractedItemsResponse {
  items: ExtractedItem[];
  count: number;
}

/**
 * Counts of extracted items by status (for badges/dashboards)
 */
export interface ExtractedItemCounts {
  pendingReview: number;
  approved: number;
  applied: number;
  dismissed: number;
}

/** Labels for extracted item types */
export const extractedItemTypeLabels: Record<ExtractedItemType, string> = {
  risk: 'Risk',
  action_item: 'Action Item',
  decision: 'Decision',
  blocker: 'Blocker',
  status_update: 'Status Update',
  dependency: 'Dependency',
  stakeholder_request: 'Stakeholder Request',
};

/** Labels for target artefacts */
export const targetArtefactLabels: Record<TargetArtefact, string> = {
  raid_log: 'RAID Log',
  delivery_state: 'Delivery State',
  backlog_summary: 'Backlog Summary',
  decision_log: 'Decision Log',
};
