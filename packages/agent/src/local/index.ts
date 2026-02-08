/**
 * Local Development Utilities
 *
 * Everything needed to run and test the PM Copilot without
 * AgentCore cloud services. Production parity where possible.
 *
 * | Production (AgentCore)        | Local Equivalent          |
 * |-------------------------------|---------------------------|
 * | AgentCore Runtime (microVM)   | dev-server.ts (Node HTTP) |
 * | AgentCore Gateway (MCP)       | MockToolExecutor          |
 * | AgentCore Memory (STM + LTM)  | InMemoryStore             |
 * | AgentCore Identity (OAuth)    | Env vars / mock           |
 * | AgentCore Policy (Cedar)      | policy-engine.ts          |
 * | AgentCore Observability       | Console + debug endpoints |
 * | Claude API                    | MockLlm (live or canned)  |
 */

export {
  MockLlm,
  createTestLlm,
  createLiveLlm,
  type RecordedCall,
} from './mock-llm.js';
export { MockToolExecutor, FAKE_DATA } from './mock-tools.js';

// Re-export InMemoryStore from memory module for convenience
export { InMemoryStore } from '../memory/index.js';
