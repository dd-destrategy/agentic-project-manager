/**
 * Seed DynamoDB Local with realistic sample data for all entity types.
 *
 * Usage: npx tsx scripts/seed-local-db.ts
 */

import { DynamoDBClient as AWSDynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = 'AgenticPM';
const ENDPOINT = 'http://127.0.0.1:4566';

const rawClient = new AWSDynamoDBClient({
  region: 'ap-southeast-2',
  endpoint: ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});
const docClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date();
const iso = (d: Date = now) => d.toISOString();
const dateOnly = (d: Date = now) => d.toISOString().split('T')[0]; // YYYY-MM-DD
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);
const ttl = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;

// Simple counter-based IDs (not real ULIDs but deterministic & unique)
let ulidCounter = 0;
const ulid = () => {
  ulidCounter++;
  const ts = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const rand = ulidCounter.toString(36).toUpperCase().padStart(16, '0');
  return (ts + rand).slice(0, 26).padEnd(26, '0');
};

// UUIDs
const PROJECT_1_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_2_ID = '22222222-2222-2222-2222-222222222222';
const ESC_1_ID = '33333333-3333-3333-3333-333333333331';
const ESC_2_ID = '33333333-3333-3333-3333-333333333332';
const ESC_3_ID = '33333333-3333-3333-3333-333333333333';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projects = [
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: 'METADATA',
    GSI1PK: 'STATUS#active',
    GSI1SK: iso(hoursAgo(2)),
    id: PROJECT_1_ID,
    name: 'Widget Platform Migration',
    description:
      'Migrating the legacy Widget Platform from monolith to microservices architecture. Target completion Q2 2026.',
    status: 'active',
    source: 'jira',
    sourceProjectKey: 'WPM',
    autonomyLevel: 'artefact',
    config: {
      pollingIntervalMinutes: 15,
      holdQueueMinutes: 30,
      jiraBoardId: 'WPM-BOARD-1',
    },
    createdAt: iso(daysAgo(30)),
    updatedAt: iso(hoursAgo(2)),
  },
  {
    PK: `PROJECT#${PROJECT_2_ID}`,
    SK: 'METADATA',
    GSI1PK: 'STATUS#active',
    GSI1SK: iso(hoursAgo(5)),
    id: PROJECT_2_ID,
    name: 'Q3 Security Audit',
    description:
      'Comprehensive security audit of all production services ahead of compliance certification.',
    status: 'active',
    source: 'jira',
    sourceProjectKey: 'SEC',
    autonomyLevel: 'monitoring',
    config: {
      pollingIntervalMinutes: 15,
      holdQueueMinutes: 60,
      jiraBoardId: 'SEC-BOARD-1',
    },
    createdAt: iso(daysAgo(14)),
    updatedAt: iso(hoursAgo(5)),
  },
];

// ---------------------------------------------------------------------------
// Artefacts — 4 types per project
// ---------------------------------------------------------------------------

