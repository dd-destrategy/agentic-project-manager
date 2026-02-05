/**
 * @agentic-pm/core
 *
 * Shared business logic for the Agentic PM Workbench.
 * This package contains all domain logic, types, and utilities
 * shared between Lambda functions and the frontend.
 */

// Types and schemas
export * from './types/index.js';
export * from './schemas/index.js';
export * from './constants.js';

// Database
export { DynamoDBClient } from './db/client.js';
export {
  ProjectRepository,
  ArtefactRepository,
  EventRepository,
  EscalationRepository,
  AgentConfigRepository,
  CheckpointRepository,
  HeldActionRepository,
  GraduationStateRepository,
  CONFIG_KEYS,
} from './db/index.js';

// LLM
export {
  ClaudeClient,
  createHaikuClient,
  createSonnetClient,
  PRICING,
  MODEL_ALIASES,
} from './llm/client.js';
export {
  getToolsForLambda,
  getToolByName,
  ALL_TOOLS,
  ARTEFACT_UPDATE_SYSTEM_PROMPT,
} from './llm/tools.js';
export type {
  UpdateDeliveryStateOutput,
  UpdateRaidLogOutput,
  UpdateBacklogSummaryOutput,
  UpdateDecisionLogOutput,
  ArtefactUpdateToolOutput,
} from './llm/tools.js';
export { BudgetTracker, DEGRADATION_THRESHOLDS, DEGRADATION_CONFIGS } from './llm/budget.js';
export type { ModelId, TokenUsage, BudgetState, DegradationTier } from './llm/types.js';

// Artefacts
export { validateArtefactContent } from './artefacts/validator.js';
export { bootstrapArtefactsFromJira } from './artefacts/bootstrap.js';
export { updateArtefact, mergeArtefact, revertArtefact, calculateDiff } from './artefacts/updater.js';

// Triage
export { sanitiseSignal, INJECTION_PATTERNS } from './triage/sanitise.js';
export { classifySignal, TRIAGE_CLASSIFY_SYSTEM_PROMPT } from './triage/classify.js';

// Execution
export {
  executeAction,
  executeActions,
  previewActions,
  canExecuteImmediately,
  wouldBeHeld,
  wouldRequireApproval,
} from './execution/execute.js';
export {
  checkConfidence,
  computeConfidence,
  canAutoExecuteWithConfidence,
  getBlockingReasons,
  formatConfidenceForDisplay,
} from './execution/index.js';
export {
  validateAction,
  isProhibitedAction,
  canAutoExecute,
  requiresHoldQueue,
  requiresApproval,
  getBoundaryCategory,
  isActionAllowedAtLevel,
  getMinimumAutonomyLevel,
  getAllowedActionsAtLevel,
  compareAutonomyLevels,
  DECISION_BOUNDARIES,
  AUTONOMY_LEVEL_PERMISSIONS,
} from './execution/boundaries.js';

// Integrations
export { JiraClient } from './integrations/jira.js';
export { OutlookClient } from './integrations/outlook.js';
export { SESClient } from './integrations/ses.js';

// Signals
export {
  normaliseJiraSignal,
  normaliseJiraSignalExpanded,
  isSignificantJiraChange,
  jiraSignalNormaliser,
} from './signals/jira.js';
export {
  normaliseOutlookSignal,
  normaliseOutlookSignalExpanded,
  isSignificantOutlookChange,
  outlookSignalNormaliser,
} from './signals/outlook.js';

// Reasoning
export { requiresComplexReasoning } from './reasoning/reasoning.js';
