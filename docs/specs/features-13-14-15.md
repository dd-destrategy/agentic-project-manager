# Feature Specifications: 13, 14, 15

> Agentic PM Workbench -- Features 13-15 Specification
> Status: Ready for development
> Author: Technical Product Architect
> Date: 2026-02-07

---

## Table of Contents

- [Feature 13: Atomic Budget Counters (Race Condition Fix)](#feature-13-atomic-budget-counters-race-condition-fix)
- [Feature 14: Stale Item Watchdog with Follow-up Drafts](#feature-14-stale-item-watchdog-with-follow-up-drafts)
- [Feature 15: Artefact Coherence Auditor](#feature-15-artefact-coherence-auditor)

---

# Feature 13: Atomic Budget Counters (Race Condition Fix)

## 1. Functional Specification

### User Story

As a PM using the autonomous agent, I want the LLM budget tracker to be
concurrency-safe so that concurrent Lambda invocations cannot overwrite each
other's spend records and cause budget overruns that breach my $0.23/day ceiling.

### Problem Statement

The current `BudgetTracker` class in
`packages/core/src/llm/budget.ts` uses a read-modify-write pattern:

1. `loadFromDb()` reads `dailySpendUsd` into an in-memory field
2. `recordUsage()` adds `usage.costUsd` to the in-memory `this.dailySpend`
3. `saveToDb()` writes the entire `BudgetRecord` back via `this.db.put()`

When two Lambda functions (e.g. triage-classify and artefact-update) run
concurrently, both read the same starting value, both increment independently,
and the second `put()` overwrites the first's increment. A daily budget of
$0.23 can be silently exceeded because Lambda A's $0.05 spend is lost when
Lambda B writes its snapshot.

Meanwhile, the `AgentConfigRepository.recordSpend()` method already uses
atomic `ADD` via `transactWrite`, but `BudgetTracker.saveToDb()` bypasses it
entirely by using `put()` on its own `BudgetRecord` items.

### Detailed Behaviour

**Atomic spend recording:**

- Replace `saveToDb()` spend persistence with a new `atomicAddSpend()` method
  that uses `DynamoDBClient.update()` with `UpdateExpression: 'ADD
  dailySpendUsd :cost SET lastUpdated = :now'`.
- Execute two atomic updates per `recordUsage()` call: one for the daily record
  (`daily_spend_<date>`) and one for the monthly record
  (`monthly_spend_<month>`).
- Both updates use a condition expression to reject the write if the resulting
  spend would exceed the hard ceiling ($0.40/day or $8.00/month), returning a
  clear error to the caller.

**Usage history append:**

- Usage history (the `usageHistory` array on `BudgetRecord`) is still written
  via `put()` but on a separate item (`PK=AGENT,
  SK=CONFIG#usage_history_<date>`) to avoid contention with the spend counter.
- The history item is written fire-and-forget; failure does not block the
  spend recording path.

**Read path unchanged:**

- `loadFromDb()` continues to read the current spend values into in-memory
  fields for read-only checks (`canMakeCall()`, `calculateDegradationTier()`,
  etc.).
- After `atomicAddSpend()` succeeds, the in-memory fields are updated
  optimistically so that subsequent reads within the same Lambda invocation
  reflect the new spend.

**Degradation tier sync:**

- After each atomic spend, compute the new degradation tier locally and write
  it via a separate `put()` on the degradation tier config key. This is
  acceptable because tier is advisory and eventual consistency is tolerable.

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Atomic ADD causes spend > daily hard ceiling ($0.40) | Condition expression fails; `atomicAddSpend()` throws `BudgetExceededError`; caller must handle (do not make the LLM call). |
| Atomic ADD causes spend > monthly limit ($8.00) | Same as above -- condition expression rejects. |
| DynamoDB throttling on ADD | Retried automatically by `DynamoDBClient.executeWithRetry()` (up to 3 retries with exponential backoff). |
| Date rollover mid-invocation | `checkDateRollover()` still resets in-memory state and calls `loadFromDb()`; the daily spend item for the new date will be created on first atomic ADD (DynamoDB ADD on a non-existent attribute initialises it to zero). |
| Monthly rollover | Same as date rollover. The monthly item for the new month is created on first ADD. |
| `saveToDb()` failure for usage history | Logged as warning; spend was already recorded atomically. No data loss on the budget counter. |
| Two Lambdas start at $0.00, both try to add $0.21 | First succeeds ($0.21); second's condition `value + :cost <= :maxDaily` evaluates as `$0.21 + $0.21 = $0.42 > $0.40`, so it is rejected. Correct. |

## 2. Data Model Changes

### DynamoDB Entities

No new entities. Two existing items are modified in structure.

**Daily spend record (modified):**

| Attribute | Type | Description |
|---|---|---|
| PK | `AGENT` | Partition key |
| SK | `CONFIG#daily_spend_<YYYY-MM-DD>` | Sort key |
| dailySpendUsd | Number | Atomic counter via ADD |
| lastUpdated | String (ISO 8601) | Timestamp of last update |

Note: The `usageHistory`, `monthlySpendUsd`, `currentDate`, `monthStartDate`
fields are **removed** from this item. The daily spend item becomes a lean
counter.

**Monthly spend record (modified):**

| Attribute | Type | Description |
|---|---|---|
| PK | `AGENT` | Partition key |
| SK | `CONFIG#monthly_spend_<YYYY-MM>` | Sort key |
| monthlySpendUsd | Number | Atomic counter via ADD |
| lastUpdated | String (ISO 8601) | Timestamp of last update |

**Usage history record (new item, same table):**

| Attribute | Type | Description |
|---|---|---|
| PK | `AGENT` | Partition key |
| SK | `CONFIG#usage_history_<YYYY-MM-DD>` | Sort key |
| entries | List of `UsageEntry` | Append-only log, capped at 200 |
| lastUpdated | String (ISO 8601) | Timestamp of last append |
| TTL | Number | 30-day expiry (epoch seconds) |

No GSI changes required.

### Schema Changes

**New Zod schema** (`packages/core/src/schemas/index.ts`):

```typescript
export const AtomicBudgetRecordSchema = z.object({
  PK: z.string(),
  SK: z.string(),
  dailySpendUsd: z.number().min(0).optional(),
  monthlySpendUsd: z.number().min(0).optional(),
  lastUpdated: IsoDateTimeSchema,
});
```

**New TypeScript types** (`packages/core/src/llm/types.ts`):

```typescript
/**
 * Error thrown when an atomic spend update would exceed budget limits
 */
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly currentSpend: number,
    public readonly attemptedAdd: number,
    public readonly limit: number,
    public readonly period: 'daily' | 'monthly'
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Result of an atomic spend operation
 */
export interface AtomicSpendResult {
  newDailySpendUsd: number;
  newMonthlySpendUsd: number;
  degradationTier: DegradationTier;
}
```

**Modified type -- `BudgetRecord`** (`packages/core/src/llm/types.ts`):

The existing `BudgetRecord` interface is retained for backward compatibility
with `loadFromDb()` reads but the `usageHistory` field becomes optional and the
record is no longer written by the spend path.

## 3. Backend Tasks

### 3.1 Modify `BudgetTracker` class

**File:** `packages/core/src/llm/budget.ts`

- Add new private method `atomicAddSpend(costUsd: number): Promise<AtomicSpendResult>`.
  - Calls `this.db.update()` twice (daily and monthly) with:
    ```
    UpdateExpression: 'ADD dailySpendUsd :cost SET lastUpdated = :now'
    ConditionExpression: 'attribute_not_exists(dailySpendUsd) OR dailySpendUsd + :cost <= :maxDaily'
    ```
  - Wraps DynamoDB `ConditionalCheckFailedException` into `BudgetExceededError`.
  - On success, updates `this.dailySpend` and `this.monthlySpend` in memory.
- Modify `recordUsage()` to call `atomicAddSpend()` instead of `this.dailySpend += usage.costUsd` followed by `saveToDb()`.
- Modify `saveToDb()` to only write the usage history item (fire-and-forget). Rename to `saveUsageHistory()` for clarity.
- Add `getDailySpendKey()` and `getMonthlySpendKey()` private helpers for SK construction.
- Export `BudgetExceededError` from the module.

### 3.2 Modify `DynamoDBClient` -- add `updateWithReturn()`

**File:** `packages/core/src/db/client.ts`

- Add method `updateWithReturn<T>()` that sets `ReturnValues: 'ALL_NEW'` and
  returns the updated item attributes. This lets `atomicAddSpend()` read the
  post-increment value from the same round trip, avoiding a separate `get()`.

### 3.3 Reconcile with `AgentConfigRepository.recordSpend()`

**File:** `packages/core/src/db/repositories/agent-config.ts`

- Deprecate `AgentConfigRepository.recordSpend()` with a `@deprecated` JSDoc
  annotation directing callers to `BudgetTracker.recordUsage()`.
- Existing callers in Lambda handlers should be migrated to use
  `BudgetTracker.recordUsage()` only.

### 3.4 Update Lambda handlers that use BudgetTracker

**Files:**
- `packages/lambdas/src/triage-sanitise/handler.ts`
- `packages/lambdas/src/triage-classify/handler.ts`
- `packages/lambdas/src/reasoning/handler.ts`
- `packages/lambdas/src/artefact-update/handler.ts`

- Ensure each handler calls `budgetTracker.sync()` at invocation start and
  `budgetTracker.recordUsage()` after each LLM call.
- Handle `BudgetExceededError` by logging a `budget_warning` event and
  returning gracefully without making the LLM call.

### 3.5 No API route changes

The budget read API (`packages/web/src/app/api/budget/route.ts`) already reads
from `AgentConfigRepository.getBudgetStatus()` which reads the same items. No
change needed; the item schema is backward compatible (ADD creates the
attribute if absent).

## 4. Frontend Tasks

### 4.1 No new pages or components

The existing `BudgetStatus` and `BudgetStatusCompact` components in
`packages/web/src/components/budget-status.tsx` continue to work unchanged
because the API response shape is not modified.

### 4.2 Minor enhancement: budget overrun indicator

**File:** `packages/web/src/components/budget-status.tsx`

- Add a small "Concurrent protection: active" label or icon in the budget card
  footer to give the user confidence the atomic counters are working. This is
  informational only and reads a new boolean field `atomicCountersEnabled` from
  the `/api/budget` response (always `true` after deployment).

## 5. Test Plan

### 5.1 Unit Tests

**File:** `packages/core/src/llm/budget.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | `atomicAddSpend` calls `db.update()` with ADD expression for daily spend | `db.update()` called with `'ADD dailySpendUsd :cost'` |
| 2 | `atomicAddSpend` calls `db.update()` with ADD expression for monthly spend | `db.update()` called with `'ADD monthlySpendUsd :cost'` |
| 3 | `atomicAddSpend` updates in-memory `dailySpend` on success | `tracker.getState().dailySpendUsd` reflects new value |
| 4 | `atomicAddSpend` throws `BudgetExceededError` on condition failure (daily) | Error caught with `period === 'daily'`, in-memory state unchanged |
| 5 | `atomicAddSpend` throws `BudgetExceededError` on condition failure (monthly) | Error caught with `period === 'monthly'`, in-memory state unchanged |
| 6 | `recordUsage` records usage history in separate item | `db.put()` called with SK containing `usage_history_` |
| 7 | `recordUsage` does not call `db.put()` for daily spend item | `db.put()` not called with SK containing `daily_spend_` |
| 8 | Usage history failure does not throw | `db.put()` rejection is caught; `recordUsage()` resolves |
| 9 | Date rollover resets in-memory state before atomic ADD | After simulated date change, `dailySpend` starts from 0 |
| 10 | `updateWithReturn` returns post-increment value | Mock returns `{ dailySpendUsd: 0.15 }` after ADD of 0.05 to 0.10 |

### 5.2 Integration Tests

**File:** `packages/core/src/llm/__tests__/budget-atomic.integration.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Two concurrent `atomicAddSpend()` calls with $0.10 each | Both succeed; final `dailySpendUsd` is $0.20 (verified by `get()`) |
| 2 | Concurrent ADD that would exceed $0.40 ceiling | One succeeds, one throws `BudgetExceededError`; final spend is $0.21 (not $0.42) |
| 3 | ADD on non-existent daily item (first call of the day) | Item created with `dailySpendUsd` equal to the cost; no error |
| 4 | Monthly rollover with concurrent ADDs | Both correctly target the new month item |

Requires local DynamoDB (e.g. `dynamodb-local` or LocalStack) configured via
`DYNAMODB_ENDPOINT` environment variable.

### 5.3 E2E Tests

Not applicable -- this is an internal infrastructure fix with no user-facing
workflow change.

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `BudgetTracker.recordUsage()` uses DynamoDB `UpdateCommand` with `ADD` expression for both daily and monthly spend items -- never `PutCommand` for spend values. |
| AC-2 | When two Lambda invocations concurrently call `recordUsage($0.10)` starting from $0.00, the resulting `dailySpendUsd` in DynamoDB is exactly $0.20 (not $0.10). |
| AC-3 | An `atomicAddSpend()` call that would cause daily spend to exceed $0.40 is rejected with `BudgetExceededError` and the DynamoDB value is unchanged. |
| AC-4 | An `atomicAddSpend()` call that would cause monthly spend to exceed $8.00 is rejected with `BudgetExceededError` and the DynamoDB value is unchanged. |
| AC-5 | `loadFromDb()` continues to work for read-only budget checks (`canMakeCall()`, `isAtHardCeiling()`, `calculateDegradationTier()`). |
| AC-6 | Usage history is stored in a separate DynamoDB item and its write failure does not block or fail the spend recording. |
| AC-7 | All existing `budget.test.ts` tests continue to pass (backward compatibility). |
| AC-8 | `AgentConfigRepository.recordSpend()` is annotated `@deprecated` with migration guidance. |

---

# Feature 14: Stale Item Watchdog with Follow-up Drafts

## 1. Functional Specification

### User Story

As a PM, I want the agent to automatically detect stale RAID items and
blockers and draft follow-up messages so that nothing falls through the cracks
when items sit unattended for too long.

### Detailed Behaviour

**Staleness detection:**

The watchdog runs as a step in the daily `housekeeping` Lambda
(`packages/lambdas/src/housekeeping/handler.ts`). On each execution:

1. Load all artefacts for each active project via `ArtefactRepository.getAllForProject()`.
2. For each `delivery_state` artefact, scan `blockers[]` for items where
   `raisedDate` is older than the blocker staleness threshold (default: 7
   days) and no resolution or update has occurred.
3. For each `raid_log` artefact, scan `items[]` for items where:
   - `status` is `open` or `mitigating`, AND
   - `lastReviewed` is older than the RAID staleness threshold (default: 14
     days).
4. Collect all stale items into a `StaleItemReport`.

**Follow-up draft generation:**

For each stale item, generate a follow-up email draft:

1. Use the item's `owner` field as the intended recipient.
2. Construct a templated email body (no LLM call needed for the template --
   this is deterministic):
   - Subject: `[Follow-up] <item type> <item ID>: <item title>`
   - Body: A brief paragraph stating the item has been open for N days, its
     current status, and a request for an update or resolution plan.
3. Create a held action of type `email_stakeholder` via
   `HeldActionRepository.create()` with `holdMinutes` set to the configured
   hold queue duration (default: 30 minutes).

**Routing through hold queue:**

- The drafted follow-up is routed through the existing hold queue so the user
  can review, approve, cancel, or let it auto-send after the hold period.
- If the user has autonomy level `monitoring`, the follow-up is created as an
  escalation instead (the agent cannot send emails at monitoring level).
- If the user has autonomy level `artefact` or `tactical`, the follow-up
  enters the hold queue as a pending held action.

**Configurable thresholds:**

Staleness thresholds are stored as agent config values in DynamoDB:

- `staleness_blocker_days` (default: 7)
- `staleness_raid_days` (default: 14)
- `staleness_enabled` (default: true)

These are configurable via the Settings page.

**Deduplication:**

- Before creating a follow-up held action, check existing pending held actions
  for the same project. If a pending `email_stakeholder` action already exists
  whose payload subject contains the same item ID, skip creation (do not
  create duplicate follow-ups for the same stale item).

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| RAID item with `lastReviewed` missing | Treat `raisedDate` as the review date for staleness calculation. |
| Blocker with no `owner` field | Use "Unassigned" as the owner; add a note in the email body that the owner is unknown and the PM should assign one. |
| Owner email address not available | Do not create an email draft. Instead, create an event of type `action_held` with a summary indicating the follow-up could not be drafted because the owner email is unknown. |
| Staleness feature disabled via config | Skip the entire watchdog step; log "Staleness watchdog disabled" and continue housekeeping. |
| No stale items found | Log "No stale items detected" and continue. No held actions created. |
| Duplicate pending follow-up already exists | Skip creation; log "Skipped duplicate follow-up for <item ID>". |
| Project has no `delivery_state` or `raid_log` artefact | Skip that artefact type for that project. |
| Error loading artefacts for one project | Log error, continue processing other projects. |

## 2. Data Model Changes

### New DynamoDB Entities

No new entity types. The feature uses existing `HeldAction` (for follow-up
drafts), `Event` (for logging), and `AgentConfig` (for thresholds) entities.

### New Config Keys

Added to `AgentConfigRepository` config keys
(`packages/core/src/db/repositories/agent-config.ts`):

| Key | Type | Default | Description |
|---|---|---|---|
| `staleness_blocker_days` | number | 7 | Days before a blocker is considered stale |
| `staleness_raid_days` | number | 14 | Days before a RAID item is considered stale |
| `staleness_enabled` | boolean | true | Master switch for the watchdog |

### Schema Changes

**New Zod schemas** (`packages/core/src/schemas/index.ts`):

```typescript
export const StalenessConfigSchema = z.object({
  stalenessBlockerDays: z.number().int().min(1).max(90).default(7),
  stalenessRaidDays: z.number().int().min(1).max(90).default(14),
  stalenessEnabled: z.boolean().default(true),
});
```

### New TypeScript Types

**File:** `packages/core/src/artefacts/types.ts` (additions)

```typescript
/**
 * A stale item detected by the watchdog
 */
export interface StaleItem {
  projectId: string;
  projectName: string;
  artefactType: 'delivery_state' | 'raid_log';
  itemId: string;
  itemTitle: string;
  itemType: 'blocker' | 'risk' | 'assumption' | 'issue' | 'dependency';
  owner: string;
  ownerEmail?: string;
  status: string;
  staleSinceDays: number;
  lastReviewedOrRaised: string;
}

/**
 * Report produced by the staleness scan
 */
export interface StaleItemReport {
  scanDate: string;
  projectId: string;
  staleBlockers: StaleItem[];
  staleRaidItems: StaleItem[];
  totalStaleItems: number;
}

/**
 * Configuration for staleness thresholds
 */
export interface StalenessConfig {
  stalenessBlockerDays: number;
  stalenessRaidDays: number;
  stalenessEnabled: boolean;
}
```

## 3. Backend Tasks

### 3.1 New module: `staleness-watchdog.ts`

**File:** `packages/core/src/artefacts/staleness-watchdog.ts`

- Export `scanForStaleItems(projectId: string, artefacts: Artefact[], config: StalenessConfig): StaleItemReport`
  - Scans `delivery_state.blockers[]` for items older than `config.stalenessBlockerDays`.
  - Scans `raid_log.items[]` for open/mitigating items with `lastReviewed` older than `config.stalenessRaidDays`.
  - Returns a `StaleItemReport`.
- Export `generateFollowUpEmail(item: StaleItem): EmailStakeholderPayload`
  - Constructs a deterministic email template.
  - Returns an `EmailStakeholderPayload` compatible with `HeldActionRepository.create()`.
- Export `isDuplicateFollowUp(itemId: string, pendingActions: HeldAction[]): boolean`
  - Checks if a pending held action already targets this item ID.

### 3.2 Add config keys to `AgentConfigRepository`

**File:** `packages/core/src/db/repositories/agent-config.ts`

- Add `STALENESS_BLOCKER_DAYS`, `STALENESS_RAID_DAYS`, `STALENESS_ENABLED` to `CONFIG_KEYS`.
- Add `getStalenessConfig(): Promise<StalenessConfig>` convenience method.
- Add these keys to `initializeDefaults()` with their default values.

### 3.3 Integrate into housekeeping Lambda

**File:** `packages/lambdas/src/housekeeping/handler.ts`

- After step 9 (storage check) and before step 10 (send daily digest), add a
  new step: "Step 9b: Staleness watchdog".
- For each active project:
  1. Call `scanForStaleItems()`.
  2. For each stale item in the report, check deduplication, then create a
     held action via `HeldActionRepository.create()`.
  3. Create an event via `EventRepository.create()` with type `action_held`
     and severity `warning` for each follow-up created.
- Add the stale item count to `HousekeepingOutput` as a new field:
  ```typescript
  stalenessReport: {
    totalStaleItems: number;
    followUpsCreated: number;
    followUpsSkippedDuplicate: number;
  };
  ```
- If staleness is disabled, set all counts to 0 and log a skip message.

### 3.4 New API route for staleness config

**File:** `packages/web/src/app/api/agent/staleness/route.ts`

- `GET`: Returns current `StalenessConfig` from `AgentConfigRepository.getStalenessConfig()`.
- `PATCH`: Accepts partial `StalenessConfig`, validates with `StalenessConfigSchema`, saves via `AgentConfigRepository.setValue()`.

### 3.5 Add to artefact module index

**File:** `packages/core/src/artefacts/index.ts`

- Re-export `scanForStaleItems`, `generateFollowUpEmail`, `isDuplicateFollowUp`, `StaleItem`, `StaleItemReport`, `StalenessConfig`.

## 4. Frontend Tasks

### 4.1 Staleness settings card on Settings page

**File:** `packages/web/src/app/(dashboard)/settings/page.tsx`

Add a new `Card` component below the existing Dry-Run Mode card:

**Wireframe description:**

```
+--------------------------------------------------+
| Staleness Watchdog                               |
| Automatically detect and follow up on stale      |
| blockers and RAID items.                         |
+--------------------------------------------------+
| [Toggle: Enabled/Disabled]                       |
|                                                  |
| Blocker threshold:  [ 7  ] days  [stepper +/-]   |
| RAID item threshold: [ 14 ] days  [stepper +/-]  |
|                                                  |
| Last scan: 2026-02-07 08:15 (3 stale items)     |
+--------------------------------------------------+
```

- The toggle controls `staleness_enabled`.
- The number inputs control `staleness_blocker_days` and `staleness_raid_days`.
- "Last scan" reads from the most recent housekeeping event.

### 4.2 New hook: `use-staleness-config.ts`

**File:** `packages/web/src/lib/hooks/use-staleness-config.ts`

- Uses TanStack Query to fetch `GET /api/agent/staleness` with 30-second stale time.
- Provides a mutation for `PATCH /api/agent/staleness`.

### 4.3 Stale items indicator on project detail page

**File:** `packages/web/src/app/(dashboard)/projects/[id]/page.tsx`

- Add a warning banner at the top of the project detail page when stale items
  exist. The banner reads: "N items have not been reviewed in over X days.
  Follow-up drafts are in the hold queue."
- The stale item count is derived from the artefact data already fetched by
  `use-artefacts.ts` -- no new API call needed. The frontend performs the same
  date comparison logic as the backend watchdog.

### 4.4 New component: `staleness-banner.tsx`

**File:** `packages/web/src/components/staleness-banner.tsx`

- Props: `staleBlockerCount: number`, `staleRaidCount: number`, `thresholdDays: number`.
- Renders an amber warning `Alert` with a link to the pending actions page.

## 5. Test Plan

### 5.1 Unit Tests

**File:** `packages/core/src/artefacts/__tests__/staleness-watchdog.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Blocker raised 8 days ago with threshold 7 | Appears in `staleBlockers` |
| 2 | Blocker raised 6 days ago with threshold 7 | Does not appear in `staleBlockers` |
| 3 | Blocker raised exactly 7 days ago (boundary) | Appears in `staleBlockers` (>= threshold) |
| 4 | RAID item `lastReviewed` 15 days ago, status `open`, threshold 14 | Appears in `staleRaidItems` |
| 5 | RAID item `lastReviewed` 15 days ago, status `resolved` | Does not appear (resolved items excluded) |
| 6 | RAID item with missing `lastReviewed` uses `raisedDate` | Falls back to `raisedDate` for age calculation |
| 7 | `generateFollowUpEmail` produces correct subject line | Subject matches `[Follow-up] <type> <id>: <title>` |
| 8 | `generateFollowUpEmail` for item with no owner | Body includes "owner is unknown" note |
| 9 | `isDuplicateFollowUp` returns true when matching pending action exists | Returns `true` |
| 10 | `isDuplicateFollowUp` returns false when no matching pending action | Returns `false` |
| 11 | `scanForStaleItems` with empty blockers and empty RAID items | Returns report with `totalStaleItems: 0` |
| 12 | `scanForStaleItems` with no `delivery_state` artefact | Gracefully returns empty `staleBlockers` |

### 5.2 Integration Tests

**File:** `packages/lambdas/src/housekeeping/__tests__/staleness.integration.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Housekeeping with 2 stale blockers and staleness enabled | 2 held actions created, 2 `action_held` events created |
| 2 | Housekeeping with staleness disabled | 0 held actions, log message "Staleness watchdog disabled" |
| 3 | Housekeeping with duplicate pending follow-up | Duplicate skipped, only new items get follow-ups |
| 4 | Housekeeping with project missing RAID log artefact | Skips RAID scan for that project, no error |

### 5.3 E2E Tests

**File:** `packages/web/e2e/staleness-settings.spec.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Toggle staleness watchdog off and on | API PATCH called; toggle state persists after page refresh |
| 2 | Change blocker threshold to 10 days | Value saved; reflected on page after refresh |
| 3 | Stale item banner appears on project page | When artefact has 8-day-old blocker and threshold is 7, banner shows |

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | When a blocker in `delivery_state.blockers[]` has `raisedDate` >= 7 days ago (configurable), the watchdog detects it as stale during the daily housekeeping run. |
| AC-2 | When a RAID item in `raid_log.items[]` has `lastReviewed` >= 14 days ago (configurable) and `status` is `open` or `mitigating`, the watchdog detects it as stale. |
| AC-3 | For each stale item detected, a held action of type `email_stakeholder` is created with a follow-up email draft addressed to the item's owner. |
| AC-4 | Duplicate follow-ups for the same item ID are not created if a pending held action already exists for that item. |
| AC-5 | The staleness feature can be disabled via the `staleness_enabled` config key, and when disabled, no scanning or follow-up creation occurs. |
| AC-6 | Staleness thresholds are configurable via the Settings page and persisted in DynamoDB. |
| AC-7 | The housekeeping output includes a `stalenessReport` object with `totalStaleItems`, `followUpsCreated`, and `followUpsSkippedDuplicate` counts. |
| AC-8 | At autonomy level `monitoring`, stale item follow-ups are created as escalations instead of held email actions. |
| AC-9 | The project detail page shows a warning banner when stale items are detected. |

---

# Feature 15: Artefact Coherence Auditor

## 1. Functional Specification

### User Story

As a PM, I want the agent to automatically detect contradictions between my PM
artefacts so that the delivery state, RAID log, backlog summary, and decision
log remain consistent and I am not making decisions based on conflicting
information.

### Detailed Behaviour

**Coherence check trigger:**

The auditor runs once per main agent cycle (every 15 minutes, or at the polling
interval configured for the current degradation tier). It is implemented as a
new step in the Step Functions state machine, positioned after the
artefact-update Lambda and before the housekeeping Lambda.

Alternatively (for initial implementation), it can run as a step within the
housekeeping Lambda to avoid a new Lambda deployment. This specification
assumes the housekeeping integration path.

**What is checked:**

The auditor detects these categories of inconsistency:

| # | Check | Example |
|---|---|---|
| C1 | Blocker count mismatch | `delivery_state.keyMetrics.openBlockers` is 2, but `delivery_state.blockers.length` is 4. |
| C2 | Active risks mismatch | `delivery_state.keyMetrics.activeRisks` is 3, but `raid_log.items.filter(i => i.type === 'risk' && ['open','mitigating'].includes(i.status)).length` is 5. |
| C3 | Blocker in delivery state not in RAID log | A blocker ID in `delivery_state.blockers[]` has no corresponding `issue` in `raid_log.items[]`. |
| C4 | RAID item references resolved decision but decision log says active | A RAID item references a decision ID that is still `active` in the decision log but the RAID item is `resolved`. |
| C5 | Backlog blocked count vs delivery state blockers | `backlog_summary.summary.byStatus.blocked` is 6, but `delivery_state.blockers.length` is 2 (significant divergence). |
| C6 | Overall status inconsistency | `delivery_state.overallStatus` is `green` but there are open critical RAID items or blockers. |
| C7 | Stale cross-references | A decision in the decision log references RAID item IDs that no longer exist in the RAID log. |

**LLM-assisted analysis:**

After the deterministic checks (C1-C7) identify potential inconsistencies, a
single Haiku call is made to:

1. Confirm whether each detected inconsistency is a genuine contradiction or
   an acceptable state (e.g. a blocker may be tracked in delivery state but
   intentionally not in RAID log because it is a short-lived operational
   issue).
2. For genuine contradictions, suggest which artefact should be corrected and
   what the correction should be.
3. Rate the severity of each inconsistency: `critical`, `high`, `medium`, `low`.

This ensures the auditor does not generate false positives for legitimate
divergences.

**Output handling:**

- Each confirmed inconsistency is recorded as an event with type
  `artefact_updated` (reusing existing event type) and severity based on the
  LLM's assessment.
- If the autonomy level is `artefact` or `tactical`, the auditor may
  auto-correct trivial inconsistencies (C1, C2 -- numeric count mismatches)
  by updating the `keyMetrics` fields. These corrections go through the
  existing artefact update path with `updatedBy: 'agent'` and rationale
  `'Coherence auditor: corrected <field> count mismatch'`.
- For non-trivial inconsistencies (C3-C7), the auditor creates an event
  with the inconsistency details and summary for the user to review in the
  activity feed.

**Budget awareness:**

- The auditor consumes exactly one Haiku call per cycle at most.
- At degradation tier 2 or above, the LLM call is skipped and only
  deterministic checks run (inconsistencies are surfaced as events without
  LLM confirmation).
- At degradation tier 3, the auditor is skipped entirely.

### Edge Cases and Error Handling

| Scenario | Behaviour |
|---|---|
| Project has no artefacts | Skip coherence check for that project. |
| Project has only some artefacts (e.g. no decision log) | Run checks only for available artefact pairs. |
| LLM call fails (API error, timeout) | Log error; surface deterministic check results as events without LLM confirmation (marked with `llmConfirmed: false`). |
| LLM call returns unexpected format | Fall back to deterministic results; log warning. |
| No inconsistencies found | Log "Coherence audit passed" as an info event; no further action. |
| Budget at tier 3 | Skip auditor entirely; log "Coherence auditor skipped (tier 3)". |
| Auditor finds inconsistency but auto-correct fails | Log the failure as an error event; the inconsistency event is still created for user visibility. |
| All four artefacts are empty (freshly bootstrapped project) | Skip coherence check; empty artefacts are inherently consistent. |

## 2. Data Model Changes

### New DynamoDB Entities

No new entity types are required. The feature uses existing `Event` entities
for inconsistency reporting.

### Schema Changes

**New Zod schema** (`packages/core/src/schemas/index.ts`):

```typescript
export const CoherenceCheckResultSchema = z.object({
  checkId: z.string(),
  checkType: z.enum([
    'blocker_count_mismatch',
    'active_risks_mismatch',
    'blocker_not_in_raid',
    'raid_decision_status_conflict',
    'backlog_blocker_divergence',
    'status_inconsistency',
    'stale_cross_reference',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string().max(500),
  artefactsInvolved: z.array(ArtefactTypeSchema).min(1),
  expectedValue: z.unknown().optional(),
  actualValue: z.unknown().optional(),
  suggestedCorrection: z.string().max(500).optional(),
  autoCorrectible: z.boolean(),
  llmConfirmed: z.boolean(),
});

export const CoherenceAuditReportSchema = z.object({
  projectId: z.string().uuid(),
  auditedAt: IsoDateTimeSchema,
  artefactsAudited: z.array(ArtefactTypeSchema),
  inconsistencies: z.array(CoherenceCheckResultSchema),
  llmCallMade: z.boolean(),
  llmCostUsd: z.number().min(0).optional(),
  autoCorrectionsApplied: z.number().int().min(0),
});
```

### New TypeScript Types

**File:** `packages/core/src/artefacts/types.ts` (additions)

```typescript
/**
 * Types of coherence check
 */
export type CoherenceCheckType =
  | 'blocker_count_mismatch'
  | 'active_risks_mismatch'
  | 'blocker_not_in_raid'
  | 'raid_decision_status_conflict'
  | 'backlog_blocker_divergence'
  | 'status_inconsistency'
  | 'stale_cross_reference';

/**
 * A single coherence check result
 */
export interface CoherenceCheckResult {
  checkId: string;
  checkType: CoherenceCheckType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  artefactsInvolved: ArtefactType[];
  expectedValue?: unknown;
  actualValue?: unknown;
  suggestedCorrection?: string;
  autoCorrectible: boolean;
  llmConfirmed: boolean;
}

/**
 * Full coherence audit report for a project
 */
export interface CoherenceAuditReport {
  projectId: string;
  auditedAt: string;
  artefactsAudited: ArtefactType[];
  inconsistencies: CoherenceCheckResult[];
  llmCallMade: boolean;
  llmCostUsd?: number;
  autoCorrectionsApplied: number;
}
```

## 3. Backend Tasks

### 3.1 New module: `coherence-auditor.ts`

**File:** `packages/core/src/artefacts/coherence-auditor.ts`

**Exports:**

- `runDeterministicChecks(artefacts: Map<ArtefactType, Artefact>): CoherenceCheckResult[]`
  - Implements checks C1-C7 as pure functions.
  - Each check returns zero or more `CoherenceCheckResult` items.
  - Sets `llmConfirmed: false` and `severity: 'medium'` as defaults (LLM
    refines these).

- `confirmWithLlm(checks: CoherenceCheckResult[], artefacts: Map<ArtefactType, Artefact>, llmClient: ClaudeClient): Promise<CoherenceCheckResult[]>`
  - Sends the deterministic results plus artefact excerpts to Haiku via the
    `coherence_audit` tool (see 3.2).
  - LLM confirms/dismisses each check, adjusts severity, and adds
    `suggestedCorrection`.
  - Sets `llmConfirmed: true` on confirmed checks.
  - Returns only confirmed inconsistencies.

- `applyAutoCorrections(corrections: CoherenceCheckResult[], artefacts: Map<ArtefactType, Artefact>, repo: ArtefactRepository, projectId: string): Promise<number>`
  - For checks with `autoCorrectible: true` (C1, C2), applies the correction
    via `ArtefactRepository.update()`.
  - Returns the count of corrections applied.

- `auditProject(projectId: string, db: DynamoDBClient, llmClient: ClaudeClient | null, budgetTier: DegradationTier): Promise<CoherenceAuditReport>`
  - Orchestrates the full audit flow: load artefacts, run deterministic
    checks, optionally call LLM, optionally auto-correct.

### 3.2 New LLM tool: `coherence_audit`

**File:** `packages/core/src/llm/tools.ts`

Add a new tool definition:

```typescript
export const COHERENCE_AUDIT_TOOL: ToolDefinition = {
  name: 'coherence_audit',
  description:
    'Analyse detected inconsistencies between PM artefacts and confirm which are genuine contradictions.',
  input_schema: {
    type: 'object',
    properties: {
      confirmed_inconsistencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            check_id: { type: 'string' },
            is_genuine: { type: 'boolean' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            explanation: { type: 'string' },
            suggested_correction: { type: 'string' },
          },
          required: ['check_id', 'is_genuine', 'severity', 'explanation'],
        },
      },
    },
    required: ['confirmed_inconsistencies'],
  },
};
```

Add `'coherence-audit'` to the `LambdaType` union and add to `getToolsForLambda()`.

### 3.3 Integrate into housekeeping Lambda

**File:** `packages/lambdas/src/housekeeping/handler.ts`

- After the staleness watchdog step (from Feature 14) and before the digest
  email step, add "Step 9c: Coherence audit".
- For each active project, call `auditProject()`.
- For each confirmed inconsistency, create an event:
  ```typescript
  eventRepo.create({
    projectId,
    eventType: 'artefact_updated', // reuse existing type
    severity: inconsistency.severity === 'critical' ? 'critical' : 'warning',
    summary: `Coherence audit: ${inconsistency.description}`,
    detail: {
      context: {
        checkType: inconsistency.checkType,
        artefactsInvolved: inconsistency.artefactsInvolved,
        suggestedCorrection: inconsistency.suggestedCorrection,
        autoCorrectible: inconsistency.autoCorrectible,
        llmConfirmed: inconsistency.llmConfirmed,
      },
    },
  });
  ```
- Add coherence audit results to `HousekeepingOutput`:
  ```typescript
  coherenceAudit: {
    projectsAudited: number;
    inconsistenciesFound: number;
    autoCorrectionsApplied: number;
    llmCallsMade: number;
  };
  ```

### 3.4 New API route for coherence audit results

**File:** `packages/web/src/app/api/artefacts/[projectId]/coherence/route.ts`

- `GET`: Returns the most recent coherence audit report for the project by
  querying events with `eventType: 'artefact_updated'` and filtering for
  coherence audit context. Returns a summary object:
  ```typescript
  {
    lastAuditedAt: string;
    inconsistencies: CoherenceCheckResult[];
    autoCorrectionsApplied: number;
  }
  ```

### 3.5 Add to artefact module index

**File:** `packages/core/src/artefacts/index.ts`

- Re-export `runDeterministicChecks`, `auditProject`, `CoherenceCheckResult`, `CoherenceAuditReport`, `CoherenceCheckType`.

## 4. Frontend Tasks

### 4.1 Coherence status indicator on project detail page

**File:** `packages/web/src/app/(dashboard)/projects/[id]/page.tsx`

Add a coherence status section below the artefact cards:

**Wireframe description:**

```
+--------------------------------------------------+
| Artefact Coherence                               |
+--------------------------------------------------+
| Last audit: 2026-02-07 08:15                     |
|                                                  |
| [green checkmark] All artefacts consistent       |
|                                                  |
|  -- OR --                                        |
|                                                  |
| [amber warning] 2 inconsistencies detected       |
|                                                  |
| > Blocker count mismatch         [medium] [auto] |
|   delivery_state.openBlockers=2 but 4 blockers   |
|   exist. Auto-corrected.                         |
|                                                  |
| > RAID item R003 not in blockers [high]          |
|   Critical risk R003 is open but not listed      |
|   as a delivery state blocker.                   |
|   Suggested: Add R003 to blockers list.          |
+--------------------------------------------------+
```

### 4.2 New component: `coherence-status.tsx`

**File:** `packages/web/src/components/coherence-status.tsx`

- Props: `projectId: string`.
- Fetches coherence data via `use-coherence.ts` hook.
- Renders a card with the last audit timestamp, a pass/fail indicator, and
  an expandable list of inconsistencies with severity badges.

### 4.3 New hook: `use-coherence.ts`

**File:** `packages/web/src/lib/hooks/use-coherence.ts`

- Uses TanStack Query to fetch `GET /api/artefacts/<projectId>/coherence`
  with 60-second stale time.
- Returns `{ data, isLoading, error }`.

### 4.4 Add coherence summary to daily digest

**File:** `packages/lambdas/src/housekeeping/handler.ts`

- In the digest email content (`DigestContent`), add:
  ```typescript
  coherenceStatus: {
    projectsWithIssues: number;
    totalInconsistencies: number;
    autoCorrections: number;
  };
  ```
- Render in both text and HTML digest sections.

## 5. Test Plan

### 5.1 Unit Tests

**File:** `packages/core/src/artefacts/__tests__/coherence-auditor.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | C1: `openBlockers=2` but `blockers.length=4` | Returns `blocker_count_mismatch` with `expectedValue: 4`, `actualValue: 2` |
| 2 | C1: `openBlockers=3` and `blockers.length=3` | Returns no inconsistency |
| 3 | C2: `activeRisks=1` but 3 open risks in RAID log | Returns `active_risks_mismatch` |
| 4 | C3: Blocker `B001` in delivery state, no matching issue in RAID log | Returns `blocker_not_in_raid` |
| 5 | C4: RAID item resolved, references decision D001 which is still active | Returns `raid_decision_status_conflict` |
| 6 | C5: Backlog blocked=10, delivery state blockers=2 | Returns `backlog_blocker_divergence` |
| 7 | C5: Backlog blocked=3, delivery state blockers=2 | No inconsistency (within acceptable divergence of 3) |
| 8 | C6: Overall status `green` with critical open RAID item | Returns `status_inconsistency` |
| 9 | C6: Overall status `red` with no open issues | Returns `status_inconsistency` |
| 10 | C7: Decision references RAID item that does not exist | Returns `stale_cross_reference` |
| 11 | Empty artefacts (freshly bootstrapped) | Returns empty inconsistencies list |
| 12 | Only delivery state exists (no RAID, backlog, decision) | Runs C1 only; skips cross-artefact checks |
| 13 | `confirmWithLlm` filters out checks LLM marks as not genuine | Only confirmed checks returned |
| 14 | `applyAutoCorrections` updates `openBlockers` to match actual count | `ArtefactRepository.update()` called with corrected `keyMetrics` |
| 15 | `applyAutoCorrections` does not modify non-auto-correctible checks | `ArtefactRepository.update()` not called for C3-C7 |
| 16 | `auditProject` at tier 3 returns empty report | Report has `llmCallMade: false` and empty `inconsistencies` |
| 17 | `auditProject` at tier 2 skips LLM but returns deterministic results | Report has `llmCallMade: false` with deterministic results |

### 5.2 Integration Tests

**File:** `packages/lambdas/src/housekeeping/__tests__/coherence.integration.test.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Housekeeping with mismatched blocker count | Event created with `checkType: 'blocker_count_mismatch'`; auto-correction applied |
| 2 | Housekeeping with all artefacts consistent | Event created with "Coherence audit passed" summary |
| 3 | Housekeeping at tier 3 | Coherence audit skipped; `coherenceAudit.llmCallsMade` is 0 |
| 4 | LLM call fails during audit | Deterministic results surfaced as events; error event logged |

### 5.3 E2E Tests

**File:** `packages/web/e2e/coherence-status.spec.ts`

| # | Test Case | Expected Behaviour |
|---|---|---|
| 1 | Project with consistent artefacts | Green checkmark, "All artefacts consistent" message |
| 2 | Project with detected inconsistencies | Amber warning with expandable inconsistency list |
| 3 | Auto-corrected inconsistency shows "Auto-corrected" badge | Badge visible next to corrected item |

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | The coherence auditor detects when `delivery_state.keyMetrics.openBlockers` does not match the actual count of items in `delivery_state.blockers[]` (check C1). |
| AC-2 | The coherence auditor detects when `delivery_state.keyMetrics.activeRisks` does not match the count of open/mitigating risk items in `raid_log.items[]` (check C2). |
| AC-3 | The coherence auditor detects when a blocker ID in delivery state has no corresponding item in the RAID log (check C3). |
| AC-4 | The coherence auditor detects when `delivery_state.overallStatus` is `green` but critical open RAID items or blockers exist (check C6). |
| AC-5 | When the degradation tier is 0 or 1, exactly one Haiku LLM call is made per audit cycle to confirm detected inconsistencies. |
| AC-6 | When the degradation tier is 2, the LLM call is skipped and only deterministic checks run. |
| AC-7 | When the degradation tier is 3, the coherence auditor is skipped entirely. |
| AC-8 | Auto-correctible inconsistencies (C1, C2 count mismatches) are automatically corrected when autonomy level is `artefact` or `tactical`, with `updatedBy: 'agent'` and a rationale describing the correction. |
| AC-9 | Non-auto-correctible inconsistencies (C3-C7) are surfaced as events in the activity feed with appropriate severity. |
| AC-10 | The project detail page displays a coherence status section showing the last audit timestamp and any detected inconsistencies. |
| AC-11 | The daily digest email includes a coherence summary section with the count of inconsistencies and auto-corrections. |
| AC-12 | The coherence auditor gracefully handles projects with missing artefacts (e.g. no decision log yet) by running only applicable checks. |

---

## Cross-Feature Dependencies

| Dependency | Detail |
|---|---|
| Feature 14 depends on Feature 13 | The staleness watchdog runs in housekeeping, which makes LLM calls for digest generation. These calls must use the atomic budget counters to avoid race conditions with concurrently running triage/reasoning Lambdas. |
| Feature 15 depends on Feature 13 | The coherence auditor's Haiku call must record spend atomically. |
| Feature 15 depends on Feature 14 (ordering only) | Both integrate into housekeeping. Feature 14's staleness step runs before Feature 15's coherence audit step. No data dependency. |

## Implementation Order

1. **Feature 13** first -- it is an infrastructure fix that all other LLM-calling features depend on.
2. **Feature 14** second -- it has no LLM dependency (templates are deterministic) but integrates into housekeeping.
3. **Feature 15** third -- it requires LLM integration and builds on the housekeeping structure established by Feature 14.

## Estimated Effort

| Feature | Backend | Frontend | Tests | Total |
|---|---|---|---|---|
| Feature 13 | 3 days | 0.5 days | 2 days | 5.5 days |
| Feature 14 | 2 days | 1.5 days | 1.5 days | 5 days |
| Feature 15 | 3 days | 1.5 days | 2 days | 6.5 days |
| **Total** | **8 days** | **3.5 days** | **5.5 days** | **17 days** |