function makeArtefacts(
  projectId: string,
  projectKey: string,
  createdDaysAgo: number
) {
  const base = {
    PK: `PROJECT#${projectId}`,
    projectId,
    version: 2,
    createdAt: iso(daysAgo(createdDaysAgo)),
    updatedAt: iso(hoursAgo(3)),
    updatedBy: 'agent',
    rationale: 'Updated based on latest Jira signals',
  };

  return [
    {
      ...base,
      SK: 'ARTEFACT#delivery_state',
      id: crypto.randomUUID(),
      type: 'delivery_state',
      content: {
        overallStatus: projectKey === 'WPM' ? 'amber' : 'green',
        statusSummary:
          projectKey === 'WPM'
            ? 'Sprint 4 is at risk due to API gateway dependency. 2 blockers open. Velocity trending down.'
            : 'Security audit progressing well. Penetration testing phase complete. Report drafting underway.',
        currentSprint: {
          name: projectKey === 'WPM' ? 'Sprint 4' : 'Audit Phase 3',
          startDate: iso(daysAgo(10)),
          endDate: iso(daysFromNow(4)),
          goal:
            projectKey === 'WPM'
              ? 'Complete API gateway migration and auth service deployment'
              : 'Complete vulnerability report and remediation plan',
          progress: {
            totalPoints: 34,
            completedPoints: projectKey === 'WPM' ? 18 : 28,
            inProgressPoints: projectKey === 'WPM' ? 10 : 4,
            blockedPoints: projectKey === 'WPM' ? 6 : 2,
          },
        },
        milestones: [
          {
            name:
              projectKey === 'WPM'
                ? 'API Gateway Go-Live'
                : 'Audit Report Submission',
            dueDate: iso(daysFromNow(14)),
            status: projectKey === 'WPM' ? 'at_risk' : 'on_track',
            notes:
              projectKey === 'WPM'
                ? 'Dependency on third-party vendor response'
                : 'Draft in review with security lead',
          },
          {
            name:
              projectKey === 'WPM'
                ? 'Data Migration Complete'
                : 'Remediation Complete',
            dueDate: iso(daysFromNow(30)),
            status: 'on_track',
          },
        ],
        blockers:
          projectKey === 'WPM'
            ? [
                {
                  id: 'BLK-001',
                  description:
                    'API gateway vendor has not provided updated SDK',
                  owner: 'Sarah Chen',
                  raisedDate: iso(daysAgo(3)),
                  severity: 'high',
                  sourceTicket: 'WPM-142',
                },
                {
                  id: 'BLK-002',
                  description:
                    'Database schema migration script failing on large tables',
                  owner: 'Mike Torres',
                  raisedDate: iso(daysAgo(1)),
                  severity: 'medium',
                  sourceTicket: 'WPM-156',
                },
              ]
            : [],
        keyMetrics: {
          velocityTrend: projectKey === 'WPM' ? 'decreasing' : 'stable',
          avgCycleTimeDays: projectKey === 'WPM' ? 4.2 : 2.8,
          openBlockers: projectKey === 'WPM' ? 2 : 0,
          activeRisks: projectKey === 'WPM' ? 3 : 1,
        },
        nextActions: [
          projectKey === 'WPM'
            ? 'Follow up with vendor on SDK timeline'
            : 'Review remediation plan with ops team',
          projectKey === 'WPM'
            ? 'Pair on database migration script fix'
            : 'Schedule compliance certification meeting',
          'Update stakeholders on sprint progress',
        ],
      },
    },
    {
      ...base,
      SK: 'ARTEFACT#raid_log',
      id: crypto.randomUUID(),
      type: 'raid_log',
      content: {
        items: [
          {
            id: 'R-001',
            type: 'risk',
            title:
              projectKey === 'WPM'
                ? 'Vendor SDK delay impacts go-live'
                : 'Scope creep from additional compliance requirements',
            description:
              projectKey === 'WPM'
                ? 'The API gateway vendor has not delivered the updated SDK. This may delay the go-live by 2 weeks.'
                : 'New GDPR requirements may expand audit scope beyond original estimate.',
            severity: 'high',
            status: 'open',
            owner: projectKey === 'WPM' ? 'Sarah Chen' : 'Alex Kim',
            raisedDate: iso(daysAgo(5)),
            mitigation:
              projectKey === 'WPM'
                ? 'Exploring alternative gateway providers as fallback'
                : 'Assessing impact with legal team',
            source: 'agent_detected',
            sourceReference: projectKey === 'WPM' ? 'WPM-142' : 'SEC-78',
            lastReviewed: iso(daysAgo(1)),
          },
          {
            id: 'I-001',
            type: 'issue',
            title:
              projectKey === 'WPM'
                ? 'CI pipeline intermittently failing'
                : 'Test environment access delays',
            description:
              projectKey === 'WPM'
                ? 'The CI pipeline for the auth service fails roughly 1 in 5 runs due to flaky integration tests.'
                : 'Team members report 24-48h delays getting access to the staging environment.',
            severity: 'medium',
            status: 'mitigating',
            owner: projectKey === 'WPM' ? 'Dev Team' : 'Ops Team',
            raisedDate: iso(daysAgo(8)),
            mitigation: 'Working on improved test isolation',
            source: 'integration_signal',
            lastReviewed: iso(daysAgo(2)),
          },
          {
            id: 'D-001',
            type: 'dependency',
            title:
              projectKey === 'WPM'
                ? 'Auth service depends on identity provider upgrade'
                : 'Audit tool licence renewal',
            description:
              projectKey === 'WPM'
                ? 'The new auth service requires the identity provider to be upgraded to v3.x first.'
                : 'BurpSuite Enterprise licence expires before audit completion date.',
            severity: 'medium',
            status: 'open',
            owner: projectKey === 'WPM' ? 'Platform Team' : 'Procurement',
            raisedDate: iso(daysAgo(12)),
            source: 'user_added',
            lastReviewed: iso(daysAgo(3)),
          },
        ],
      },
    },
    {
      ...base,
      SK: 'ARTEFACT#backlog_summary',
      id: crypto.randomUUID(),
      type: 'backlog_summary',
      content: {
        source: 'jira',
        lastSynced: iso(hoursAgo(1)),
        summary: {
          totalItems: projectKey === 'WPM' ? 47 : 23,
          byStatus: {
            toDo: projectKey === 'WPM' ? 15 : 5,
            inProgress: projectKey === 'WPM' ? 10 : 8,
            doneThisSprint: projectKey === 'WPM' ? 18 : 9,
            blocked: projectKey === 'WPM' ? 4 : 1,
          },
          byPriority: {
            critical: projectKey === 'WPM' ? 2 : 0,
            high: projectKey === 'WPM' ? 8 : 4,
            medium: projectKey === 'WPM' ? 22 : 12,
            low: projectKey === 'WPM' ? 15 : 7,
          },
        },
        highlights: [
          {
            ticketId: `${projectKey}-101`,
            title:
              projectKey === 'WPM'
                ? 'Implement rate limiting for API gateway'
                : 'Document firewall rule changes',
            flag: 'blocked',
            detail:
              projectKey === 'WPM'
                ? 'Blocked by vendor SDK delivery'
                : 'Waiting on network team review',
            suggestedAction: 'Escalate to project lead',
          },
          {
            ticketId: `${projectKey}-089`,
            title:
              projectKey === 'WPM'
                ? 'Update monitoring dashboards'
                : 'Review access control policies',
            flag: 'stale',
            detail: 'No updates for 10 days',
          },
        ],
        refinementCandidates: [
          {
            ticketId: `${projectKey}-112`,
            title:
              projectKey === 'WPM'
                ? 'Performance testing for new services'
                : 'Penetration test follow-up items',
            issue: 'Missing acceptance criteria and story points',
          },
        ],
        scopeNotes:
          projectKey === 'WPM'
            ? '3 new tickets added this sprint from stakeholder feedback'
            : 'Scope stable, no changes this cycle',
      },
    },
    {
      ...base,
      SK: 'ARTEFACT#decision_log',
      id: crypto.randomUUID(),
      type: 'decision_log',
      content: {
        decisions: [
          {
            id: 'DEC-001',
            title:
              projectKey === 'WPM'
                ? 'Use Kong as API gateway'
                : 'Use OWASP ZAP for automated scanning',
            context:
              projectKey === 'WPM'
                ? 'Needed to choose between Kong, AWS API Gateway, and Apigee for the new microservices architecture.'
                : 'Evaluated open-source and commercial scanning tools for the automated security testing phase.',
            optionsConsidered: [
              {
                option: projectKey === 'WPM' ? 'Kong' : 'OWASP ZAP',
                pros: [
                  'Open source',
                  'Strong community',
                  'Good plugin ecosystem',
                ],
                cons: ['Operational overhead', 'Learning curve'],
              },
              {
                option: projectKey === 'WPM' ? 'AWS API Gateway' : 'BurpSuite',
                pros: ['Managed service', 'AWS integration'],
                cons: ['Vendor lock-in', 'Cost at scale'],
              },
            ],
            decision: projectKey === 'WPM' ? 'Kong' : 'OWASP ZAP',
            rationale:
              projectKey === 'WPM'
                ? 'Kong provides the best balance of flexibility and cost for our multi-cloud strategy.'
                : 'ZAP provides sufficient coverage for our needs and avoids additional licence costs.',
            madeBy: 'user',
            date: iso(daysAgo(20)),
            status: 'active',
          },
        ],
      },
    },
  ];
}

