/**
 * MCP Tool Catalogue
 *
 * All tools available to the PM Copilot, registered in AgentCore
 * Gateway. Each tool definition includes its schema, policy level,
 * and description for LLM tool selection.
 *
 * Tools are grouped by category:
 * - jira: Jira Cloud REST API operations
 * - outlook: Microsoft Graph API mail operations
 * - artefact: PM artefact CRUD (DynamoDB)
 * - notification: Amazon SES user notifications
 * - analysis: Read-only analysis tools (no side effects)
 * - project: Project and event management
 */

import { z } from 'zod';

import type { McpToolDefinition } from './types.js';

// ─── Jira Tools ────────────────────────────────────────────────

export const jiraSearchIssues: McpToolDefinition = {
  name: 'jira_search_issues',
  description:
    'Search Jira tickets using JQL. Returns matching issues with key fields (status, priority, assignee, summary, updated date). Use for sprint queries, blocker searches, or general ticket lookups.',
  category: 'jira',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    jql: z.string().describe('JQL query string'),
    maxResults: z.number().min(1).max(100).default(50),
    fields: z
      .array(z.string())
      .default([
        'summary',
        'status',
        'priority',
        'assignee',
        'updated',
        'labels',
      ]),
  }),
  outputSchema: z.object({
    total: z.number(),
    issues: z.array(
      z.object({
        key: z.string(),
        summary: z.string(),
        status: z.string(),
        priority: z.string(),
        assignee: z.string().nullable(),
        updated: z.string(),
        labels: z.array(z.string()),
      })
    ),
  }),
};

export const jiraGetIssue: McpToolDefinition = {
  name: 'jira_get_issue',
  description:
    'Fetch full detail for a single Jira issue by key (e.g., ATL-342). Includes description, comments, changelog, and linked issues.',
  category: 'jira',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    issueKey: z.string().describe('Jira issue key (e.g., ATL-342)'),
  }),
  outputSchema: z.object({
    key: z.string(),
    summary: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    priority: z.string(),
    assignee: z.string().nullable(),
    reporter: z.string().nullable(),
    created: z.string(),
    updated: z.string(),
    labels: z.array(z.string()),
    comments: z.array(
      z.object({
        author: z.string(),
        body: z.string(),
        created: z.string(),
      })
    ),
    changelog: z.array(
      z.object({
        field: z.string(),
        from: z.string().nullable(),
        to: z.string().nullable(),
        date: z.string(),
      })
    ),
  }),
};

export const jiraGetSprint: McpToolDefinition = {
  name: 'jira_get_sprint',
  description:
    'Get the current active sprint for a Jira board. Returns sprint name, dates, goal, and issue breakdown by status.',
  category: 'jira',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    boardId: z.number().describe('Jira board ID'),
  }),
  outputSchema: z.object({
    id: z.number(),
    name: z.string(),
    state: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    goal: z.string().nullable(),
    issues: z.object({
      total: z.number(),
      done: z.number(),
      inProgress: z.number(),
      toDo: z.number(),
      blocked: z.number(),
    }),
    totalPoints: z.number().nullable(),
    completedPoints: z.number().nullable(),
  }),
};

export const jiraAddComment: McpToolDefinition = {
  name: 'jira_add_comment',
  description:
    'Add a comment to a Jira issue. Use for logging decisions, flagging concerns, or adding context visible to the project team.',
  category: 'jira',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    issueKey: z.string().describe('Jira issue key'),
    body: z
      .string()
      .describe('Comment text (Atlassian Document Format or plain text)'),
  }),
  outputSchema: z.object({
    commentId: z.string(),
    created: z.string(),
  }),
};

