/**
 * @agentic-pm/agent — PM Copilot Agent
 *
 * Ensemble reasoning, MCP tools, policy engine, and AgentCore
 * runtime for the PM Copilot.
 */

// Ensemble
export {
  EnsembleOrchestrator,
  type LlmCall,
  type ToolExecutor,
  type ToolResult,
  type SessionState,
  type ConversationTurn,
  type PendingDraft,
} from './ensemble/index.js';

export {
  PersonaId,
  ConversationMode,
  MODE_PERSONA_MAP,
  type Contribution,
  type Deliberation,
  type Challenge,
  type CopilotResponse,
  type PersonaConfig,
  type EnsembleConfig,
} from './ensemble/index.js';

export {
  ALL_PERSONAS,
  PERSONA_MAP,
  OPERATOR,
  ANALYST,
  SCEPTIC,
  ADVOCATE,
  HISTORIAN,
  SYNTHESISER,
} from './ensemble/index.js';

export { classifyMode, shouldActivateSceptic } from './ensemble/index.js';

// Tools
export {
  TOOL_CATALOGUE,
  getAvailableTools,
  evaluatePolicy,
  createToolCallRecord,
  describeAutonomyCapabilities,
  type McpToolDefinition,
  type ToolExecutionContext,
  type ToolCallRecord,
  type AutonomyMode,
} from './tools/index.js';

// Memory
export {
  InMemoryStore,
  type MemoryStore,
  type MemoryRecord,
} from './memory/index.js';

// Runtime
export {
  CopilotRuntime,
  SessionManager,
  type InvokeRequest,
  type InvokeResponse,
  type HealthResponse,
} from './runtime/index.js';