const artefacts = [
  ...makeArtefacts(PROJECT_1_ID, 'WPM', 28),
  ...makeArtefacts(PROJECT_2_ID, 'SEC', 12),
];

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

const escalations = [
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: `ESCALATION#${ESC_1_ID}`,
    GSI1PK: 'ESCALATION#pending',
    GSI1SK: iso(hoursAgo(4)),
    TTL: ttl(90),
    escalationId: ESC_1_ID,
    projectId: PROJECT_1_ID,
    title: 'API gateway vendor unresponsive — consider fallback provider',
    context: {
      summary:
        'The API gateway vendor has not responded to our SDK request for 5 business days. The go-live milestone is at risk if we continue waiting.',
      triggeringSignals: [
        {
          source: 'jira',
          type: 'ticket_commented',
          summary: 'WPM-142: No vendor update after 5 days',
          timestamp: iso(hoursAgo(4)),
        },
      ],
      relevantArtefacts: [
        {
          artefactType: 'delivery_state',
          excerpt: 'API Gateway Go-Live milestone at risk',
        },
      ],
    },
    options: [
      {
        id: 'opt-1',
        label: 'Wait 5 more business days',
        description: 'Give the vendor more time to respond before switching.',
        pros: ['No rework needed', 'Preserves vendor relationship'],
        cons: ['Further delays possible', 'Go-live at risk'],
        riskLevel: 'medium',
      },
      {
        id: 'opt-2',
        label: 'Switch to AWS API Gateway',
        description:
          'Begin migration to AWS API Gateway as the primary gateway solution.',
        pros: ['Managed service', 'No vendor dependency', 'Quick setup'],
        cons: ['2-3 days rework', 'Vendor lock-in'],
        riskLevel: 'low',
      },
    ],
    agentRecommendation: 'opt-2',
    agentRationale:
      'Given the timeline pressure and lack of vendor response, switching to a managed service eliminates the dependency risk.',
    status: 'pending',
    createdAt: iso(hoursAgo(4)),
    expiresAt: iso(daysFromNow(7)),
  },
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: `ESCALATION#${ESC_2_ID}`,
    GSI1PK: 'ESCALATION#pending',
    GSI1SK: iso(hoursAgo(12)),
    TTL: ttl(90),
    escalationId: ESC_2_ID,
    projectId: PROJECT_1_ID,
    title: 'Sprint scope increase — 3 unplanned tickets added',
    context: {
      summary:
        'Three unplanned tickets were added to Sprint 4 by stakeholders, increasing scope by approximately 13 story points.',
      triggeringSignals: [
        {
          source: 'jira',
          type: 'sprint_scope_changed',
          summary: 'Sprint 4 scope increased by 13 points',
          timestamp: iso(hoursAgo(12)),
        },
      ],
    },
    options: [
      {
        id: 'opt-1',
        label: 'Accept scope increase',
        description: 'Keep all tickets in the sprint and adjust expectations.',
        pros: ['Stakeholder satisfaction'],
        cons: ['Sprint likely to miss goal', 'Team overloaded'],
        riskLevel: 'high',
      },
      {
        id: 'opt-2',
        label: 'Move new tickets to next sprint',
        description: 'Remove the 3 new tickets and schedule for Sprint 5.',
        pros: ['Protects sprint goal', 'Maintains velocity'],
        cons: ['Stakeholder pushback possible'],
        riskLevel: 'low',
      },
    ],
    agentRecommendation: 'opt-2',
    agentRationale:
      'Sprint velocity is already decreasing. Adding 13 points to a sprint that is at risk will almost certainly cause a miss.',
    status: 'pending',
    createdAt: iso(hoursAgo(12)),
    expiresAt: iso(daysFromNow(7)),
  },
  {
    PK: `PROJECT#${PROJECT_2_ID}`,
    SK: `ESCALATION#${ESC_3_ID}`,
    GSI1PK: 'ESCALATION#decided',
    GSI1SK: iso(daysAgo(2)),
    TTL: ttl(90),
    escalationId: ESC_3_ID,
    projectId: PROJECT_2_ID,
    title: 'Critical vulnerability found in auth module',
    context: {
      summary:
        'Automated scanning detected a critical SQL injection vulnerability in the authentication module. Requires immediate remediation.',
      triggeringSignals: [
        {
          source: 'jira',
          type: 'ticket_created',
          summary: 'SEC-92: Critical SQLi in auth module',
          timestamp: iso(daysAgo(3)),
        },
      ],
    },
    options: [
      {
        id: 'opt-1',
        label: 'Immediate hotfix',
        description: 'Deploy a targeted fix within 24 hours.',
        pros: ['Fast resolution', 'Minimises exposure window'],
        cons: ['Rushed testing'],
        riskLevel: 'medium',
      },
      {
        id: 'opt-2',
        label: 'Full refactor of auth module',
        description:
          'Rewrite the vulnerable module with parameterised queries.',
        pros: ['Comprehensive fix', 'Prevents recurrence'],
        cons: ['3-5 day timeline'],
        riskLevel: 'low',
      },
    ],
    agentRecommendation: 'opt-1',
    agentRationale:
      'Critical severity warrants immediate action. Follow up with full refactor.',
    status: 'decided',
    userDecision: 'opt-1',
    userNotes: 'Agreed — hotfix now, schedule full refactor for next sprint.',
    decidedAt: iso(daysAgo(2)),
    createdAt: iso(daysAgo(3)),
    expiresAt: iso(daysFromNow(4)),
  },
];