export const jiraTransitionIssue: McpToolDefinition = {
  name: 'jira_transition_issue',
  description:
    'Change the status of a Jira issue (e.g., To Do → In Progress → Done). Requires valid transition ID for the issue workflow.',
  category: 'jira',
  readonly: false,
  policyLevel: 'hold_queue',
  holdMinutes: 5,
  inputSchema: z.object({
    issueKey: z.string().describe('Jira issue key'),
    transitionId: z.string().describe('Target transition ID'),
    comment: z
      .string()
      .optional()
      .describe('Optional comment explaining the transition'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    newStatus: z.string(),
  }),
};

export const jiraCreateIssue: McpToolDefinition = {
  name: 'jira_create_issue',
  description:
    'Create a new Jira issue. Requires project key, issue type, summary, and optionally description, priority, assignee, and labels.',
  category: 'jira',
  readonly: false,
  policyLevel: 'requires_approval',
  inputSchema: z.object({
    projectKey: z.string().describe('Jira project key (e.g., ATL)'),
    issueType: z.enum(['Story', 'Task', 'Bug', 'Epic', 'Sub-task']),
    summary: z.string(),
    description: z.string().optional(),
    priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
    assignee: z.string().optional().describe('Assignee account ID'),
    labels: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    key: z.string(),
    id: z.string(),
    self: z.string(),
  }),
};

export const jiraUpdateFields: McpToolDefinition = {
  name: 'jira_update_fields',
  description:
    'Update fields on an existing Jira issue (priority, labels, assignee, summary, description).',
  category: 'jira',
  readonly: false,
  policyLevel: 'hold_queue',
  holdMinutes: 5,
  inputSchema: z.object({
    issueKey: z.string().describe('Jira issue key'),
    fields: z.record(z.unknown()).describe('Fields to update'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
};

// ─── Outlook Tools ─────────────────────────────────────────────

export const outlookSearchMail: McpToolDefinition = {
  name: 'outlook_search_mail',
  description:
    'Search Outlook inbox for emails matching a query. Supports OData $filter syntax for sender, subject, date range, and body content.',
  category: 'outlook',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    query: z.string().describe('Search query or OData $filter expression'),
    maxResults: z.number().min(1).max(50).default(20),
    folder: z.enum(['inbox', 'sent', 'drafts', 'all']).default('inbox'),
  }),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        subject: z.string(),
        from: z.string(),
        receivedAt: z.string(),
        preview: z.string(),
        hasAttachments: z.boolean(),
      })
    ),
  }),
};

export const outlookReadMessage: McpToolDefinition = {
  name: 'outlook_read_message',
  description:
    'Read the full content of a specific Outlook email by ID. Returns body, headers, and attachment metadata.',
  category: 'outlook',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    messageId: z.string().describe('Outlook message ID'),
  }),
  outputSchema: z.object({
    id: z.string(),
    subject: z.string(),
    from: z.string(),
    to: z.array(z.string()),
    cc: z.array(z.string()),
    body: z.string(),
    receivedAt: z.string(),
    conversationId: z.string().nullable(),
    attachments: z.array(
      z.object({ name: z.string(), contentType: z.string(), size: z.number() })
    ),
  }),
};

export const outlookListRecent: McpToolDefinition = {
  name: 'outlook_list_recent',
  description:
    'List recent emails using delta query. Returns messages received since the last checkpoint. Used primarily in background monitoring cycles.',
  category: 'outlook',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    deltaToken: z
      .string()
      .optional()
      .describe('Delta token from previous query'),
    maxResults: z.number().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        subject: z.string(),
        from: z.string(),
        receivedAt: z.string(),
        preview: z.string(),
      })
    ),
    nextDeltaToken: z.string(),
  }),
};

export const outlookSendEmail: McpToolDefinition = {
  name: 'outlook_send_email',
  description:
    'Send an email via Outlook. All outbound emails pass through the hold queue for user review before sending.',
  category: 'outlook',
  readonly: false,
  policyLevel: 'hold_queue',
  holdMinutes: 30, // 30 min for external, 5 min for internal (policy refines)
  inputSchema: z.object({
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).optional(),
    subject: z.string().min(1),
    body: z.string().min(1),
    bodyType: z.enum(['text', 'html']).default('text'),
    importance: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
  outputSchema: z.object({
    messageId: z.string(),
    sentAt: z.string(),
  }),
};

// ─── PM Artefact Tools ─────────────────────────────────────────

export const artefactGet: McpToolDefinition = {
  name: 'artefact_get',
  description:
    'Read a PM artefact (delivery_state, raid_log, backlog_summary, decision_log) for a project. Returns the current content and version.',
  category: 'artefact',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    projectId: z.string(),
    type: z.enum([
      'delivery_state',
      'raid_log',
      'backlog_summary',
      'decision_log',
    ]),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    type: z.string(),
    content: z.unknown(),
    version: z.number(),
    updatedAt: z.string(),
    updatedBy: z.string(),
  }),
};

