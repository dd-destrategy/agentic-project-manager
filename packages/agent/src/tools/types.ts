/**
 * MCP Tool Type Definitions
 *
 * Every external action the copilot can take is defined as an MCP
 * tool. Tools are registered in AgentCore Gateway and discovered
 * at runtime. Cedar policies govern which tools can execute.
 */

import { z } from 'zod';

// ─── Tool Categories ───────────────────────────────────────────

export const ToolCategory = z.enum([
  'jira',
  'outlook',
  'artefact',
  'notification',
  'analysis',
  'project',
]);
export type ToolCategory = z.infer<typeof ToolCategory>;

// ─── Policy Levels ─────────────────────────────────────────────

export const PolicyLevel = z.enum([
  'always_allowed',
  'auto_execute',
  'hold_queue',
  'requires_approval',
  'never',
]);
export type PolicyLevel = z.infer<typeof PolicyLevel>;

// ─── Tool Definition ───────────────────────────────────────────

export interface McpToolDefinition {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description for LLM tool selection */
  description: string;
  /** Tool category for grouping */
  category: ToolCategory;
  /** Whether this tool only reads data (no side effects) */
  readonly: boolean;
  /** Cedar policy level governing execution */
  policyLevel: PolicyLevel;
  /** Hold duration in minutes (only for hold_queue tools) */
  holdMinutes?: number;
  /** JSON Schema for tool parameters */
  inputSchema: z.ZodType;
  /** JSON Schema for tool response */
  outputSchema: z.ZodType;
}

// ─── Tool Execution Context ────────────────────────────────────

export interface ToolExecutionContext {
  /** Current project ID (scopes tool calls) */
  projectId?: string;
  /** Whether this is a background cycle (restricts some tools) */
  isBackground: boolean;
  /** Whether the user has pre-approved this action */
  userApproved: boolean;
  /** Whether this action passed hold queue review */
  holdQueueApproved: boolean;
}

// ─── Tool Call Record (audit trail) ────────────────────────────

export const ToolCallRecordSchema = z.object({
  toolName: z.string(),
  category: ToolCategory,
  params: z.record(z.unknown()),
  result: z.unknown().optional(),
  error: z.string().optional(),
  policyLevel: PolicyLevel,
  executedAt: z.string(),
  durationMs: z.number(),
  /** Whether Cedar policy permitted execution */
  policyPermitted: z.boolean(),
  /** Reason if policy denied */
  policyDenialReason: z.string().optional(),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
