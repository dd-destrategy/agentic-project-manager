# Feature Specifications: Features 7, 8, and 9

> Generated: 2026-02-07
> Status: Ready for development
> Codebase reference: monorepo with `packages/core`, `packages/web`, `packages/lambdas`, `packages/cdk`

---

## Table of Contents

1. [Feature 7: "Since You Left" Catch-Up Synthesiser](#feature-7-since-you-left-catch-up-synthesiser)
2. [Feature 8: Decision Outcome Tracking](#feature-8-decision-outcome-tracking)
3. [Feature 9: Stakeholder Intelligence (Implicit Social Graph)](#feature-9-stakeholder-intelligence-implicit-social-graph)

---

## Feature 7: "Since You Left" Catch-Up Synthesiser

### 1. Functional Specification

#### User Story

As a PM, I want to see a prioritised summary of everything that changed since I last visited the dashboard, so that I can quickly catch up without manually scanning the activity feed.

#### Detailed Behaviour Description

1. **Last-visit tracking**: The frontend stores a `lastVisitTimestamp` in `localStorage` under the key `agentic-pm:lastVisitTimestamp`. This value is updated to the current ISO 8601 timestamp each time the user acknowledges/dismisses the catch-up card, or after 60 seconds of active session time (whichever comes first).

2. **Gap detection**: On page load of the Mission Control dashboard (`/`), the frontend reads `lastVisitTimestamp` from `localStorage`. If no value exists (first visit), the feature is suppressed and `lastVisitTimestamp` is initialised to the current time. If a value exists and the gap between now and `lastVisitTimestamp` exceeds 5 minutes, the catch-up flow triggers.

3. **API call**: The frontend calls `GET /api/catch-up?since={lastVisitTimestamp}` to fetch a synthesised briefing. The API route:
   - Queries events from the gap period using `EventRepository.getByDate()` across the relevant date range.
   - Queries current artefact versions for all active projects.
   - Counts pending escalations and held actions created during the gap.
   - If the gap contains fewer than 3 events, returns a simple event list (no LLM call) to save budget.
   - If the gap contains 3 or more events, calls Haiku via `ClaudeClient.callWithTools()` with the `synthesise_catch_up` tool to produce a prioritised briefing.

4. **LLM synthesisation**: The Haiku call receives:
   - All events from the gap period (max 100, most recent).
   - Current artefact summaries (delivery state overall status, open blocker count, pending escalation count).
   - The `synthesise_catch_up` tool schema requiring structured output: priority items, summary, and attention-needed flags.

5. **UI presentation**: A dismissible `Card` appears at the top of the Mission Control page, above the existing activity feed. It displays:
   - Header: "Since you left" with a relative time indicator (e.g., "4 hours ago").
   - A bulleted list of 3-7 priority items, each with a severity badge.
   - An "attention needed" count (pending escalations + held actions created in the gap).
   - A "Dismiss" button (secondary variant) and an auto-collapse timer (card auto-collapses after 30 seconds of being visible, but remains accessible via a collapsed bar reading "Catch-up available").

6. **Acknowledge flow**: When the user clicks "Dismiss" or the card auto-collapses, `lastVisitTimestamp` is updated to the current time. Subsequent navigation within the same session does not re-trigger the catch-up (the hook tracks a `dismissed` boolean in React state).

#### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| First-ever visit (no `localStorage` value) | Initialise `lastVisitTimestamp` to now; suppress catch-up card. |
| Gap < 5 minutes | Suppress catch-up card; silently update `lastVisitTimestamp`. |
| Gap > 7 days | Clamp the query to the last 7 days to avoid expensive queries. Show a note: "Showing changes from the last 7 days." |
| Zero events in gap period | Show a brief card: "Nothing happened while you were away." Auto-dismiss after 5 seconds. |
| Fewer than 3 events in gap | Return raw event list without LLM call. Display events directly. |
| LLM call fails (budget exhausted, API error) | Fall back to raw event list display. Log error as a warning event. Do not block the dashboard. |
| `localStorage` unavailable (private browsing) | Gracefully degrade: never show catch-up card. Log warning to console. |
| Multiple browser tabs | Each tab reads `lastVisitTimestamp` independently. The first tab to dismiss updates the value; the other tab will re-read on next mount and see a short/zero gap. |

### 2. Data Model Changes

#### New DynamoDB Entities

No new DynamoDB entities are required. This feature reads existing Event entities and artefact data. The `lastVisitTimestamp` is stored client-side in `localStorage`.

#### Schema Changes

New Zod schema for the catch-up API response:

```typescript
// In packages/core/src/schemas/index.ts

export const CatchUpPriorityItemSchema = z.object({
  summary: z.string().min(1).max(300),
  severity: EventSeveritySchema,
  eventType: EventTypeSchema,
  projectName: z.string().max(200).optional(),
  relatedId: z.string().max(100).optional(),
  timestamp: IsoDateTimeSchema,
});

export const CatchUpBriefingSchema = z.object({
  gapStartedAt: IsoDateTimeSchema,
  gapEndedAt: IsoDateTimeSchema,
  gapDurationMinutes: z.number().min(0),
  totalEventsInGap: z.number().min(0),
  synthesisedByLlm: z.boolean(),
  overallSummary: z.string().max(500),
  priorityItems: z.array(CatchUpPriorityItemSchema).max(7),
  attentionNeeded: z.object({
    pendingEscalations: z.number().min(0),
    pendingHeldActions: z.number().min(0),
    newBlockers: z.number().min(0),
  }),
  projectHealthChanges: z.array(z.object({
    projectName: z.string(),
    previousStatus: z.enum(['green', 'amber', 'red']).optional(),
    currentStatus: z.enum(['green', 'amber', 'red']),
  })).optional(),
});
```

#### New TypeScript Types

```typescript
// In packages/core/src/types/index.ts

export type CatchUpPriorityItem = z.infer<typeof CatchUpPriorityItemSchema>;
export type CatchUpBriefing = z.infer<typeof CatchUpBriefingSchema>;
```

### 3. Backend Tasks

#### New LLM Tool Definition

**File:** `packages/core/src/llm/tools.ts`

Add the `SYNTHESISE_CATCH_UP_TOOL` definition:

```typescript
export const SYNTHESISE_CATCH_UP_TOOL: ToolDefinition = {
  name: 'synthesise_catch_up',
  description: 'Synthesise a prioritised catch-up briefing from gap period events for the PM dashboard.',
  input_schema: {
    type: 'object',
    properties: {
      overall_summary: {
        type: 'string',
        description: 'One-paragraph summary of what happened during the gap period. British English.',
      },
      priority_items: {
        type: 'array',
        description: 'Top 3-7 most important items the PM needs to know, ordered by priority.',
        items: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'One-sentence description of the item' },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            event_type: { type: 'string' },
            project_name: { type: 'string' },
            related_id: { type: 'string', description: 'Related ticket ID or escalation ID' },
          },
          required: ['summary', 'severity', 'event_type'],
        },
        minItems: 1,
        maxItems: 7,
      },
      new_blockers_count: {
        type: 'integer',
        description: 'Number of new blockers raised during the gap period',
      },
    },
    required: ['overall_summary', 'priority_items', 'new_blockers_count'],
  },
};
```

Add `'catch-up'` to the `LambdaType` union and register the tool in `getToolsForLambda()`.

#### New Core Module: Catch-Up Synthesiser

**File:** `packages/core/src/catch-up/synthesiser.ts` (new)

```typescript
/**
 * Catch-up synthesiser
 *
 * Builds a gap-aware briefing from events that occurred between
 * lastVisitTimestamp and now. Uses Haiku for prioritisation when
 * the gap contains 3+ events.
 */

export interface SynthesiserInput {
  since: string;               // ISO 8601 lastVisitTimestamp
  events: Event[];             // Events from the gap period
  projects: Project[];         // Active projects
  artefacts: Map<string, Artefact[]>; // projectId -> artefacts
  pendingEscalations: number;
  pendingHeldActions: number;
}

export interface SynthesiserDeps {
  haikuClient: ClaudeClient;
  budgetTracker: BudgetTracker;
}

export async function synthesiseCatchUp(
  input: SynthesiserInput,
  deps: SynthesiserDeps
): Promise<CatchUpBriefing>;
```

This module:
- Clamps the gap to 7 days maximum.
- If fewer than 3 events, builds a `CatchUpBriefing` directly from the event list (no LLM call).
- If 3+ events, calls `haikuClient.callWithTools<SynthesiseCatchUpOutput>()` with `SYNTHESISE_CATCH_UP_TOOL`, forcing the tool via `forceTool`.
- Records LLM usage via `budgetTracker.recordUsage()`.
- Falls back to deterministic briefing on LLM failure.

#### New API Route

**File:** `packages/web/src/app/api/catch-up/route.ts` (new)

```
GET /api/catch-up?since={ISO8601}
```

- Authenticates via `getServerSession(authOptions)`.
- Validates `since` query parameter with Zod `IsoDateTimeSchema`.
- Clamps `since` to max 7 days ago.
- Queries events across the date range using `EventRepository.getByDate()` for each date in the range.
- Fetches active projects via `ProjectRepository.getActive()`.
- Fetches artefacts for each active project via `ArtefactRepository.getAllForProject()`.
- Counts pending escalations via `EscalationRepository.countPending()`.
- Counts pending held actions via `HeldActionRepository.countPending()`.
- Calls `synthesiseCatchUp()` from the core module.
- Returns `CatchUpBriefing` JSON.
- On error, returns 500 with `internalError()`.

#### Modified Files

| File | Change |
|---|---|
| `packages/core/src/schemas/index.ts` | Add `CatchUpPriorityItemSchema`, `CatchUpBriefingSchema` |
| `packages/core/src/types/index.ts` | Add `CatchUpPriorityItem`, `CatchUpBriefing` type exports |
| `packages/core/src/llm/tools.ts` | Add `SYNTHESISE_CATCH_UP_TOOL`, update `LambdaType`, `getToolsForLambda()` |
| `packages/core/src/index.ts` | Export catch-up module |

### 4. Frontend Tasks

#### New Hook

**File:** `packages/web/src/lib/hooks/use-catch-up.ts` (new)

```typescript
export function useCatchUp(): {
  briefing: CatchUpBriefing | null;
  isLoading: boolean;
  isError: boolean;
  isDismissed: boolean;
  gapMinutes: number;
  dismiss: () => void;
};
```

Logic:
- Reads `lastVisitTimestamp` from `localStorage` on mount.
- Computes gap duration. If gap < 5 minutes, returns `{ briefing: null, isDismissed: true }`.
- Calls `GET /api/catch-up?since={lastVisitTimestamp}` via `useQuery` with `staleTime: Infinity` (no polling -- one-shot).
- Exposes `dismiss()` function that writes current time to `localStorage` and sets `isDismissed` to `true`.
- Sets up an auto-dismiss timer (30 seconds) after data loads.

Register in `packages/web/src/lib/hooks/index.ts`.

#### New Component

**File:** `packages/web/src/components/catch-up-card.tsx` (new)

UI wireframe:

```
+------------------------------------------------------------------+
| [Clock icon]  Since you left (4h 23m ago)             [X Dismiss] |
|                                                                    |
|  "3 escalations were created, sprint progress advanced to 68%,     |
|   and a new blocker was raised on PROJ-142."                       |
|                                                                    |
|  Priority items:                                                   |
|  [!critical]  New blocker: PROJ-142 API dependency unresolved      |
|  [!warning]   Escalation pending: Sprint scope change decision     |
|  [!warning]   Escalation pending: Resource reallocation            |
|  [info]       Backlog summary updated with 3 new tickets           |
|                                                                    |
|  Attention needed: 3 escalations, 1 held action                    |
|                                                                    |
+------------------------------------------------------------------+
```

Component structure:
- Uses shadcn/ui `Card`, `CardHeader`, `CardContent`, `Badge`, `Button`.
- `Clock` icon from `lucide-react` in the header.
- Severity badges use the existing `severityStyles` mapping pattern from `activity-feed.tsx`.
- Collapsed state shows a thin bar: `[Clock] Catch-up available -- Click to expand`.
- Animated entrance via CSS transition (`max-height` + `opacity`).

#### Modified Components

**File:** `packages/web/src/app/(dashboard)/page.tsx` (or equivalent Mission Control page)

Insert `<CatchUpCard />` at the top of the page, before the activity feed and project cards.

### 5. Test Plan

#### Unit Tests

| Test file | Test case | Expected behaviour |
|---|---|---|
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | Gap with 0 events | Returns briefing with "Nothing happened" summary, empty priority items, `synthesisedByLlm: false`. |
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | Gap with 2 events (below LLM threshold) | Returns briefing built from raw events, `synthesisedByLlm: false`. |
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | Gap with 10 events | Calls Haiku via `callWithTools`, returns LLM-synthesised briefing with `synthesisedByLlm: true`. |
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | Gap exceeds 7 days | Clamps `since` to 7 days ago. Query date range does not exceed 7 days. |
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | LLM call fails | Falls back to deterministic briefing from raw events. `synthesisedByLlm: false`. |
| `packages/core/src/catch-up/__tests__/synthesiser.test.ts` | Budget exhausted (tier 3) | Skips LLM call entirely; uses deterministic fallback. |
| `packages/web/src/lib/hooks/__tests__/use-catch-up.test.tsx` | No `localStorage` value | `briefing` is `null`, `isDismissed` is `true`. `lastVisitTimestamp` is initialised. |
| `packages/web/src/lib/hooks/__tests__/use-catch-up.test.tsx` | Gap < 5 minutes | `briefing` is `null`, `isDismissed` is `true`. No API call made. |
| `packages/web/src/lib/hooks/__tests__/use-catch-up.test.tsx` | Gap = 2 hours | API call made with correct `since` param. Briefing data returned. |
| `packages/web/src/lib/hooks/__tests__/use-catch-up.test.tsx` | Dismiss action | `isDismissed` becomes `true`. `localStorage` updated with current time. |
| `packages/web/src/app/api/catch-up/__tests__/route.test.ts` | Unauthenticated request | Returns 401. |
| `packages/web/src/app/api/catch-up/__tests__/route.test.ts` | Missing `since` param | Returns 400 with validation error. |
| `packages/web/src/app/api/catch-up/__tests__/route.test.ts` | Valid request with events | Returns 200 with `CatchUpBriefing` JSON. |

#### Integration Tests

| Test case | Scope |
|---|---|
| Full catch-up flow with DynamoDB Local | Seed events across 2 days. Call `synthesiseCatchUp()` with mocked Haiku client. Verify briefing structure matches `CatchUpBriefingSchema`. |
| API route with mocked DB | Mock `EventRepository`, `ProjectRepository`, `ArtefactRepository`. Verify correct query date ranges and response shape. |

#### E2E Tests

| Test case | Steps |
|---|---|
| First visit suppresses card | Navigate to `/`. Verify no catch-up card is visible. Verify `localStorage` has `lastVisitTimestamp`. |
| Card appears after gap | Set `localStorage` value to 3 hours ago. Navigate to `/`. Verify catch-up card is visible with content. |
| Dismiss hides card | Click "Dismiss". Verify card disappears. Verify `localStorage` updated. |

### 6. Acceptance Criteria

- **AC-1**: When a user visits Mission Control with a gap of 5+ minutes since their last visit, a catch-up card appears at the top of the page displaying a synthesised briefing.
- **AC-2**: The catch-up card shows a prioritised list of 1-7 items ordered by severity, each with a severity badge.
- **AC-3**: When the gap period contains fewer than 3 events, the catch-up card displays the raw event list without making an LLM call.
- **AC-4**: When the gap period contains 3+ events, the briefing is synthesised by a Haiku LLM call using the `synthesise_catch_up` tool.
- **AC-5**: Clicking "Dismiss" hides the card and updates `lastVisitTimestamp` in `localStorage` to the current time.
- **AC-6**: The card auto-collapses after 30 seconds of visibility, but remains accessible via a thin collapsed bar.
- **AC-7**: If the LLM call fails, the card falls back to showing the raw event list rather than an error state.
- **AC-8**: If the gap exceeds 7 days, the query is clamped to 7 days and the card shows a note indicating this.
- **AC-9**: On a user's first-ever visit (no `localStorage` value), no catch-up card is shown and `lastVisitTimestamp` is initialised.
- **AC-10**: The feature does not make any LLM calls when the budget is at degradation tier 3.

---

## Feature 8: Decision Outcome Tracking

### 1. Functional Specification

#### User Story

As a PM, I want the system to track whether past decisions led to their expected outcomes, so that I can improve decision-making quality over time and identify decisions that need revisiting.

#### Detailed Behaviour Description

1. **Schema extension**: Each decision in the `decision_log` artefact gains three new optional fields:
   - `expectedOutcome`: A free-text description of the expected result of the decision, set at decision time.
   - `expectedOutcomeDate`: An ISO 8601 date by which the outcome should be assessable.
   - `outcomeAssessment`: A structured object added later containing the assessment result (materialised, partially materialised, not materialised, too early to assess), evidence, and assessment date.
   - `lastReviewedAt`: ISO 8601 timestamp of the last time this decision's outcome was reviewed.

2. **Decision creation flow**: When a new decision is added (either via the agent's `update_decision_log` tool or via user escalation response), the agent (or user) is prompted to provide `expectedOutcome` and `expectedOutcomeDate`. These fields are optional to maintain backward compatibility. For agent-made decisions, the Haiku tool call includes these fields. For user-made decisions (escalation responses), the UI presents optional "Expected outcome" and "Review by" fields.

3. **Housekeeping review trigger**: The existing housekeeping Lambda (`packages/lambdas/src/housekeeping/handler.ts`) is extended with a new step that scans for decisions approaching or past their `expectedOutcomeDate`. Specifically:
   - Query all active projects' `decision_log` artefacts.
   - For each decision with `status === 'active'` and `expectedOutcomeDate` set:
     - If `expectedOutcomeDate` is within the next 3 days or already past, and either `outcomeAssessment` is absent or `lastReviewedAt` is more than 14 days ago, trigger a review.
   - The review calls Haiku with the `assess_decision_outcome` tool, passing the decision context, expected outcome, and recent events/signals relevant to the decision.
   - The Haiku response populates the `outcomeAssessment` field and updates `lastReviewedAt`.
   - If the assessment is "not materialised" or "partially materialised", an event of type `decision_review` (new event type) is created with severity `warning`, visible in the activity feed and daily digest.

4. **Periodic re-review**: Decisions with an `outcomeAssessment` of "too early to assess" are re-reviewed every 14 days until a conclusive assessment is reached or the decision is superseded/reversed.

5. **Dashboard section**: A new "Decision Quality" section appears on the project detail page, showing:
   - A summary bar: "X of Y decisions assessed, Z% materialised."
   - A list of decisions due for review (expectedOutcomeDate approaching).
   - A list of recently assessed decisions with their outcome status.
   - A simple quality trend: percentage of materialised outcomes over the last 30/60/90 days (deterministic calculation, no LLM).

#### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Decision has no `expectedOutcome` or `expectedOutcomeDate` | Skip review. These fields are optional for backward compatibility. |
| Decision has `status: 'superseded'` or `status: 'reversed'` | Skip review. Only active decisions are assessed. |
| LLM assessment fails (budget/API error) | Set `lastReviewedAt` to now (to avoid retrying next cycle). Log a warning event. Retry on the next housekeeping run. |
| No recent events related to the decision | Haiku assesses with available artefact data. May return "too early to assess" if insufficient evidence. |
| Decision log has > 50 active decisions with dates | Process in batches of 10 to control LLM costs. Prioritise decisions with the oldest `expectedOutcomeDate` first. |
| Multiple projects have decisions due | Process each project independently. Budget allocation is shared. |
| `outcomeAssessment` already exists and is conclusive | Do not re-assess unless `lastReviewedAt` is more than 90 days ago (staleness check). |

### 2. Data Model Changes

#### Modified DynamoDB Entities

No new DynamoDB entities. The `decision_log` artefact content is extended. Artefacts are stored as `PK=PROJECT#uuid, SK=ARTEFACT#decision_log` with the content field containing the full decision log.

#### Schema Changes

**File:** `packages/core/src/schemas/index.ts`

Add the `DecisionOutcomeAssessmentSchema` and extend the existing `DecisionSchema`:

```typescript
export const DecisionOutcomeAssessmentSchema = z.object({
  result: z.enum([
    'materialised',
    'partially_materialised',
    'not_materialised',
    'too_early_to_assess',
  ]),
  evidence: z.string().max(1000),
  assessedAt: IsoDateTimeSchema,
  assessedBy: z.enum(['agent', 'user']),
  confidence: z.number().min(0).max(1),
  signalsConsidered: z.array(z.string().max(100)).optional(),
  notes: z.string().max(500).optional(),
});
```

Extend the existing `DecisionSchema`:

```typescript
export const DecisionSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  context: z.string().max(2000),
  optionsConsidered: z.array(DecisionOptionSchema).min(1),
  decision: z.string().min(1).max(200),
  rationale: z.string().max(1000),
  madeBy: z.enum(['user', 'agent']),
  date: IsoDateTimeSchema,
  status: z.enum(['active', 'superseded', 'reversed']),
  relatedRaidItems: z.array(z.string()).optional(),
  // New fields for outcome tracking
  expectedOutcome: z.string().max(1000).optional(),
  expectedOutcomeDate: IsoDateTimeSchema.optional(),
  outcomeAssessment: DecisionOutcomeAssessmentSchema.optional(),
  lastReviewedAt: IsoDateTimeSchema.optional(),
});
```

Add new event type:

```typescript
export const EventTypeSchema = z.enum([
  // ... existing values ...
  'decision_review',  // NEW
]);
```

#### New TypeScript Types

```typescript
// In packages/core/src/types/index.ts
export type DecisionOutcomeAssessment = z.infer<typeof DecisionOutcomeAssessmentSchema>;

// Derived Decision type automatically inherits new fields from schema
```

### 3. Backend Tasks

#### New LLM Tool Definition

**File:** `packages/core/src/llm/tools.ts`

Add the `ASSESS_DECISION_OUTCOME_TOOL`:

```typescript
export const ASSESS_DECISION_OUTCOME_TOOL: ToolDefinition = {
  name: 'assess_decision_outcome',
  description: 'Assess whether a past decision achieved its expected outcome based on available evidence.',
  input_schema: {
    type: 'object',
    properties: {
      decision_id: {
        type: 'string',
        description: 'The ID of the decision being assessed',
      },
      result: {
        type: 'string',
        enum: ['materialised', 'partially_materialised', 'not_materialised', 'too_early_to_assess'],
        description: 'Whether the expected outcome materialised',
      },
      evidence: {
        type: 'string',
        description: 'Factual evidence supporting the assessment. Reference specific signals or artefact data.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this assessment (0.0 = guessing, 1.0 = certain)',
        minimum: 0,
        maximum: 1,
      },
      signals_considered: {
        type: 'array',
        description: 'IDs or descriptions of signals that informed this assessment',
        items: { type: 'string' },
      },
      notes: {
        type: 'string',
        description: 'Additional observations or recommendations',
      },
    },
    required: ['decision_id', 'result', 'evidence', 'confidence'],
  },
};
```

Update `LambdaType` and `getToolsForLambda()` to include this tool under `'housekeeping'`.

Extend the `UPDATE_DECISION_LOG_TOOL` to include the new fields in the `decisions_added` schema:

```typescript
// In the decisions_added items properties, add:
expected_outcome: { type: 'string', description: 'Expected result of this decision' },
expected_outcome_date: { type: 'string', format: 'date-time', description: 'Date by which outcome should be assessable' },
```

#### New Core Module: Decision Outcome Reviewer

**File:** `packages/core/src/artefacts/decision-reviewer.ts` (new)

```typescript
/**
 * Decision outcome reviewer
 *
 * Identifies decisions due for review and invokes Haiku to assess
 * whether expected outcomes materialised.
 */

export interface DecisionReviewInput {
  decision: Decision;
  recentEvents: Event[];
  currentArtefacts: {
    deliveryState?: DeliveryStateContent;
    raidLog?: RaidLogContent;
  };
}

export interface DecisionReviewResult {
  decisionId: string;
  assessment: DecisionOutcomeAssessment;
  eventCreated: boolean;
}

/** Identify active decisions due for outcome review */
export function findDecisionsDueForReview(
  decisions: Decision[],
  now: Date
): Decision[];

/** Assess a single decision's outcome via Haiku */
export async function assessDecisionOutcome(
  input: DecisionReviewInput,
  haikuClient: ClaudeClient,
  budgetTracker: BudgetTracker
): Promise<DecisionReviewResult>;
```

`findDecisionsDueForReview()` logic:
- Filter to `status === 'active'` with `expectedOutcomeDate` set.
- Include if `expectedOutcomeDate` is within 3 days of `now` or already past.
- Exclude if `outcomeAssessment` exists with a conclusive result and `lastReviewedAt` is within 90 days.
- Include if `outcomeAssessment.result === 'too_early_to_assess'` and `lastReviewedAt` is more than 14 days ago.
- Sort by `expectedOutcomeDate` ascending (oldest first).
- Cap at 10 decisions per run.

#### Modified Lambda: Housekeeping

**File:** `packages/lambdas/src/housekeeping/handler.ts`

Insert a new step between step 7 (artefact changes) and step 8 (project summaries):

```typescript
// 7b. Review decision outcomes
const decisionReviewResults = await reviewDecisionOutcomes(
  projects,
  artefactRepo,
  eventRepo,
  haikuClient,
  budgetTracker
);
```

This step:
- Iterates over active projects.
- Fetches each project's `decision_log` artefact.
- Calls `findDecisionsDueForReview()`.
- For each due decision, calls `assessDecisionOutcome()`.
- Writes updated `outcomeAssessment` and `lastReviewedAt` back to the artefact via `ArtefactRepository.update()`.
- Creates `decision_review` events for non-materialised outcomes.

#### New API Route

**File:** `packages/web/src/app/api/decisions/quality/route.ts` (new)

```
GET /api/decisions/quality?projectId={uuid}
```

Returns aggregated decision quality metrics:
- Total active decisions with expected outcomes.
- Count by assessment result.
- Decisions due for review.
- Historical quality trend (materialised % by month for last 3 months).

This is a deterministic aggregation over artefact data -- no LLM call.

#### Modified Files

| File | Change |
|---|---|
| `packages/core/src/schemas/index.ts` | Add `DecisionOutcomeAssessmentSchema`, extend `DecisionSchema`, add `decision_review` to `EventTypeSchema` |
| `packages/core/src/types/index.ts` | Add `DecisionOutcomeAssessment` export |
| `packages/core/src/llm/tools.ts` | Add `ASSESS_DECISION_OUTCOME_TOOL`, update `UPDATE_DECISION_LOG_TOOL` |
| `packages/core/src/artefacts/index.ts` | Export decision reviewer module |
| `packages/lambdas/src/housekeeping/handler.ts` | Add decision review step |
| `packages/web/src/components/activity-feed.tsx` | Add `decision_review` to `eventTypeIcons` mapping |

### 4. Frontend Tasks

#### New Hook

**File:** `packages/web/src/lib/hooks/use-decision-quality.ts` (new)

```typescript
export interface DecisionQualityMetrics {
  totalAssessed: number;
  totalWithOutcomes: number;
  materialisedCount: number;
  partiallyMaterialisedCount: number;
  notMaterialisedCount: number;
  tooEarlyCount: number;
  materialisedPercentage: number;
  dueForReview: Decision[];
  recentAssessments: Array<Decision & { outcomeAssessment: DecisionOutcomeAssessment }>;
  trend: Array<{ month: string; materialisedPercent: number; count: number }>;
}

export function useDecisionQuality(projectId: string | undefined): {
  data: DecisionQualityMetrics | undefined;
  isLoading: boolean;
  isError: boolean;
};
```

Uses `useQuery` with `queryKey: ['decision-quality', projectId]`, `staleTime: 60_000`, `refetchInterval: 60_000`.

Register in `packages/web/src/lib/hooks/index.ts`.

#### New Component

**File:** `packages/web/src/components/decision-quality.tsx` (new)

UI wireframe:

```
+------------------------------------------------------------------+
| [Scale icon]  Decision Quality                                     |
|                                                                    |
|  +----------+  +----------+  +----------+  +----------+           |
|  |    12    |  |    8     |  |    2     |  |    2     |           |
|  | assessed |  | achieved |  | partial  |  |  missed  |           |
|  +----------+  +----------+  +----------+  +----------+           |
|                                                                    |
|  Quality rate: 67% of decisions achieved expected outcomes         |
|  [============================--------] 67%                        |
|                                                                    |
|  --- Due for Review ---                                            |
|  [!warning] D003: Migration approach (due 2 days ago)              |
|  [info]     D007: Vendor selection (due in 1 day)                  |
|                                                                    |
|  --- Recent Assessments ---                                        |
|  [check] D001: API framework choice - Materialised                 |
|  [check] D002: Sprint cadence - Materialised                       |
|  [~]     D005: Staffing model - Partially materialised             |
|  [x]     D004: Deadline commitment - Not materialised              |
|                                                                    |
|  --- Trend (last 3 months) ---                                     |
|  Dec 2025: 75% (4/4)                                               |
|  Jan 2026: 60% (3/5)                                               |
|  Feb 2026: 67% (2/3)                                               |
+------------------------------------------------------------------+
```

Component structure:
- shadcn/ui `Card`, `CardHeader`, `CardContent`, `Badge`, `Progress` bar.
- Four stat cards at the top using a grid layout.
- Progress bar for the quality rate.
- Two collapsible sections: "Due for Review" and "Recent Assessments".
- Simple text-based trend display (bar chart deferred for cost reasons).

#### Modified Components

**File:** `packages/web/src/components/artefact-renderers/decision-log.tsx`

Extend the decision list rendering to show outcome assessment badges:
- If `outcomeAssessment` exists, show a small badge next to the decision status: `[Materialised]` (green), `[Partial]` (amber), `[Missed]` (red), `[Pending]` (grey).
- If `expectedOutcomeDate` is set and approaching, show a small clock icon with "Review due in X days".

### 5. Test Plan

#### Unit Tests

| Test file | Test case | Expected behaviour |
|---|---|---|
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | `findDecisionsDueForReview` with no dated decisions | Returns empty array. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with `expectedOutcomeDate` 2 days ago, no assessment | Returns the decision. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with `expectedOutcomeDate` 5 days in the future | Returns empty (outside 3-day window). |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with `expectedOutcomeDate` 2 days in the future | Returns the decision (within 3-day window). |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with conclusive assessment and recent `lastReviewedAt` | Excluded from results. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with `too_early_to_assess` and `lastReviewedAt` 15 days ago | Returns the decision for re-review. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | Decision with `status: 'superseded'` | Excluded. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | More than 10 eligible decisions | Returns only 10, sorted by oldest `expectedOutcomeDate`. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | `assessDecisionOutcome` with mock Haiku client | Returns `DecisionReviewResult` with assessment from tool output. |
| `packages/core/src/artefacts/__tests__/decision-reviewer.test.ts` | `assessDecisionOutcome` when LLM call fails | Returns result with `eventCreated: false`, logs warning. |
| `packages/core/src/schemas/__tests__/decision-outcome.test.ts` | Valid `DecisionOutcomeAssessmentSchema` parse | Parses without error. |
| `packages/core/src/schemas/__tests__/decision-outcome.test.ts` | Missing required `result` field | Zod throws validation error. |
| `packages/web/src/app/api/decisions/quality/__tests__/route.test.ts` | Unauthenticated request | Returns 401. |
| `packages/web/src/app/api/decisions/quality/__tests__/route.test.ts` | Valid request with assessed decisions | Returns quality metrics JSON. |
| `packages/web/src/app/api/decisions/quality/__tests__/route.test.ts` | Project with no decisions | Returns zero counts with 0% quality rate. |

#### Integration Tests

| Test case | Scope |
|---|---|
| Housekeeping decision review step | Seed a project with 3 decisions (1 due, 1 future, 1 superseded). Run housekeeping with mocked Haiku. Verify only the due decision is assessed. Verify artefact updated with `outcomeAssessment`. |
| Decision quality API with DynamoDB Local | Seed a decision_log artefact with mixed assessment results. Verify quality metrics aggregation is correct. |

#### E2E Tests

| Test case | Steps |
|---|---|
| Decision quality section renders | Navigate to project detail page. Verify "Decision Quality" section appears. |
| Outcome badges on decision log | Navigate to decision log artefact view. Verify outcome badges appear on assessed decisions. |

### 6. Acceptance Criteria

- **AC-1**: The `DecisionSchema` Zod schema accepts the new optional fields `expectedOutcome`, `expectedOutcomeDate`, `outcomeAssessment`, and `lastReviewedAt` without breaking existing data.
- **AC-2**: When the housekeeping Lambda runs, it identifies active decisions whose `expectedOutcomeDate` is within 3 days of the current date or already past, and whose `outcomeAssessment` is absent or stale.
- **AC-3**: For each identified decision, the housekeeping Lambda calls Haiku with the `assess_decision_outcome` tool and writes the result back to the decision_log artefact.
- **AC-4**: When the outcome assessment is "not materialised" or "partially materialised", a `decision_review` event is created with severity `warning`.
- **AC-5**: Decisions with `status: 'superseded'` or `status: 'reversed'` are never assessed.
- **AC-6**: Decisions assessed as "too early to assess" are re-reviewed after 14 days.
- **AC-7**: The dashboard displays a "Decision Quality" section with assessment counts, quality percentage, decisions due for review, and recent assessments.
- **AC-8**: The decision log renderer shows outcome assessment badges (`Materialised`, `Partial`, `Missed`, `Pending`) next to assessed decisions.
- **AC-9**: The `GET /api/decisions/quality` endpoint returns correct aggregated metrics derived from the decision_log artefact.
- **AC-10**: No more than 10 decisions are assessed per housekeeping run to control LLM costs.
- **AC-11**: Backward compatibility is maintained: existing decisions without the new fields continue to work without errors.

---

## Feature 9: Stakeholder Intelligence (Implicit Social Graph)

### 1. Functional Specification

#### User Story

As a PM, I want to see an automatically maintained map of key stakeholders, their engagement levels, and communication patterns, so that I can identify engagement risks and maintain healthy stakeholder relationships without manually tracking interactions.

#### Detailed Behaviour Description

1. **Actor extraction (deterministic)**: During the existing signal normalisation pipeline, actors are extracted from signal metadata. This is entirely deterministic -- no LLM call needed:
   - **Jira signals**: Extract `assignee.displayName`, `reporter.displayName` from `JiraIssue.fields`. The existing `extractParticipants()` function in `packages/core/src/signals/jira.ts` already does this and populates `metadata.participants`.
   - **Outlook signals**: Extract `from.emailAddress.name` and `to[].emailAddress.name` from email metadata.
   - **RAID log**: Extract `owner` field from RAID items.
   - **Escalation responses**: Extract the PM user identity from session data.
   - **Decision log**: Extract `madeBy` context when user-made decisions are recorded.

2. **Stakeholder entity**: A new DynamoDB entity `STAKEHOLDER#normalised_name` is created and maintained. Actor names are normalised (lowercased, trimmed, deduplication via fuzzy matching on edit distance <= 2 characters). Each stakeholder entity tracks:
   - `name`: Display name (original casing from first encounter).
   - `normalisedName`: Lowercase, trimmed canonical form.
   - `projectIds`: Set of project IDs this stakeholder is associated with.
   - `interactionCounts`: Object tracking counts by interaction type (jira_assignment, jira_comment, email_sent, email_received, raid_owner, escalation_participant).
   - `totalInteractions`: Sum of all interaction counts.
   - `firstSeenAt`: ISO 8601 timestamp of first interaction.
   - `lastSeenAt`: ISO 8601 timestamp of most recent interaction.
   - `communicationFrequency`: Calculated field -- interactions per week over the last 30 days.
   - `engagementTrend`: `increasing`, `stable`, `decreasing`, or `silent` (no interaction in 14+ days).
   - `silentSinceDays`: Number of days since last interaction (null if < 1 day).
   - `tags`: Optional user-applied tags (e.g., "sponsor", "tech lead", "external").

3. **Update mechanics**: Stakeholder entities are updated via an `UpdateExpression` (atomic increment) rather than full replacement, to handle concurrent updates from multiple signal processing cycles:
   - On each signal that involves a participant, increment the relevant `interactionCounts` field.
   - Update `lastSeenAt` if the signal timestamp is more recent.
   - Add `projectId` to the `projectIds` set.
   - Recalculate `communicationFrequency` and `engagementTrend` during housekeeping (not on every signal, to reduce write costs).

4. **Housekeeping recalculation**: The housekeeping Lambda gains a new step that iterates over all stakeholder entities and:
   - Recalculates `communicationFrequency` from events in the last 30 days.
   - Updates `engagementTrend` by comparing the last 14 days' interactions to the prior 14 days.
   - Calculates `silentSinceDays` from `lastSeenAt`.
   - If `silentSinceDays` >= 14 and the stakeholder had a `communicationFrequency` >= 1 interaction/week prior to going silent, creates a `stakeholder_anomaly` event (new event type) with severity `warning`.

5. **Anomaly detection**: The silence anomaly is the primary detection mechanism. It flags stakeholders who were previously active but have gone silent. The threshold is configurable but defaults to 14 days. This is purely deterministic -- no LLM call.

6. **Dashboard panel**: A "Key People" panel on the Mission Control page and project detail page shows:
   - A list of stakeholders sorted by `totalInteractions` descending.
   - Each entry shows name, last-seen relative time, interaction count, and an engagement health badge (active/quiet/silent).
   - A filter by project.
   - Silent stakeholders are highlighted with an amber/red badge.
   - Clicking a stakeholder name shows a detail popover with interaction breakdown and timeline.

#### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Same person with different names (e.g., "John Smith" vs "John D. Smith") | Fuzzy matching on normalised name with Levenshtein distance <= 2. If ambiguous, create separate entities; the user can merge via a future UI feature (out of scope for MVP). |
| Very high-frequency stakeholder (100+ interactions/day) | Atomic counter increments handle this naturally. No batching needed at current scale. |
| Stakeholder entity does not exist on first signal | Use `UpdateExpression` with `SET ... IF_NOT_EXISTS(...)` to atomically create or update. |
| Email addresses without display names | Use the email address local part as the display name (e.g., `john.smith@example.com` becomes "john.smith"). |
| Empty `metadata.participants` on a signal | Skip stakeholder update for that signal. Log at debug level. |
| Stakeholder associated with a now-archived project | Stakeholder entity persists. `projectIds` retains the archived project ID. The dashboard filters by active projects by default but allows viewing all. |
| > 200 stakeholders across all projects | Dashboard paginates (20 per page). The GSI query supports pagination natively. |
| Housekeeping runs before any stakeholders exist | The stakeholder scan returns empty. No errors. |

### 2. Data Model Changes

#### New DynamoDB Entity: Stakeholder

| Attribute | Pattern | Example |
|---|---|---|
| `PK` | `STAKEHOLDER#normalised_name` | `STAKEHOLDER#john.smith` |
| `SK` | `STAKEHOLDER#normalised_name` | `STAKEHOLDER#john.smith` |
| `GSI1PK` | `STAKEHOLDERS#all` | `STAKEHOLDERS#all` |
| `GSI1SK` | `INTERACTIONS#{zero-padded total}#normalised_name` | `INTERACTIONS#000042#john.smith` |
| `name` | Display name | `John Smith` |
| `normalisedName` | Canonical form | `john.smith` |
| `projectIds` | String Set | `["uuid1", "uuid2"]` |
| `interactionCounts` | Map | `{ jira_assignment: 5, email_received: 12, ... }` |
| `totalInteractions` | Number | `42` |
| `firstSeenAt` | ISO 8601 | `2026-01-15T09:30:00.000Z` |
| `lastSeenAt` | ISO 8601 | `2026-02-06T14:22:00.000Z` |
| `communicationFrequency` | Number (per week) | `3.5` |
| `engagementTrend` | String | `stable` |
| `silentSinceDays` | Number (nullable) | `null` or `7` |
| `tags` | String Set | `["sponsor", "external"]` |
| `updatedAt` | ISO 8601 | `2026-02-07T08:00:00.000Z` |

Design rationale:
- `PK === SK` pattern (single-item entity, not a collection under a parent).
- `GSI1PK = STAKEHOLDERS#all` enables listing all stakeholders with sort by interaction count.
- `GSI1SK` is zero-padded to enable DynamoDB's lexicographic sort to work as numeric sort (descending queries return highest-interaction stakeholders first).
- No TTL: stakeholder data is retained indefinitely (low volume, high value).

#### New DynamoDB Entity: Stakeholder-Project Association (for per-project queries)

| Attribute | Pattern | Example |
|---|---|---|
| `PK` | `PROJECT#uuid` | `PROJECT#abc-123` |
| `SK` | `STAKEHOLDER#normalised_name` | `STAKEHOLDER#john.smith` |
| `GSI1PK` | `PROJ_STAKEHOLDERS#uuid` | `PROJ_STAKEHOLDERS#abc-123` |
| `GSI1SK` | `INTERACTIONS#{zero-padded count}` | `INTERACTIONS#000012` |
| `normalisedName` | String | `john.smith` |
| `projectInteractionCount` | Number | `12` |
| `lastSeenInProjectAt` | ISO 8601 | `2026-02-06T14:22:00.000Z` |

This denormalised entity enables efficient per-project stakeholder queries without scanning all stakeholders.

#### Schema Changes

**File:** `packages/core/src/schemas/index.ts`

```typescript
export const InteractionCountsSchema = z.object({
  jira_assignment: z.number().min(0).default(0),
  jira_comment: z.number().min(0).default(0),
  jira_reporter: z.number().min(0).default(0),
  email_sent: z.number().min(0).default(0),
  email_received: z.number().min(0).default(0),
  raid_owner: z.number().min(0).default(0),
  escalation_participant: z.number().min(0).default(0),
});

export const EngagementTrendSchema = z.enum([
  'increasing',
  'stable',
  'decreasing',
  'silent',
]);

export const StakeholderSchema = z.object({
  name: z.string().min(1).max(200),
  normalisedName: z.string().min(1).max(200),
  projectIds: z.array(UuidSchema),
  interactionCounts: InteractionCountsSchema,
  totalInteractions: z.number().min(0),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  communicationFrequency: z.number().min(0),
  engagementTrend: EngagementTrendSchema,
  silentSinceDays: z.number().min(0).nullable(),
  tags: z.array(z.string().max(50)).optional(),
  updatedAt: IsoDateTimeSchema,
});
```

Add new event type:

```typescript
export const EventTypeSchema = z.enum([
  // ... existing values ...
  'stakeholder_anomaly',  // NEW
]);
```

Add new key prefix and GSI1 prefix:

```typescript
// In packages/core/src/constants.ts
export const KEY_PREFIX = {
  // ... existing ...
  STAKEHOLDER: 'STAKEHOLDER#',
} as const;

export const GSI1_PREFIX = {
  // ... existing ...
  STAKEHOLDERS_ALL: 'STAKEHOLDERS#all',
  PROJ_STAKEHOLDERS: 'PROJ_STAKEHOLDERS#',
} as const;
```

#### New TypeScript Types

```typescript
// In packages/core/src/types/index.ts
export type InteractionCounts = z.infer<typeof InteractionCountsSchema>;
export type EngagementTrend = z.infer<typeof EngagementTrendSchema>;
export type Stakeholder = z.infer<typeof StakeholderSchema>;
```

### 3. Backend Tasks

#### New Repository

**File:** `packages/core/src/db/repositories/stakeholder.ts` (new)

```typescript
/**
 * Stakeholder repository
 *
 * Manages stakeholder entities with atomic counter updates
 * and per-project association tracking.
 */

export type InteractionType = keyof InteractionCounts;

export class StakeholderRepository {
  constructor(private db: DynamoDBClient) {}

  /** Get a stakeholder by normalised name */
  async getByName(normalisedName: string): Promise<Stakeholder | null>;

  /** Get all stakeholders, sorted by total interactions descending */
  async getAll(options?: QueryOptions): Promise<QueryResult<Stakeholder>>;

  /** Get stakeholders for a specific project */
  async getByProject(
    projectId: string,
    options?: QueryOptions
  ): Promise<QueryResult<Stakeholder>>;

  /**
   * Record an interaction for a stakeholder.
   * Creates the entity if it does not exist (upsert via UpdateExpression).
   * Atomically increments the interaction counter and updates lastSeenAt.
   */
  async recordInteraction(
    name: string,
    projectId: string,
    interactionType: InteractionType,
    timestamp: string
  ): Promise<void>;

  /**
   * Batch-record interactions for multiple stakeholders from a single signal.
   * Calls recordInteraction for each participant.
   */
  async recordInteractionsFromSignal(
    participants: string[],
    projectId: string,
    interactionType: InteractionType,
    timestamp: string
  ): Promise<void>;

  /**
   * Recalculate engagement metrics for a stakeholder.
   * Called during housekeeping.
   */
  async recalculateEngagement(
    normalisedName: string,
    recentInteractionDates: string[],
    now: Date
  ): Promise<void>;

  /**
   * Update user-applied tags on a stakeholder.
   */
  async updateTags(
    normalisedName: string,
    tags: string[]
  ): Promise<void>;

  /**
   * Find stakeholders who have gone silent (silentSinceDays >= threshold).
   */
  async findSilent(thresholdDays: number): Promise<Stakeholder[]>;
}
```

Key implementation details:

`recordInteraction()` uses a DynamoDB `UpdateExpression`:

```
SET #name = if_not_exists(#name, :displayName),
    #normalisedName = :normalisedName,
    #firstSeenAt = if_not_exists(#firstSeenAt, :timestamp),
    #lastSeenAt = if_not_exists(#lastSeenAt, :zero),
    #interactionCounts.#iType = if_not_exists(#interactionCounts.#iType, :zero) + :one,
    #totalInteractions = if_not_exists(#totalInteractions, :zero) + :one,
    #updatedAt = :now
ADD #projectIds :projectIdSet
```

Plus a conditional `SET #lastSeenAt = :timestamp` only if `:timestamp > #lastSeenAt` (using a separate update or condition).

The GSI1SK is also updated: `INTERACTIONS#{padded totalInteractions}#normalisedName`.

`normaliseName()` utility function:

```typescript
export function normaliseName(displayName: string): string {
  return displayName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')       // "John Smith" -> "john.smith"
    .replace(/[^a-z0-9._-]/g, ''); // Remove special characters
}
```

Register in `packages/core/src/db/repositories/index.ts`.

#### New Core Module: Actor Extractor

**File:** `packages/core/src/signals/actor-extractor.ts` (new)

```typescript
/**
 * Deterministic actor extraction from signal data.
 * No LLM call -- purely rule-based extraction.
 */

export interface ExtractedActor {
  name: string;
  interactionType: InteractionType;
}

/** Extract actors from a normalised signal */
export function extractActors(signal: NormalisedSignal): ExtractedActor[];

/** Extract actors from a RAID item */
export function extractActorsFromRaidItem(item: RaidItem): ExtractedActor[];

/** Extract actors from a decision */
export function extractActorsFromDecision(decision: Decision): ExtractedActor[];
```

`extractActors()` logic:
- For `source === 'jira'`:
  - If `signal.metadata?.participants` contains names, extract with type based on signal type:
    - `ticket_assigned` -> `jira_assignment`
    - `ticket_commented` -> `jira_comment`
    - `ticket_created` -> `jira_reporter` for reporter, `jira_assignment` for assignee
    - All other types -> `jira_comment` (generic)
- For `source === 'outlook'`:
  - Extract sender as `email_sent`, recipients as `email_received`.
  - Participant names come from `signal.raw` email metadata.

#### Modified Signal Processing Pipeline

**File:** `packages/lambdas/src/normalise/handler.ts`

After signal normalisation, call `extractActors()` and `stakeholderRepo.recordInteractionsFromSignal()`:

```typescript
// After normalisation:
const actors = extractActors(normalisedSignal);
if (actors.length > 0) {
  await stakeholderRepo.recordInteractionsFromSignal(
    actors.map(a => a.name),
    normalisedSignal.projectId,
    actors[0].interactionType, // Primary interaction type
    normalisedSignal.timestamp
  );
}
```

Note: For signals with multiple actors of different interaction types, iterate and call `recordInteraction()` individually.

#### Modified Lambda: Housekeeping

**File:** `packages/lambdas/src/housekeeping/handler.ts`

Add a new step for stakeholder engagement recalculation:

```typescript
// 7c. Recalculate stakeholder engagement metrics
const stakeholderRepo = new StakeholderRepository(db);
const allStakeholders = await stakeholderRepo.getAll({ limit: 500 });
const silenceThresholdDays = 14;

for (const stakeholder of allStakeholders.items) {
  // Get recent event dates for this stakeholder from the last 30 days
  const recentDates = await getStakeholderInteractionDates(
    stakeholder.normalisedName,
    30
  );
  await stakeholderRepo.recalculateEngagement(
    stakeholder.normalisedName,
    recentDates,
    new Date()
  );
}

// Detect silence anomalies
const silentStakeholders = await stakeholderRepo.findSilent(silenceThresholdDays);
for (const stakeholder of silentStakeholders) {
  // Only create an anomaly event if we haven't already in the last 7 days
  const recentAnomaly = await eventRepo.getRecent({
    eventType: 'stakeholder_anomaly',
    limit: 1,
    days: 7,
  });
  const alreadyFlagged = recentAnomaly.items.some(
    e => e.detail?.context?.stakeholderName === stakeholder.normalisedName
  );

  if (!alreadyFlagged && stakeholder.communicationFrequency >= 1) {
    await eventRepo.create({
      eventType: 'stakeholder_anomaly',
      severity: stakeholder.silentSinceDays! >= 21 ? 'warning' : 'info',
      summary: `${stakeholder.name} has been silent for ${stakeholder.silentSinceDays} days (previously ${stakeholder.communicationFrequency.toFixed(1)} interactions/week)`,
      detail: {
        context: {
          stakeholderName: stakeholder.normalisedName,
          silentDays: stakeholder.silentSinceDays,
          previousFrequency: stakeholder.communicationFrequency,
        },
      },
    });
  }
}
```

#### New API Routes

**File:** `packages/web/src/app/api/stakeholders/route.ts` (new)

```
GET /api/stakeholders?projectId={uuid}&limit=20&cursor=...
```

Returns paginated stakeholder list for a project (or all if `projectId` omitted), sorted by total interactions descending.

**File:** `packages/web/src/app/api/stakeholders/[name]/route.ts` (new)

```
GET /api/stakeholders/{normalisedName}
```

Returns a single stakeholder entity with full interaction breakdown.

```
PATCH /api/stakeholders/{normalisedName}
```

Updates stakeholder tags. Request body: `{ tags: string[] }`.

#### Modified Files

| File | Change |
|---|---|
| `packages/core/src/constants.ts` | Add `STAKEHOLDER` key prefix, `STAKEHOLDERS_ALL` and `PROJ_STAKEHOLDERS` GSI1 prefixes |
| `packages/core/src/schemas/index.ts` | Add `InteractionCountsSchema`, `EngagementTrendSchema`, `StakeholderSchema`, add `stakeholder_anomaly` to `EventTypeSchema` |
| `packages/core/src/types/index.ts` | Add `InteractionCounts`, `EngagementTrend`, `Stakeholder` type exports |
| `packages/core/src/db/repositories/index.ts` | Export `StakeholderRepository` |
| `packages/core/src/signals/index.ts` | Export `extractActors` |
| `packages/lambdas/src/normalise/handler.ts` | Add actor extraction and stakeholder recording |
| `packages/lambdas/src/housekeeping/handler.ts` | Add stakeholder engagement recalculation and silence anomaly detection |
| `packages/web/src/components/activity-feed.tsx` | Add `stakeholder_anomaly` to `eventTypeIcons` mapping (use `UserX` icon from lucide-react) |
| `packages/cdk/lib/*.ts` | No table changes needed (single-table design, GSI1 already exists) |

### 4. Frontend Tasks

#### New Hook

**File:** `packages/web/src/lib/hooks/use-stakeholders.ts` (new)

```typescript
export function useStakeholders(projectId?: string): {
  data: { stakeholders: Stakeholder[]; hasMore: boolean; nextCursor?: string } | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function useStakeholder(normalisedName: string): {
  data: Stakeholder | undefined;
  isLoading: boolean;
  isError: boolean;
};

export function useUpdateStakeholderTags(): UseMutationResult<...>;
```

- `useStakeholders` uses `queryKey: ['stakeholders', projectId]`, `staleTime: 60_000`, `refetchInterval: 60_000`.
- `useStakeholder` uses `queryKey: ['stakeholder', normalisedName]`, `staleTime: 30_000`.

Register in `packages/web/src/lib/hooks/index.ts`.

#### New Components

**File:** `packages/web/src/components/stakeholder-panel.tsx` (new)

UI wireframe:

```
+------------------------------------------------------------------+
| [Users icon]  Key People                          [Filter: All v] |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  | [Avatar] John Smith                                           | |
|  |          Last seen: 2h ago  |  42 interactions  |  [Active]  | |
|  +--------------------------------------------------------------+ |
|  | [Avatar] Sarah Johnson                                        | |
|  |          Last seen: 3d ago  |  28 interactions  |  [Active]  | |
|  +--------------------------------------------------------------+ |
|  | [Avatar] Mike Chen                                [!]         | |
|  |          Last seen: 16d ago |  15 interactions  |  [Silent]  | |
|  +--------------------------------------------------------------+ |
|  | [Avatar] External Vendor                                      | |
|  |          Last seen: 1d ago  |  8 interactions   |  [Active]  | |
|  +--------------------------------------------------------------+ |
|                                                                    |
|  Showing 4 of 12 stakeholders            [Load more]              |
+------------------------------------------------------------------+
```

Engagement health badges:
- **Active** (green): `lastSeenAt` within 3 days AND `engagementTrend` is `increasing` or `stable`.
- **Quiet** (amber): `lastSeenAt` between 3-14 days ago OR `engagementTrend` is `decreasing`.
- **Silent** (red): `silentSinceDays` >= 14.

**File:** `packages/web/src/components/stakeholder-detail.tsx` (new)

A `Dialog` component showing:
- Stakeholder name and tags (editable).
- Interaction breakdown: bar showing counts by type (jira_assignment, email_received, etc.).
- Engagement trend indicator.
- Communication frequency stat.
- "First seen" and "Last seen" timestamps.
- Associated projects.

UI wireframe (popover/dialog):

```
+------------------------------------------+
| John Smith                     [Active]   |
| Tags: [sponsor] [tech lead] [+ Add]      |
|                                           |
| First seen: 15 Jan 2026                   |
| Last seen: 2 hours ago                    |
| Frequency: 3.5 interactions/week          |
| Trend: Stable                             |
|                                           |
| Interaction Breakdown:                    |
| Jira assignments:    ======= 12          |
| Jira comments:       ============ 18     |
| Emails received:     ===== 8             |
| Emails sent:         === 4               |
| RAID ownership:      = 0                  |
|                                           |
| Projects: Alpha, Beta                     |
+------------------------------------------+
```

#### Modified Components

**File:** `packages/web/src/app/(dashboard)/page.tsx` (or equivalent)

Add `<StakeholderPanel />` to the Mission Control layout, positioned after the activity feed or in a sidebar column.

### 5. Test Plan

#### Unit Tests

| Test file | Test case | Expected behaviour |
|---|---|---|
| `packages/core/src/signals/__tests__/actor-extractor.test.ts` | Jira `ticket_assigned` signal with assignee | Returns `[{ name: 'John Smith', interactionType: 'jira_assignment' }]`. |
| `packages/core/src/signals/__tests__/actor-extractor.test.ts` | Jira `ticket_created` signal with reporter and assignee | Returns 2 actors: reporter as `jira_reporter`, assignee as `jira_assignment`. |
| `packages/core/src/signals/__tests__/actor-extractor.test.ts` | Signal with empty `metadata.participants` | Returns empty array. |
| `packages/core/src/signals/__tests__/actor-extractor.test.ts` | Outlook signal with sender and 2 recipients | Returns 3 actors: 1 `email_sent`, 2 `email_received`. |
| `packages/core/src/signals/__tests__/actor-extractor.test.ts` | RAID item with owner "Jane Doe" | Returns `[{ name: 'Jane Doe', interactionType: 'raid_owner' }]`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `normaliseName('John Smith')` | Returns `'john.smith'`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `normaliseName('  John  D.  Smith  ')` | Returns `'john.d..smith'`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `recordInteraction` for new stakeholder | Creates entity with `totalInteractions: 1`, correct `firstSeenAt`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `recordInteraction` for existing stakeholder | Increments counter. `firstSeenAt` unchanged. `lastSeenAt` updated. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `recordInteraction` with older timestamp | `lastSeenAt` not updated (only updates if timestamp is newer). |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `recalculateEngagement` with 7 interactions in 14 days | Sets `communicationFrequency: 3.5`, `engagementTrend: 'stable'`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `recalculateEngagement` with 0 interactions in 30 days | Sets `communicationFrequency: 0`, `engagementTrend: 'silent'`. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `findSilent(14)` with 1 silent and 2 active stakeholders | Returns only the silent stakeholder. |
| `packages/core/src/db/repositories/__tests__/stakeholder.test.ts` | `getByProject` returns only stakeholders associated with the project | Correct filtering by project ID. |
| `packages/web/src/app/api/stakeholders/__tests__/route.test.ts` | Unauthenticated request | Returns 401. |
| `packages/web/src/app/api/stakeholders/__tests__/route.test.ts` | GET with projectId filter | Returns stakeholders for that project only. |
| `packages/web/src/app/api/stakeholders/__tests__/route.test.ts` | GET without filter | Returns all stakeholders sorted by interaction count. |
| `packages/web/src/app/api/stakeholders/[name]/__tests__/route.test.ts` | PATCH with valid tags | Updates tags. Returns 200. |
| `packages/web/src/app/api/stakeholders/[name]/__tests__/route.test.ts` | GET for existing stakeholder | Returns full stakeholder entity. |
| `packages/web/src/app/api/stakeholders/[name]/__tests__/route.test.ts` | GET for non-existent stakeholder | Returns 404. |

#### Integration Tests

| Test case | Scope |
|---|---|
| Signal processing with actor extraction | Process a Jira `ticket_assigned` signal through the normalise Lambda (mocked DynamoDB). Verify `StakeholderRepository.recordInteraction()` is called with correct arguments. |
| Housekeeping engagement recalculation | Seed 3 stakeholders with varying interaction patterns. Run housekeeping. Verify `communicationFrequency` and `engagementTrend` are correctly computed. |
| Silence anomaly detection | Seed a stakeholder with `lastSeenAt` 20 days ago and `communicationFrequency: 2.0`. Run housekeeping. Verify a `stakeholder_anomaly` event is created. |
| Duplicate anomaly suppression | Seed a `stakeholder_anomaly` event from 3 days ago. Run housekeeping. Verify no new anomaly event is created for the same stakeholder. |

#### E2E Tests

| Test case | Steps |
|---|---|
| Stakeholder panel renders | Navigate to Mission Control. Verify "Key People" panel is visible. |
| Stakeholder detail dialog | Click on a stakeholder name. Verify detail dialog opens with interaction breakdown. |
| Silent stakeholder highlighted | Seed a silent stakeholder. Navigate to dashboard. Verify red "Silent" badge is visible. |
| Tag editing | Open stakeholder detail. Add a tag "sponsor". Verify tag appears. Refresh page. Verify tag persists. |

### 6. Acceptance Criteria

- **AC-1**: When a Jira signal is processed, the assignee and reporter are automatically extracted and their stakeholder entities are created or updated in DynamoDB.
- **AC-2**: When an Outlook signal is processed, the sender and recipients are automatically extracted and their stakeholder entities are created or updated.
- **AC-3**: Each stakeholder entity tracks per-type interaction counts (jira_assignment, jira_comment, email_sent, email_received, raid_owner, escalation_participant) via atomic DynamoDB counter increments.
- **AC-4**: The housekeeping Lambda recalculates `communicationFrequency` (interactions per week over 30 days) and `engagementTrend` (increasing/stable/decreasing/silent) for all stakeholders.
- **AC-5**: When a previously active stakeholder (>= 1 interaction/week) has been silent for 14+ days, a `stakeholder_anomaly` event is created with severity `warning`.
- **AC-6**: Silence anomaly events are not duplicated: if an anomaly event for the same stakeholder exists within the last 7 days, a new one is not created.
- **AC-7**: The Mission Control dashboard displays a "Key People" panel listing stakeholders sorted by total interactions, with engagement health badges (Active/Quiet/Silent).
- **AC-8**: Clicking a stakeholder name opens a detail dialog showing interaction breakdown by type, engagement trend, communication frequency, and associated projects.
- **AC-9**: The `GET /api/stakeholders` endpoint supports filtering by `projectId` and pagination, returning stakeholders sorted by interaction count descending.
- **AC-10**: The `PATCH /api/stakeholders/{name}` endpoint allows updating user-applied tags on a stakeholder entity.
- **AC-11**: Actor extraction is entirely deterministic (no LLM calls). Only the engagement recalculation and anomaly detection run in the housekeeping Lambda (also deterministic, no LLM calls).
- **AC-12**: Stakeholder name normalisation handles whitespace, casing, and basic deduplication. Names differing only in case or whitespace map to the same entity.

---

## Cross-Cutting Concerns

### Budget Impact

| Feature | LLM Calls | Estimated Cost/Day |
|---|---|---|
| Feature 7 (Catch-Up) | 0-2 Haiku calls per user session (on-demand only) | ~$0.002/session |
| Feature 8 (Decision Outcomes) | 0-10 Haiku calls per housekeeping run (daily) | ~$0.005/day |
| Feature 9 (Stakeholder Intelligence) | 0 LLM calls (fully deterministic) | $0.000/day |
| **Total additional** | | **~$0.007/day ($0.21/month)** |

All features remain well within the $7/month LLM budget ceiling.

### New Event Types Summary

| Event Type | Feature | Severity | Description |
|---|---|---|---|
| `decision_review` | Feature 8 | `warning` | Decision outcome assessed as not/partially materialised |
| `stakeholder_anomaly` | Feature 9 | `info` or `warning` | Previously active stakeholder has gone silent |

### New DynamoDB Key Prefixes

| Prefix | Feature | Usage |
|---|---|---|
| `STAKEHOLDER#` | Feature 9 | PK and SK for stakeholder entities |
| `STAKEHOLDERS#all` | Feature 9 | GSI1PK for listing all stakeholders |
| `PROJ_STAKEHOLDERS#` | Feature 9 | GSI1PK for per-project stakeholder listing |
| `INTERACTIONS#` | Feature 9 | GSI1SK prefix for interaction-count sorting |

### New API Routes Summary

| Route | Method | Feature | Description |
|---|---|---|---|
| `/api/catch-up` | GET | Feature 7 | Synthesised gap-aware briefing |
| `/api/decisions/quality` | GET | Feature 8 | Decision quality metrics |
| `/api/stakeholders` | GET | Feature 9 | List stakeholders |
| `/api/stakeholders/[name]` | GET, PATCH | Feature 9 | Stakeholder detail and tag update |

### New Hooks Summary

| Hook | Feature | Description |
|---|---|---|
| `useCatchUp` | Feature 7 | Gap detection, API call, dismiss logic |
| `useDecisionQuality` | Feature 8 | Decision quality metrics |
| `useStakeholders` | Feature 9 | Stakeholder list with project filter |
| `useStakeholder` | Feature 9 | Single stakeholder detail |
| `useUpdateStakeholderTags` | Feature 9 | Mutation for tag updates |

### New Components Summary

| Component | Feature | Location |
|---|---|---|
| `CatchUpCard` | Feature 7 | Mission Control (top of page) |
| `DecisionQuality` | Feature 8 | Project detail page |
| `StakeholderPanel` | Feature 9 | Mission Control + project detail |
| `StakeholderDetail` | Feature 9 | Dialog from StakeholderPanel |

### Implementation Order Recommendation

1. **Feature 9** (Stakeholder Intelligence) -- No LLM dependency; purely additive DynamoDB entities; can be developed independently. Provides data foundation for other features.
2. **Feature 8** (Decision Outcome Tracking) -- Extends existing schema; moderate complexity. The housekeeping extension builds on well-understood patterns.
3. **Feature 7** (Catch-Up Synthesiser) -- Most UI-intensive; depends on a mature event pipeline. Best developed last when the activity feed data is rich.
