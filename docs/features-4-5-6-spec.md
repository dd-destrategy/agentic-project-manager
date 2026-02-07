# Features 4, 5, 6 -- Detailed Specifications

> Generated 2026-02-07. Covers Dead Man's Switch, Meeting Notes Ingestion, and
> Natural Language Project Query.

---

## Table of Contents

- [Feature 4: Dead Man's Switch (Heartbeat Staleness Alarm)](#feature-4-dead-mans-switch-heartbeat-staleness-alarm)
- [Feature 5: Meeting Notes Ingestion Pipeline](#feature-5-meeting-notes-ingestion-pipeline)
- [Feature 6: Natural Language Project Query ("Ask Your Project")](#feature-6-natural-language-project-query-ask-your-project)

---

## Feature 4: Dead Man's Switch (Heartbeat Staleness Alarm)

### 1. Functional Specification

**User story:**
As a PM, I want to be notified by email when the agent has not run for 30
minutes, so that I know immediately if the autonomous cycle has silently stopped
working and can investigate before it impacts project monitoring.

**Detailed behaviour description:**

The heartbeat Lambda (`packages/lambdas/src/heartbeat/handler.ts`) already
executes at the start of every 15-minute agent cycle and writes a heartbeat
event to DynamoDB. This feature adds a custom CloudWatch metric
(`AgentHeartbeatEmitted`) that the heartbeat Lambda emits on every successful
invocation, plus a CloudWatch Alarm that fires when that metric is *absent* for
two consecutive evaluation periods of 15 minutes (i.e. 30 minutes total).

Flow:
1. At the end of a successful heartbeat handler execution (after the heartbeat
   event has been written to DynamoDB and `updateLastHeartbeat` has been
   called), the handler emits a CloudWatch metric `AgentHeartbeatEmitted` with
   value `1` into the `AgenticPM` namespace, dimensioned by `Environment`.
2. The monitoring stack defines a CloudWatch Alarm on that metric with
   `treatMissingData: BREACHING`. If the metric receives zero data points in
   two consecutive 15-minute periods, the alarm transitions to `ALARM` state.
3. The alarm action sends a notification to the existing `agentic-pm-alerts`
   SNS topic (already subscribed to the PM's email address).
4. When the agent resumes and the heartbeat metric appears again, the alarm
   automatically returns to `OK` state.

**Edge cases and error handling:**

| Scenario | Behaviour |
|---|---|
| Heartbeat Lambda invoked but fails before emitting metric | No metric data point; alarm correctly treats missing data as breaching after threshold. |
| CloudWatch PutMetricData call fails | Metric emission is wrapped in try/catch (same pattern as existing `MetricsEmitter`). Failure is logged but does not crash the heartbeat Lambda. The missed data point contributes to alarm triggering -- this is the correct fail-safe behaviour. |
| First deployment (no historical metric data) | Alarm enters ALARM immediately because there is no baseline data. This is intentional -- the PM must trigger the agent at least once after deploy to silence the alarm. Alternatively, add a brief `INSUFFICIENT_DATA` suppression period via `datapointsToAlarm: 2` with `evaluationPeriods: 2`. |
| Agent paused intentionally (e.g. maintenance) | The PM can temporarily disable alarm actions in CloudWatch Console or set the alarm state to `OK` via CLI. No application-level "pause" toggle is built for v1. |
| Multiple environments (dev/prod) | The metric dimension `Environment` ensures dev and prod alarms are independent. Alarms are only created when `config.enableAlarms` is `true` (prod only). |

### 2. Data Model Changes

**No new DynamoDB entities are required.** This feature operates entirely
through CloudWatch metrics and alarms.

**Schema changes:**

Add `AgentHeartbeatEmitted` to the existing `MetricName` union type.

```typescript
// packages/lambdas/src/shared/metrics.ts
export type MetricName =
  | 'AgentCycleCount'
  | 'LLMCostDaily'
  | 'EscalationCount'
  | 'TriggerCount'
  | 'AgentHeartbeatEmitted';  // NEW
```

Add the corresponding unit mapping:

```typescript
const METRIC_UNITS: Record<MetricName, StandardUnit> = {
  AgentCycleCount: StandardUnit.Count,
  LLMCostDaily: StandardUnit.None,
  EscalationCount: StandardUnit.Count,
  TriggerCount: StandardUnit.Count,
  AgentHeartbeatEmitted: StandardUnit.Count,  // NEW
};
```

### 3. Backend Tasks (with file paths)

#### 3a. Emit metric from heartbeat Lambda

**File:** `packages/lambdas/src/heartbeat/handler.ts`

After line 258 (after the heartbeat event is written to DynamoDB, before the
`logger.info('Heartbeat completed', ...)` call), add:

```typescript
// Emit dead man's switch metric
import { metrics } from '../shared/metrics.js';

metrics.increment('AgentHeartbeatEmitted');
await metrics.flush();
```

The metric flush happens after the DynamoDB write so that the metric is only
emitted on a truly successful heartbeat. If DynamoDB writes fail, the handler
throws and the metric is never emitted -- correct fail-safe behaviour.

#### 3b. Add metric to MetricsEmitter

**File:** `packages/lambdas/src/shared/metrics.ts`

- Add `'AgentHeartbeatEmitted'` to `MetricName` union (line 27).
- Add `AgentHeartbeatEmitted: StandardUnit.Count` to `METRIC_UNITS` (line 38).

#### 3c. Define CloudWatch Alarm in monitoring stack

**File:** `packages/cdk/lib/stacks/monitoring-stack.ts`

Inside the `createAlarms` method, after the DynamoDB throttle alarm (after line
100), add a new heartbeat staleness alarm:

```typescript
// Dead Man's Switch — heartbeat staleness alarm
const heartbeatMetric = new cloudwatch.Metric({
  namespace: 'AgenticPM',
  metricName: 'AgentHeartbeatEmitted',
  dimensionsMap: {
    Environment: props.config.envName,
  },
  period: cdk.Duration.minutes(15),
  statistic: 'Sum',
});

const heartbeatStalenessAlarm = new cloudwatch.Alarm(
  this,
  'HeartbeatStalenessAlarm',
  {
    alarmName: 'agentic-pm-heartbeat-staleness',
    alarmDescription:
      'Agent heartbeat has not been received for 30 minutes. ' +
      'The agent cycle may have stopped running.',
    metric: heartbeatMetric,
    threshold: 1,
    comparisonOperator:
      cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    evaluationPeriods: 2,
    datapointsToAlarm: 2,
    treatMissingData: cloudwatch.TreatMissingData.BREACHING,
  }
);

if (this.alertTopic) {
  heartbeatStalenessAlarm.addAlarmAction(
    new cloudwatchActions.SnsAction(this.alertTopic)
  );
  heartbeatStalenessAlarm.addOkAction(
    new cloudwatchActions.SnsAction(this.alertTopic)
  );
}
```

#### 3d. Add heartbeat metric widget to dashboard

**File:** `packages/cdk/lib/stacks/monitoring-stack.ts`

Inside the `createDashboard` method, add a widget for the heartbeat metric:

```typescript
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Agent Heartbeat',
    width: 12,
    left: [
      new cloudwatch.Metric({
        namespace: 'AgenticPM',
        metricName: 'AgentHeartbeatEmitted',
        dimensionsMap: {
          Environment: props.config.envName,
        },
        period: cdk.Duration.minutes(15),
        statistic: 'Sum',
      }),
    ],
  }),
  new cloudwatch.AlarmWidget({
    title: 'Heartbeat Staleness Alarm',
    width: 12,
    alarm: heartbeatStalenessAlarm,
  })
);
```

Note: `heartbeatStalenessAlarm` must be stored as an instance property to be
accessible in `createDashboard`. Alternatively, create both alarm and widget in
the same method.

### 4. Frontend Tasks (with file paths)

#### 4a. Display heartbeat staleness on agent status panel

**File:** `packages/web/src/app/api/agent/status/route.ts`

No change required. The existing status route already returns
`lastHeartbeat` timestamp via `AgentConfigRepository`. The frontend already
renders this in the agent status component.

#### 4b. Visual staleness indicator (enhancement)

**File:** `packages/web/src/lib/hooks/use-agent-status.ts`

The existing `formatLastHeartbeat` helper already shows human-readable time.
Add a derived boolean helper:

```typescript
export function isHeartbeatStale(
  timestamp: string | null,
  thresholdMinutes = 30
): boolean {
  if (!timestamp) return true;
  const diffMs = Date.now() - new Date(timestamp).getTime();
  return diffMs > thresholdMinutes * 60 * 1000;
}
```

The dashboard page or agent status component can then conditionally show a
warning badge (e.g. red dot or "Agent Stale" label) when `isHeartbeatStale`
returns `true`.

**UI wireframe description:**

In the dashboard header where the agent status is shown (green/amber/red dot
with "Last heartbeat: X minutes ago"), add a conditional warning state:

- If `isHeartbeatStale` is `true`, change the status dot colour to red and
  append the text "-- Agent may be offline" in muted-foreground.
- No new pages or routes required.

### 5. Test Plan

#### Unit tests

**File:** `packages/lambdas/src/heartbeat/__tests__/handler.test.ts`

| Test case | Expected behaviour |
|---|---|
| `should emit AgentHeartbeatEmitted metric on successful heartbeat` | After handler returns, verify `metrics.record` or `metrics.increment` was called with `'AgentHeartbeatEmitted'` and `metrics.flush` was awaited. |
| `should not emit metric when heartbeat fails` | Mock `projectRepo.getActive` to throw. Verify `metrics.increment` was NOT called with `'AgentHeartbeatEmitted'`. |
| `should not crash handler when metric flush fails` | Mock `metrics.flush` to throw. Handler should still return successfully (metric emission is non-critical). |

**File:** `packages/lambdas/src/shared/__tests__/metrics.test.ts` (new file)

| Test case | Expected behaviour |
|---|---|
| `should accept AgentHeartbeatEmitted as valid MetricName` | Call `metrics.record('AgentHeartbeatEmitted', 1)` -- no type error, buffer size increments. |
| `should use Count unit for AgentHeartbeatEmitted` | After recording, inspect buffer datum and verify `Unit` is `StandardUnit.Count`. |

**File:** `packages/web/src/lib/hooks/__tests__/use-agent-status.test.ts` (new
file)

| Test case | Expected behaviour |
|---|---|
| `isHeartbeatStale returns true for null timestamp` | `isHeartbeatStale(null)` returns `true`. |
| `isHeartbeatStale returns true for timestamp older than 30 minutes` | Pass ISO timestamp 35 minutes ago; returns `true`. |
| `isHeartbeatStale returns false for recent timestamp` | Pass ISO timestamp 5 minutes ago; returns `false`. |
| `isHeartbeatStale respects custom threshold` | Pass 20-minute-old timestamp with `thresholdMinutes=25`; returns `false`. |

#### Integration tests

| Test case | Expected behaviour |
|---|---|
| CDK snapshot test includes heartbeat alarm resource | Synthesise the monitoring stack and assert a `AWS::CloudWatch::Alarm` with `AlarmName: 'agentic-pm-heartbeat-staleness'` and `TreatMissingData: 'breaching'` exists. |
| CDK snapshot test includes SNS action on heartbeat alarm | Assert `AlarmActions` contains the alert topic ARN. |

#### E2E tests

Not applicable for this feature. CloudWatch alarm behaviour is verified through
CDK snapshot tests and manual post-deploy validation.

### 6. Acceptance Criteria

- **AC-1:** The heartbeat Lambda emits a CloudWatch metric
  `AgentHeartbeatEmitted` (value 1, namespace `AgenticPM`, dimension
  `Environment`) on every successful invocation.
- **AC-2:** A CloudWatch Alarm named `agentic-pm-heartbeat-staleness` exists in
  the monitoring stack with `treatMissingData: BREACHING`,
  `evaluationPeriods: 2`, and `period: 15 minutes`.
- **AC-3:** The alarm triggers (transitions to ALARM) after 30 minutes of no
  heartbeat metric data points.
- **AC-4:** The alarm action sends a notification to the `agentic-pm-alerts`
  SNS topic, which delivers an email to the configured address.
- **AC-5:** The alarm automatically returns to OK when the heartbeat resumes.
- **AC-6:** Failure to emit the metric (e.g. CloudWatch API error) does not
  crash the heartbeat Lambda -- the error is logged and the handler completes
  normally.
- **AC-7:** The CloudWatch dashboard includes a heartbeat metric graph and an
  alarm status widget.
- **AC-8:** The frontend displays a visual "Agent may be offline" warning when
  the last heartbeat is older than 30 minutes.
- **AC-9:** Alarms are only created when `config.enableAlarms` is `true` (prod
  environment).

---

## Feature 5: Meeting Notes Ingestion Pipeline

### 1. Functional Specification

**User story:**
As a PM, I want to paste meeting transcripts or rough notes into the ingestion
interface with meeting-specific metadata (date, attendees, meeting type), so
that the AI extracts action items, decisions, risks, and blockers mapped to the
correct RAID categories and PM artefacts -- saving me 15-20 minutes of manual
post-meeting admin per meeting.

**Detailed behaviour description:**

This feature extends the existing ingestion interface (`/ingest`) with a
meeting-specific workflow. The current ingestion interface already supports free
text and image pasting with AI extraction via the `extract_items` tool. Meeting
notes ingestion adds:

1. **Meeting session type:** When creating a new ingestion session, the user can
   select "Meeting Notes" as the session type (alongside the existing general
   "Ingestion" type). This sets a `sessionType` field on the session entity.

2. **Meeting metadata form:** Before sending the first message, a metadata form
   collects:
   - Meeting date (defaults to today)
   - Attendees (comma-separated names or free text)
   - Meeting type (standup, sprint review, retrospective, stakeholder check-in,
     design review, ad hoc, other)
   - Project association (optional, from existing projects dropdown)

3. **Meeting-specific system prompt:** When the session type is `meeting`, the
   LLM call in `POST /api/ingest/[id]/messages` uses an enhanced system prompt
   that:
   - Instructs the AI to parse meeting notes structure (agenda items, speaker
     attribution, timestamps)
   - Emphasises extraction of action items with owners and due dates
   - Prioritises decision extraction with context and rationale
   - Maps blockers and risks to RAID categories automatically
   - Includes the meeting metadata (date, attendees, type) as context for
     better extraction accuracy

4. **Meeting summary generation:** After all messages in a meeting session have
   been processed, the user can click "Generate Meeting Summary" which makes a
   final LLM call that synthesises all messages and extracted items into a
   structured meeting summary (attendees, agenda topics, key decisions, action
   items, risks identified, next steps).

5. **Extracted items pipeline:** All extracted items follow the existing
   `ExtractedItem` pipeline -- they land in `pending_review` status, the PM
   reviews/approves/dismisses them, and approved items are applied to artefacts.
   No changes to the downstream pipeline.

**Edge cases and error handling:**

| Scenario | Behaviour |
|---|---|
| Empty meeting transcript | AI responds conversationally asking for content. No items extracted. |
| Very long transcript (>50,000 chars) | Existing `sendIngestionMessageSchema` limits content to 50,000 chars. Return 400 validation error with guidance to split into multiple messages. |
| Meeting with no clear action items | AI responds with summary but calls `extract_items` with an empty array or only status_update items. No error. |
| Attendees field left blank | Metadata is optional except for meeting date. The system prompt includes whatever metadata is provided. |
| Session type changed after messages exist | Not supported. Session type is set at creation time and is immutable. |
| Budget exhausted mid-meeting | Existing budget check returns 429. Frontend shows "Budget exceeded" error inline in the chat. |
| Meeting metadata with past date | Allowed. PMs often process notes from meetings that happened earlier. Date is stored as metadata, not validated against current time. |

### 2. Data Model Changes

#### 2a. Modified entity: IngestionSession

Add meeting-specific metadata fields to the existing `IngestionSession` entity.

**File:** `packages/core/src/db/repositories/ingestion-session.ts`

```typescript
// NEW: Session type discriminator
export type IngestionSessionType = 'general' | 'meeting';

// NEW: Meeting type enum
export type MeetingType =
  | 'standup'
  | 'sprint_review'
  | 'retrospective'
  | 'stakeholder_checkin'
  | 'design_review'
  | 'ad_hoc'
  | 'other';

// NEW: Meeting metadata interface
export interface MeetingMetadata {
  meetingDate: string;        // ISO date string (YYYY-MM-DD)
  attendees: string[];        // List of attendee names
  meetingType: MeetingType;
  summary?: string;           // Generated meeting summary (populated later)
  summaryGeneratedAt?: string; // ISO timestamp
}

// MODIFIED: Add sessionType and meetingMetadata to IngestionSession
export interface IngestionSession {
  id: string;
  title: string;
  status: IngestionSessionStatus;
  sessionType: IngestionSessionType;       // NEW (default: 'general')
  meetingMetadata?: MeetingMetadata;       // NEW (present when sessionType='meeting')
  messages: IngestionMessage[];
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

// MODIFIED: Add sessionType and meetingMetadata to creation options
export interface CreateIngestionSessionOptions {
  title: string;
  projectId?: string;
  sessionType?: IngestionSessionType;      // NEW (default: 'general')
  meetingMetadata?: MeetingMetadata;       // NEW
}
```

DynamoDB layout is unchanged. `sessionType` and `meetingMetadata` are stored as
top-level attributes on the existing `INGEST#<sessionId> / METADATA` item.

PK: `INGEST#<sessionId>` | SK: `METADATA` (unchanged)

New attributes on item:
- `sessionType`: `'general'` | `'meeting'`
- `meetingMetadata`: `{ meetingDate, attendees, meetingType, summary?,
  summaryGeneratedAt? }` (optional, map type)

No new GSI entries needed. Existing `GSI1PK: INGEST#active` /
`GSI1SK: <createdAt>` pattern is sufficient.

#### 2b. New Zod schemas

**File:** `packages/web/src/schemas/ingest.ts`

```typescript
// NEW: Meeting metadata schema
export const meetingMetadataSchema = z.object({
  meetingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  attendees: z
    .array(z.string().min(1).max(100))
    .min(0)
    .max(50),
  meetingType: z.enum([
    'standup',
    'sprint_review',
    'retrospective',
    'stakeholder_checkin',
    'design_review',
    'ad_hoc',
    'other',
  ]),
});

// MODIFIED: Extend createIngestionSessionSchema
export const createIngestionSessionSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().optional(),
  sessionType: z.enum(['general', 'meeting']).default('general'),  // NEW
  meetingMetadata: meetingMetadataSchema.optional(),                // NEW
}).refine(
  (data) => {
    // meetingMetadata required when sessionType is 'meeting'
    if (data.sessionType === 'meeting' && !data.meetingMetadata) {
      return false;
    }
    return true;
  },
  { message: 'meetingMetadata is required when sessionType is meeting' }
);

// NEW: Generate meeting summary request schema
export const generateMeetingSummarySchema = z.object({
  sessionId: z.string().min(1),
});

export type MeetingMetadataInput = z.infer<typeof meetingMetadataSchema>;
export type GenerateMeetingSummaryInput = z.infer<
  typeof generateMeetingSummarySchema
>;
```

#### 2c. New TypeScript types

**File:** `packages/web/src/types/index.ts` (or wherever the web types are)

```typescript
export type IngestionSessionType = 'general' | 'meeting';
export type MeetingType =
  | 'standup'
  | 'sprint_review'
  | 'retrospective'
  | 'stakeholder_checkin'
  | 'design_review'
  | 'ad_hoc'
  | 'other';

export interface MeetingMetadata {
  meetingDate: string;
  attendees: string[];
  meetingType: MeetingType;
  summary?: string;
  summaryGeneratedAt?: string;
}

// Extend existing IngestionSession type
export interface IngestionSession {
  // ... existing fields ...
  sessionType: IngestionSessionType;
  meetingMetadata?: MeetingMetadata;
}

// NEW: Meeting summary response
export interface MeetingSummaryResponse {
  summary: string;
  updatedSession: IngestionSession;
}
```

### 3. Backend Tasks (with file paths)

#### 3a. Modify IngestionSessionRepository

**File:** `packages/core/src/db/repositories/ingestion-session.ts`

- Add `sessionType`, `MeetingMetadata`, and `MeetingType` type exports.
- Modify `CreateIngestionSessionOptions` to accept `sessionType` and
  `meetingMetadata`.
- Modify `create()` method to store `sessionType` (default `'general'`) and
  `meetingMetadata` on the DynamoDB item.
- Modify `toSession()` and `toSessionSummary()` mappers to include
  `sessionType` and `meetingMetadata`.
- Add `updateMeetingSummary(sessionId, summary)` method that sets
  `meetingMetadata.summary` and `meetingMetadata.summaryGeneratedAt`.

#### 3b. Modify session creation API route

**File:** `packages/web/src/app/api/ingest/route.ts`

In the `POST` handler, pass `sessionType` and `meetingMetadata` from the
validated request body to `repo.create()`.

#### 3c. Create meeting-specific system prompt module

**File:** `packages/web/src/lib/prompts/meeting-ingestion.ts` (new file)

```typescript
import type { MeetingMetadata } from '@/types';

/**
 * Build the meeting-specific system prompt.
 *
 * Includes meeting metadata as context so the LLM can use attendee names,
 * meeting date, and meeting type to improve extraction accuracy.
 */
export function buildMeetingSystemPrompt(metadata: MeetingMetadata): string {
  const attendeeList = metadata.attendees.length > 0
    ? metadata.attendees.join(', ')
    : 'Not specified';

  const meetingTypeLabel = metadata.meetingType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `You are a project management assistant embedded in the Agentic PM Workbench.
The user is sharing notes or a transcript from a meeting. Your job is to extract all actionable PM information.

MEETING CONTEXT:
- Date: ${metadata.meetingDate}
- Type: ${meetingTypeLabel}
- Attendees: ${attendeeList}

Your role:
1. **Parse the transcript structure** -- identify speaker turns, agenda items, timestamps if present.
2. **Extract action items** with owners (match to attendee names where possible) and due dates if mentioned.
3. **Extract decisions** with full context: what was decided, alternatives considered, rationale.
4. **Identify risks and blockers** -- anything that could delay delivery or impact quality. Map to RAID categories.
5. **Capture status updates** -- any progress reported, metrics shared, or milestones discussed.
6. **Identify dependencies** -- cross-team dependencies, external blockers, or stakeholder requests.
7. **Summarise key points** -- provide a concise summary suitable for someone who missed the meeting.

IMPORTANT: You MUST call the extract_items tool for every concrete PM item you identify. Each item needs:
- type: risk, action_item, decision, blocker, status_update, dependency, or stakeholder_request
- title: concise one-line summary
- content: full detail with owner, date, and context
- target_artefact: raid_log (risks/issues/blockers), decision_log (decisions), delivery_state (status updates), backlog_summary (action items/dependencies)
- priority: critical, high, medium, or low

For action items, always include the owner name in the title (e.g. "[@Alice] Complete API documentation by 15 Feb").
For decisions, include the rationale in the content.

Keep responses focused and actionable. Use British English spelling. Do not make up information that isn't in the transcript.`;
}
```

#### 3d. Modify message handler to use meeting prompt

**File:** `packages/web/src/app/api/ingest/[id]/messages/route.ts`

In the `POST` handler, after retrieving the ingestion session (line 218), check
`ingestionSession.sessionType`. If it is `'meeting'`, use
`buildMeetingSystemPrompt(ingestionSession.meetingMetadata!)` instead of the
default `SYSTEM_PROMPT` constant.

```typescript
import { buildMeetingSystemPrompt } from '@/lib/prompts/meeting-ingestion';

// ... inside POST handler, after line 228 ...
const systemPrompt =
  ingestionSession.sessionType === 'meeting' && ingestionSession.meetingMetadata
    ? buildMeetingSystemPrompt(ingestionSession.meetingMetadata)
    : SYSTEM_PROMPT;

// Use systemPrompt in the Anthropic API call (line 276)
const response = await anthropic.messages.create({
  // ...
  system: systemPrompt,  // was: SYSTEM_PROMPT
  // ...
});
```

#### 3e. Create meeting summary API route

**File:** `packages/web/src/app/api/ingest/[id]/summary/route.ts` (new file)

```typescript
/**
 * POST /api/ingest/[id]/summary
 *
 * Generate a structured meeting summary from all messages and extracted
 * items in a meeting-type ingestion session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  // 2. Fetch session; validate sessionType === 'meeting'
  // 3. Fetch all extracted items for this session
  // 4. Build a summarisation prompt with full conversation + extracted items
  // 5. Call Claude Haiku (cheaper -- summary is lower complexity)
  // 6. Store summary in session.meetingMetadata.summary
  // 7. Return { summary, updatedSession }
}
```

The summary prompt includes:
- All user messages (meeting notes text)
- All extracted items with their types and priorities
- Meeting metadata (date, attendees, type)

The response is a structured markdown summary with sections: Attendees, Agenda
Topics Discussed, Key Decisions, Action Items (with owners), Risks/Blockers
Identified, Next Steps.

Budget tracking: uses Haiku pricing. Records usage via `BudgetTracker` same as
the message handler.

#### 3f. Modify Zod schemas

**File:** `packages/web/src/schemas/ingest.ts`

Add `meetingMetadataSchema`, modify `createIngestionSessionSchema`, and add
`generateMeetingSummarySchema` as detailed in section 2b.

### 4. Frontend Tasks (with file paths)

#### 4a. Modify session creation form

**File:** `packages/web/src/app/(dashboard)/ingest/page.tsx`

In the `NewSessionForm` component (line 373), add:

1. A radio group or toggle to select session type: "General" or "Meeting Notes".
2. When "Meeting Notes" is selected, show a collapsible metadata form with:
   - Date picker (defaulting to today) for `meetingDate`
   - Text input for `attendees` (comma-separated, with chip/tag display)
   - Dropdown select for `meetingType`
3. Pass `sessionType` and `meetingMetadata` in the `createSession.mutate()`
   call.

**UI wireframe:**

```
+-------------------------------------------+
| New Ingestion Session                     |
+-------------------------------------------+
| Session title:                            |
| [Sprint review - 7 Feb 2026          ]    |
|                                           |
| Type:  ( ) General   (*) Meeting Notes    |
|                                           |
| --- Meeting Details (visible when meeting)|
| Date:      [2026-02-07]                   |
| Attendees: [Alice] [Bob] [Charlie] [+ ]   |
| Type:      [Sprint Review       v]        |
| ---                                       |
|                                           |
| Project:   [API Migration       v]        |
|                        [Cancel] [Create]  |
+-------------------------------------------+
```

#### 4b. Create MeetingMetadataForm component

**File:** `packages/web/src/components/ingest/meeting-metadata-form.tsx` (new
file)

A form component with:
- `DateInput` for meeting date (HTML date input, simple)
- `TagInput` for attendees (type name, press Enter to add chip)
- `Select` for meeting type (from the `MeetingType` enum)
- Props: `value: MeetingMetadata`, `onChange: (metadata: MeetingMetadata) => void`

Uses existing shadcn/ui primitives (`Input`, `Select`, `Badge`).

#### 4c. Add meeting badge to session list

**File:** `packages/web/src/app/(dashboard)/ingest/page.tsx`

In the `SessionList` component, when rendering each session, show a small badge
next to the title if `session.sessionType === 'meeting'` (e.g. a calendar icon
or "Meeting" label).

#### 4d. Add "Generate Summary" button to chat view

**File:** `packages/web/src/app/(dashboard)/ingest/page.tsx`

In the `ChatView` component, when the session type is `'meeting'` and there are
messages, show a "Generate Summary" button in the header bar (next to the
"Extracted" toggle). Clicking it calls the summary API and displays the result
in a modal or inline panel.

#### 4e. Create MeetingSummaryPanel component

**File:** `packages/web/src/components/ingest/meeting-summary-panel.tsx` (new
file)

Renders the generated meeting summary as formatted markdown. Sections:
- Attendees
- Agenda Topics
- Key Decisions (with links to extracted decision items)
- Action Items (table: owner, description, due date, priority)
- Risks / Blockers
- Next Steps

Includes a "Regenerate" button and a "Copy to Clipboard" button.

#### 4f. New hook for meeting summary

**File:** `packages/web/src/lib/hooks/use-ingestion.ts`

Add:

```typescript
async function generateMeetingSummary(
  sessionId: string
): Promise<MeetingSummaryResponse> {
  const response = await fetch(`/api/ingest/${sessionId}/summary`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error ?? 'Failed to generate meeting summary');
  }
  return response.json();
}

export function useGenerateMeetingSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateMeetingSummary,
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: ['ingestion-session', sessionId],
      });
    },
  });
}
```

### 5. Test Plan

#### Unit tests

**File:** `packages/core/src/db/repositories/__tests__/ingestion-session.test.ts`
(new or extend existing)

| Test case | Expected behaviour |
|---|---|
| `create() stores sessionType='general' by default` | Created item has `sessionType: 'general'` and no `meetingMetadata`. |
| `create() stores meeting metadata when sessionType='meeting'` | Created item has `sessionType: 'meeting'` and `meetingMetadata` with all fields. |
| `toSession() maps sessionType and meetingMetadata correctly` | Retrieved session includes both new fields. |
| `updateMeetingSummary() updates summary fields` | After calling, `meetingMetadata.summary` and `summaryGeneratedAt` are set. |

**File:** `packages/web/src/app/api/ingest/__tests__/route.test.ts`

| Test case | Expected behaviour |
|---|---|
| `POST /api/ingest creates meeting session with metadata` | Send `sessionType: 'meeting'` with valid `meetingMetadata`; returns 201 with metadata in response. |
| `POST /api/ingest rejects meeting session without metadata` | Send `sessionType: 'meeting'` without `meetingMetadata`; returns 400 validation error. |
| `POST /api/ingest accepts general session without metadata` | Send `sessionType: 'general'` without `meetingMetadata`; returns 201. |

**File:** `packages/web/src/lib/prompts/__tests__/meeting-ingestion.test.ts`
(new file)

| Test case | Expected behaviour |
|---|---|
| `buildMeetingSystemPrompt includes meeting date` | Output string contains the provided date. |
| `buildMeetingSystemPrompt includes attendee names` | Output string contains all attendee names comma-separated. |
| `buildMeetingSystemPrompt handles empty attendees` | Output string contains "Not specified" for attendees. |
| `buildMeetingSystemPrompt formats meeting type correctly` | `sprint_review` becomes `Sprint Review` in the output. |
| `buildMeetingSystemPrompt includes extract_items instructions` | Output string contains "extract_items" tool reference. |

**File:** `packages/web/src/app/api/ingest/[id]/messages/__tests__/messages.test.ts`
(extend existing or new)

| Test case | Expected behaviour |
|---|---|
| `uses meeting system prompt for meeting sessions` | When session has `sessionType: 'meeting'`, the Anthropic API call uses the meeting-specific prompt (verify by inspecting mock call arguments). |
| `uses default system prompt for general sessions` | When session has `sessionType: 'general'`, the default `SYSTEM_PROMPT` is used. |

**File:** `packages/web/src/app/api/ingest/[id]/summary/__tests__/route.test.ts`
(new file)

| Test case | Expected behaviour |
|---|---|
| `returns 401 when not authenticated` | Unauthenticated request returns 401. |
| `returns 404 for non-existent session` | Returns 404. |
| `returns 400 for non-meeting session` | General session returns 400 with "only available for meeting sessions" message. |
| `generates and stores summary for valid meeting session` | Returns 200 with `summary` string. Verifies `updateMeetingSummary` was called. |
| `returns 429 when budget exceeded` | Budget check fails; returns 429. |

#### Integration tests

| Test case | Expected behaviour |
|---|---|
| Schema validation: meeting metadata with invalid date format | Zod rejects `meetingDate: '7 Feb 2026'` (not YYYY-MM-DD). |
| Schema validation: meeting metadata with >50 attendees | Zod rejects array exceeding max length. |
| Full pipeline: create meeting session, send message, extract items | End-to-end flow with mocked LLM returns extracted items with meeting context. |

#### E2E tests (Playwright)

| Test case | Expected behaviour |
|---|---|
| Create meeting session from UI | Navigate to `/ingest`, click "New", select "Meeting Notes", fill metadata, create. Session appears in sidebar with meeting badge. |
| Send message in meeting session | Type meeting notes, send. AI response appears with extracted items in panel. |
| Generate meeting summary | Click "Generate Summary" button. Summary panel appears with formatted content. |

### 6. Acceptance Criteria

- **AC-1:** The "New Session" form offers a "Meeting Notes" session type option
  alongside the existing general type.
- **AC-2:** Selecting "Meeting Notes" reveals a metadata form with meeting date,
  attendees, and meeting type fields.
- **AC-3:** Meeting metadata is stored on the `IngestionSession` entity in
  DynamoDB and returned in API responses.
- **AC-4:** Messages sent in a meeting-type session use a meeting-specific
  system prompt that includes the meeting metadata as context.
- **AC-5:** The meeting-specific prompt instructs the AI to extract action items
  with owners, decisions with rationale, and risks/blockers mapped to RAID
  categories.
- **AC-6:** Extracted items from meeting sessions follow the existing review
  pipeline (pending_review -> approved -> applied) with no changes to
  downstream behaviour.
- **AC-7:** A "Generate Summary" button appears for meeting sessions with at
  least one message.
- **AC-8:** The generated summary includes: attendees, agenda topics, key
  decisions, action items with owners, risks/blockers, and next steps.
- **AC-9:** The summary is stored on the session entity and can be viewed on
  subsequent page loads without regeneration.
- **AC-10:** Meeting sessions are visually distinguished in the session list
  (badge or icon).
- **AC-11:** Schema validation requires `meetingMetadata` when `sessionType` is
  `'meeting'` and rejects it with a 400 error if missing.
- **AC-12:** Budget tracking applies to all meeting session LLM calls (both
  message processing and summary generation).

---

## Feature 6: Natural Language Project Query ("Ask Your Project")

### 1. Functional Specification

**User story:**
As a PM, I want to ask natural-language questions about my project's current
state and history (e.g. "What blocked the API migration last week?" or "What
decisions have we made about the auth architecture?"), and receive grounded
answers sourced from my artefacts and event history, so that I can quickly get
context without manually searching through multiple artefacts and event feeds.

**Detailed behaviour description:**

A new query interface accessible from a dedicated `/ask` route (or an "Ask"
tab within the existing dashboard). The PM types a question, the system
retrieves relevant context from DynamoDB (artefacts, events, extracted items),
and calls Claude Haiku with the retrieved context to produce a grounded answer.

Flow:
1. PM navigates to `/ask` and selects a project from the project dropdown.
2. PM types a natural-language question into a text input and submits.
3. The backend API route:
   a. Parses the question and identifies relevant data sources (artefacts,
      events by date range, extracted items).
   b. Retrieves all four artefacts for the selected project.
   c. Retrieves recent events (last 7 days by default, adjustable) for the
      project via `EventRepository.getByProject()`.
   d. Optionally retrieves extracted items for the project via
      `ExtractedItemRepository.getByStatus('applied')` filtered by projectId.
   e. Constructs a prompt with the question + retrieved context as structured
      data (artefact snapshots as JSON, events as a timeline).
   f. Calls Claude Haiku with the prompt and `max_tokens: 2048`.
   g. Returns the answer with source citations (which artefact or event the
      information came from).
4. The frontend displays the answer with citations rendered as links/badges
   (e.g. "[RAID Log]", "[Event: 3 Feb]").
5. The PM can ask follow-up questions. The conversation is stateless per
   question (no multi-turn context) in v1 to keep costs low and
   implementation simple.

**Retrieval strategy (v1):**

Rather than embedding-based retrieval (which would require a vector store,
violating the "no Pinecone/S3" constraint), the system uses a deterministic
retrieval approach:

1. **Always retrieve** all four artefacts for the project (small, bounded data).
2. **Retrieve events** for the last N days (default 7, configurable via query
   param). Events are filtered by project and date using the existing
   `EventRepository.getByProject()` with date range filtering.
3. **Retrieve extracted items** that have been applied to the project
   (provides history of ingested information).

This "retrieve everything relevant, let the LLM filter" approach works because
the data volume per project is small (1-2 active projects, bounded artefact
sizes, events TTL 30 days).

**Edge cases and error handling:**

| Scenario | Behaviour |
|---|---|
| No project selected | Frontend disables the question input. API returns 400. |
| Project has no artefacts | LLM receives empty artefact context. Responds with "I don't have enough data to answer this question. The project artefacts haven't been populated yet." |
| Question is unrelated to project data | LLM responds with "I can only answer questions about project data. Try asking about risks, blockers, decisions, or delivery status." |
| Very broad question (e.g. "Tell me everything") | LLM provides a high-level summary. Token usage is capped at 2048 output tokens. |
| Budget exhausted | Returns 429 with budget exceeded error. Frontend displays inline error. |
| LLM rate limited | Returns 429 with rate limit error. Frontend shows retry message. |
| Events span > 7 days request | Allow `days` query param up to 30 (matching event TTL). |
| Answer references data that no longer exists | Possible for events near TTL boundary. LLM is instructed to caveat time-sensitive answers. |
| Question about a different project | LLM only receives context for the selected project. It cannot answer questions about other projects. |

### 2. Data Model Changes

#### 2a. New entity: QueryLog (optional, for analytics)

Store query history for usage analytics and prompt refinement. Uses the
existing single-table design.

**DynamoDB layout:**

| Attribute | Value |
|---|---|
| PK | `PROJECT#<projectId>` |
| SK | `QUERY#<timestamp>#<queryId>` |
| GSI1PK | `QUERY#<date>` |
| GSI1SK | `<timestamp>#<queryId>` |

**Attributes:**

```typescript
interface QueryLogItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  TTL: number;           // 30 days
  queryId: string;
  projectId: string;
  question: string;
  answer: string;
  contextSources: string[];   // e.g. ['delivery_state', 'raid_log', 'events:7d']
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  durationMs: number;
  createdAt: string;
}
```

**Constants additions:**

**File:** `packages/core/src/constants.ts`

```typescript
// Add to KEY_PREFIX
QUERY: 'QUERY#',

// Add to GSI1_PREFIX
QUERY_DATE: 'QUERY#',  // Followed by date (YYYY-MM-DD)
```

#### 2b. New Zod schemas

**File:** `packages/web/src/schemas/query.ts` (new file)

```typescript
import { z } from 'zod';

/**
 * Schema for submitting a project query
 */
export const projectQuerySchema = z.object({
  projectId: z.string().min(1, 'Project is required'),
  question: z
    .string()
    .min(5, 'Question must be at least 5 characters')
    .max(2000, 'Question must be at most 2000 characters'),
  days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7)
    .optional(),
});

export type ProjectQueryInput = z.infer<typeof projectQuerySchema>;
```

#### 2c. New TypeScript types

**File:** `packages/web/src/types/index.ts`

```typescript
/** Citation source in a query answer */
export interface QueryCitation {
  source: 'delivery_state' | 'raid_log' | 'backlog_summary' | 'decision_log'
    | 'event' | 'extracted_item';
  label: string;         // Human-readable label, e.g. "RAID Log" or "Event: 3 Feb"
  reference?: string;    // Event ID or item ID for linking
}

/** Response from the project query API */
export interface ProjectQueryResponse {
  answer: string;
  citations: QueryCitation[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  contextWindow: {
    artefactsLoaded: string[];     // e.g. ['delivery_state', 'raid_log', ...]
    eventsCount: number;
    eventsDays: number;
  };
}

/** Query history item (from QueryLog) */
export interface QueryHistoryItem {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}
```

### 3. Backend Tasks (with file paths)

#### 3a. Create QueryLogRepository

**File:** `packages/core/src/db/repositories/query-log.ts` (new file)

```typescript
/**
 * Query log repository
 *
 * Stores project query history for analytics and prompt refinement.
 *
 * DynamoDB layout:
 *   PK: PROJECT#<projectId>   SK: QUERY#<timestamp>#<queryId>
 *   GSI1PK: QUERY#<date>      GSI1SK: <timestamp>#<queryId>
 */

import { ulid } from 'ulid';
import { KEY_PREFIX, GSI1_PREFIX, TTL } from '../../constants.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

export interface QueryLog {
  id: string;
  projectId: string;
  question: string;
  answer: string;
  contextSources: string[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  durationMs: number;
  createdAt: string;
}

export interface CreateQueryLogOptions {
  projectId: string;
  question: string;
  answer: string;
  contextSources: string[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  durationMs: number;
}

export class QueryLogRepository {
  constructor(private db: DynamoDBClient) {}

  async create(options: CreateQueryLogOptions): Promise<QueryLog> {
    const id = ulid();
    const now = new Date().toISOString();
    const dateOnly = now.split('T')[0]!;

    const item = {
      PK: `${KEY_PREFIX.PROJECT}${options.projectId}`,
      SK: `${KEY_PREFIX.QUERY}${now}#${id}`,
      GSI1PK: `${GSI1_PREFIX.QUERY_DATE}${dateOnly}`,
      GSI1SK: `${now}#${id}`,
      TTL: Math.floor(Date.now() / 1000) + TTL.EVENTS_DAYS * 24 * 60 * 60,
      queryId: id,
      ...options,
      createdAt: now,
    };

    await this.db.put(item as unknown as Record<string, unknown>);
    return { id, ...options, createdAt: now };
  }

  async getByProject(
    projectId: string,
    options?: QueryOptions
  ): Promise<QueryResult<QueryLog>> {
    const result = await this.db.query<QueryLog & { queryId: string }>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.QUERY,
      { limit: options?.limit ?? 20, ascending: false }
    );

    return {
      items: result.items.map((item) => ({
        ...item,
        id: item.queryId,
      })),
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }
}
```

#### 3b. Export from repositories index

**File:** `packages/core/src/db/repositories/index.ts`

Add:

```typescript
export { QueryLogRepository } from './query-log.js';
```

#### 3c. Add constants

**File:** `packages/core/src/constants.ts`

Add `QUERY: 'QUERY#'` to `KEY_PREFIX` and `QUERY_DATE: 'QUERY#'` to
`GSI1_PREFIX`.

#### 3d. Create context retrieval module

**File:** `packages/web/src/lib/query/context-retriever.ts` (new file)

```typescript
/**
 * Retrieves project context for natural language queries.
 *
 * Fetches artefacts, events, and applied extracted items for a project,
 * then formats them as structured context for the LLM prompt.
 */

import {
  ArtefactRepository,
  EventRepository,
  ExtractedItemRepository,
} from '@agentic-pm/core/db/repositories';
import type { DynamoDBClient } from '@agentic-pm/core/db';
import type { Artefact, Event } from '@agentic-pm/core';
import type { ExtractedItem } from '@agentic-pm/core/db/repositories';

export interface RetrievedContext {
  artefacts: Artefact[];
  events: Event[];
  appliedItems: ExtractedItem[];
  summary: {
    artefactsLoaded: string[];
    eventsCount: number;
    eventsDays: number;
  };
}

export async function retrieveProjectContext(
  db: DynamoDBClient,
  projectId: string,
  days: number = 7
): Promise<RetrievedContext> {
  const artefactRepo = new ArtefactRepository(db);
  const eventRepo = new EventRepository(db);

  // Fetch artefacts and events in parallel
  const [artefacts, eventsResult] = await Promise.all([
    artefactRepo.getAllForProject(projectId),
    eventRepo.getByProject(projectId, { limit: 200, days }),
  ]);

  return {
    artefacts,
    events: eventsResult.items,
    appliedItems: [], // v1: skip applied items to reduce token count
    summary: {
      artefactsLoaded: artefacts.map((a) => a.type),
      eventsCount: eventsResult.items.length,
      eventsDays: days,
    },
  };
}

/**
 * Format retrieved context as a structured string for the LLM prompt.
 */
export function formatContextForPrompt(context: RetrievedContext): string {
  const sections: string[] = [];

  // Artefacts
  for (const artefact of context.artefacts) {
    sections.push(
      `=== ARTEFACT: ${artefact.type.toUpperCase().replace(/_/g, ' ')} ===\n` +
      `Last updated: ${artefact.updatedAt} (v${artefact.version})\n` +
      `Content:\n${JSON.stringify(artefact.content, null, 2)}`
    );
  }

  // Events (summarised)
  if (context.events.length > 0) {
    const eventLines = context.events.map(
      (e) => `- [${e.createdAt}] (${e.severity}) ${e.summary}`
    );
    sections.push(
      `=== RECENT EVENTS (last ${context.summary.eventsDays} days, ` +
      `${context.events.length} events) ===\n` +
      eventLines.join('\n')
    );
  } else {
    sections.push('=== RECENT EVENTS ===\nNo events in the selected period.');
  }

  return sections.join('\n\n');
}
```

#### 3e. Create query prompt builder

**File:** `packages/web/src/lib/prompts/project-query.ts` (new file)

```typescript
/**
 * Build the system prompt for project queries.
 */
export const PROJECT_QUERY_SYSTEM_PROMPT = `You are a project management assistant for the Agentic PM Workbench.
The user is asking a question about their project. You have been provided with the project's current artefacts (delivery state, RAID log, backlog summary, decision log) and recent events.

Your role:
1. **Answer the question accurately** using ONLY the provided context. Do not make up information.
2. **Cite your sources** — when referencing information, indicate which artefact or event it came from using [SOURCE: artefact_type] or [SOURCE: event_date] notation.
3. **Be concise** — provide a direct answer first, then supporting details if needed.
4. **Acknowledge gaps** — if the provided context does not contain enough information to fully answer the question, say so clearly.
5. **Use British English spelling** throughout.

Source citation format:
- For artefacts: [SOURCE: delivery_state], [SOURCE: raid_log], [SOURCE: backlog_summary], [SOURCE: decision_log]
- For events: [SOURCE: event YYYY-MM-DD]

If the question is about something not covered by the project data (e.g. general PM advice), politely redirect: "I can only answer questions grounded in your project's artefacts and event history."`;

/**
 * Build the full user message with context and question.
 */
export function buildQueryUserMessage(
  question: string,
  formattedContext: string
): string {
  return `Here is the current project context:\n\n${formattedContext}\n\n---\n\nQuestion: ${question}`;
}
```

#### 3f. Create query API route

**File:** `packages/web/src/app/api/query/route.ts` (new file)

```typescript
/**
 * POST /api/query
 *
 * Ask a natural-language question about a project. Returns an answer
 * grounded in artefact data and recent events.
 *
 * Body: { projectId: string, question: string, days?: number }
 * Response: { answer, citations, tokenUsage, contextWindow }
 */

import { ArtefactRepository, EventRepository, QueryLogRepository }
  from '@agentic-pm/core/db/repositories';
import { BudgetTracker, PRICING } from '@agentic-pm/core/llm';
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import {
  unauthorised,
  validationError,
  budgetExceeded,
  llmError,
  internalError,
  rateLimited,
  notFound,
} from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import {
  retrieveProjectContext,
  formatContextForPrompt,
} from '@/lib/query/context-retriever';
import {
  PROJECT_QUERY_SYSTEM_PROMPT,
  buildQueryUserMessage,
} from '@/lib/prompts/project-query';
import { projectQuerySchema } from '@/schemas/query';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Auth
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    // 2. Validate input
    const body = await request.json();
    const parseResult = projectQuerySchema.safeParse(body);
    if (!parseResult.success) {
      return validationError(
        'Invalid query',
        parseResult.error.flatten()
      );
    }

    const { projectId, question, days = 7 } = parseResult.data;

    const db = getDbClient();

    // 3. Budget check
    const budgetTracker = new BudgetTracker(db);
    await budgetTracker.loadFromDb();
    if (!budgetTracker.canMakeCall()) {
      return budgetExceeded('Daily LLM budget exhausted.', {
        dailySpendUsd: budgetTracker.getState().dailySpendUsd,
        dailyLimitUsd: budgetTracker.getState().dailyLimitUsd,
      });
    }

    // 4. Retrieve context
    const context = await retrieveProjectContext(db, projectId, days);

    if (context.artefacts.length === 0 && context.events.length === 0) {
      return NextResponse.json({
        answer:
          'I do not have enough data to answer this question. ' +
          'The project artefacts have not been populated yet, ' +
          'and there are no recent events.',
        citations: [],
        tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        contextWindow: context.summary,
      });
    }

    const formattedContext = formatContextForPrompt(context);
    const userMessage = buildQueryUserMessage(question, formattedContext);

    // 5. Call Claude Haiku (cheaper for Q&A)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return llmError('LLM API key not configured');

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20250514',
      max_tokens: 2048,
      temperature: 0.2,
      system: PROJECT_QUERY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // 6. Parse response
    const answerText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('\n');

    // 7. Extract citations from [SOURCE: ...] markers
    const citationRegex = /\[SOURCE:\s*([^\]]+)\]/g;
    const citationSet = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = citationRegex.exec(answerText)) !== null) {
      citationSet.add(match[1]!.trim());
    }

    const citations = Array.from(citationSet).map((src) => {
      if (src.startsWith('event')) {
        return {
          source: 'event' as const,
          label: src.replace('event ', 'Event: '),
        };
      }
      return {
        source: src as
          | 'delivery_state'
          | 'raid_log'
          | 'backlog_summary'
          | 'decision_log',
        label: src.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      };
    });

    // 8. Record budget usage
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const pricing = PRICING['claude-haiku-4-5-20250514'];
    const costUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    await budgetTracker.recordUsage(
      { inputTokens, outputTokens, costUsd },
      'project_query',
      'claude-haiku-4-5-20250514'
    );

    // 9. Log query (fire-and-forget)
    const queryLogRepo = new QueryLogRepository(db);
    queryLogRepo
      .create({
        projectId,
        question,
        answer: answerText,
        contextSources: [
          ...context.summary.artefactsLoaded,
          `events:${days}d`,
        ],
        tokenUsage: { inputTokens, outputTokens, costUsd },
        durationMs: Date.now() - startTime,
      })
      .catch((err) => {
        console.error('Failed to log query:', err);
      });

    // 10. Return response
    return NextResponse.json({
      answer: answerText,
      citations,
      tokenUsage: { inputTokens, outputTokens, costUsd },
      contextWindow: context.summary,
    });
  } catch (error) {
    console.error('Error processing project query:', error);

    if (error instanceof Anthropic.AuthenticationError) {
      return llmError('LLM authentication failed.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return rateLimited('LLM rate limited. Please try again shortly.');
    }

    return internalError('Failed to process query');
  }
}
```

#### 3g. Add query history API route (optional, for displaying past queries)

**File:** `packages/web/src/app/api/query/history/route.ts` (new file)

```typescript
/**
 * GET /api/query/history?projectId=<id>&limit=<n>
 *
 * Retrieve recent query history for a project.
 */
export async function GET(request: NextRequest) {
  // Auth check
  // Parse projectId from query params
  // Fetch from QueryLogRepository.getByProject()
  // Return { queries: QueryHistoryItem[] }
}
```

### 4. Frontend Tasks (with file paths)

#### 4a. Create Ask page

**File:** `packages/web/src/app/(dashboard)/ask/page.tsx` (new file)

The main page component for the "Ask Your Project" feature.

**UI wireframe:**

```
+-----------------------------------------------------------+
| Ask Your Project                                          |
+-----------------------------------------------------------+
| Project: [API Migration            v]                     |
|                                                           |
| +-------------------------------------------------------+ |
| | What blocked the API migration last week?         [->]| |
| +-------------------------------------------------------+ |
|                                                           |
| +-------------------------------------------------------+ |
| | ANSWER                                                | |
| |                                                       | |
| | Based on the RAID log [SOURCE: raid_log], the API     | |
| | migration was blocked by two issues last week:        | |
| |                                                       | |
| | 1. **Database schema lock** -- the DBA team had not   | |
| |    approved the migration script. This was raised     | |
| |    on 3 Feb [SOURCE: event 2026-02-03] and is still   | |
| |    open.                                              | |
| |                                                       | |
| | 2. **Authentication dependency** -- the new auth      | |
| |    service deployment was delayed, blocking the API   | |
| |    endpoint registration.                             | |
| |                                                       | |
| | Sources: [RAID Log] [Event: 3 Feb] [Delivery State]  | |
| +-------------------------------------------------------+ |
|                                                           |
| Context: 4 artefacts, 23 events (7 days) | $0.002       |
|                                                           |
| --- Recent Questions ---                                  |
| > What decisions have been made about caching? (2h ago)   |
| > Summarise this week's progress (yesterday)              |
+-----------------------------------------------------------+
```

#### 4b. Create QueryInput component

**File:** `packages/web/src/components/query/query-input.tsx` (new file)

- Text input with submit button (Enter or click)
- Project selector dropdown (reuse existing project selector pattern)
- Loading state while query is processing
- Keyboard shortcut: Ctrl+Enter to submit

#### 4c. Create QueryAnswer component

**File:** `packages/web/src/components/query/query-answer.tsx` (new file)

- Renders the answer as markdown
- Parses `[SOURCE: ...]` markers and renders them as styled badges/chips
- Shows token usage and cost in a subtle footer
- Shows context window summary (artefacts loaded, event count)
- "Copy answer" button

#### 4d. Create QueryHistory component

**File:** `packages/web/src/components/query/query-history.tsx` (new file)

- Lists recent questions for the selected project
- Click a past question to re-display its answer (from cache or re-query)
- Shows relative timestamps ("2 hours ago", "yesterday")

#### 4e. Create useProjectQuery hook

**File:** `packages/web/src/lib/hooks/use-project-query.ts` (new file)

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ProjectQueryResponse, QueryHistoryItem } from '@/types';

async function submitQuery(data: {
  projectId: string;
  question: string;
  days?: number;
}): Promise<ProjectQueryResponse> {
  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    throw new Error(errBody?.error ?? 'Failed to process query');
  }
  return response.json();
}

async function fetchQueryHistory(
  projectId: string
): Promise<{ queries: QueryHistoryItem[] }> {
  const response = await fetch(
    `/api/query/history?projectId=${projectId}&limit=10`
  );
  if (!response.ok) throw new Error('Failed to fetch query history');
  return response.json();
}

/**
 * Submit a project query
 */
export function useProjectQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitQuery,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['query-history', variables.projectId],
      });
    },
  });
}

/**
 * Fetch recent query history for a project
 */
export function useQueryHistory(projectId: string | null) {
  return useQuery({
    queryKey: ['query-history', projectId],
    queryFn: () => fetchQueryHistory(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}
```

#### 4f. Export hook from index

**File:** `packages/web/src/lib/hooks/index.ts`

Add export for `use-project-query`.

#### 4g. Add navigation link

**File:** `packages/web/src/app/(dashboard)/layout.tsx`

Add an "Ask" link to the dashboard sidebar navigation, positioned after
"Ingest" in the nav order. Icon suggestion: `MessageCircleQuestion` from
lucide-react.

### 5. Test Plan

#### Unit tests

**File:** `packages/core/src/db/repositories/__tests__/query-log.test.ts` (new
file)

| Test case | Expected behaviour |
|---|---|
| `create() stores query log with correct PK/SK pattern` | PK is `PROJECT#<projectId>`, SK starts with `QUERY#`. |
| `create() sets TTL to 30 days` | TTL attribute is approximately `now + 30 days` in epoch seconds. |
| `getByProject() returns queries in descending order` | Most recent query first. |
| `getByProject() respects limit parameter` | Returns at most N items. |

**File:** `packages/web/src/lib/query/__tests__/context-retriever.test.ts` (new
file)

| Test case | Expected behaviour |
|---|---|
| `retrieveProjectContext fetches artefacts and events in parallel` | Both repos called; result contains artefacts and events arrays. |
| `retrieveProjectContext returns empty arrays for new project` | No artefacts, no events; summary reflects 0 counts. |
| `formatContextForPrompt includes all artefact types` | Output string contains headers for each artefact. |
| `formatContextForPrompt formats events as timeline` | Each event appears as `- [timestamp] (severity) summary`. |
| `formatContextForPrompt handles empty events` | Shows "No events in the selected period." |

**File:** `packages/web/src/lib/prompts/__tests__/project-query.test.ts` (new
file)

| Test case | Expected behaviour |
|---|---|
| `buildQueryUserMessage includes question and context` | Output contains both the formatted context and the question. |
| `PROJECT_QUERY_SYSTEM_PROMPT includes citation format instructions` | String contains `[SOURCE:` pattern description. |

**File:** `packages/web/src/app/api/query/__tests__/route.test.ts` (new file)

| Test case | Expected behaviour |
|---|---|
| `POST returns 401 when not authenticated` | Unauthenticated returns 401. |
| `POST returns 400 for missing projectId` | Validation error. |
| `POST returns 400 for question shorter than 5 chars` | Validation error. |
| `POST returns 429 when budget exhausted` | Budget exceeded error with details. |
| `POST returns early when no artefacts or events exist` | Returns answer about insufficient data, zero token usage. |
| `POST returns answer with citations for valid query` | Mocked LLM response with `[SOURCE: raid_log]` markers; response includes parsed citations. |
| `POST records budget usage via BudgetTracker` | `budgetTracker.recordUsage` called with correct model and usage. |
| `POST logs query to QueryLogRepository` | `queryLogRepo.create` called (fire-and-forget). |
| `POST handles LLM authentication error` | Returns 500 LLM error. |
| `POST handles LLM rate limit error` | Returns 429 rate limited. |

**File:** `packages/web/src/lib/hooks/__tests__/use-project-query.test.ts` (new
file)

| Test case | Expected behaviour |
|---|---|
| `useProjectQuery calls /api/query with correct payload` | Verify fetch URL and body. |
| `useProjectQuery invalidates query history on success` | queryClient.invalidateQueries called with `['query-history', projectId]`. |
| `useQueryHistory fetches history for given projectId` | Verify fetch URL includes projectId. |
| `useQueryHistory is disabled when projectId is null` | Query is not executed. |

#### Integration tests

| Test case | Expected behaviour |
|---|---|
| Schema validation: question < 5 chars | Zod rejects with appropriate error message. |
| Schema validation: days > 30 | Zod rejects with max constraint error. |
| Full pipeline: submit query with mocked context and LLM | Query returns structured answer with citations extracted from response text. |
| Citation parsing: multiple citation types | Answer containing `[SOURCE: raid_log]`, `[SOURCE: event 2026-02-03]`, and `[SOURCE: delivery_state]` produces 3 distinct citation objects. |

#### E2E tests (Playwright)

| Test case | Expected behaviour |
|---|---|
| Navigate to /ask page | Page loads with project selector and question input. |
| Submit query with project selected | Loading indicator appears, answer renders with citations. |
| Submit query with no project | Submit button disabled or 400 error shown inline. |
| Click recent question from history | Previous answer is displayed. |

### 6. Acceptance Criteria

- **AC-1:** A new `/ask` page is accessible from the dashboard navigation.
- **AC-2:** The page includes a project selector dropdown and a question text
  input.
- **AC-3:** Submitting a question with a selected project calls `POST
  /api/query` and displays the answer below the input.
- **AC-4:** The answer includes inline source citations formatted as styled
  badges (e.g. `[RAID Log]`, `[Event: 3 Feb]`).
- **AC-5:** The API retrieves all four artefacts for the selected project and
  events from the last 7 days (configurable up to 30).
- **AC-6:** The API uses Claude Haiku for query answering to minimise cost.
- **AC-7:** When the project has no artefacts or events, the API returns a
  helpful message without making an LLM call.
- **AC-8:** Budget usage is tracked via `BudgetTracker.recordUsage()` for every
  query that invokes the LLM.
- **AC-9:** Token usage and estimated cost are displayed in a subtle footer
  below the answer.
- **AC-10:** Query history (last 10 questions) is displayed below the answer
  area and persisted in DynamoDB with a 30-day TTL.
- **AC-11:** The question input is disabled when no project is selected.
- **AC-12:** Standard error handling applies: 401 for unauthenticated, 400 for
  validation failures, 429 for budget/rate limits, 500 for LLM errors.
- **AC-13:** The system prompt instructs the LLM to only answer from provided
  context and not fabricate information.
- **AC-14:** The `/ask` navigation link appears in the dashboard sidebar with an
  appropriate icon.

---

## Cross-Feature Considerations

### Budget Impact

| Feature | LLM usage | Estimated cost per invocation |
|---|---|---|
| Feature 4 (Dead Man's Switch) | None | $0 (CloudWatch only) |
| Feature 5 (Meeting Ingestion) | Sonnet per message + Haiku for summary | ~$0.01-0.03 per meeting (same as existing ingestion) |
| Feature 6 (Project Query) | Haiku per query | ~$0.001-0.003 per query |

All three features remain within the $0.23/day and $8/month LLM budget ceiling.
Feature 4 has zero LLM cost. Feature 5 reuses the existing ingestion message
pattern and pricing. Feature 6 deliberately uses Haiku to keep query costs
minimal.

### Deployment Order

1. **Feature 4** first -- it is infrastructure-only (CDK + Lambda metric
   emission), no data model changes, and provides immediate operational value.
2. **Feature 5** second -- builds on the existing ingestion pipeline with
   additive data model changes (new optional fields on existing entity).
3. **Feature 6** third -- introduces a new entity (QueryLog) and a new
   frontend page, but has no dependencies on Features 4 or 5.

### Shared Infrastructure

- All three features use the existing `agentic-pm-alerts` SNS topic (Feature 4
  directly; Features 5 and 6 indirectly via existing error alerting).
- Features 5 and 6 both use `BudgetTracker` for LLM cost tracking.
- Feature 6's context retrieval module (`context-retriever.ts`) could later be
  reused by Feature 5's summary generation to provide meeting-in-context
  summaries.