export const artefactUpdate: McpToolDefinition = {
  name: 'artefact_update',
  description:
    'Update a PM artefact with new content. The previous version is preserved for one-deep undo. Validates content against the artefact schema.',
  category: 'artefact',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    projectId: z.string(),
    type: z.enum([
      'delivery_state',
      'raid_log',
      'backlog_summary',
      'decision_log',
    ]),
    content: z.unknown().describe('Artefact content matching the type schema'),
    reason: z.string().describe('Why this update was made'),
  }),
  outputSchema: z.object({
    version: z.number(),
    updatedAt: z.string(),
    diff: z.string().optional(),
  }),
};

export const artefactRevert: McpToolDefinition = {
  name: 'artefact_revert',
  description:
    'Revert an artefact to its previous version. One-deep undo only.',
  category: 'artefact',
  readonly: false,
  policyLevel: 'requires_approval',
  inputSchema: z.object({
    projectId: z.string(),
    type: z.enum([
      'delivery_state',
      'raid_log',
      'backlog_summary',
      'decision_log',
    ]),
  }),
  outputSchema: z.object({
    revertedToVersion: z.number(),
    updatedAt: z.string(),
  }),
};

// ─── Project & Event Tools ─────────────────────────────────────

export const projectList: McpToolDefinition = {
  name: 'project_list',
  description: 'List all active projects with their status and configuration.',
  category: 'project',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({}),
  outputSchema: z.object({
    projects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        autonomyLevel: z.string(),
        source: z.string(),
        lastActivity: z.string().nullable(),
      })
    ),
  }),
};

export const projectGet: McpToolDefinition = {
  name: 'project_get',
  description:
    'Get full detail for a project including configuration, integration settings, and recent activity.',
  category: 'project',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    autonomyLevel: z.string(),
    config: z.unknown(),
    recentEvents: z.array(z.unknown()),
  }),
};

export const eventLog: McpToolDefinition = {
  name: 'event_log',
  description:
    'Write an event to the activity feed. Used for logging agent actions, state changes, and observations.',
  category: 'project',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    projectId: z.string(),
    eventType: z.string(),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    summary: z.string(),
    detail: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    createdAt: z.string(),
  }),
};

export const escalationCreate: McpToolDefinition = {
  name: 'escalation_create',
  description:
    'Create an escalation requiring user decision. Includes context, options with trade-offs, and agent recommendation.',
  category: 'project',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    projectId: z.string(),
    title: z.string(),
    context: z.string(),
    options: z.array(
      z.object({
        label: z.string(),
        description: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
      })
    ),
    recommendation: z
      .object({
        optionLabel: z.string(),
        rationale: z.string(),
      })
      .optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  outputSchema: z.object({
    escalationId: z.string(),
    createdAt: z.string(),
  }),
};

export const heldActionCreate: McpToolDefinition = {
  name: 'held_action_create',
  description:
    'Queue an action for user review before execution. The action will auto-execute after the hold period unless cancelled.',
  category: 'project',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    projectId: z.string(),
    actionType: z.string(),
    summary: z.string(),
    detail: z.unknown(),
    holdMinutes: z.number().min(1).max(1440),
  }),
  outputSchema: z.object({
    actionId: z.string(),
    holdUntil: z.string(),
  }),
};

// ─── Notification Tools ────────────────────────────────────────