// ---------------------------------------------------------------------------
// Held Actions
// ---------------------------------------------------------------------------

const ACTION_1_ID = ulid();
const ACTION_2_ID = ulid();

const heldActions = [
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: `HELD#${ACTION_1_ID}`,
    GSI1PK: 'HELD#PENDING',
    GSI1SK: iso(hoursAgo(0.5)),
    TTL: ttl(90),
    actionId: ACTION_1_ID,
    projectId: PROJECT_1_ID,
    actionType: 'email_stakeholder',
    description: 'Send sprint risk update to stakeholders',
    payload: {
      to: ['pm-lead@example.com', 'cto@example.com'],
      subject: 'Widget Platform Migration — Sprint 4 Risk Update',
      body: 'Sprint 4 is at risk due to 2 open blockers and scope increase. Recommend de-scoping 3 recently added tickets.',
    },
    status: 'pending',
    heldUntil: iso(hoursAgo(-0.5)), // 30 min from now
    createdAt: iso(hoursAgo(1)),
  },
  {
    PK: `PROJECT#${PROJECT_2_ID}`,
    SK: `HELD#${ACTION_2_ID}`,
    GSI1PK: 'HELD#PENDING',
    GSI1SK: iso(hoursAgo(2)),
    TTL: ttl(90),
    actionId: ACTION_2_ID,
    projectId: PROJECT_2_ID,
    actionType: 'jira_status_change',
    description: 'Move SEC-92 to In Progress after hotfix decision',
    payload: {
      ticketId: 'SEC-92',
      fromStatus: 'To Do',
      toStatus: 'In Progress',
      comment:
        'Moving to In Progress per escalation decision — immediate hotfix approved.',
    },
    status: 'pending',
    heldUntil: iso(hoursAgo(-1)), // 1h from now
    createdAt: iso(hoursAgo(2)),
  },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function makeEvent(
  projectId: string | undefined,
  eventType: string,
  severity: string,
  summary: string,
  createdAt: Date,
  detail?: Record<string, unknown>
) {
  const id = ulid();
  const ts = iso(createdAt);
  const day = dateOnly(createdAt);
  const pk = projectId ? `PROJECT#${projectId}` : 'GLOBAL';

  return {
    PK: pk,
    SK: `EVENT#${ts}#${id}`,
    GSI1PK: `EVENT#${day}`,
    GSI1SK: `${ts}#${id}`,
    TTL: ttl(30),
    id,
    projectId,
    eventType,
    severity,
    summary,
    detail,
    createdAt: ts,
  };
}

