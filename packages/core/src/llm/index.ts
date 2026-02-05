/**
 * LLM module
 *
 * Claude API client with tool-use support and budget tracking.
 */

export { ClaudeClient, createHaikuClient, createSonnetClient, PRICING, MODEL_ALIASES } from './client.js';
export { BudgetTracker, createBudgetTracker, DEGRADATION_THRESHOLDS, DEGRADATION_CONFIGS } from './budget.js';
export {
  getToolsForLambda,
  getToolByName,
  ALL_TOOLS,
  SANITISE_SIGNAL_TOOL,
  CLASSIFY_SIGNAL_TOOL,
  BATCH_CLASSIFY_SIGNALS_TOOL,
  UPDATE_DELIVERY_STATE_TOOL,
  UPDATE_RAID_LOG_TOOL,
  UPDATE_BACKLOG_SUMMARY_TOOL,
  UPDATE_DECISION_LOG_TOOL,
  CREATE_ESCALATION_TOOL,
  DRAFT_COMMUNICATION_TOOL,
} from './tools.js';
export type {
  LlmConfig,
  LlmResponse,
  TokenUsage,
  ToolDefinition,
  ModelId,
  RetryConfig,
  DegradationTier,
  DegradationConfig,
  BudgetState,
  BudgetRecord,
  UsageEntry,
} from './types.js';
export type {
  LambdaType,
  SanitiseSignalOutput,
  ClassifySignalOutput,
  BatchClassifySignalsOutput,
  CreateEscalationOutput,
} from './tools.js';
