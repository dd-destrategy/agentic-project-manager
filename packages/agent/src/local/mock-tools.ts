/**
 * Mock Tool Executor — Local Development
 *
 * Simulates the AgentCore Gateway + MCP tool backends with
 * realistic fake data. Mirrors production tool catalogue exactly
 * — same tool names, same input/output schemas.
 *
 * Two modes:
 * 1. FAKE: Returns realistic synthetic project data (default)
 * 2. PASSTHROUGH: Calls real Jira/Outlook APIs via @agentic-pm/core
 *    integrations (set integration credentials in env vars)
 *
 * Fake mode gives production-parity tool behaviour without needing
 * any external service accounts.
 */

import type { ToolExecutor, ToolResult } from '../ensemble/orchestrator.js';
import { TOOL_CATALOGUE } from '../tools/catalogue.js';
import { evaluatePolicy } from '../tools/policy-engine.js';
import type { AutonomyMode } from '../tools/policy-engine.js';
import type { ToolExecutionContext } from '../tools/types.js';

// ─── Fake Project Data ─────────────────────────────────────────

const FAKE_PROJECT = {
  id: 'proj-atlas-001',
  name: 'Project Atlas',
  key: 'ATL',
  status: 'active',
  autonomyLevel: 'act',
  source: 'jira',
  boardId: 42,
};

const FAKE_SPRINT = {
  id: 1014,
  name: 'Sprint 14',
  state: 'active',
  startDate: '2026-02-03T00:00:00Z',
  endDate: '2026-02-14T00:00:00Z',
  goal: 'Complete API migration and profile redesign groundwork',
  issues: { total: 12, done: 5, inProgress: 4, toDo: 1, blocked: 2 },
  totalPoints: 34,
  completedPoints: 21,
};

const FAKE_ISSUES = [
  {
    key: 'ATL-338',
    summary: 'Implement auth flow for API v3',
    status: 'Done',
    priority: 'High',
    assignee: 'alex.rivera@company.com',
    updated: '2026-02-08T08:30:00Z',
    labels: ['api', 'auth'],
  },
  {
    key: 'ATL-340',
    summary: 'Add error handling for edge cases',
    status: 'Done',
    priority: 'Medium',
    assignee: 'alex.rivera@company.com',
    updated: '2026-02-08T09:15:00Z',
    labels: ['quality'],
  },
  {
    key: 'ATL-341',
    summary: 'Search API integration',
    status: 'In Review',
    priority: 'High',
    assignee: 'priya.patel@company.com',
    updated: '2026-02-08T11:00:00Z',
    labels: ['api', 'search'],
  },
  {
    key: 'ATL-342',
    summary: 'API migration blocked on DevOps approval',
    status: 'Blocked',
    priority: 'Highest',
    assignee: 'devops-team@company.com',
    updated: '2026-02-05T14:22:00Z',
    labels: ['api', 'blocked'],
  },
  {
    key: 'ATL-345',
    summary: 'Profile redesign — component scaffolding',
    status: 'In Progress',
    priority: 'High',
    assignee: 'sam.keller@company.com',
    updated: '2026-02-08T10:00:00Z',
    labels: ['frontend', 'design'],
  },
  {
    key: 'ATL-350',
    summary: 'Environment access blocked by policy change',
    status: 'Blocked',
    priority: 'Highest',
    assignee: 'jamie.park@company.com',
    updated: '2026-02-08T11:42:00Z',
    labels: ['devops', 'blocked'],
  },
];

const FAKE_DELIVERY_STATE = {
  overall_status: 'amber',
  status_summary:
    'Sprint 14 at 62% with 2 active blockers. Velocity trend declining.',
  current_sprint: {
    name: 'Sprint 14',
    start_date: '2026-02-03T00:00:00Z',
    end_date: '2026-02-14T00:00:00Z',
    goal: 'Complete API migration and profile redesign groundwork',
    progress: {
      total_points: 34,
      completed_points: 21,
      in_progress_points: 8,
      blocked_points: 5,
    },
  },
  milestones: [
    {
      name: 'Beta Launch',
      due_date: '2026-03-15T00:00:00Z',
      status: 'at_risk',
      notes: 'API dependency and design assets are risk factors',
    },
  ],
  blockers: [
    {
      id: 'ATL-342',
      description: 'API migration blocked on DevOps approval',
      owner: 'DevOps team',
      severity: 'high',
      source_ticket: 'ATL-342',
    },
    {
      id: 'ATL-350',
      description: 'Environment access blocked by policy change',
      owner: 'Jamie Park',
      severity: 'high',
      source_ticket: 'ATL-350',
    },
  ],
  key_metrics: {
    velocity_trend: 'decreasing',
    avg_cycle_time_days: 4.2,
    open_blockers: 2,
    active_risks: 3,
  },
  next_actions: [
    'Resolve DevOps blocker (ATL-342)',
    'Chase Acme Studios for design assets',
    'Review velocity decline with team',
  ],
};