const events = [
  // Heartbeats
  makeEvent(
    undefined,
    'heartbeat',
    'info',
    'Agent cycle completed — no changes detected',
    hoursAgo(0.25)
  ),
  makeEvent(
    undefined,
    'heartbeat_with_changes',
    'info',
    'Agent cycle completed — 2 artefacts updated',
    hoursAgo(1)
  ),
  // Project 1 events
  makeEvent(
    PROJECT_1_ID,
    'signal_detected',
    'info',
    'Jira: Sprint 4 scope changed (+3 tickets, +13 points)',
    hoursAgo(12)
  ),
  makeEvent(
    PROJECT_1_ID,
    'artefact_updated',
    'info',
    'Delivery state updated — overall status changed to amber',
    hoursAgo(3)
  ),
  makeEvent(
    PROJECT_1_ID,
    'escalation_created',
    'warning',
    'New escalation: API gateway vendor unresponsive',
    hoursAgo(4)
  ),
  makeEvent(
    PROJECT_1_ID,
    'escalation_created',
    'warning',
    'New escalation: Sprint scope increase',
    hoursAgo(12)
  ),
  makeEvent(
    PROJECT_1_ID,
    'action_held',
    'info',
    'Email to stakeholders held for 30 minutes',
    hoursAgo(1)
  ),
  makeEvent(
    PROJECT_1_ID,
    'signal_detected',
    'info',
    'Jira: WPM-156 created — DB migration script failing',
    hoursAgo(6)
  ),
  // Project 2 events
  makeEvent(
    PROJECT_2_ID,
    'escalation_decided',
    'info',
    'Escalation decided: Critical vulnerability — immediate hotfix selected',
    daysAgo(2)
  ),
  makeEvent(
    PROJECT_2_ID,
    'artefact_updated',
    'info',
    'RAID log updated — new critical issue added',
    daysAgo(3)
  ),
  makeEvent(
    PROJECT_2_ID,
    'action_held',
    'info',
    'Jira status change held for review',
    hoursAgo(2)
  ),
  makeEvent(
    PROJECT_2_ID,
    'signal_detected',
    'info',
    'Jira: SEC-92 critical vulnerability ticket created',
    daysAgo(3)
  ),
  // Global events
  makeEvent(
    undefined,
    'budget_warning',
    'warning',
    'Daily LLM spend at 78% of limit ($0.18 / $0.23)',
    hoursAgo(6)
  ),
];

