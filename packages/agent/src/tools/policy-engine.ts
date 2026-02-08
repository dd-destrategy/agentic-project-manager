/**
 * Policy Engine
 *
 * Local enforcement layer that mirrors AgentCore Cedar policies.
 * Evaluates whether a tool call is permitted given the current
 * autonomy level, context, and tool policy level.
 *
 * In production, Cedar policies enforce at the Gateway level.
 * This engine provides local validation for:
 * - Development/testing without AgentCore
 * - Pre-flight checks before Gateway calls
 * - Audit trail of policy decisions
 */

import type {
  PolicyLevel,
  ToolExecutionContext,
  ToolCallRecord,
  McpToolDefinition,
} from './types.js';

// ─── Autonomy Levels ───────────────────────────────────────────

export type AutonomyMode = 'observe' | 'maintain' | 'act';

interface PolicyDecision {
  permitted: boolean;
  reason: string;
  action: 'execute' | 'hold' | 'escalate' | 'deny';
  holdMinutes?: number;
}

// ─── Policy Rules by Autonomy Mode ────────────────────────────

const AUTONOMY_RULES: Record<
  AutonomyMode,
  Record<PolicyLevel, PolicyDecision['action']>
> = {
  observe: {
    always_allowed: 'execute', // Read-only tools always work
    auto_execute: 'deny',
    hold_queue: 'deny',
    requires_approval: 'deny',
    never: 'deny',
  },
  maintain: {
    always_allowed: 'execute',
    auto_execute: 'execute', // Artefact updates, event logging
    hold_queue: 'escalate', // Cannot send comms, escalate instead
    requires_approval: 'escalate',
    never: 'deny',
  },
  act: {
    always_allowed: 'execute',
    auto_execute: 'execute',
    hold_queue: 'hold', // Draft-hold-decide cycle
    requires_approval: 'escalate', // Still needs explicit approval
    never: 'deny',
  },
};

// ─── Hard Deny List (never, regardless of autonomy) ───────────

const HARD_DENY_TOOLS = new Set<string>([
  // No tool is permanently blocked — the 'never' policy level handles this.
  // This set is for emergency overrides if a tool must be killed immediately.
]);

// ─── Background Cycle Restrictions ─────────────────────────────

const BACKGROUND_DENY_TOOLS = new Set<string>([
  'outlook_send_email',
  'jira_create_issue',
  'artefact_revert',
]);

/**
 * Evaluate whether a tool call is permitted under current policy.
 */
export function evaluatePolicy(
  tool: McpToolDefinition,
  autonomy: AutonomyMode,
  ctx: ToolExecutionContext
): PolicyDecision {
  // Hard deny check
  if (HARD_DENY_TOOLS.has(tool.name)) {
    return {
      permitted: false,
      reason: `Tool ${tool.name} is on the hard deny list`,
      action: 'deny',
    };
  }

  // Background cycle restrictions
  if (ctx.isBackground && BACKGROUND_DENY_TOOLS.has(tool.name)) {
    return {
      permitted: false,
      reason: `Tool ${tool.name} is not permitted during background cycles`,
      action: 'deny',
    };
  }

  // Pre-approved by user (hold queue approved, or explicit approval)
  if (ctx.userApproved || ctx.holdQueueApproved) {
    if (tool.policyLevel !== 'never') {
      return {
        permitted: true,
        reason: 'User pre-approved this action',
        action: 'execute',
      };
    }
  }

  // Look up the action for this autonomy level + policy level
  const action = AUTONOMY_RULES[autonomy][tool.policyLevel];

  switch (action) {
    case 'execute':
      return {
        permitted: true,
        reason: `Autonomy level '${autonomy}' permits '${tool.policyLevel}' tools`,
        action: 'execute',
      };

    case 'hold':
      return {
        permitted: true,
        reason: `Tool '${tool.name}' requires hold queue review (${tool.holdMinutes ?? 30} min)`,
        action: 'hold',
        holdMinutes: tool.holdMinutes ?? 30,
      };

    case 'escalate':
      return {
        permitted: false,
        reason: `Autonomy level '${autonomy}' requires approval for '${tool.policyLevel}' tools`,
        action: 'escalate',
      };

    case 'deny':
      return {
        permitted: false,
        reason: `Autonomy level '${autonomy}' does not permit '${tool.policyLevel}' tools`,
        action: 'deny',
      };
  }
}

/**
 * Create an audit record for a tool call (permitted or denied).
 */
export function createToolCallRecord(
  tool: McpToolDefinition,
  params: Record<string, unknown>,
  decision: PolicyDecision,
  result?: { data?: unknown; error?: string; durationMs: number }
): ToolCallRecord {
  return {
    toolName: tool.name,
    category: tool.category,
    params,
    result: result?.data,
    error: result?.error,
    policyLevel: tool.policyLevel,
    executedAt: new Date().toISOString(),
    durationMs: result?.durationMs ?? 0,
    policyPermitted: decision.permitted,
    policyDenialReason: decision.permitted ? undefined : decision.reason,
  };
}

/**
 * Get a human-readable summary of what tools are available
 * at a given autonomy level (for the settings UI).
 */
export function describeAutonomyCapabilities(autonomy: AutonomyMode): {
  canDo: string[];
  cannotDo: string[];
  holdQueue: string[];
} {
  const canDo: string[] = [];
  const cannotDo: string[] = [];
  const holdQueue: string[] = [];

  const descriptions: Record<PolicyLevel, string> = {
    always_allowed: 'Read project data, search tickets, read emails',
    auto_execute:
      'Update artefacts, log events, send user notifications, add Jira comments',
    hold_queue:
      'Send stakeholder emails (with review), change Jira status (with review)',
    requires_approval:
      'Create Jira tickets, revert artefacts, send external emails',
    never: 'Delete data, share confidential information, modify own autonomy',
  };

  for (const [policyLevel, desc] of Object.entries(descriptions) as [
    PolicyLevel,
    string,
  ][]) {
    const action = AUTONOMY_RULES[autonomy][policyLevel];
    switch (action) {
      case 'execute':
        canDo.push(desc);
        break;
      case 'hold':
        holdQueue.push(desc);
        break;
      case 'escalate':
      case 'deny':
        cannotDo.push(desc);
        break;
    }
  }

  return { canDo, cannotDo, holdQueue };
}