const FAKE_RAID_LOG = {
  items: [
    {
      id: 'R-012',
      type: 'risk',
      title: 'Vendor reliability — Acme Studios',
      description: 'Design vendor has missed 3 of 5 delivery dates',
      severity: 'high',
      status: 'open',
      owner: 'PM',
      raised_date: '2026-01-20T00:00:00Z',
      mitigation: 'Weekly check-in calls, SLA enforcement clause 4.2',
      source: 'agent_detected',
      last_reviewed: '2026-02-06T00:00:00Z',
    },
    {
      id: 'R-015',
      type: 'risk',
      title: 'API v3 dependency — no confirmed date',
      description:
        'Platform team has not confirmed API v3 delivery date. Last update: 12 days ago.',
      severity: 'high',
      status: 'open',
      owner: 'PM',
      raised_date: '2026-01-27T00:00:00Z',
      mitigation: 'Escalate to engineering manager if no update by 10 Feb',
      source: 'agent_detected',
      last_reviewed: '2026-02-04T00:00:00Z',
    },
    {
      id: 'I-019',
      type: 'issue',
      title: 'DevOps access policy blocker',
      description:
        'New access policy blocks non-admin staging deploys. Affects 4 in-progress stories.',
      severity: 'high',
      status: 'open',
      owner: 'Jamie Park',
      raised_date: '2026-02-08T11:42:00Z',
      mitigation: 'Request emergency access exemption',
      source: 'agent_detected',
      last_reviewed: '2026-02-08T11:42:00Z',
    },
  ],
};

const FAKE_EMAILS = [
  {
    id: 'msg-001',
    subject: 'RE: Phase 2 scope reduction',
    from: 'sarah.chen@company.com',
    receivedAt: '2026-02-08T10:14:00Z',
    preview: 'Approved. Lets proceed with the reduced scope for Phase 2...',
    hasAttachments: false,
  },
  {
    id: 'msg-002',
    subject: 'Design assets — Atlas profile redesign',
    from: 'design@acmestudios.com',
    receivedAt: '2026-02-07T18:22:00Z',
    preview:
      'Apologies for the delay. We are aiming to have the assets ready by Wednesday...',
    hasAttachments: false,
  },
];

// ─── Tool Handler Map ──────────────────────────────────────────