// ---------------------------------------------------------------------------
// Agent Config
// ---------------------------------------------------------------------------

const agentConfig = [
  {
    PK: 'AGENT',
    SK: 'CONFIG#main',
    pollingIntervalMinutes: 15,
    budgetCeilingDailyUsd: 0.23,
    holdQueueMinutes: 30,
    workingHours: {
      start: '08:00',
      end: '18:00',
      timezone: 'Australia/Sydney',
    },
    llmSplit: { haikuPercent: 70, sonnetPercent: 30 },
    autonomyLevel: 'artefact',
    dryRun: false,
    updatedAt: iso(hoursAgo(1)),
  },
  {
    PK: 'AGENT',
    SK: 'CONFIG#last_heartbeat',
    value: iso(hoursAgo(0.25)),
    updatedAt: iso(hoursAgo(0.25)),
  },
  {
    PK: 'AGENT',
    SK: 'CONFIG#daily_spend_usd',
    value: 0.18,
    date: dateOnly(),
    updatedAt: iso(hoursAgo(1)),
  },
  {
    PK: 'AGENT',
    SK: 'CONFIG#monthly_spend_usd',
    value: 3.42,
    month: now.toISOString().slice(0, 7), // YYYY-MM
    updatedAt: iso(hoursAgo(1)),
  },
];

