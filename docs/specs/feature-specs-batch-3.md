# Feature Specifications -- Batch 3

**Status:** Draft
**Author:** Technical Product Architect
**Date:** 2026-02-07
**Covers:** Status Report Generator, Longitudinal Project Memory, Idempotent External Action Execution

---

## Table of Contents

1. [Feature 1: Status Report / Weekly Narrative Generator](#feature-1-status-report--weekly-narrative-generator)
2. [Feature 2: Longitudinal Project Memory with Trend Analytics](#feature-2-longitudinal-project-memory-with-trend-analytics)
3. [Feature 3: Idempotent External Action Execution](#feature-3-idempotent-external-action-execution)

---

# Feature 1: Status Report / Weekly Narrative Generator

## 1. Functional Specification

### User Story

**As a** PM using the Agentic PM Workbench,
**I want to** generate stakeholder-ready status reports from my existing artefact data with a single click,
**so that** I can produce consistent, professional reports without manually assembling data from delivery state, RAID log, backlog summary, and decision log artefacts.

### Detailed Behaviour Description

The Status Report Generator synthesises all four artefact types for a project into a cohesive narrative report. The system supports three audience templates:

1. **Steering Committee** -- Formal tone, RAG status prominent, milestone focus, risk summary, key decisions, budget/timeline callouts. Typically 1--2 pages.
2. **Team** -- Informal tone, sprint-level detail, blocker focus, backlog highlights, refinement candidates, next actions. Typically 1 page.
3. **Executive** -- Brief, high-level, 3--5 bullet points maximum, RAG status, critical risks only, key decision outcomes.

**Generation flow:**

1. User navigates to a project detail page and clicks "Generate Report".
2. User selects audience template from a dropdown.
3. Optionally selects a date range (defaults to "since last report" or "last 7 days" if no prior report exists).
4. System fetches all four artefact types for the project.
5. System calls Claude Sonnet 4.5 via tool-use with the artefact data and audience template prompt.
6. Claude returns structured report content via the `generate_status_report` tool.
7. Report appears in a preview pane with rich formatting (rendered Markdown).
8. User can edit the report inline (textarea with Markdown preview toggle).
9. User can then:
   - **Send via SES**: Opens a recipient selector (pre-populated from project config `monitoredEmails` or agent config `digestEmail`), then sends.
   - **Copy to clipboard**: Copies Markdown or plain text.
   - **Download**: Exports as `.md` file.
   - **Save as draft**: Persists to DynamoDB for later editing/sending.
10. After sending, the report is saved with `status: 'sent'` and the send timestamp is recorded.

**LLM prompt strategy:**

- Uses Sonnet 4.5 (complex reasoning tier) since report generation is a high-value, low-frequency operation.
- Tool-use schema enforces structured output with sections matching the audience template.
- System prompt includes audience-specific formatting instructions and tone guidance.
- Input context is capped at the four artefact contents plus optional recent events (last 20 events within date range) to stay within budget.

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| One or more artefacts are empty (version 1, bootstrapped) | Report includes a note: "No data available for [artefact type]." The section is omitted from the narrative. |
| LLM budget exceeded (degradation tier 2+) | Generation is blocked. UI displays: "Report generation unavailable -- daily LLM budget reached. Try again tomorrow or use manual export." |
| LLM call fails (timeout, API error) | Retry once automatically. If second attempt fails, display error with option to retry manually. Draft is not saved. |
| Project has no artefacts at all | "Generate Report" button is disabled with tooltip: "No artefact data available." |
| Report content exceeds SES size limit (10 MB) | Extremely unlikely given text-only content, but truncate HTML at 256 KB and warn user. |
| SES send fails | Display error toast with SES error message. Report remains in "draft" status. User can retry sending. |
| User navigates away during generation | Generation continues in the background. If user returns, the most recent draft is displayed. |
| Concurrent report generation for same project | Second request is rejected with "A report is already being generated for this project." |

---

## 2. Data Model Changes

### New DynamoDB Entity: StatusReport

| Attribute | Type | Description |
|---|---|---|
| **PK** | `PROJECT#<projectId>` | Partition key |
| **SK** | `REPORT#<reportId>` | Sort key (ULID for time-ordered retrieval) |
| **GSI1PK** | `REPORT#<status>` | Index by status (`draft`, `sent`) |
| **GSI1SK** | `<createdAt>` | Sort within status by creation time |
| **TTL** | number | 180-day expiry (15,552,000 seconds) |
| reportId | string (ULID) | Unique report identifier |
| projectId | string (UUID) | Parent project |
| audience | `'steering_committee' \| 'team' \| 'executive'` | Audience template used |
| title | string | Report title (auto-generated, user-editable) |
| contentMarkdown | string | Full report content in Markdown |
| contentHtml | string | Rendered HTML (generated at save time) |
| status | `'generating' \| 'draft' \| 'sent' \| 'failed'` | Report lifecycle status |
| dateRangeStart | string (ISO 8601) | Start of reporting period |
| dateRangeEnd | string (ISO 8601) | End of reporting period |
| artefactVersions | object | Snapshot of artefact versions used: `{ delivery_state: number, raid_log: number, backlog_summary: number, decision_log: number }` |
| recipients | string[] | Email addresses (populated on send) |
| sentAt | string (ISO 8601) | When the report was sent |
| sesMessageId | string | SES message ID for tracking |
| llmCostUsd | number | Cost of the generation call |
| tokensUsed | object | `{ input: number, output: number }` |
| createdAt | string (ISO 8601) | Creation timestamp |
| updatedAt | string (ISO 8601) | Last modification |

### New Zod Schemas

Add to `/home/user/agentic-project-manager/packages/core/src/schemas/index.ts`:

```typescript
export const ReportAudienceSchema = z.enum([
  'steering_committee',
  'team',
  'executive',
]);

export const ReportStatusSchema = z.enum([
  'generating',
  'draft',
  'sent',
  'failed',
]);

export const ArtefactVersionSnapshotSchema = z.object({
  delivery_state: z.number().int().min(0),
  raid_log: z.number().int().min(0),
  backlog_summary: z.number().int().min(0),
  decision_log: z.number().int().min(0),
});

export const StatusReportSchema = z.object({
  reportId: UlidSchema,
  projectId: UuidSchema,
  audience: ReportAudienceSchema,
  title: z.string().min(1).max(300),
  contentMarkdown: z.string().max(100_000),
  contentHtml: z.string().max(500_000).optional(),
  status: ReportStatusSchema,
  dateRangeStart: IsoDateTimeSchema,
  dateRangeEnd: IsoDateTimeSchema,
  artefactVersions: ArtefactVersionSnapshotSchema,
  recipients: z.array(z.string().email()).optional(),
  sentAt: IsoDateTimeSchema.optional(),
  sesMessageId: z.string().optional(),
  llmCostUsd: z.number().min(0).optional(),
  tokensUsed: z.object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
  }).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const GenerateReportRequestSchema = z.object({
  projectId: UuidSchema,
  audience: ReportAudienceSchema,
  dateRangeStart: IsoDateTimeSchema.optional(),
  dateRangeEnd: IsoDateTimeSchema.optional(),
});

export const SendReportRequestSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(20),
});

export const UpdateReportRequestSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  contentMarkdown: z.string().max(100_000).optional(),
});
```

### New TypeScript Types

Add to `/home/user/agentic-project-manager/packages/core/src/types/index.ts`:

```typescript
export type ReportAudience = z.infer<typeof ReportAudienceSchema>;
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export type ArtefactVersionSnapshot = z.infer<typeof ArtefactVersionSnapshotSchema>;
export type StatusReport = z.infer<typeof StatusReportSchema>;
```

---

## 3. Backend Tasks

### 3.1 New Repository: StatusReportRepository

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/status-report.ts`

Methods:
- `create(report: Omit<StatusReport, 'reportId' | 'createdAt' | 'updatedAt'>): Promise<StatusReport>` -- Creates report with ULID, sets GSI1 keys.
- `getById(projectId: string, reportId: string): Promise<StatusReport | null>` -- Fetches by PK/SK.
- `getByProject(projectId: string, options?: { status?: ReportStatus; limit?: number }): Promise<QueryResult<StatusReport>>` -- Queries all reports for a project, optionally filtered by status.
- `getRecentByStatus(status: ReportStatus, limit?: number): Promise<QueryResult<StatusReport>>` -- GSI1 query for reports by status.
- `update(projectId: string, reportId: string, updates: Partial<StatusReport>): Promise<StatusReport>` -- Partial update (title, contentMarkdown, status, etc.).
- `markSent(projectId: string, reportId: string, recipients: string[], sesMessageId: string): Promise<StatusReport>` -- Sets status to `sent`, records recipients and SES message ID.
- `delete(projectId: string, reportId: string): Promise<void>` -- Deletes a draft report.

Export from `/home/user/agentic-project-manager/packages/core/src/db/repositories/index.ts`.

### 3.2 New Core Module: Report Generator

**File:** `/home/user/agentic-project-manager/packages/core/src/reports/generator.ts`

```typescript
export class ReportGenerator {
  constructor(
    private claudeClient: ClaudeClient,
    private budgetTracker: BudgetTracker
  ) {}

  async generate(input: ReportGenerationInput): Promise<ReportGenerationResult>;
}
```

- Assembles prompt context from all four artefacts and recent events.
- Calls Claude Sonnet via tool-use with the `generate_status_report` tool.
- Returns structured Markdown content, title, and token usage.
- Checks budget before calling LLM; throws `BudgetExceededError` if tier >= 2.

**File:** `/home/user/agentic-project-manager/packages/core/src/reports/templates.ts`

- Contains audience-specific system prompt templates.
- Defines section structures per audience type.
- Exports `getTemplateForAudience(audience: ReportAudience): ReportTemplate`.

**File:** `/home/user/agentic-project-manager/packages/core/src/reports/markdown-to-html.ts`

- Lightweight Markdown-to-HTML converter for email rendering.
- Uses a minimal parser (no heavy dependencies) or a small library like `marked`.
- Wraps output in the same email template styling used by the daily digest.

### 3.3 New LLM Tool Definition

**File:** `/home/user/agentic-project-manager/packages/core/src/llm/tools.ts` (append)

Add `GENERATE_STATUS_REPORT_TOOL: ToolDefinition` with input schema:
- `title` (string) -- Generated report title.
- `sections` (array of `{ heading: string, content: string }`) -- Report body.
- `executive_summary` (string) -- 2--3 sentence summary.
- `rag_status` (enum: `green`, `amber`, `red`) -- Overall status.
- `key_highlights` (array of string) -- Top 3--5 highlights.
- `risks_and_issues_summary` (string) -- RAID summary prose.
- `next_steps` (array of string) -- Recommended next actions.

### 3.4 New API Routes

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/reports/route.ts`

- `POST /api/reports` -- Initiates report generation. Validates `GenerateReportRequestSchema`. Fetches artefacts, calls `ReportGenerator`, saves draft to DynamoDB. Returns the created report.

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/reports/[id]/route.ts`

- `GET /api/reports/[id]?projectId=<uuid>` -- Fetches a single report.
- `PATCH /api/reports/[id]` -- Updates title or content (draft only).
- `DELETE /api/reports/[id]` -- Deletes a draft report.

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/reports/[id]/send/route.ts`

- `POST /api/reports/[id]/send` -- Sends the report via SES. Validates `SendReportRequestSchema`. Updates report status to `sent`.

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/reports/project/[projectId]/route.ts`

- `GET /api/reports/project/[projectId]` -- Lists reports for a project (paginated, most recent first).

All routes require authentication via `getServerSession(authOptions)`.

---

## 4. Frontend Tasks

### 4.1 New Hook

**File:** `/home/user/agentic-project-manager/packages/web/src/lib/hooks/use-reports.ts`

```typescript
export function useReports(projectId: string | undefined);
export function useReport(reportId: string | undefined, projectId: string | undefined);
export function useGenerateReport();
export function useSendReport();
export function useUpdateReport();
export function useDeleteReport();
```

- `useReports` -- TanStack Query hook for listing reports per project. 60-second stale time.
- `useGenerateReport` -- Mutation hook that POSTs to `/api/reports`. Invalidates `['reports', projectId]` on success.
- `useSendReport` -- Mutation hook that POSTs to `/api/reports/[id]/send`.
- `useUpdateReport` -- Mutation hook that PATCHes `/api/reports/[id]`.
- `useDeleteReport` -- Mutation hook that DELETEs `/api/reports/[id]`.

### 4.2 New Components

**File:** `/home/user/agentic-project-manager/packages/web/src/components/report-generator.tsx`

- `ReportGenerator` component: Audience selector dropdown, date range picker (optional), "Generate" button.
- Shows loading spinner during generation with estimated time ("Generating report... this may take 10--15 seconds").
- On completion, transitions to `ReportPreview`.

**File:** `/home/user/agentic-project-manager/packages/web/src/components/report-preview.tsx`

- `ReportPreview` component: Displays rendered Markdown in a styled card.
- Toggle between rendered view and raw Markdown editor (textarea).
- Action bar at bottom: "Send via Email", "Copy to Clipboard", "Download .md", "Save Draft".
- Send button opens a recipient popover with email input + suggestions from project config.

**File:** `/home/user/agentic-project-manager/packages/web/src/components/report-history.tsx`

- `ReportHistory` component: Lists previous reports for the project in a compact table.
- Columns: Date, Audience, Status badge (draft/sent), Actions (view, resend, delete).
- Clicking a row opens the report in `ReportPreview` (read-only for sent reports).

### 4.3 Page Integration

**File:** `/home/user/agentic-project-manager/packages/web/src/app/(dashboard)/projects/[id]/page.tsx`

- Add a new tab "Reports" to the existing `TabsList` alongside the artefact type tabs and the Graduation tab.
- Tab content renders `ReportGenerator` (top) and `ReportHistory` (below).

### 4.4 UI Wireframe Description

```
+------------------------------------------------------------------+
| [Delivery State] [RAID Log] [Backlog] [Decisions] [Graduation] [Reports] |
+------------------------------------------------------------------+
| GENERATE STATUS REPORT                                            |
| +-------------------------------+  +---------------------------+ |
| | Audience:  [Steering Cttee v] |  | Date Range: [Auto]        | |
| +-------------------------------+  | [2026-01-31] to [2026-02-07]| |
|                                     +---------------------------+ |
| [ Generate Report ]                                               |
+------------------------------------------------------------------+
| REPORT PREVIEW                                      [Edit] [Raw] |
| +--------------------------------------------------------------+ |
| | Weekly Status Report -- Project Alpha                         | |
| | Overall Status: GREEN                                         | |
| |                                                                | |
| | Executive Summary                                              | |
| | Sprint 12 is progressing well with 85% of committed points... | |
| |                                                                | |
| | Key Highlights                                                 | |
| | - Milestone M3 completed on schedule                           | |
| | - Two new risks identified around third-party API dependency  | |
| | ...                                                            | |
| +--------------------------------------------------------------+ |
| [ Send via Email ]  [ Copy ]  [ Download .md ]  [ Save Draft ] |
+------------------------------------------------------------------+
| REPORT HISTORY                                                    |
| +------+------------------+--------+----------------------------+ |
| | Date | Audience         | Status | Actions                    | |
| | 31/1 | Steering Cttee   | Sent   | [View] [Resend]            | |
| | 24/1 | Team             | Draft  | [View] [Edit] [Delete]     | |
| +------+------------------+--------+----------------------------+ |
+------------------------------------------------------------------+
```

---

## 5. Test Plan

### 5.1 Unit Tests

**File:** `/home/user/agentic-project-manager/packages/core/src/reports/__tests__/generator.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| Generates report with all four artefacts populated | Returns Markdown with all expected sections for the audience template. |
| Generates report with one artefact empty | Omits the corresponding section, includes a note about missing data. |
| Rejects generation when budget tier >= 2 | Throws `BudgetExceededError` without calling Claude. |
| Returns correct token usage and cost | `llmCostUsd` and `tokensUsed` match the values from Claude's response. |
| Handles Claude API timeout | Retries once, then throws with descriptive error. |
| Each audience template produces distinct output structure | Steering committee has formal sections; team has sprint detail; executive is brief. |

**File:** `/home/user/agentic-project-manager/packages/core/src/reports/__tests__/templates.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `getTemplateForAudience('steering_committee')` | Returns template with formal tone instructions and milestone section. |
| `getTemplateForAudience('team')` | Returns template with sprint-detail instructions and blocker focus. |
| `getTemplateForAudience('executive')` | Returns template with brevity constraint (max 5 bullets). |
| Unknown audience type | Throws validation error. |

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/__tests__/status-report.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `create` stores report with correct PK/SK/GSI1 keys | PK = `PROJECT#<id>`, SK = `REPORT#<ulid>`, GSI1PK = `REPORT#draft`. |
| `getById` returns null for non-existent report | Returns `null`. |
| `getByProject` returns reports sorted by creation time descending | Most recent report first. |
| `markSent` updates status, recipients, sesMessageId, sentAt | All fields set correctly. GSI1PK updated to `REPORT#sent`. |
| `update` on a sent report throws error | Cannot modify sent reports. |
| `delete` removes the item | Subsequent `getById` returns `null`. |

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/reports/__tests__/route.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| POST without authentication returns 401 | `unauthorised()` response. |
| POST with invalid body returns 400 | Zod validation error details in response. |
| POST with valid body creates report and returns 201 | Report object in response with status `draft`. |
| GET /reports/project/[projectId] returns paginated list | Correct pagination with `hasMore` flag. |
| PATCH on sent report returns 400 | "Cannot edit a sent report." |
| DELETE on sent report returns 400 | "Cannot delete a sent report." |

### 5.2 Integration Tests

| Test Case | Expected Behaviour |
|---|---|
| Full generation flow: create project, bootstrap artefacts, generate report | Report references data from all artefacts. |
| Send flow: generate, save draft, update content, send via SES | SES `sendEmail` called with correct HTML, report status updated to `sent`. |

### 5.3 E2E Tests (Playwright)

| Test Case | Expected Behaviour |
|---|---|
| Navigate to project, click Reports tab, generate a report | Loading spinner shown, report preview appears within 20 seconds. |
| Edit report content in raw mode and save draft | Content persists after page refresh. |
| Send report and verify it appears in history with "Sent" badge | History table updates. |

---

## 6. Acceptance Criteria

- **AC-1:** Clicking "Generate Report" on a project with populated artefacts produces a Markdown report within 20 seconds containing an executive summary, key highlights, and RAG status.
- **AC-2:** All three audience templates (steering committee, team, executive) produce structurally distinct reports with appropriate tone and detail level.
- **AC-3:** The report preview renders Markdown correctly and supports inline editing with a raw/preview toggle.
- **AC-4:** Sending a report via SES delivers an HTML email to all specified recipients, and the report status transitions to "sent" with the SES message ID recorded.
- **AC-5:** Generated reports are persisted in DynamoDB and appear in the report history list for the project, sorted by most recent first.
- **AC-6:** Report generation is blocked with a user-visible message when the LLM budget is at degradation tier 2 or above.
- **AC-7:** A report generated when one or more artefacts are empty omits those sections gracefully without errors.
- **AC-8:** Draft reports can be edited (title and content) and re-saved. Sent reports cannot be edited or deleted.
- **AC-9:** The report generation uses Claude Sonnet 4.5 via tool-use (no raw `JSON.parse`), and the cost is tracked by the `BudgetTracker`.
- **AC-10:** Copy to clipboard and download as `.md` both function correctly from the report preview.

---

# Feature 2: Longitudinal Project Memory with Trend Analytics

## 1. Functional Specification

### User Story

**As a** PM using the Agentic PM Workbench,
**I want** the system to persist weekly snapshots of my project artefacts and compute trend analytics over time,
**so that** I can track sprint velocity trends, risk accumulation patterns, and blocker recurrence to make better project decisions.

### Detailed Behaviour Description

Currently, artefacts store only the current state and one previous version (one-deep undo). This feature adds a time-series layer that captures weekly snapshots and derives analytics.

**Snapshot capture:**

1. The housekeeping Lambda (runs daily) checks if a weekly snapshot is due for each active project.
2. Snapshot cadence is configurable per project (default: every Sunday at the housekeeping run time).
3. When due, the system reads all four artefacts for the project and writes an `ArtefactSnapshot` entity to DynamoDB.
4. Each snapshot contains a frozen copy of the artefact content plus derived metrics extracted at snapshot time.
5. Snapshots are retained according to a configurable policy:
   - Last 4 weeks: full weekly snapshots.
   - Weeks 5--12: every other week (alternating snapshots pruned).
   - Weeks 13+: monthly only (first snapshot of each month retained).
   - Maximum retention: 52 weeks (1 year).

**Derived metrics (computed at snapshot time):**

From `delivery_state`:
- `velocityPoints`: `completedPoints` from current sprint.
- `overallStatus`: RAG status string.
- `openBlockerCount`: length of `blockers` array.
- `milestoneHealth`: count of on_track / at_risk / delayed milestones.
- `avgCycleTimeDays`: from `keyMetrics`.

From `raid_log`:
- `openRiskCount`: items where `type === 'risk'` and `status` is `open` or `mitigating`.
- `openIssueCount`: items where `type === 'issue'` and `status` is `open` or `mitigating`.
- `newItemsThisWeek`: items where `raisedDate` is within the snapshot period.
- `resolvedItemsThisWeek`: items where `resolvedDate` is within the snapshot period.

From `backlog_summary`:
- `totalBacklogItems`: `summary.totalItems`.
- `blockedItems`: `summary.byStatus.blocked`.
- `scopeCreepFlags`: highlights with `flag === 'scope_creep'`.

From `decision_log`:
- `totalDecisions`: length of `decisions` array.
- `activeDecisions`: count where `status === 'active'`.
- `agentDecisions`: count where `madeBy === 'agent'`.

**Trend computation:**

Trends are computed on read (not stored), by comparing the most recent N snapshots:
- `velocityTrend`: Linear regression slope over last 6 data points. Classified as `increasing`, `stable`, or `decreasing`.
- `riskAccumulation`: Net change in open risks over time. Flagged if monotonically increasing for 3+ weeks.
- `blockerRecurrence`: Identify blockers that appear, resolve, and reappear. Detected by matching blocker `id` or `description` similarity.
- `cycleTimeDirection`: Trend of `avgCycleTimeDays` over time.
- `scopeGrowth`: Delta of `totalBacklogItems` over time.

**Dashboard:**

A new "Trends" section on the project detail page shows:
- Line charts for velocity, open risks, open blockers, and backlog size over time.
- A summary card showing trend direction with natural-language interpretation (e.g., "Velocity has increased 15% over the last 4 sprints").
- Warning indicators when negative trends persist (e.g., "Risks have been accumulating for 4 consecutive weeks").

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Project has fewer than 2 snapshots | Charts display with available data points. Trend text: "Insufficient data for trend analysis (minimum 2 weeks required)." |
| Snapshot capture fails mid-way (e.g., one artefact read fails) | Skip the snapshot entirely for this week. Log an error event. Retry on next housekeeping run. |
| Artefact content schema changes between snapshots | Snapshots store raw content. Derived metrics are recomputed from the stored content using the current schema version. Missing fields default to 0. |
| Project is paused and then resumed | Gap in snapshots is expected. Charts show the gap. Trend computation only uses contiguous data points. |
| Retention pruning deletes a snapshot that is part of a trend calculation | Trends recalculate with available data. Minimum data points for trend computation is 2. |
| Snapshot content is very large (many RAID items) | Content is stored as-is. DynamoDB item size limit is 400 KB. If exceeded, store only derived metrics (not full content) and log a warning. |

---

## 2. Data Model Changes

### New DynamoDB Entity: ArtefactSnapshot

| Attribute | Type | Description |
|---|---|---|
| **PK** | `PROJECT#<projectId>` | Partition key |
| **SK** | `SNAPSHOT#<isoWeekDate>` | Sort key (e.g., `SNAPSHOT#2026-02-02`) |
| **GSI1PK** | `SNAPSHOT#<projectId>` | For querying all snapshots for a project |
| **GSI1SK** | `<isoWeekDate>` | Sorted by date |
| **TTL** | number | 365-day expiry from creation |
| projectId | string (UUID) | Parent project |
| weekDate | string (ISO date, YYYY-MM-DD) | The Sunday (or configured day) this snapshot represents |
| snapshotVersion | number | Schema version for forward compatibility (starts at 1) |
| artefactContents | object | Full artefact content snapshots (map of artefact type to content) |
| derivedMetrics | `SnapshotMetrics` | Computed metrics at snapshot time |
| createdAt | string (ISO 8601) | When the snapshot was taken |

### New Zod Schemas

Add to `/home/user/agentic-project-manager/packages/core/src/schemas/index.ts`:

```typescript
export const SnapshotMetricsSchema = z.object({
  // Delivery metrics
  velocityPoints: z.number().min(0),
  overallStatus: z.enum(['green', 'amber', 'red']),
  openBlockerCount: z.number().int().min(0),
  milestonesOnTrack: z.number().int().min(0),
  milestonesAtRisk: z.number().int().min(0),
  milestonesDelayed: z.number().int().min(0),
  avgCycleTimeDays: z.number().min(0),

  // RAID metrics
  openRiskCount: z.number().int().min(0),
  openIssueCount: z.number().int().min(0),
  newRaidItemsThisWeek: z.number().int().min(0),
  resolvedRaidItemsThisWeek: z.number().int().min(0),

  // Backlog metrics
  totalBacklogItems: z.number().int().min(0),
  blockedItems: z.number().int().min(0),
  scopeCreepFlags: z.number().int().min(0),

  // Decision metrics
  totalDecisions: z.number().int().min(0),
  activeDecisions: z.number().int().min(0),
  agentDecisions: z.number().int().min(0),
});

export const ArtefactSnapshotSchema = z.object({
  projectId: UuidSchema,
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  snapshotVersion: z.number().int().min(1),
  artefactContents: z.object({
    delivery_state: DeliveryStateContentSchema.optional(),
    raid_log: RaidLogContentSchema.optional(),
    backlog_summary: BacklogSummaryContentSchema.optional(),
    decision_log: DecisionLogContentSchema.optional(),
  }),
  derivedMetrics: SnapshotMetricsSchema,
  createdAt: IsoDateTimeSchema,
});

export const SnapshotRetentionConfigSchema = z.object({
  snapshotDay: z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']).default('sunday'),
  fullRetentionWeeks: z.number().int().min(1).max(52).default(4),
  biweeklyRetentionWeeks: z.number().int().min(0).max(52).default(8),
  maxRetentionWeeks: z.number().int().min(4).max(52).default(52),
});

export const TrendDirectionSchema = z.enum([
  'increasing',
  'stable',
  'decreasing',
]);

export const TrendAnalysisSchema = z.object({
  velocityTrend: z.object({
    direction: TrendDirectionSchema,
    changePercent: z.number(),
    dataPoints: z.number().int().min(0),
    description: z.string(),
  }),
  riskAccumulation: z.object({
    direction: TrendDirectionSchema,
    consecutiveWeeksIncreasing: z.number().int().min(0),
    warning: z.boolean(),
    description: z.string(),
  }),
  blockerPattern: z.object({
    recurringBlockerIds: z.array(z.string()),
    currentCount: z.number().int().min(0),
    trend: TrendDirectionSchema,
    description: z.string(),
  }),
  cycleTime: z.object({
    direction: TrendDirectionSchema,
    currentDays: z.number().min(0),
    changePercent: z.number(),
    description: z.string(),
  }),
  scopeGrowth: z.object({
    direction: TrendDirectionSchema,
    netChange: z.number().int(),
    changePercent: z.number(),
    description: z.string(),
  }),
});
```

### New TypeScript Types

Add to `/home/user/agentic-project-manager/packages/core/src/types/index.ts`:

```typescript
export type SnapshotMetrics = z.infer<typeof SnapshotMetricsSchema>;
export type ArtefactSnapshot = z.infer<typeof ArtefactSnapshotSchema>;
export type SnapshotRetentionConfig = z.infer<typeof SnapshotRetentionConfigSchema>;
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;
export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;
```

---

## 3. Backend Tasks

### 3.1 New Repository: ArtefactSnapshotRepository

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/artefact-snapshot.ts`

Methods:
- `create(snapshot: ArtefactSnapshot): Promise<ArtefactSnapshot>` -- Writes snapshot with PK/SK/GSI1 keys and TTL.
- `getByWeek(projectId: string, weekDate: string): Promise<ArtefactSnapshot | null>` -- Fetches a specific week's snapshot.
- `getByProject(projectId: string, options?: { limit?: number; startDate?: string; endDate?: string }): Promise<ArtefactSnapshot[]>` -- Returns snapshots for a project within a date range, sorted by `weekDate` descending.
- `getLatest(projectId: string, count: number): Promise<ArtefactSnapshot[]>` -- Returns the N most recent snapshots.
- `delete(projectId: string, weekDate: string): Promise<void>` -- Deletes a single snapshot (used by retention pruning).
- `pruneByRetentionPolicy(projectId: string, config: SnapshotRetentionConfig): Promise<{ deleted: number }>` -- Applies retention policy, deleting snapshots that exceed the configured retention tiers.

Export from `/home/user/agentic-project-manager/packages/core/src/db/repositories/index.ts`.

### 3.2 New Core Module: Snapshot Service

**File:** `/home/user/agentic-project-manager/packages/core/src/analytics/snapshot-service.ts`

```typescript
export class SnapshotService {
  constructor(
    private snapshotRepo: ArtefactSnapshotRepository,
    private artefactRepo: ArtefactRepository
  ) {}

  async captureSnapshot(projectId: string, weekDate: string): Promise<ArtefactSnapshot>;
  extractMetrics(artefacts: Record<ArtefactType, ArtefactContent | undefined>, weekDate: string, previousWeekDate?: string): SnapshotMetrics;
  isSnapshotDue(projectId: string, config: SnapshotRetentionConfig): Promise<boolean>;
}
```

- `captureSnapshot`: Reads all artefacts, computes metrics, writes snapshot.
- `extractMetrics`: Pure function that derives `SnapshotMetrics` from artefact contents.
- `isSnapshotDue`: Checks if the current day matches the configured snapshot day and no snapshot exists for this week.

### 3.3 New Core Module: Trend Analyser

**File:** `/home/user/agentic-project-manager/packages/core/src/analytics/trend-analyser.ts`

```typescript
export class TrendAnalyser {
  computeTrends(snapshots: ArtefactSnapshot[]): TrendAnalysis;
  linearRegressionSlope(values: number[]): number;
  classifyTrend(slope: number, threshold: number): TrendDirection;
  detectRecurringBlockers(snapshots: ArtefactSnapshot[]): string[];
}
```

- All methods are pure functions operating on snapshot arrays.
- `computeTrends` requires minimum 2 snapshots; returns neutral/empty trends if fewer.
- `linearRegressionSlope` implements simple OLS regression for trend detection.
- Blocker recurrence detection matches on blocker `id` field across snapshots.

**File:** `/home/user/agentic-project-manager/packages/core/src/analytics/index.ts`

- Barrel export for both modules.

### 3.4 Modify Housekeeping Lambda

**File:** `/home/user/agentic-project-manager/packages/lambdas/src/housekeeping/handler.ts`

Add snapshot capture step between step 7 (artefact changes) and step 8 (project summaries):

```
// 7.5 Capture weekly snapshots if due
for (const project of projects) {
  const snapshotService = new SnapshotService(snapshotRepo, artefactRepo);
  const config = project.config.snapshotRetention ?? DEFAULT_SNAPSHOT_RETENTION;
  if (await snapshotService.isSnapshotDue(project.id, config)) {
    await snapshotService.captureSnapshot(project.id, todayStr);
    // Also prune old snapshots
    await snapshotRepo.pruneByRetentionPolicy(project.id, config);
  }
}
```

Update `HousekeepingOutput` interface to include `snapshotsCaptured: number`.

### 3.5 New API Routes

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/snapshots/[projectId]/route.ts`

- `GET /api/snapshots/[projectId]?limit=12&startDate=2025-11-01` -- Returns snapshots for a project.

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/trends/[projectId]/route.ts`

- `GET /api/trends/[projectId]` -- Fetches snapshots, computes trends via `TrendAnalyser`, returns `TrendAnalysis`.

### 3.6 Schema Changes

**File:** `/home/user/agentic-project-manager/packages/core/src/schemas/index.ts`

Add `snapshotRetention` as an optional field to `ProjectConfigSchema`:

```typescript
export const ProjectConfigSchema = z.object({
  pollingIntervalMinutes: z.number().min(5).max(60).optional(),
  holdQueueMinutes: z.number().min(1).max(120).optional(),
  jiraBoardId: z.string().optional(),
  monitoredEmails: z.array(z.string().email()).optional(),
  snapshotRetention: SnapshotRetentionConfigSchema.optional(),
});
```

### 3.7 Constants Update

**File:** `/home/user/agentic-project-manager/packages/core/src/constants.ts`

Add:
```typescript
export const KEY_PREFIX = {
  // ... existing prefixes
  SNAPSHOT: 'SNAPSHOT#',
} as const;

export const TTL = {
  // ... existing TTLs
  SNAPSHOTS_DAYS: 365,
} as const;

export const DEFAULT_SNAPSHOT_RETENTION: SnapshotRetentionConfig = {
  snapshotDay: 'sunday',
  fullRetentionWeeks: 4,
  biweeklyRetentionWeeks: 8,
  maxRetentionWeeks: 52,
};
```

---

## 4. Frontend Tasks

### 4.1 New Hooks

**File:** `/home/user/agentic-project-manager/packages/web/src/lib/hooks/use-snapshots.ts`

```typescript
export function useSnapshots(projectId: string | undefined, options?: { limit?: number });
export function useTrends(projectId: string | undefined);
```

- `useSnapshots`: TanStack Query hook for fetching snapshot data. 5-minute stale time (data does not change frequently).
- `useTrends`: TanStack Query hook for fetching computed trends. 5-minute stale time.

### 4.2 New Components

**File:** `/home/user/agentic-project-manager/packages/web/src/components/trend-charts.tsx`

- `TrendCharts` component: Renders 4 line charts in a 2x2 grid:
  1. Sprint velocity (points) over time.
  2. Open risks + open issues over time (dual line).
  3. Open blockers over time.
  4. Total backlog items over time.
- Uses lightweight SVG-based charts (no heavy charting library to stay within budget constraints). Consider `recharts` (tree-shakeable, ~45 KB gzipped) or hand-rolled SVG paths.
- Each chart shows data points as dots, connecting lines, and a subtle trend line overlay.
- X-axis: week dates. Y-axis: metric values with auto-scaling.
- Hover tooltip showing exact values.

**File:** `/home/user/agentic-project-manager/packages/web/src/components/trend-summary.tsx`

- `TrendSummary` component: Displays trend direction indicators with natural-language descriptions.
- Each trend metric shown as a card with:
  - Metric name (e.g., "Velocity Trend").
  - Direction arrow (up/flat/down) colour-coded (green for positive trends, red for negative, grey for stable).
  - Description text from `TrendAnalysis`.
  - Warning badge if a negative trend persists (e.g., "3 weeks increasing" for risk accumulation).

**File:** `/home/user/agentic-project-manager/packages/web/src/components/snapshot-timeline.tsx`

- `SnapshotTimeline` component: Compact timeline view showing snapshot dates as dots on a horizontal line.
- Clicking a dot shows a popup with the RAG status and key metrics for that week.
- Visual indicator for gaps (when a project was paused).

### 4.3 Page Integration

**File:** `/home/user/agentic-project-manager/packages/web/src/app/(dashboard)/projects/[id]/page.tsx`

- Add a new tab "Trends" to the `TabsList`.
- Tab content renders:
  1. `TrendSummary` at the top (5 metric cards in a responsive grid).
  2. `TrendCharts` below (2x2 grid of line charts).
  3. `SnapshotTimeline` at the bottom.
- Show "Insufficient data" message if fewer than 2 snapshots exist.

### 4.4 UI Wireframe Description

```
+------------------------------------------------------------------+
| [Delivery State] [RAID] [Backlog] [Decisions] [Graduation] [Trends] [Reports] |
+------------------------------------------------------------------+
| TREND SUMMARY                                                      |
| +-------------+ +-------------+ +-------------+ +-------------+  |
| | Velocity    | | Risk        | | Blockers    | | Scope       |  |
| | ^ +12%      | | v -2 items  | | -- Stable   | | ^ +8 items  |  |
| | Increasing  | | Decreasing  | | 3 open      | | Growing     |  |
| | 6 data pts  | | 6 data pts  | | No recurrence| | 6 data pts |  |
| +-------------+ +-------------+ +-------------+ +-------------+  |
|                                                                    |
| TREND CHARTS                                                       |
| +-----------------------------+ +-----------------------------+   |
| | Sprint Velocity             | | Open Risks & Issues         |   |
| |     *                       | |  *                          |   |
| |   *   *                     | | * *                         |   |
| |  *     *  *                 | |    * *                      |   |
| | *                           | |       *  *                  |   |
| +-----------------------------+ +-----------------------------+   |
| +-----------------------------+ +-----------------------------+   |
| | Open Blockers               | | Backlog Size                |   |
| |  * *                        | |            *  *             |   |
| | *   *                       | |         *                   |   |
| |      * *                    | |      *                      |   |
| |         *                   | |   *                         |   |
| +-----------------------------+ +-----------------------------+   |
|                                                                    |
| SNAPSHOT TIMELINE                                                  |
| o---o---o---o---o---o---o---o---o---o---o---o                     |
| Dec                Jan               Feb                           |
+------------------------------------------------------------------+
```

---

## 5. Test Plan

### 5.1 Unit Tests

**File:** `/home/user/agentic-project-manager/packages/core/src/analytics/__tests__/snapshot-service.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `extractMetrics` with fully populated artefacts | All metrics populated correctly from artefact data. |
| `extractMetrics` with empty artefacts | All metrics default to 0. |
| `extractMetrics` counts RAID items correctly by type and status | `openRiskCount` only includes `type: 'risk'` with `status: 'open' \| 'mitigating'`. |
| `isSnapshotDue` on configured snapshot day with no existing snapshot | Returns `true`. |
| `isSnapshotDue` on configured snapshot day with existing snapshot | Returns `false`. |
| `isSnapshotDue` on non-snapshot day | Returns `false`. |
| `captureSnapshot` writes correct PK/SK/GSI1 | Verifies DynamoDB item structure. |
| Snapshot for project with very large RAID log (500+ items) | Succeeds if under 400 KB. Logs warning and stores metrics-only if over. |

**File:** `/home/user/agentic-project-manager/packages/core/src/analytics/__tests__/trend-analyser.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `linearRegressionSlope` with increasing values `[1, 2, 3, 4, 5]` | Returns positive slope (~1.0). |
| `linearRegressionSlope` with decreasing values `[5, 4, 3, 2, 1]` | Returns negative slope (~-1.0). |
| `linearRegressionSlope` with constant values `[3, 3, 3, 3]` | Returns 0. |
| `linearRegressionSlope` with single value | Returns 0. |
| `classifyTrend` with slope above threshold | Returns `'increasing'`. |
| `classifyTrend` with slope below negative threshold | Returns `'decreasing'`. |
| `classifyTrend` with slope within threshold | Returns `'stable'`. |
| `computeTrends` with 6 snapshots showing velocity increase | `velocityTrend.direction === 'increasing'`, `changePercent > 0`. |
| `computeTrends` with 1 snapshot | All trends have `description` indicating insufficient data. |
| `detectRecurringBlockers` with blocker appearing in 3 non-consecutive snapshots | Blocker ID appears in `recurringBlockerIds`. |
| `detectRecurringBlockers` with blocker appearing only once | Not listed as recurring. |

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/__tests__/artefact-snapshot.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `create` stores snapshot with correct keys | PK = `PROJECT#<id>`, SK = `SNAPSHOT#2026-02-02`. |
| `getLatest(projectId, 4)` returns the 4 most recent snapshots | Sorted by `weekDate` descending. |
| `pruneByRetentionPolicy` with 20 weekly snapshots | Keeps weeks 1--4 (full), keeps alternating weeks 5--12, keeps monthly 13+. |
| `pruneByRetentionPolicy` with fewer snapshots than retention threshold | Deletes nothing. |
| `getByProject` with date range filter | Only returns snapshots within the specified range. |

### 5.2 Integration Tests

| Test Case | Expected Behaviour |
|---|---|
| Housekeeping Lambda captures snapshot on the configured day | Snapshot entity created in DynamoDB with correct metrics. |
| Housekeeping Lambda skips snapshot on non-configured day | No snapshot created. |
| Housekeeping Lambda prunes old snapshots after capture | Old snapshots deleted per retention policy. |
| Trends API returns correct analysis for 8 weeks of data | All five trend categories populated with meaningful descriptions. |

### 5.3 E2E Tests (Playwright)

| Test Case | Expected Behaviour |
|---|---|
| Navigate to project Trends tab with snapshot data | Four charts render with data points and trend lines. |
| Trend summary cards show correct direction indicators | Arrows and colours match the computed trend directions. |
| Snapshot timeline is interactive | Clicking a dot shows a popup with that week's metrics. |
| Trends tab with no snapshot data | "Insufficient data" message displayed. |

---

## 6. Acceptance Criteria

- **AC-1:** The housekeeping Lambda captures an artefact snapshot for each active project on the configured snapshot day (default: Sunday), storing all four artefact contents and derived metrics.
- **AC-2:** Derived metrics are correctly computed from artefact content: velocity points, open risk/issue counts, blocker count, backlog size, decision counts, and cycle time.
- **AC-3:** Snapshot retention pruning correctly applies the three-tier retention policy (full weekly, biweekly, monthly) and does not delete snapshots within the full-retention window.
- **AC-4:** The Trends API returns a `TrendAnalysis` with velocity trend, risk accumulation, blocker pattern, cycle time direction, and scope growth, each with a direction classification and natural-language description.
- **AC-5:** Trend computation handles edge cases: fewer than 2 snapshots returns neutral trends; gaps in data are handled without errors.
- **AC-6:** The project detail page displays a "Trends" tab with summary cards showing trend direction and charts showing metric time series.
- **AC-7:** Line charts display correctly with at least 2 data points, auto-scaling Y-axis, hover tooltips, and week dates on the X-axis.
- **AC-8:** Recurring blockers are detected by matching blocker IDs across snapshots and flagged in the `blockerPattern` analysis.
- **AC-9:** The snapshot capture does not block or slow down the housekeeping Lambda by more than 2 seconds per project.
- **AC-10:** Snapshot day is configurable per project via `ProjectConfig.snapshotRetention.snapshotDay`.

---

# Feature 3: Idempotent External Action Execution

## 1. Functional Specification

### User Story

**As a** PM relying on autonomous agent actions,
**I want** the hold queue processor to guarantee exactly-once execution of external actions (SES emails and Jira transitions),
**so that** stakeholders do not receive duplicate emails and Jira tickets are not transitioned multiple times due to Lambda retries, network timeouts, or race conditions.

### Detailed Behaviour Description

The current hold queue processor (`HoldQueueService.processQueue` in `/home/user/agentic-project-manager/packages/core/src/execution/hold-queue.ts`) has a gap between executing an action and marking it as executed. If the Lambda is retried (timeout, infrastructure failure) or the `markExecuted` call fails after successful execution, the action will be executed again on the next queue processing cycle.

**Current flow (problematic):**

```
1. getReady() -> list of pending actions past heldUntil
2. For each action:
   a. executeAction(action, executor)  // <-- External side effect happens here
   b. markExecuted(action)             // <-- If this fails, action re-executes next cycle
   c. recordApproval(graduation)
```

**Problems identified:**

1. **No intermediate state**: Actions jump from `pending` directly to `executed`. If the Lambda crashes between steps 2a and 2b, the action remains `pending` and will be re-executed.
2. **No SES deduplication**: SES does not deduplicate emails by default. A retry sends a second email.
3. **No Jira pre-check**: The Jira transition is executed without checking if the ticket is already in the target status. A retry could fail with a confusing error or create a duplicate comment.
4. **No stuck action detection**: If an action enters `executing` state (proposed) and the Lambda crashes, no mechanism detects it.

**Proposed flow (idempotent):**

```
1. getReady() -> list of pending actions past heldUntil
2. For each action:
   a. atomicTransition(action, 'pending' -> 'executing')  // Conditional write
      - If fails (already executing/executed): SKIP (another process handling it)
   b. executeAction(action, executor) with idempotency guards:
      - SES: Use MessageDeduplicationId (action.id as dedup key)
      - Jira: Check current status before transitioning
   c. atomicTransition(action, 'executing' -> 'executed')
   d. recordApproval(graduation)
   e. If step b fails: atomicTransition(action, 'executing' -> 'failed')
```

**Idempotency guards per action type:**

- **SES Email (`email_stakeholder`):**
  - Store `idempotencyKey` (derived from `action.id`) in the SES `Tags` or `MessageGroupId` (if using FIFO topic) or a custom `X-Idempotency-Key` header.
  - Before sending, check if a `sesMessageId` is already recorded on the action. If yes, skip sending.
  - Record `sesMessageId` on the action immediately after SES returns.

- **Jira Status Change (`jira_status_change`):**
  - Before executing the transition, fetch the current issue status via `GET /rest/api/3/issue/{issueKey}?fields=status`.
  - If the current status already matches `toStatus`, skip the transition (log as "already in target status").
  - If the current status does not match `fromStatus`, log a warning and skip (the ticket state has drifted; create an escalation instead).

**Stuck action detection (housekeeping):**

- The housekeeping Lambda gains a new step: scan for actions in `executing` status older than 5 minutes.
- For each stuck action:
  - Check the external system to determine actual outcome (SES delivery log or Jira current status).
  - If the action completed externally: transition to `executed`.
  - If the action did not complete: transition back to `pending` for retry (with a `retryCount` increment).
  - If `retryCount >= 3`: transition to `failed` and create an escalation.

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Two Lambda invocations process the same action concurrently | First invocation wins the `pending -> executing` conditional write. Second invocation's conditional write fails; it skips the action. |
| Lambda crashes after `executing` but before external call | Housekeeping detects stuck action after 5 minutes. Checks external system. Since action did not execute, resets to `pending` for retry. |
| Lambda crashes after successful SES send but before `markExecuted` | Housekeeping detects stuck action. Checks action for `sesMessageId` (set during send). If present, transitions to `executed`. If absent, checks external system or resets to `pending`. |
| Jira ticket status changed by another user between queue and execution | Pre-transition check detects status mismatch. Action marked as `failed` with reason "Ticket status drifted". Escalation created. |
| SES call returns success but email bounces later | Outside scope of this feature. SES bounce handling is a separate concern. |
| Action has been retried 3+ times | Marked as `failed`. Escalation created with retry history. |
| Held action is approved by user while simultaneously being picked up by the queue | The `approve` path also uses conditional writes (`pending -> approved`). If the queue processor already transitioned to `executing`, the approval fails gracefully (returns null). |
| Network timeout on Jira API but transition actually succeeded | Pre-transition status check on retry will detect the ticket is already in `toStatus` and skip the duplicate transition. |

---

## 2. Data Model Changes

### Modified Entity: HeldAction

Add new fields to the existing `HeldAction` interface and `HeldActionItem` in `/home/user/agentic-project-manager/packages/core/src/db/repositories/held-action.ts`:

| New Attribute | Type | Description |
|---|---|---|
| executionId | string (ULID) | Unique ID for this execution attempt, used as idempotency key |
| executingStartedAt | string (ISO 8601) | When the action entered `executing` state |
| retryCount | number | Number of times this action has been retried (default 0) |
| failureReason | string | Reason for failure (if status is `failed`) |
| sesMessageId | string | SES message ID recorded immediately after successful send |
| externalCheckResult | object | Result of external system verification during stuck-action recovery |

### Modified Status Type

Change `HeldActionStatus` to include `'executing'` and `'failed'`:

```typescript
export type HeldActionStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'cancelled'
  | 'executed'
  | 'failed';
```

### New GSI1 Keys

```
HELD#EXECUTING  -- for stuck action detection queries
HELD#FAILED     -- for failed action visibility
```

### Modified Zod Schemas

No changes to the public Zod schemas in `schemas/index.ts` are required since `HeldAction` uses local type definitions in its repository file. However, update the `ActionTypeSchema` and related schemas if needed for any new event types.

### New Constants

Add to `/home/user/agentic-project-manager/packages/core/src/constants.ts`:

```typescript
/** Maximum time an action can be in 'executing' state before considered stuck */
export const EXECUTING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum retry attempts for a failed action */
export const MAX_ACTION_RETRIES = 3;
```

---

## 3. Backend Tasks

### 3.1 Modify HeldActionRepository

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/held-action.ts`

**New methods:**

- `transitionToExecuting(projectId: string, actionId: string, executionId: string): Promise<HeldAction | null>`
  - Conditional update: `SET #status = :executing, #executionId = :executionId, #executingStartedAt = :now, #gsi1pk = :gsi1pk WHERE #status = :pending`
  - Returns `null` if conditional check fails (action already processing).

- `transitionToExecuted(projectId: string, actionId: string, executionId: string, sesMessageId?: string): Promise<HeldAction | null>`
  - Conditional update: `SET #status = :executed, ... WHERE #status = :executing AND #executionId = :executionId`
  - The `executionId` check ensures only the Lambda instance that started execution can complete it.

- `transitionToFailed(projectId: string, actionId: string, executionId: string, reason: string): Promise<HeldAction | null>`
  - Conditional update: `SET #status = :failed, #failureReason = :reason WHERE #status = :executing AND #executionId = :executionId`

- `resetToRetry(projectId: string, actionId: string): Promise<HeldAction | null>`
  - Conditional update: `SET #status = :pending, #retryCount = #retryCount + :one, #executionId = :null, #executingStartedAt = :null, #gsi1pk = :pendingGsi WHERE #status = :executing`
  - Only resets if `retryCount < MAX_ACTION_RETRIES`.

- `getStuckExecuting(timeoutMs: number): Promise<HeldAction[]>`
  - Queries GSI1PK = `HELD#EXECUTING`, filters for `executingStartedAt` older than `timeoutMs` ago.

- `recordSesMessageId(projectId: string, actionId: string, sesMessageId: string): Promise<void>`
  - Updates the `sesMessageId` field without a status condition (can be called independently).

**Modified methods:**

- `markExecuted`: Deprecate in favour of `transitionToExecuted`. Keep for backward compatibility but add a warning log.

- Update `toHeldAction` mapping to include new fields (`executionId`, `executingStartedAt`, `retryCount`, `failureReason`, `sesMessageId`).

### 3.2 Modify HoldQueueService

**File:** `/home/user/agentic-project-manager/packages/core/src/execution/hold-queue.ts`

**Modify `processQueue`:**

```typescript
async processQueue(executor: ActionExecutor): Promise<HoldQueueProcessingResult> {
  const now = new Date().toISOString();
  const result: HoldQueueProcessingResult = { processed: 0, executed: 0, cancelled: 0, failed: 0, errors: [] };

  const readyActions = await this.heldActionRepo.getReady(now, { limit: 50 });

  for (const action of readyActions) {
    result.processed++;
    const executionId = ulid();

    // Step 1: Atomically claim the action
    const claimed = await this.heldActionRepo.transitionToExecuting(
      action.projectId, action.id, executionId
    );
    if (!claimed) {
      // Another process is handling this action -- skip
      continue;
    }

    try {
      // Step 2: Execute with idempotency guards
      const execResult = await this.executeActionIdempotent(action, executor);

      // Step 3: Record SES message ID if applicable
      if (execResult.sesMessageId) {
        await this.heldActionRepo.recordSesMessageId(
          action.projectId, action.id, execResult.sesMessageId
        );
      }

      // Step 4: Transition to executed
      await this.heldActionRepo.transitionToExecuted(
        action.projectId, action.id, executionId, execResult.sesMessageId
      );

      // Step 5: Record graduation approval
      await this.graduationRepo.recordApproval(action.projectId, action.actionType);

      result.executed++;
    } catch (error) {
      // Mark as failed
      const reason = error instanceof Error ? error.message : String(error);
      await this.heldActionRepo.transitionToFailed(
        action.projectId, action.id, executionId, reason
      );
      result.failed++;
      result.errors.push({ actionId: action.id, error: reason });
    }
  }
  return result;
}
```

**New method `executeActionIdempotent`:**

```typescript
private async executeActionIdempotent(
  action: HeldAction,
  executor: ActionExecutor
): Promise<{ sesMessageId?: string }> {
  switch (action.actionType) {
    case 'email_stakeholder': {
      // Check if already sent (idempotency)
      if (action.sesMessageId) {
        return { sesMessageId: action.sesMessageId };
      }
      const result = await executor.executeEmail(
        action.payload as EmailStakeholderPayload,
        action.id // Pass action ID as idempotency key
      );
      return { sesMessageId: result.messageId };
    }
    case 'jira_status_change': {
      const payload = action.payload as JiraStatusChangePayload;
      // Pre-check current status
      const currentStatus = await executor.getJiraIssueStatus(payload.issueKey);
      if (currentStatus === payload.toStatus) {
        // Already in target status -- skip silently
        return {};
      }
      if (currentStatus !== payload.fromStatus) {
        // Status has drifted -- fail with explanation
        throw new Error(
          `Jira ticket ${payload.issueKey} status drifted: expected "${payload.fromStatus}", found "${currentStatus}". Manual review required.`
        );
      }
      await executor.executeJiraStatusChange(payload);
      return {};
    }
    default:
      throw new Error(`Unknown action type: ${action.actionType}`);
  }
}
```

**Update `HoldQueueProcessingResult`:**

Add `failed: number` field to the result interface.

### 3.3 Modify ActionExecutor Interface

**File:** `/home/user/agentic-project-manager/packages/core/src/execution/hold-queue.ts`

```typescript
export interface ActionExecutor {
  executeEmail(
    payload: EmailStakeholderPayload,
    idempotencyKey?: string
  ): Promise<{ messageId: string }>;
  executeJiraStatusChange(payload: JiraStatusChangePayload): Promise<void>;
  getJiraIssueStatus(issueKey: string): Promise<string>;
}
```

### 3.4 Modify Hold Queue Lambda Handler

**File:** `/home/user/agentic-project-manager/packages/lambdas/src/hold-queue/handler.ts`

Update `createActionExecutor` to implement the new `ActionExecutor` interface:

- `executeEmail` now accepts `idempotencyKey` and includes it as an SES message tag (`X-Idempotency-Key`).
- Add `getJiraIssueStatus` method that calls `GET /rest/api/3/issue/{issueKey}?fields=status` and returns the status name string.

Update `HoldQueueOutput` to include `failed: number`.

### 3.5 Add JiraClient Method

**File:** `/home/user/agentic-project-manager/packages/core/src/integrations/jira.ts`

Add method to `JiraClient`:

```typescript
async getIssueStatus(issueKey: string): Promise<string> {
  const response = await this.request(`/rest/api/3/issue/${issueKey}?fields=status`);
  return response.fields.status.name;
}
```

### 3.6 Modify Housekeeping Lambda

**File:** `/home/user/agentic-project-manager/packages/lambdas/src/housekeeping/handler.ts`

Add stuck action detection step after existing steps:

```
// 12. Detect and recover stuck executing actions
const stuckActions = await heldActionRepo.getStuckExecuting(EXECUTING_TIMEOUT_MS);
for (const stuckAction of stuckActions) {
  if (stuckAction.retryCount >= MAX_ACTION_RETRIES) {
    await heldActionRepo.transitionToFailed(
      stuckAction.projectId, stuckAction.id,
      stuckAction.executionId!, 'Exceeded maximum retry attempts'
    );
    // Create escalation for failed action
    await escalationRepo.create({ ... });
  } else {
    await heldActionRepo.resetToRetry(stuckAction.projectId, stuckAction.id);
  }
}
```

Update `HousekeepingOutput` to include `stuckActionsRecovered: number`.

### 3.7 Modify Approve Flow

**File:** `/home/user/agentic-project-manager/packages/core/src/execution/hold-queue.ts`

Update `approveAction` to use the new idempotent flow:

```typescript
async approveAction(
  projectId: string,
  actionId: string,
  executor: ActionExecutor,
  decidedBy?: string
): Promise<HeldAction | null> {
  // First, approve (pending -> approved)
  const approved = await this.heldActionRepo.approve(projectId, actionId, decidedBy);
  if (!approved) return null;

  const executionId = ulid();

  // Then, transition to executing (approved -> executing)
  // Use a new method or modify approve to go directly to executing
  await this.heldActionRepo.transitionToExecuting(projectId, actionId, executionId);

  try {
    const action = await this.heldActionRepo.getById(projectId, actionId);
    if (!action) throw new Error('Action disappeared during approval');

    const execResult = await this.executeActionIdempotent(action, executor);

    if (execResult.sesMessageId) {
      await this.heldActionRepo.recordSesMessageId(projectId, actionId, execResult.sesMessageId);
    }

    await this.heldActionRepo.transitionToExecuted(projectId, actionId, executionId, execResult.sesMessageId);
    await this.graduationRepo.recordApproval(projectId, action.actionType);

    return this.heldActionRepo.getById(projectId, actionId);
  } catch (error) {
    await this.heldActionRepo.transitionToFailed(projectId, actionId, executionId,
      error instanceof Error ? error.message : String(error));
    throw error;
  }
}
```

---

## 4. Frontend Tasks

### 4.1 Modify Existing Hook

**File:** `/home/user/agentic-project-manager/packages/web/src/lib/hooks/use-held-actions.ts`

- Update the `HeldAction` type to include new fields: `executionId`, `retryCount`, `failureReason`, `sesMessageId`.
- Add `status: 'executing'` and `status: 'failed'` to any status filtering logic.

### 4.2 Modify Existing Components

**File:** `/home/user/agentic-project-manager/packages/web/src/app/(dashboard)/pending/page.tsx`

- Display `executing` actions with a pulsing indicator and "Executing..." label.
- Display `failed` actions with a red badge showing the failure reason.
- Failed actions show a "Retry" button (which resets status to `pending`) and a `retryCount` indicator.
- Executing actions have approve/cancel buttons disabled.

### 4.3 New Component

**File:** `/home/user/agentic-project-manager/packages/web/src/components/action-status-badge.tsx`

- `ActionStatusBadge` component: Renders a status badge for held actions.
- States: `pending` (yellow), `approved` (blue), `executing` (pulsing blue), `executed` (green), `cancelled` (grey), `failed` (red).
- For `failed`, shows a tooltip with the `failureReason`.
- For `executing`, shows elapsed time since `executingStartedAt`.

### 4.4 New API Route for Retry

**File:** `/home/user/agentic-project-manager/packages/web/src/app/api/held-actions/[id]/retry/route.ts`

- `POST /api/held-actions/[id]/retry` -- Resets a failed action to `pending` for retry. Only works if `status === 'failed'` and `retryCount < MAX_ACTION_RETRIES`.

### 4.5 UI Wireframe Description

```
+------------------------------------------------------------------+
| PENDING ACTIONS                                                    |
+------------------------------------------------------------------+
| +------+-------------------+----------+---------+----------------+ |
| | Time | Action            | Status   | Retry   | Actions        | |
| +------+-------------------+----------+---------+----------------+ |
| | 2m   | Email to J.Smith  | PENDING  |         | [Approve] [X]  | |
| |      | Re: Sprint Review | (yellow) |         |                | |
| +------+-------------------+----------+---------+----------------+ |
| | 1m   | Jira PROJ-123     | EXECUTING|         | (disabled)     | |
| |      | In Progress->Done | (pulse)  |         |                | |
| |      |                   | 45s ago  |         |                | |
| +------+-------------------+----------+---------+----------------+ |
| | 15m  | Email to team     | FAILED   | 2/3     | [Retry] [X]    | |
| |      | Re: Blocker       | (red)    |         |                | |
| |      | Reason: SES quota |          |         |                | |
| +------+-------------------+----------+---------+----------------+ |
```

---

## 5. Test Plan

### 5.1 Unit Tests

**File:** `/home/user/agentic-project-manager/packages/core/src/execution/__tests__/hold-queue-idempotent.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `transitionToExecuting` succeeds for pending action | Action status changes to `executing`, `executionId` is set. |
| `transitionToExecuting` fails for already-executing action | Returns `null`, action remains in `executing` with original `executionId`. |
| `transitionToExecuting` fails for already-executed action | Returns `null`. |
| `transitionToExecuted` succeeds with matching `executionId` | Status changes to `executed`, `executedAt` set. |
| `transitionToExecuted` fails with wrong `executionId` | Returns `null`, prevents a stale Lambda from marking a retried action as executed. |
| `transitionToFailed` records failure reason | `failureReason` set, status is `failed`, GSI1PK is `HELD#FAILED`. |
| `resetToRetry` increments `retryCount` and resets to pending | `retryCount` incremented by 1, status back to `pending`, `executionId` cleared. |
| `resetToRetry` fails if `retryCount >= MAX_ACTION_RETRIES` | Returns `null`. Action remains in `executing`. |
| `getStuckExecuting` returns actions older than timeout | Only returns actions where `executingStartedAt` is more than `timeoutMs` ago. |
| `getStuckExecuting` does not return recently started actions | Actions less than `timeoutMs` old are excluded. |

**File:** `/home/user/agentic-project-manager/packages/core/src/execution/__tests__/hold-queue-idempotent-flow.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| Normal flow: pending -> executing -> executed | All transitions succeed. `recordApproval` called. Events logged. |
| Email action with existing `sesMessageId` skips sending | `executeEmail` not called. Action transitions to `executed`. |
| Jira action where ticket already in target status | `executeJiraStatusChange` not called. Action transitions to `executed` (idempotent skip). |
| Jira action where ticket status has drifted | Action transitions to `failed` with "status drifted" reason. |
| Concurrent processing: two invocations for same action | First claims via `transitionToExecuting`. Second skips. Only one email sent. |
| Failed action retry: reset and re-process | After `resetToRetry`, action appears in `getReady` results. Re-processes successfully. |
| Three retries exhausted: action transitions to failed | After third reset, `resetToRetry` returns `null`. Housekeeping marks as `failed`. |

**File:** `/home/user/agentic-project-manager/packages/core/src/db/repositories/__tests__/held-action-idempotent.test.ts`

| Test Case | Expected Behaviour |
|---|---|
| `recordSesMessageId` updates the field | `sesMessageId` set on the action. |
| `recordSesMessageId` is idempotent (calling twice with same ID) | Second call succeeds without error. |
| Conditional write race: two concurrent `transitionToExecuting` calls | One succeeds, one fails. DynamoDB `ConditionalCheckFailedException` caught and returned as `null`. |

### 5.2 Integration Tests

| Test Case | Expected Behaviour |
|---|---|
| Hold queue processes 3 actions: 1 email, 1 Jira, 1 already-executing | Email sent once, Jira transitioned once, already-executing skipped. |
| Housekeeping detects and recovers stuck executing action | Action reset to `pending` with incremented `retryCount`. |
| Housekeeping marks action as failed after 3 retries | Action in `failed` status. Escalation created. |
| Approved action uses idempotent execution path | `transitionToExecuting` called before external action. |

### 5.3 E2E Tests (Playwright)

| Test Case | Expected Behaviour |
|---|---|
| Failed action appears in pending page with retry button | Red badge, failure reason tooltip, "Retry" button visible. |
| Clicking "Retry" on failed action resets it to pending | Status changes to pending, `retryCount` incremented in display. |
| Executing action shows pulsing indicator | Blue pulsing badge with elapsed time. Approve/cancel buttons disabled. |

---

## 6. Acceptance Criteria

- **AC-1:** The hold queue processor uses a conditional DynamoDB write to atomically transition actions from `pending` to `executing` before performing any external side effects, preventing duplicate execution by concurrent Lambda invocations.
- **AC-2:** If a Lambda instance crashes after transitioning to `executing` but before completing, the housekeeping Lambda detects the stuck action within 24 hours (next housekeeping run) and either recovers it (reset to `pending`) or marks it as `failed` after 3 retries.
- **AC-3:** SES email actions record the `sesMessageId` immediately after a successful send. On retry, the presence of `sesMessageId` causes the action to skip sending and proceed to `executed` without sending a duplicate email.
- **AC-4:** Jira status change actions check the current ticket status before executing the transition. If the ticket is already in the target status, the transition is skipped (idempotent). If the ticket is in an unexpected status, the action fails with a descriptive reason.
- **AC-5:** The `transitionToExecuted` method requires the `executionId` to match, ensuring only the Lambda instance that claimed the action can mark it as complete.
- **AC-6:** Failed actions are visible in the UI with a red status badge, the failure reason in a tooltip, and a "Retry" button that resets the action to `pending` (up to `MAX_ACTION_RETRIES` times).
- **AC-7:** The `HoldQueueProcessingResult` includes a `failed` count alongside `processed`, `executed`, and `cancelled`.
- **AC-8:** Concurrent approval (user clicks "Approve" while queue processor picks up the same action) is handled gracefully: one path wins, the other returns `null` without errors or duplicate execution.
- **AC-9:** All state transitions are logged as events in the `EventRepository` with appropriate severity levels (`info` for normal transitions, `warning` for retries, `error` for failures).
- **AC-10:** The existing unit tests for hold queue race conditions (`/home/user/agentic-project-manager/packages/core/src/execution/__tests__/hold-queue-race.test.ts`) continue to pass, and new tests cover the `executing` and `failed` states.

---

## Cross-cutting Concerns

### Budget Impact

| Feature | LLM Cost Impact | DynamoDB Cost Impact |
|---|---|---|
| Status Report Generator | ~$0.02--0.05 per report (Sonnet 4.5, ~2K input + 1K output tokens). At 2 reports/week = ~$0.40/month. | Negligible: ~10 writes/month for reports. |
| Longitudinal Project Memory | Zero LLM cost (pure computation). | ~4 snapshot writes/month per project. With 2 projects = ~8 writes/month. Well within on-demand tier. |
| Idempotent Execution | Zero additional LLM cost. One extra Jira API call per action (status check). | 2--3 additional DynamoDB writes per action (state transitions). At ~20 actions/month = ~60 extra writes. Negligible. |

**Total estimated monthly cost increase: ~$0.40--0.50**, well within the $15/month budget ceiling.

### Deployment Order

1. **Feature 3 (Idempotent Execution)** should be deployed first -- it fixes a correctness bug and has no dependencies on the other features.
2. **Feature 2 (Longitudinal Memory)** second -- it modifies the housekeeping Lambda (which Feature 3 also modifies) and provides data that Feature 1 could optionally use in future.
3. **Feature 1 (Status Reports)** last -- it is a new capability that benefits from having trend data available (future enhancement: include trend summary in reports).

### Shared Infrastructure Changes

**CDK Stack** (`/home/user/agentic-project-manager/packages/cdk/`):
- No new Lambda functions required. All features extend existing Lambdas or add API routes to the Next.js app.
- No new DynamoDB tables. All new entities use the existing single-table design.
- No new EventBridge rules. Snapshot capture runs within the existing daily housekeeping schedule.