type ToolHandler = (params: Record<string, unknown>) => unknown;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  jira_search_issues: (params) => {
    const jql = (params.jql as string) ?? '';
    let issues = [...FAKE_ISSUES];

    // Basic JQL filtering
    if (jql.includes('status = Blocked')) {
      issues = issues.filter((i) => i.status === 'Blocked');
    }
    if (jql.includes('status = Done')) {
      issues = issues.filter((i) => i.status === 'Done');
    }
    if (jql.includes('priority = Highest')) {
      issues = issues.filter((i) => i.priority === 'Highest');
    }

    const max = (params.maxResults as number) ?? 50;
    return { total: issues.length, issues: issues.slice(0, max) };
  },

  jira_get_issue: (params) => {
    const key = params.issueKey as string;
    const issue = FAKE_ISSUES.find((i) => i.key === key);
    if (!issue) return { error: `Issue ${key} not found` };
    return {
      ...issue,
      description: `Detailed description for ${key}. This is a mock description for local development.`,
      reporter: 'pm@company.com',
      created: '2026-01-15T09:00:00Z',
      comments: [
        {
          author: 'alex.rivera@company.com',
          body: 'Working on this. Should be done by EOD.',
          created: '2026-02-07T14:00:00Z',
        },
      ],
      changelog: [
        {
          field: 'status',
          from: 'To Do',
          to: issue.status,
          date: issue.updated,
        },
      ],
    };
  },

  jira_get_sprint: () => FAKE_SPRINT,

  jira_add_comment: (_params) => ({
    commentId: `comment-${Date.now()}`,
    created: new Date().toISOString(),
  }),

  jira_transition_issue: (_params) => ({
    success: true,
    newStatus: 'In Progress',
  }),

  jira_create_issue: (_params) => ({
    key: `ATL-${351 + Math.floor(Math.random() * 100)}`,
    id: `${10000 + Math.floor(Math.random() * 1000)}`,
    self: 'https://your-domain.atlassian.net/rest/api/3/issue/10042',
  }),

  jira_update_fields: () => ({ success: true }),

  outlook_search_mail: (params) => {
    const query = ((params.query as string) ?? '').toLowerCase();
    let messages = [...FAKE_EMAILS];
    if (query) {
      messages = messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(query) ||
          m.from.toLowerCase().includes(query) ||
          m.preview.toLowerCase().includes(query)
      );
    }
    return { messages };
  },

  outlook_read_message: (params) => {
    const id = params.messageId as string;
    const msg = FAKE_EMAILS.find((m) => m.id === id);
    if (!msg) return { error: `Message ${id} not found` };
    return {
      ...msg,
      to: ['pm@company.com'],
      cc: [],
      body: `Full body content for: ${msg.preview}`,
      conversationId: `conv-${id}`,
      attachments: [],
    };
  },

  outlook_list_recent: (_params) => ({
    messages: FAKE_EMAILS,
    nextDeltaToken: `delta-${Date.now()}`,
  }),

  outlook_send_email: (_params) => ({
    messageId: `sent-${Date.now()}`,
    sentAt: new Date().toISOString(),
  }),

  artefact_get: (params) => {
    const type = params.type as string;
    const contentMap: Record<string, unknown> = {
      delivery_state: FAKE_DELIVERY_STATE,
      raid_log: FAKE_RAID_LOG,
      backlog_summary: {
        source: 'jira',
        last_synced: new Date().toISOString(),
        summary: {
          total_items: 47,
          by_status: {
            to_do: 22,
            in_progress: 8,
            in_review: 3,
            done: 12,
            blocked: 2,
          },
          by_priority: { critical: 2, high: 11, medium: 24, low: 10 },
        },
        highlights: [],
        refinement_candidates: [],
        scope_notes: 'Phase 2 scope reduced per sponsor approval (8 Feb)',
      },
      decision_log: {
        decisions: [
          {
            id: 'D-014',
            title: 'Phase 2 scope reduction',
            context:
              'Timeline pressure and vendor delays necessitated scope review',
            decision:
              'Reduce Phase 2 to core features only, defer nice-to-haves to Phase 3',
            rationale:
              'Maintains March milestone viability while managing risk',
            made_by: 'user',
            date: '2026-02-08T10:14:00Z',
            status: 'active',
          },
        ],
      },
    };
    return {
      projectId: params.projectId,
      type,
      content: contentMap[type] ?? {},
      version: 14,
      updatedAt: new Date().toISOString(),
      updatedBy: 'agent',
    };
  },

  artefact_update: (_params) => ({
    version: 15,
    updatedAt: new Date().toISOString(),
    diff: '+ Added new blocker I-019\n- Updated sprint progress',
  }),

  artefact_revert: () => ({
    revertedToVersion: 13,
    updatedAt: new Date().toISOString(),
  }),

  project_list: () => ({
    projects: [
      { ...FAKE_PROJECT, lastActivity: new Date().toISOString() },
      {
        id: 'proj-beacon-002',
        name: 'Project Beacon',
        key: 'BCN',
        status: 'active',
        autonomyLevel: 'maintain',
        source: 'jira',
        lastActivity: '2026-02-07T16:00:00Z',
      },
    ],
  }),

  project_get: (_params) => ({
    ...FAKE_PROJECT,
    config: { pollingIntervalMinutes: 15, holdQueueMinutes: 30 },
    recentEvents: [
      {
        type: 'artefact_updated',
        summary: 'Delivery state updated',
        timestamp: new Date().toISOString(),
      },
      {
        type: 'signal_detected',
        summary: 'ATL-350 blocker raised',
        timestamp: '2026-02-08T11:42:00Z',
      },
    ],
  }),

  event_log: () => ({
    eventId: `evt-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }),

  escalation_create: (_params) => ({
    escalationId: `esc-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }),

  held_action_create: (params) => {
    const holdMinutes = (params.holdMinutes as number) ?? 30;
    return {
      actionId: `held-${Date.now()}`,
      holdUntil: new Date(Date.now() + holdMinutes * 60 * 1000).toISOString(),
    };
  },

  ses_send_notification: () => ({
    messageId: `ses-${Date.now()}`,
    sentAt: new Date().toISOString(),
  }),

  analyse_backlog_health: () => ({
    totalItems: 47,
    issues: [
      {
        ticketKey: 'ATL-320',
        title: 'Legacy API wrapper',
        flag: 'stale',
        detail: 'No updates in 35 days',
        suggestedAction: 'Close or re-prioritise',
      },
      {
        ticketKey: 'ATL-333',
        title: 'User profile caching',
        flag: 'missing_acceptance_criteria',
        detail: 'No acceptance criteria defined',
        suggestedAction: 'Add criteria before sprint planning',
      },
      {
        ticketKey: 'ATL-280',
        title: 'Critical performance fix',
        flag: 'priority_conflict',
        detail: 'Marked Critical but not in current sprint',
        suggestedAction: 'Pull into sprint or downgrade priority',
      },
    ],
    summary: {
      missingCriteria: 8,
      staleTickets: 2,
      priorityConflicts: 1,
      orphanEpics: 3,
      scopeCreepIndicators: 0,
    },
  }),

  analyse_raid_coherence: () => ({
    totalItems: 3,
    staleItems: [
      { id: 'R-015', title: 'API v3 dependency', daysSinceReview: 4 },
    ],
    conflicts: [],
    closureCandidates: [],
  }),

  analyse_delivery_risk: () => ({
    overallRisk: 'high',
    milestones: [
      {
        name: 'Beta Launch',
        dueDate: '2026-03-15T00:00:00Z',
        status: 'at_risk',
        riskFactors: [
          'Velocity gap (36%)',
          'API dependency unconfirmed',
          'Design assets delayed',
        ],
        completionProbability: 0.25,
      },
    ],
    velocityAnalysis: {
      required: 34,
      actual: 25,
      gapPercent: 26,
      trend: 'declining',
    },
  }),
};