// ---------------------------------------------------------------------------
// Ingestion Session
// ---------------------------------------------------------------------------

const SESSION_ID = ulid();

const ingestionSession = {
  PK: `INGEST#${SESSION_ID}`,
  SK: 'METADATA',
  GSI1PK: 'INGEST#active',
  GSI1SK: iso(hoursAgo(6)),
  TTL: ttl(90),
  sessionId: SESSION_ID,
  title: 'Standup notes — 6 Feb',
  status: 'active',
  projectId: PROJECT_1_ID,
  messages: [
    {
      id: 'msg-001',
      role: 'user',
      content:
        'From standup: Sarah flagged the vendor SDK is still missing. Mike found a bug in the DB migration script. 3 new tickets were added to the sprint by product.',
      timestamp: iso(hoursAgo(6)),
    },
    {
      id: 'msg-002',
      role: 'assistant',
      content:
        "I've identified 3 items from your standup notes:\n\n1. **Risk**: Vendor SDK still missing (affects API gateway go-live)\n2. **Issue**: DB migration script bug (WPM-156)\n3. **Scope change**: 3 unplanned tickets added to Sprint 4\n\nI'll add these to the staging area for your review.",
      timestamp: iso(hoursAgo(6)),
    },
  ],
  createdAt: iso(hoursAgo(6)),
  updatedAt: iso(hoursAgo(6)),
};

// ---------------------------------------------------------------------------
// Extracted Items
// ---------------------------------------------------------------------------

const EXTRACT_1_ID = ulid();
const EXTRACT_2_ID = ulid();
const EXTRACT_3_ID = ulid();

const extractedItems = [
  {
    PK: `INGEST#${SESSION_ID}`,
    SK: `EXTRACT#${EXTRACT_1_ID}`,
    GSI1PK: 'EXTRACT#pending_review',
    GSI1SK: iso(hoursAgo(6)),
    TTL: ttl(90),
    id: EXTRACT_1_ID,
    sessionId: SESSION_ID,
    messageId: 'msg-001',
    type: 'risk',
    title: 'Vendor SDK delivery delay',
    content:
      'API gateway vendor has not delivered the updated SDK. This is blocking the API gateway go-live milestone.',
    targetArtefact: 'raid_log',
    priority: 'high',
    status: 'pending_review',
    projectId: PROJECT_1_ID,
    createdAt: iso(hoursAgo(6)),
    updatedAt: iso(hoursAgo(6)),
  },
  {
    PK: `INGEST#${SESSION_ID}`,
    SK: `EXTRACT#${EXTRACT_2_ID}`,
    GSI1PK: 'EXTRACT#pending_review',
    GSI1SK: iso(hoursAgo(6)),
    TTL: ttl(90),
    id: EXTRACT_2_ID,
    sessionId: SESSION_ID,
    messageId: 'msg-001',
    type: 'blocker',
    title: 'DB migration script failing on large tables',
    content:
      'The database schema migration script is failing on tables with more than 1M rows. Mike Torres investigating.',
    targetArtefact: 'delivery_state',
    priority: 'medium',
    status: 'pending_review',
    projectId: PROJECT_1_ID,
    createdAt: iso(hoursAgo(6)),
    updatedAt: iso(hoursAgo(6)),
  },
  {
    PK: `INGEST#${SESSION_ID}`,
    SK: `EXTRACT#${EXTRACT_3_ID}`,
    GSI1PK: 'EXTRACT#approved',
    GSI1SK: iso(hoursAgo(5)),
    TTL: ttl(90),
    id: EXTRACT_3_ID,
    sessionId: SESSION_ID,
    messageId: 'msg-001',
    type: 'status_update',
    title: 'Sprint 4 scope increased by 3 tickets',
    content:
      'Product added 3 unplanned tickets to Sprint 4, increasing scope by ~13 story points.',
    targetArtefact: 'backlog_summary',
    priority: 'medium',
    status: 'approved',
    projectId: PROJECT_1_ID,
    createdAt: iso(hoursAgo(6)),
    updatedAt: iso(hoursAgo(5)),
  },
];