export const sesSendNotification: McpToolDefinition = {
  name: 'ses_send_notification',
  description:
    'Send a notification email to the user via Amazon SES. For digest emails, health alerts, and escalation notices. Not for stakeholder communications.',
  category: 'notification',
  readonly: false,
  policyLevel: 'auto_execute',
  inputSchema: z.object({
    subject: z.string(),
    bodyHtml: z.string(),
    bodyText: z.string(),
    importance: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
  outputSchema: z.object({
    messageId: z.string(),
    sentAt: z.string(),
  }),
};

// ─── Analysis Tools (read-only, no side effects) ───────────────

export const analyseBacklogHealth: McpToolDefinition = {
  name: 'analyse_backlog_health',
  description:
    'Scan the Jira backlog for quality issues: missing acceptance criteria, stale tickets, priority conflicts, orphan epics, scope creep indicators.',
  category: 'analysis',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    projectId: z.string(),
    boardId: z.number().optional(),
    staleDays: z.number().default(30),
  }),
  outputSchema: z.object({
    totalItems: z.number(),
    issues: z.array(
      z.object({
        ticketKey: z.string(),
        title: z.string(),
        flag: z.enum([
          'missing_acceptance_criteria',
          'stale',
          'priority_conflict',
          'orphan_epic',
          'scope_creep',
          'no_estimate',
          'blocked_not_flagged',
        ]),
        detail: z.string(),
        suggestedAction: z.string(),
      })
    ),
    summary: z.object({
      missingCriteria: z.number(),
      staleTickets: z.number(),
      priorityConflicts: z.number(),
      orphanEpics: z.number(),
      scopeCreepIndicators: z.number(),
    }),
  }),
};

export const analyseRaidCoherence: McpToolDefinition = {
  name: 'analyse_raid_coherence',
  description:
    'Check the RAID log for staleness, internal conflicts, and items that should be escalated or closed. Cross-references with current Jira data.',
  category: 'analysis',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    totalItems: z.number(),
    staleItems: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        daysSinceReview: z.number(),
      })
    ),
    conflicts: z.array(
      z.object({ itemA: z.string(), itemB: z.string(), conflict: z.string() })
    ),
    closureCandidates: z.array(
      z.object({ id: z.string(), title: z.string(), reason: z.string() })
    ),
  }),
};

export const analyseDeliveryRisk: McpToolDefinition = {
  name: 'analyse_delivery_risk',
  description:
    'Cross-reference current signals against milestones and delivery targets. Computes risk of missing deadlines based on velocity, blockers, and dependencies.',
  category: 'analysis',
  readonly: true,
  policyLevel: 'always_allowed',
  inputSchema: z.object({
    projectId: z.string(),
    milestoneId: z.string().optional(),
  }),
  outputSchema: z.object({
    overallRisk: z.enum(['low', 'moderate', 'high', 'critical']),
    milestones: z.array(
      z.object({
        name: z.string(),
        dueDate: z.string(),
        status: z.string(),
        riskFactors: z.array(z.string()),
        completionProbability: z.number().min(0).max(1),
      })
    ),
    velocityAnalysis: z.object({
      required: z.number(),
      actual: z.number(),
      gapPercent: z.number(),
      trend: z.enum(['improving', 'stable', 'declining']),
    }),
  }),
};

// ─── Full Catalogue ────────────────────────────────────────────

export const TOOL_CATALOGUE: McpToolDefinition[] = [
  // Jira
  jiraSearchIssues,
  jiraGetIssue,
  jiraGetSprint,
  jiraAddComment,
  jiraTransitionIssue,
  jiraCreateIssue,
  jiraUpdateFields,
  // Outlook
  outlookSearchMail,
  outlookReadMessage,
  outlookListRecent,
  outlookSendEmail,
  // Artefacts
  artefactGet,
  artefactUpdate,
  artefactRevert,
  // Project & Events
  projectList,
  projectGet,
  eventLog,
  escalationCreate,
  heldActionCreate,
  // Notifications
  sesSendNotification,
  // Analysis
  analyseBacklogHealth,
  analyseRaidCoherence,
  analyseDeliveryRisk,
];

/**
 * Get tools available for a given context.
 * Background cycles exclude send/write tools that require user presence.
 */
export function getAvailableTools(ctx: {
  isBackground: boolean;
}): McpToolDefinition[] {
  if (ctx.isBackground) {
    return TOOL_CATALOGUE.filter(
      (t) =>
        t.readonly ||
        t.policyLevel === 'auto_execute' ||
        // Allow escalation creation in background
        t.name === 'escalation_create' ||
        t.name === 'event_log'
    ).filter(
      // Explicitly deny sending emails in background cycles
      (t) => t.name !== 'outlook_send_email'
    );
  }
  return TOOL_CATALOGUE;
}