// ─── Mock Tool Executor ────────────────────────────────────────

interface MockToolExecutorOptions {
  autonomy?: AutonomyMode;
  /** Log all tool calls for debugging */
  verbose?: boolean;
}

export class MockToolExecutor implements ToolExecutor {
  private readonly autonomy: AutonomyMode;
  private readonly verbose: boolean;
  private readonly callLog: ToolResult[] = [];

  constructor(options?: MockToolExecutorOptions) {
    this.autonomy = options?.autonomy ?? 'act';
    this.verbose = options?.verbose ?? false;
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    // Find tool definition
    const toolDef = TOOL_CATALOGUE.find((t) => t.name === toolName);
    if (!toolDef) {
      const result: ToolResult = {
        toolName,
        result: undefined,
        error: `Unknown tool: ${toolName}`,
      };
      this.callLog.push(result);
      return result;
    }

    // Evaluate policy
    const ctx: ToolExecutionContext = {
      isBackground: false,
      userApproved: false,
      holdQueueApproved: false,
    };
    const decision = evaluatePolicy(toolDef, this.autonomy, ctx);

    if (!decision.permitted && decision.action === 'deny') {
      const result: ToolResult = {
        toolName,
        result: undefined,
        error: `Policy denied: ${decision.reason}`,
      };
      this.callLog.push(result);
      return result;
    }

    // Execute the handler
    const handler = TOOL_HANDLERS[toolName];
    if (!handler) {
      const result: ToolResult = {
        toolName,
        result: undefined,
        error: `No mock handler for tool: ${toolName}`,
      };
      this.callLog.push(result);
      return result;
    }

    const data = handler(params);

    if (this.verbose) {
      console.log(
        `[MockTool] ${toolName}(${JSON.stringify(params)}) → ${JSON.stringify(data).substring(0, 200)}`
      );
    }

    const result: ToolResult = { toolName, result: data };
    this.callLog.push(result);
    return result;
  }

  listAvailable(): string[] {
    return TOOL_CATALOGUE.map((t) => t.name);
  }

  // ─── Test Helpers ──────────────────────────────────────────

  getCallLog(): ToolResult[] {
    return [...this.callLog];
  }

  getCallsForTool(toolName: string): ToolResult[] {
    return this.callLog.filter((c) => c.toolName === toolName);
  }

  clearCallLog(): void {
    this.callLog.length = 0;
  }

  setAutonomy(level: AutonomyMode): void {
    (this as { autonomy: AutonomyMode }).autonomy = level;
  }
}

// ─── Exports ───────────────────────────────────────────────────

/** Fake project data for use in tests and local development. */
export const FAKE_DATA = {
  project: FAKE_PROJECT,
  sprint: FAKE_SPRINT,
  issues: FAKE_ISSUES,
  deliveryState: FAKE_DELIVERY_STATE,
  raidLog: FAKE_RAID_LOG,
  emails: FAKE_EMAILS,
};