// ---------------------------------------------------------------------------
// Graduation State
// ---------------------------------------------------------------------------

const graduationStates = [
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: 'GRADUATION#email_stakeholder',
    actionType: 'email_stakeholder',
    consecutiveApprovals: 3,
    currentHoldMinutes: 30,
    graduationTier: 0,
    lastApprovedAt: iso(hoursAgo(2)),
    createdAt: iso(daysAgo(10)),
    updatedAt: iso(hoursAgo(2)),
  },
  {
    PK: `PROJECT#${PROJECT_1_ID}`,
    SK: 'GRADUATION#jira_status_change',
    actionType: 'jira_status_change',
    consecutiveApprovals: 7,
    currentHoldMinutes: 15,
    graduationTier: 1,
    lastApprovedAt: iso(hoursAgo(6)),
    createdAt: iso(daysAgo(10)),
    updatedAt: iso(hoursAgo(6)),
  },
];

// ---------------------------------------------------------------------------
// Integration Health Config
// ---------------------------------------------------------------------------

const integrationConfigs = [
  {
    PK: 'INTEGRATION#jira',
    SK: 'CONFIG',
    name: 'jira',
    healthy: true,
    lastHealthCheck: iso(hoursAgo(0.25)),
    consecutiveFailures: 0,
    latencyMs: 245,
    details: {
      accountId: '5f4dcc3b5aa765d61d8327deb882cf99',
      displayName: 'PM Agent',
      active: true,
    },
    createdAt: iso(daysAgo(14)),
    updatedAt: iso(hoursAgo(0.25)),
  },
  {
    PK: 'INTEGRATION#ses',
    SK: 'CONFIG',
    name: 'ses',
    healthy: true,
    lastHealthCheck: iso(hoursAgo(0.25)),
    consecutiveFailures: 0,
    latencyMs: 120,
    details: {
      max24HourSend: 50000,
      sentLast24Hours: 3,
      maxSendRate: 14,
    },
    createdAt: iso(daysAgo(14)),
    updatedAt: iso(hoursAgo(0.25)),
  },
];

// ---------------------------------------------------------------------------
// Write all items
// ---------------------------------------------------------------------------

async function batchPut(items: Record<string, unknown>[]) {
  // DynamoDB BatchWrite supports max 25 items per request
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      })
    );
  }
}

async function main() {
  const allItems: Record<string, unknown>[] = [
    ...projects,
    ...artefacts,
    ...escalations,
    ...heldActions,
    ...events,
    ...agentConfig,
    ...graduationStates,
    ...integrationConfigs,
    ingestionSession,
    ...extractedItems,
  ];

  console.log(`Seeding ${allItems.length} items into ${TABLE_NAME}...`);
  await batchPut(allItems);
  console.log(
    `Seeded successfully:\n` +
      `  ${projects.length} projects\n` +
      `  ${artefacts.length} artefacts\n` +
      `  ${escalations.length} escalations\n` +
      `  ${heldActions.length} held actions\n` +
      `  ${events.length} events\n` +
      `  ${agentConfig.length} agent config entries\n` +
      `  ${graduationStates.length} graduation states\n` +
      `  ${integrationConfigs.length} integration health configs\n` +
      `  1 ingestion session\n` +
      `  ${extractedItems.length} extracted items`
  );
}

main().catch((err) => {
  console.error('Failed to seed local DB:', err);
  process.exit(1);
});
