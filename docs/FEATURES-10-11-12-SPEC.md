# Features 10, 11, 12 -- Detailed Specification

> Generated: 2026-02-07
> Covers: Pre-Meeting Briefing Generator, Artefact Export & Shareable Snapshots, Command Palette (Cmd+K)

---

## Table of Contents

- [Feature 10: Pre-Meeting / Cadence Briefing Generator](#feature-10-pre-meeting--cadence-briefing-generator)
- [Feature 11: Artefact Export & Shareable Snapshots](#feature-11-artefact-export--shareable-snapshots)
- [Feature 12: Command Palette (Cmd+K)](#feature-12-command-palette-cmdk)

---

# Feature 10: Pre-Meeting / Cadence Briefing Generator

## 10.1 Functional Specification

### User Story

As a PM, I want the agent to automatically generate ceremony-specific briefing documents before my scheduled meetings so that I walk into every standup, sprint review, retro, steering committee, or 1:1 already prepared with relevant data from my artefacts.

### Detailed Behaviour

1. **Cadence configuration** -- The user defines recurring meeting cadences in agent config. Each cadence specifies:
   - A meeting type (standup, sprint_review, retro, steering_committee, one_to_one)
   - A cron-like schedule (day of week + time, e.g. "Monday 09:00", "Friday 15:00")
   - An optional list of artefact types to emphasise
   - An optional list of participant names (for 1:1 context)
   - An optional custom prompt fragment (e.g. "focus on API migration risks")

2. **Trigger mechanism** -- The housekeeping Lambda, which already runs on the first cycle after working-hours start, gains a new step: scan all configured cadences and identify meetings due within the next 60 minutes that do not yet have a generated briefing for today. For each match, it invokes a new `generate-briefing` step. Additionally, EventBridge Scheduler can be configured to fire a dedicated `briefing-check` rule every 15 minutes during working hours to catch mid-day meetings.

3. **Briefing generation** -- For each triggered meeting:
   - Gather all artefacts for the relevant project(s) via `ArtefactRepository.getAllForProject`.
   - Compute artefact diffs by comparing `content` with `previousVersion` for each artefact.
   - Fetch recent events from the last 24 hours via `EventRepository.getRecent`.
   - Fetch pending escalations and held actions.
   - Construct a ceremony-specific prompt (see section 10.3) and call Claude Haiku (via `ClaudeClient.callWithTools`) with a `generate_briefing` tool definition.
   - The tool output is a structured briefing document with ceremony-appropriate sections.

4. **Delivery** -- The generated briefing is:
   - Stored in DynamoDB as a `BRIEFING` entity.
   - Optionally emailed via SES to the configured digest email address.
   - Displayed in the dashboard with a notification badge.

5. **Dashboard view** -- A new "Briefings" section on the project detail page (or a top-level page) shows upcoming and recent briefings. Each briefing is rendered in a card with sections appropriate to the ceremony type.

### Meeting-Type Templates

| Meeting Type | Primary Artefacts | Key Sections |
|---|---|---|
| standup | delivery_state, backlog_summary | Yesterday's progress, Today's plan, Blockers, Sprint burndown |
| sprint_review | delivery_state, backlog_summary, decision_log | Sprint goal status, Completed items, Demo candidates, Metrics delta |
| retro | delivery_state, raid_log, decision_log | What went well, What needs improvement, Action items from last retro, New RAID items |
| steering_committee | delivery_state, raid_log, decision_log | Executive summary, RAG status, Key risks/issues, Upcoming milestones, Budget |
| one_to_one | delivery_state, raid_log | Talking points, Blockers needing escalation, Decisions pending, Recent wins |

### Edge Cases and Error Handling

- **No artefacts exist yet**: Generate a minimal briefing stating "Artefacts not yet populated. Recommend running at least one agent cycle before the meeting."
- **LLM budget exhausted**: Skip LLM generation, produce a template-only briefing using raw artefact data without AI summarisation. Log a warning event.
- **Duplicate trigger**: Before generating, check if a briefing already exists for this cadence + date combination. If so, skip. Keyed by `cadenceId#YYYY-MM-DD`.
- **Meeting time in the past**: If the housekeeping cycle runs late and the meeting time has already passed by more than 30 minutes, skip generation and log an info event.
- **No cadences configured**: The feature is inert -- no errors, no overhead.
- **LLM call fails**: Retry once with Haiku. If still failing, produce a raw-data-only briefing and log an error event.

---

## 10.2 Data Model Changes

### New DynamoDB Entities

**Cadence Config** (stored as agent config entries):

```
PK: AGENT
SK: CONFIG#cadence#<cadenceId>
```

| Attribute | Type | Description |
|---|---|---|
| key | `string` | `cadence#<cadenceId>` |
| value | `CadenceConfig` | Full cadence configuration object |
| updatedAt | `string` (ISO 8601) | Last modified timestamp |

**Briefing Entity**:

```
PK: PROJECT#<projectId>
SK: BRIEFING#<date>#<cadenceId>
GSI1PK: BRIEFING#<date>
GSI1SK: <projectId>#<cadenceId>
TTL: 30 days from creation
```

| Attribute | Type | Description |
|---|---|---|
| id | `string` (UUID) | Unique briefing identifier |
| projectId | `string` (UUID) | Associated project |
| cadenceId | `string` | Identifier of the cadence that triggered this briefing |
| meetingType | `CadenceMeetingType` | Type of meeting |
| scheduledTime | `string` (ISO 8601) | When the meeting is scheduled |
| sections | `BriefingSection[]` | Structured briefing content |
| summary | `string` | One-paragraph executive summary |
| artefactVersions | `Record<ArtefactType, number>` | Version numbers of artefacts used |
| llmCostUsd | `number` | Cost of LLM call for this briefing |
| generatedAt | `string` (ISO 8601) | When the briefing was generated |
| deliveredVia | `('dashboard' \| 'email')[]` | Delivery channels used |
| createdAt | `string` (ISO 8601) | Creation timestamp |

### New Zod Schemas

File: `packages/core/src/schemas/index.ts`

```typescript
export const CadenceMeetingTypeSchema = z.enum([
  'standup',
  'sprint_review',
  'retro',
  'steering_committee',
  'one_to_one',
]);

export const CadenceScheduleSchema = z.object({
  dayOfWeek: z.enum([
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday', 'sunday',
  ]).array().min(1),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
});

export const CadenceConfigSchema = z.object({
  id: z.string().min(1).max(50),
  meetingType: CadenceMeetingTypeSchema,
  name: z.string().min(1).max(200),
  projectId: UuidSchema,
  schedule: CadenceScheduleSchema,
  timezone: z.string().min(1),
  emphasisArtefacts: z.array(ArtefactTypeSchema).optional(),
  participants: z.array(z.string().max(100)).optional(),
  customPromptFragment: z.string().max(500).optional(),
  emailDelivery: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const BriefingSectionSchema = z.object({
  heading: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  bulletPoints: z.array(z.string().max(500)).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

export const BriefingSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  cadenceId: z.string().min(1).max(50),
  meetingType: CadenceMeetingTypeSchema,
  scheduledTime: IsoDateTimeSchema,
  sections: z.array(BriefingSectionSchema).min(1),
  summary: z.string().min(1).max(2000),
  artefactVersions: z.record(ArtefactTypeSchema, z.number().int().min(1)),
  llmCostUsd: z.number().min(0),
  generatedAt: IsoDateTimeSchema,
  deliveredVia: z.array(z.enum(['dashboard', 'email'])),
  createdAt: IsoDateTimeSchema,
});
```

### New TypeScript Types

File: `packages/core/src/types/index.ts`

```typescript
export type CadenceMeetingType = z.infer<typeof CadenceMeetingTypeSchema>;
export type CadenceSchedule = z.infer<typeof CadenceScheduleSchema>;
export type CadenceConfig = z.infer<typeof CadenceConfigSchema>;
export type BriefingSection = z.infer<typeof BriefingSectionSchema>;
export type Briefing = z.infer<typeof BriefingSchema>;
```

---

## 10.3 Backend Tasks

### New Repository: `packages/core/src/db/repositories/briefing.ts`

```
class BriefingRepository
  constructor(db: DynamoDBClient)
  async create(briefing: Briefing): Promise<Briefing>
  async getByProjectAndDate(projectId: string, date: string): Promise<Briefing[]>
  async getByCadenceAndDate(projectId: string, cadenceId: string, date: string): Promise<Briefing | null>
  async getRecentByProject(projectId: string, limit?: number): Promise<Briefing[]>
  async getByDate(date: string): Promise<Briefing[]>
```

- PK: `PROJECT#<projectId>`, SK: `BRIEFING#<date>#<cadenceId>`
- GSI1PK: `BRIEFING#<date>`, GSI1SK: `<projectId>#<cadenceId>`
- TTL: 30 days (matching event TTL)

### Modified Repository: `packages/core/src/db/repositories/agent-config.ts`

Add to `CONFIG_KEYS`:
```typescript
CADENCE_PREFIX: 'cadence#',
```

Add methods:
```typescript
async getCadences(): Promise<CadenceConfig[]>
async getCadence(cadenceId: string): Promise<CadenceConfig | null>
async setCadence(config: CadenceConfig): Promise<void>
async deleteCadence(cadenceId: string): Promise<void>
```

### New Core Module: `packages/core/src/briefing/generator.ts`

```
class BriefingGenerator
  constructor(
    claude: ClaudeClient,
    artefactRepo: ArtefactRepository,
    eventRepo: EventRepository,
    escalationRepo: EscalationRepository,
    heldActionRepo: HeldActionRepository,
  )
  async generate(projectId: string, cadence: CadenceConfig): Promise<Briefing>
  private buildPrompt(meetingType: CadenceMeetingType, context: BriefingContext): string
  private buildFallbackBriefing(context: BriefingContext): Briefing
```

### New LLM Tool Definition: `packages/core/src/llm/tools.ts`

Add `GENERATE_BRIEFING_TOOL`:
```typescript
export const GENERATE_BRIEFING_TOOL: ToolDefinition = {
  name: 'generate_briefing',
  description: 'Generate a ceremony-specific meeting briefing document.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One-paragraph executive summary' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            bullet_points: { type: 'array', items: { type: 'string' } },
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          },
          required: ['heading', 'content'],
        },
      },
    },
    required: ['summary', 'sections'],
  },
};
```

### Modified Lambda: `packages/lambdas/src/housekeeping/handler.ts`

Add after the daily digest logic (step 10):
```
// 11. Check for upcoming meeting briefings
const cadences = await configRepo.getCadences();
const briefingsGenerated = await generateDueBriefings(
  cadences, projects, artefactRepo, eventRepo, escalationRepo,
  heldActionRepo, briefingRepo, configRepo, sesClient
);
```

Add `briefingsGenerated: number` to `HousekeepingOutput`.

### New API Routes

**`packages/web/src/app/api/briefings/[projectId]/route.ts`** -- GET briefings for a project
```
GET /api/briefings/<projectId>?limit=10
Response: { briefings: Briefing[] }
```

**`packages/web/src/app/api/cadences/route.ts`** -- CRUD for cadences
```
GET    /api/cadences              -> { cadences: CadenceConfig[] }
POST   /api/cadences              -> { cadence: CadenceConfig }
PUT    /api/cadences/<cadenceId>  -> { cadence: CadenceConfig }
DELETE /api/cadences/<cadenceId>  -> { success: boolean }
```

**`packages/web/src/app/api/cadences/[cadenceId]/route.ts`** -- Individual cadence operations

---

## 10.4 Frontend Tasks

### New Hook: `packages/web/src/lib/hooks/use-briefings.ts`

```typescript
export function useBriefings(projectId: string | undefined)
export function useCadences()
export function useCreateCadence()
export function useUpdateCadence()
export function useDeleteCadence()
```

Uses TanStack Query with 60-second stale time (briefings change infrequently).

### New Component: `packages/web/src/components/briefing-card.tsx`

Renders a single briefing as a card with:
- Header: meeting type badge, scheduled time, generated time
- Summary paragraph
- Expandable sections (each `BriefingSection` rendered as a collapsible)
- Severity indicators (warning/critical sections highlighted)
- Version badge showing which artefact versions were used

### New Component: `packages/web/src/components/cadence-editor.tsx`

A form for creating/editing cadences:
- Meeting type selector (dropdown)
- Name field
- Project selector (dropdown of active projects)
- Day-of-week checkboxes
- Time picker (HH:MM)
- Timezone selector (defaulting to agent config timezone)
- Emphasis artefacts multi-select
- Participants text area
- Custom prompt fragment text area
- Email delivery toggle
- Enable/disable toggle

### New Page: `packages/web/src/app/(dashboard)/briefings/page.tsx`

- Lists upcoming meetings (based on cadence schedules)
- Shows recent briefings grouped by date
- "Configure Cadences" button opens the cadence editor in a sheet/dialog

### Modified Component: `packages/web/src/components/sidebar.tsx`

Add a "Briefings" navigation entry:
```typescript
{ name: 'Briefings', href: '/briefings', icon: BookOpen },
```

### Modified Component: `packages/web/src/components/header.tsx`

Add a briefing notification indicator when a briefing was generated in the last hour.

### UI Wireframe Description

```
+-----------------------------------------------------------+
| BRIEFINGS                                [Configure]       |
+-----------------------------------------------------------+
| Upcoming Meetings                                          |
| +-------------------------------------------------------+ |
| | Standup - Monday 09:00          [30 min until meeting] | |
| | Sprint Review - Friday 15:00    [3 days away]          | |
| +-------------------------------------------------------+ |
|                                                            |
| Recent Briefings                                           |
| +-------------------------------------------------------+ |
| | [STANDUP] Project Alpha - 7 Feb 2026, 08:30            | |
| |                                                        | |
| | The sprint is tracking to amber. 2 blockers remain...  | |
| |                                                        | |
| | > Yesterday's Progress (3 items)              [expand] | |
| | > Today's Plan (4 items)                      [expand] | |
| | > Blockers (2 items)                 [!] WARNING       | |
| | > Sprint Burndown                             [expand] | |
| +-------------------------------------------------------+ |
| | [STEERING] Project Alpha - 6 Feb 2026, 14:00          | |
| | ...                                                    | |
| +-------------------------------------------------------+ |
+-----------------------------------------------------------+
```

---

## 10.5 Test Plan

### Unit Tests

**`packages/core/src/briefing/__tests__/generator.test.ts`**
- TC-10-01: Generates standup briefing with all four artefacts present -- expects sections for progress, plan, blockers, burndown.
- TC-10-02: Generates steering committee briefing -- expects executive summary, RAG status, risks section.
- TC-10-03: Falls back to template-only briefing when LLM budget is exhausted -- expects no LLM call, raw data sections.
- TC-10-04: Falls back to template-only briefing when LLM call fails -- expects error logged, valid briefing returned.
- TC-10-05: Handles missing artefacts gracefully -- expects "Artefacts not yet populated" note.
- TC-10-06: Custom prompt fragment is included in LLM prompt -- expects fragment appended to user message.

**`packages/core/src/db/repositories/__tests__/briefing.test.ts`**
- TC-10-07: Creates and retrieves a briefing by project and date.
- TC-10-08: `getByCadenceAndDate` returns null when no briefing exists (dedup check).
- TC-10-09: `getByCadenceAndDate` returns existing briefing (prevents duplicates).
- TC-10-10: `getRecentByProject` returns briefings in descending order by date.

**`packages/core/src/db/repositories/__tests__/agent-config.cadences.test.ts`**
- TC-10-11: CRUD operations for cadences work correctly.
- TC-10-12: `getCadences` returns empty array when none configured.

### Integration Tests

- TC-10-13: Housekeeping handler generates briefing when cadence is due within 60 minutes.
- TC-10-14: Housekeeping handler skips briefing generation when one already exists for today.
- TC-10-15: Briefing is delivered via SES when `emailDelivery` is true and digest email is configured.
- TC-10-16: End-to-end cadence creation through API, followed by briefing generation on trigger.

### E2E Tests

- TC-10-17: User configures a cadence via the settings page, navigates to Briefings page, and sees the upcoming meeting listed.

---

## 10.6 Acceptance Criteria

- **AC-10-1**: A cadence can be created, updated, and deleted via the API and the frontend cadence editor.
- **AC-10-2**: When a meeting is scheduled within 60 minutes and no briefing exists for today, the housekeeping Lambda generates a briefing document.
- **AC-10-3**: The generated briefing contains ceremony-specific sections appropriate to the meeting type (see table in 10.1).
- **AC-10-4**: Each briefing section has a heading, content body, and optional bullet points.
- **AC-10-5**: The briefing is stored in DynamoDB with correct PK/SK/GSI1 keys and a 30-day TTL.
- **AC-10-6**: If `emailDelivery` is enabled and a digest email is configured, the briefing is sent via SES.
- **AC-10-7**: The dashboard Briefings page lists upcoming meetings and recent briefings.
- **AC-10-8**: Duplicate briefings are prevented -- only one briefing per cadence per day.
- **AC-10-9**: If the LLM budget is exhausted, a template-only fallback briefing is produced.
- **AC-10-10**: Briefing generation uses Haiku 4.5 by default; total LLM cost per briefing is recorded in the entity.
- **AC-10-11**: Disabled cadences (enabled: false) are not triggered.
- **AC-10-12**: A `briefing_generated` event is logged after each successful generation.

---

# Feature 11: Artefact Export & Shareable Snapshots

## 11.1 Functional Specification

### User Story

As a PM, I want to export my artefacts as markdown or JSON, copy them to my clipboard, or email them via SES so that I can share project status with stakeholders who do not have access to the dashboard.

### Detailed Behaviour

1. **Export formats** -- Two export formats are supported:
   - **Markdown**: Human-readable, formatted with headings, tables, and bullet points. Suitable for pasting into Confluence, Notion, emails, or documents.
   - **JSON**: Machine-readable, the raw artefact content as stored in DynamoDB. Useful for integrations or archiving.

2. **Export scope**:
   - **Single artefact**: Export one artefact (e.g. just the RAID Log).
   - **All artefacts for a project**: Export all four artefacts in a single document, concatenated with section headers.
   - **Snapshot bundle**: All artefacts + metadata header (project name, export date, artefact versions).

3. **Delivery channels**:
   - **Copy to clipboard**: Browser Clipboard API. One-click action in the UI.
   - **Download as file**: Browser download of `.md` or `.json` file.
   - **Send via SES**: Email the export to a specified address (defaults to configured digest email). Subject: `[Agentic PM] <Project Name> - <Artefact Type> Export (<date>)`.
   - **Time-limited permalink** (optional, Phase 2 stretch): Generate a signed URL that renders the artefact in a read-only view. Valid for 24 hours by default (configurable 1h-168h). No authentication required for the link holder. Implemented via a short-lived DynamoDB item with a random token.

4. **No LLM cost** -- All export operations are pure formatting. No Claude API calls. No budget impact.

5. **Markdown formatting rules**:
   - Delivery State: RAG badge, sprint progress table, blockers list, milestones table, metrics summary.
   - RAID Log: Grouped by type (Risks, Assumptions, Issues, Dependencies), each item as a sub-section.
   - Backlog Summary: Stats table, highlights list, refinement candidates list.
   - Decision Log: Each decision as a sub-section with options table.
   - All-artefacts bundle: Table of contents, metadata header, then each artefact as a top-level section.

### Edge Cases and Error Handling

- **Empty artefact**: Export a document with a note "This artefact has no content yet."
- **Clipboard API unavailable** (e.g. HTTP, old browser): Show a modal with the text content and a "Select All" instruction. Disable the copy button with a tooltip explaining why.
- **SES not configured**: Hide the "Email" option. If the API is called anyway, return 400 with a clear message.
- **SES send fails**: Return 500 with the SES error. Show a toast in the UI.
- **Permalink token collision**: Use crypto.randomUUID() -- collision probability is negligible. If it occurs, return 500 and ask the user to retry.
- **Permalink accessed after expiry**: Return 404 with "This link has expired."
- **Very large artefact** (e.g. RAID log with 200+ items): No truncation. The full document is exported. Markdown rendering handles this gracefully.

---

## 11.2 Data Model Changes

### New DynamoDB Entity: Shareable Snapshot (for permalink feature)

```
PK: SNAPSHOT#<token>
SK: SNAPSHOT#<token>
GSI1PK: (not used)
GSI1SK: (not used)
TTL: <expiresAt as epoch seconds>
```

| Attribute | Type | Description |
|---|---|---|
| token | `string` (UUID) | Random access token (used in URL) |
| projectId | `string` (UUID) | Source project |
| projectName | `string` | Project name at time of snapshot (denormalised) |
| artefactTypes | `ArtefactType[]` | Which artefacts are included |
| content | `Record<ArtefactType, ArtefactContent>` | Snapshot of artefact content at export time |
| artefactVersions | `Record<ArtefactType, number>` | Version numbers at time of export |
| format | `'rendered' \| 'markdown' \| 'json'` | How to display the snapshot |
| createdAt | `string` (ISO 8601) | When the snapshot was created |
| expiresAt | `string` (ISO 8601) | When the link expires |
| createdBy | `string` | User who created the snapshot |

### New Zod Schemas

File: `packages/core/src/schemas/index.ts`

```typescript
export const ExportFormatSchema = z.enum(['markdown', 'json']);

export const ExportScopeSchema = z.enum(['single', 'all', 'bundle']);

export const ExportRequestSchema = z.object({
  projectId: UuidSchema,
  artefactType: ArtefactTypeSchema.optional(),  // required if scope='single'
  scope: ExportScopeSchema,
  format: ExportFormatSchema,
});

export const EmailExportRequestSchema = ExportRequestSchema.extend({
  recipientEmail: z.string().email(),
  customSubject: z.string().max(200).optional(),
  customMessage: z.string().max(2000).optional(),
});

export const SnapshotCreateRequestSchema = z.object({
  projectId: UuidSchema,
  artefactTypes: z.array(ArtefactTypeSchema).min(1),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

export const ShareableSnapshotSchema = z.object({
  token: UuidSchema,
  projectId: UuidSchema,
  projectName: z.string(),
  artefactTypes: z.array(ArtefactTypeSchema).min(1),
  content: z.record(ArtefactTypeSchema, ArtefactContentSchema),
  artefactVersions: z.record(ArtefactTypeSchema, z.number().int().min(1)),
  format: z.enum(['rendered', 'markdown', 'json']),
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  createdBy: z.string(),
});
```

### New TypeScript Types

File: `packages/core/src/types/index.ts`

```typescript
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportScope = z.infer<typeof ExportScopeSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
export type EmailExportRequest = z.infer<typeof EmailExportRequestSchema>;
export type SnapshotCreateRequest = z.infer<typeof SnapshotCreateRequestSchema>;
export type ShareableSnapshot = z.infer<typeof ShareableSnapshotSchema>;
```

---

## 11.3 Backend Tasks

### New Core Module: `packages/core/src/artefacts/formatter.ts`

Pure formatting functions, no LLM calls.

```typescript
export class ArtefactFormatter {
  static toMarkdown(artefact: Artefact): string
  static toMarkdownBundle(artefacts: Artefact[], projectName: string): string
  static toJSON(artefact: Artefact): string
  static toJSONBundle(artefacts: Artefact[], projectName: string): string

  // Internal helpers
  private static deliveryStateToMarkdown(content: DeliveryStateContent): string
  private static raidLogToMarkdown(content: RaidLogContent): string
  private static backlogSummaryToMarkdown(content: BacklogSummaryContent): string
  private static decisionLogToMarkdown(content: DecisionLogContent): string
  private static generateBundleHeader(projectName: string, artefacts: Artefact[]): string
}
```

### New Repository: `packages/core/src/db/repositories/snapshot.ts`

```typescript
export class SnapshotRepository {
  constructor(private db: DynamoDBClient) {}
  async create(snapshot: ShareableSnapshot): Promise<ShareableSnapshot>
  async getByToken(token: string): Promise<ShareableSnapshot | null>
  async delete(token: string): Promise<void>
}
```

- PK/SK: `SNAPSHOT#<token>` / `SNAPSHOT#<token>` (singleton pattern)
- TTL: Set to `expiresAt` epoch seconds for automatic cleanup

### New API Routes

**`packages/web/src/app/api/artefacts/[projectId]/export/route.ts`** -- Generate export content
```
POST /api/artefacts/<projectId>/export
Body: { scope: 'single' | 'all' | 'bundle', format: 'markdown' | 'json', artefactType?: string }
Response: { content: string, filename: string, mimeType: string }
```

**`packages/web/src/app/api/artefacts/[projectId]/export/email/route.ts`** -- Email export
```
POST /api/artefacts/<projectId>/export/email
Body: { scope, format, artefactType?, recipientEmail, customSubject?, customMessage? }
Response: { messageId: string }
```

**`packages/web/src/app/api/snapshots/route.ts`** -- Create snapshot
```
POST /api/snapshots
Body: { projectId, artefactTypes, expiresInHours? }
Response: { token: string, url: string, expiresAt: string }
```

**`packages/web/src/app/api/snapshots/[token]/route.ts`** -- Retrieve snapshot
```
GET /api/snapshots/<token>
Response: { snapshot: ShareableSnapshot } or 404
```

**`packages/web/src/app/(dashboard)/snapshots/[token]/page.tsx`** -- Public render page
- This page does NOT require authentication.
- Fetches the snapshot by token and renders artefacts using the existing artefact renderers.
- Shows an expiry notice: "This snapshot expires on <date>."

---

## 11.4 Frontend Tasks

### New Hook: `packages/web/src/lib/hooks/use-export.ts`

```typescript
export function useExportArtefact()
  // Returns mutation for generating export content
  // { mutateAsync: (params: ExportRequest) => Promise<{ content: string, filename: string }> }

export function useEmailExport()
  // Returns mutation for emailing export
  // { mutateAsync: (params: EmailExportRequest) => Promise<{ messageId: string }> }

export function useCreateSnapshot()
  // Returns mutation for creating a snapshot permalink
  // { mutateAsync: (params: SnapshotCreateRequest) => Promise<{ token: string, url: string, expiresAt: string }> }

export function useCopyToClipboard()
  // Wraps navigator.clipboard.writeText with error handling
  // Returns { copy: (text: string) => Promise<boolean>, isSupported: boolean }
```

### New Component: `packages/web/src/components/export-menu.tsx`

A dropdown menu (using shadcn `DropdownMenu`) attached to each artefact card:
- Copy as Markdown
- Copy as JSON
- Download as .md
- Download as .json
- Email via SES (opens a mini-dialog for recipient email)
- Create shareable link (opens a dialog with expiry selector)

Actions:
- "Copy as Markdown" calls the export API, then uses `navigator.clipboard.writeText`.
- "Download" calls the export API, then triggers a browser download via a Blob URL.
- "Email" opens an `EmailExportDialog` component.
- "Create shareable link" opens a `SnapshotDialog` component.

### New Component: `packages/web/src/components/email-export-dialog.tsx`

A modal dialog:
- Recipient email input (pre-filled with digest email if configured)
- Custom subject line (optional)
- Custom message (optional)
- Format selector (markdown/JSON)
- Send button
- Loading/success/error states

### New Component: `packages/web/src/components/snapshot-dialog.tsx`

A modal dialog:
- Artefact type checkboxes (pre-selected based on context)
- Expiry duration selector (1h, 6h, 24h, 48h, 7 days)
- Generate button
- After generation: shows the URL with a copy button and QR code (optional)

### Modified Component: `packages/web/src/components/artefact-viewer.tsx`

Add an export menu button to the `CardHeader` of each artefact viewer:
```tsx
<div className="flex items-center gap-2">
  <ExportMenu projectId={artefact.projectId} artefactType={artefact.type} />
  {/* existing version badge and timestamp */}
</div>
```

### New Page: `packages/web/src/app/(dashboard)/snapshots/[token]/page.tsx`

Public snapshot view page:
- No auth required (implemented by checking the route against NextAuth middleware)
- Fetches snapshot data by token
- Renders artefact content using existing renderers
- Shows metadata: project name, export date, expiry date
- Expired snapshots show a friendly "This link has expired" message

### UI Wireframe Description

**Export Menu (on artefact card header):**
```
[Delivery State]                    v1  2h ago  [...]
                                                  |
                                    +-------------+---+
                                    | Copy as Markdown |
                                    | Copy as JSON     |
                                    | -----------      |
                                    | Download .md     |
                                    | Download .json   |
                                    | -----------      |
                                    | Email export...  |
                                    | Share link...    |
                                    +------------------+
```

**Bundle Export (on project page header):**
```
+-----------------------------------------------------------+
| Project Alpha                [Export All Artefacts v]      |
|                                                            |
| [Delivery State] [RAID Log] [Backlog] [Decisions]         |
+-----------------------------------------------------------+
```

---

## 11.5 Test Plan

### Unit Tests

**`packages/core/src/artefacts/__tests__/formatter.test.ts`**
- TC-11-01: `toMarkdown` for delivery_state produces valid markdown with RAG status, sprint table, blockers list.
- TC-11-02: `toMarkdown` for raid_log groups items by type with correct headings.
- TC-11-03: `toMarkdown` for backlog_summary includes stats table and highlights.
- TC-11-04: `toMarkdown` for decision_log includes options table with pros/cons.
- TC-11-05: `toMarkdownBundle` includes a table of contents and metadata header.
- TC-11-06: `toMarkdownBundle` for empty artefacts list returns a "no artefacts" note.
- TC-11-07: `toJSON` returns valid JSON matching the artefact content schema.
- TC-11-08: `toJSONBundle` wraps all artefacts in a `{ projectName, exportedAt, artefacts: [...] }` envelope.
- TC-11-09: Empty artefact content (e.g. `{ items: [] }`) produces a meaningful markdown note.

**`packages/core/src/db/repositories/__tests__/snapshot.test.ts`**
- TC-11-10: Creates a snapshot with correct PK/SK/TTL.
- TC-11-11: Retrieves a snapshot by token.
- TC-11-12: Returns null for a non-existent token.
- TC-11-13: TTL is correctly set to the expiry epoch.

### Integration Tests

- TC-11-14: Export API returns markdown content for a single artefact.
- TC-11-15: Export API returns JSON content for all artefacts.
- TC-11-16: Email export API sends email via SES and returns messageId.
- TC-11-17: Email export API returns 400 when SES is not configured.
- TC-11-18: Snapshot creation returns a valid token and URL.
- TC-11-19: Snapshot retrieval returns the snapshot content.
- TC-11-20: Expired snapshot returns 404.

### E2E Tests

- TC-11-21: User clicks "Copy as Markdown" on a RAID Log, pastes into a text area, and the content is valid markdown.
- TC-11-22: User clicks "Download .md", and the browser downloads a file with the correct filename.
- TC-11-23: User creates a shareable link, opens it in an incognito window, and sees the rendered artefacts.

---

## 11.6 Acceptance Criteria

- **AC-11-1**: Each artefact card in the UI has an export menu with options: Copy as Markdown, Copy as JSON, Download .md, Download .json.
- **AC-11-2**: Copying to clipboard works in modern browsers (Chrome, Firefox, Edge, Safari) on HTTPS.
- **AC-11-3**: Downloaded markdown files have the filename pattern `<project>-<artefact-type>-<YYYY-MM-DD>.md`.
- **AC-11-4**: Downloaded JSON files have the filename pattern `<project>-<artefact-type>-<YYYY-MM-DD>.json`.
- **AC-11-5**: "Export All Artefacts" on the project page generates a bundle with a table of contents, metadata header, and all four artefact sections.
- **AC-11-6**: Email export sends the formatted content via SES with the subject line `[Agentic PM] <Project Name> - <Type> Export (<date>)`.
- **AC-11-7**: The email export option is hidden when SES is not configured.
- **AC-11-8**: Shareable permalinks render artefacts without authentication.
- **AC-11-9**: Shareable permalinks expire after the configured duration and return 404 after expiry.
- **AC-11-10**: No LLM calls are made during any export operation. Zero budget impact.
- **AC-11-11**: Export operations complete in under 2 seconds for projects with all four artefacts.
- **AC-11-12**: The snapshot public page is mobile-responsive.

---

# Feature 12: Command Palette (Cmd+K)

## 12.1 Functional Specification

### User Story

As a PM, I want a global keyboard shortcut (Cmd+K on macOS, Ctrl+K on Windows/Linux) that opens a searchable command palette so that I can quickly navigate, trigger actions, and search across my projects without reaching for the mouse.

### Detailed Behaviour

1. **Activation** -- Pressing Cmd+K (or Ctrl+K) from anywhere in the dashboard opens a centered modal dialog with a search input. Pressing Escape or clicking outside closes it. Pressing Cmd+K again while open closes it (toggle behaviour).

2. **Search** -- As the user types, commands and items are filtered in real time using fuzzy matching. Results are grouped by category. The search is purely client-side, operating on a pre-built index of available commands and entities.

3. **Navigation commands** -- Navigate to any page in the application:
   - Dashboard
   - Ingest
   - Extracted Items
   - Projects (list and individual project pages)
   - Activity
   - Escalations
   - Settings
   - Briefings (if Feature 10 is implemented)

4. **Action commands** -- Trigger actions from the palette:
   - "View escalation: <title>" -- navigates to a specific escalation
   - "Approve held action: <description>" -- opens the held action approval flow
   - "Export artefact: <type>" -- opens the export dialog for the selected artefact (if Feature 11 is implemented)
   - "Create cadence" -- opens the cadence editor (if Feature 10 is implemented)
   - "Toggle dry-run mode" -- toggles the agent's dry-run setting
   - "View budget status" -- navigates to the dashboard budget section

5. **Entity search** -- Search across projects, escalations, and held actions by name/title. Results show the entity type, name, and a brief description or status.

6. **Keyboard navigation** -- Arrow keys move selection up/down. Enter activates the selected item. Tab cycles through groups.

7. **Recency** -- Recently used commands appear at the top of the initial (empty-search) state, stored in `localStorage`.

8. **No backend changes** -- This is a purely frontend feature. All data comes from existing TanStack Query caches and pre-built command lists.

### Command Categories

| Category | Icon | Examples |
|---|---|---|
| Navigation | `ArrowRight` | Go to Dashboard, Go to Projects, Go to Settings |
| Projects | `FolderKanban` | Project Alpha, Project Beta |
| Escalations | `AlertCircle` | "Approve scope change for API module" |
| Held Actions | `Clock` | "Review email draft to stakeholder" |
| Actions | `Zap` | Toggle dry-run, Export RAID Log, Create cadence |
| Settings | `Settings` | Open integration config, Open agent config |

### Edge Cases and Error Handling

- **No results**: Show a friendly "No results found. Try a different search term." message with the search query highlighted.
- **Data not yet loaded**: Show a loading indicator in the relevant category. Commands that rely on data (e.g. "View escalation") are only available after the data is loaded.
- **Large number of entities**: Limit displayed results to 10 per category. Show a "View all" link at the bottom of each category that navigates to the relevant page.
- **Keyboard shortcut conflict**: If the browser or OS captures Cmd+K (e.g. Firefox address bar), the palette still activates because the event handler calls `preventDefault()`. If this fails, the palette can also be opened via a button in the header.
- **Mobile**: On mobile/tablet, the Cmd+K shortcut is not available. A search icon button in the header opens the palette instead.
- **Dialog already open**: If another dialog (e.g. export dialog, escalation detail) is open, Cmd+K does not open the palette. The keydown listener checks for existing open dialogs via a context or ref.

---

## 12.2 Data Model Changes

**None.** This feature is entirely frontend. No DynamoDB changes, no new schemas, no new TypeScript types in the core package.

The only "storage" is `localStorage` for recent commands:
```
Key: 'agentic-pm:recent-commands'
Value: JSON array of { id: string, label: string, timestamp: number }
Max entries: 10 (FIFO eviction)
```

---

## 12.3 Backend Tasks

**None.** This feature requires no backend changes. All data is sourced from existing API routes and TanStack Query caches.

---

## 12.4 Frontend Tasks

### New Dependency

Add the `cmdk` package (Command Menu for React):
```
pnpm add cmdk --filter @agentic-pm/web
```

The `cmdk` library provides the foundational `<Command>` component, which handles:
- Fuzzy search filtering
- Keyboard navigation (arrow keys, enter, escape)
- Accessible ARIA attributes
- Grouping and separators

### New Component: `packages/web/src/components/ui/command.tsx`

shadcn/ui-style wrapper around `cmdk` primitives (following the shadcn pattern already used in the project):

```typescript
// Re-exports from cmdk with Tailwind styling applied
export const Command = /* styled Command root */
export const CommandDialog = /* Command inside a Dialog */
export const CommandInput = /* styled search input */
export const CommandList = /* styled results list */
export const CommandEmpty = /* "no results" state */
export const CommandGroup = /* category group */
export const CommandItem = /* individual result item */
export const CommandSeparator = /* visual separator */
export const CommandShortcut = /* keyboard shortcut hint */
```

### New Component: `packages/web/src/components/command-palette.tsx`

The main command palette component:

```typescript
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  // Hooks for data
  const { data: projects } = useProjects();
  const { data: escalations } = useEscalations(/* active project */);
  const { data: heldActions } = useHeldActions();

  // State
  const [search, setSearch] = useState('');
  const [recentCommands, setRecentCommands] = useLocalStorage<RecentCommand[]>(
    'agentic-pm:recent-commands', []
  );

  // Navigation handler
  const router = useRouter();
  const handleSelect = (command: CommandItem) => {
    recordRecentCommand(command);
    onOpenChange(false);
    if (command.type === 'navigation') router.push(command.href);
    if (command.type === 'action') command.action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Recent commands (shown when search is empty) */}
        {!search && recentCommands.length > 0 && (
          <CommandGroup heading="Recent">
            {recentCommands.map(cmd => <CommandItem ... />)}
          </CommandGroup>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem>Go to Dashboard</CommandItem>
          <CommandItem>Go to Projects</CommandItem>
          <CommandItem>Go to Escalations</CommandItem>
          {/* ... */}
        </CommandGroup>

        {/* Projects */}
        <CommandGroup heading="Projects">
          {projects?.map(project => <CommandItem ... />)}
        </CommandGroup>

        {/* Escalations */}
        {escalations?.length > 0 && (
          <CommandGroup heading="Pending Escalations">
            {escalations.filter(e => e.status === 'pending').map(esc => <CommandItem ... />)}
          </CommandGroup>
        )}

        {/* Held Actions */}
        {heldActions?.length > 0 && (
          <CommandGroup heading="Held Actions">
            {heldActions.map(action => <CommandItem ... />)}
          </CommandGroup>
        )}

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem>Toggle dry-run mode</CommandItem>
          <CommandItem>Export artefact...</CommandItem>
          <CommandItem>View budget status</CommandItem>
          {/* ... */}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

### New Hook: `packages/web/src/lib/hooks/use-command-palette.ts`

```typescript
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+K (macOS) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Don't open if another dialog is already open
        const existingDialog = document.querySelector('[role="dialog"][data-state="open"]');
        if (existingDialog && !open) return;
        setOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return { open, setOpen };
}
```

### New Hook: `packages/web/src/lib/hooks/use-local-storage.ts`

Generic localStorage hook for persisting recent commands:

```typescript
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void]
```

### Modified Component: `packages/web/src/components/header.tsx`

Add the command palette trigger and search button:

```tsx
{/* Add before the sign-out button */}
<button
  onClick={() => setCommandPaletteOpen(true)}
  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
  aria-label="Open command palette (Cmd+K)"
>
  <Search className="h-4 w-4" aria-hidden="true" />
  <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
    <span className="text-xs">⌘</span>K
  </kbd>
</button>
```

### Modified Layout: `packages/web/src/app/(dashboard)/layout.tsx`

Mount the command palette at the layout level so it is globally available:

```tsx
export default async function DashboardLayout({ children }) {
  // ... existing auth check ...
  return (
    <ResponsiveLayout>
      {children}
      <CommandPaletteProvider />
    </ResponsiveLayout>
  );
}
```

Since the layout is a server component, create a client wrapper:

### New Component: `packages/web/src/components/command-palette-provider.tsx`

```typescript
'use client';

import { useCommandPalette } from '@/lib/hooks/use-command-palette';
import { CommandPalette } from './command-palette';

export function CommandPaletteProvider() {
  const { open, setOpen } = useCommandPalette();
  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
```

### Modified Component: `packages/web/src/components/responsive-layout.tsx`

Pass the command palette state through context or render the provider:

```tsx
<CommandPaletteProvider />
```

### UI Wireframe Description

**Command Palette (modal overlay):**

```
+-----------------------------------------------------------+
|  ________________________________________________________  |
| |  > Type a command or search...                    ⌘K  | |
| |________________________________________________________| |
|                                                            |
| Recent                                                     |
|   [clock] Go to Escalations                                |
|   [clock] Project Alpha                                    |
|                                                            |
| Navigation                                                 |
|   [>] Go to Dashboard                                      |
|   [>] Go to Projects                                       |
|   [>] Go to Escalations                                    |
|   [>] Go to Activity                                       |
|   [>] Go to Settings                                       |
|   [>] Go to Briefings                                      |
|                                                            |
| Projects                                                   |
|   [folder] Project Alpha                      [active]     |
|   [folder] Project Beta                       [paused]     |
|                                                            |
| Pending Escalations                                        |
|   [!] Approve scope change for API module     [pending]    |
|   [!] Decide on vendor selection              [pending]    |
|                                                            |
| Actions                                                    |
|   [zap] Toggle dry-run mode                   [off]        |
|   [zap] Export artefact...                                 |
|   [zap] View budget status                                 |
+-----------------------------------------------------------+
```

**With search active (typing "esc"):**

```
+-----------------------------------------------------------+
|  ________________________________________________________  |
| |  > esc                                            ⌘K  | |
| |________________________________________________________| |
|                                                            |
| Pending Escalations                                        |
|   [!] Approve scope change for API module     [pending]    |
|   [!] Decide on vendor selection              [pending]    |
|                                                            |
| Navigation                                                 |
|   [>] Go to Escalations                                    |
+-----------------------------------------------------------+
```

---

## 12.5 Test Plan

### Unit Tests

**`packages/web/src/components/__tests__/command-palette.test.tsx`**
- TC-12-01: Renders navigation items when opened with empty search.
- TC-12-02: Filters items when user types in the search input.
- TC-12-03: Shows "No results found" when search matches nothing.
- TC-12-04: Navigates to correct page when a navigation item is selected via Enter key.
- TC-12-05: Closes palette when Escape is pressed.
- TC-12-06: Closes palette when an item is selected.
- TC-12-07: Shows project items from the useProjects hook data.
- TC-12-08: Shows pending escalation items from the useEscalations hook data.
- TC-12-09: Shows held action items from the useHeldActions hook data.
- TC-12-10: Recent commands are displayed when search is empty.
- TC-12-11: Recently selected command is added to the recents list.
- TC-12-12: Arrow key navigation moves focus between items.

**`packages/web/src/lib/hooks/__tests__/use-command-palette.test.ts`**
- TC-12-13: Cmd+K opens the palette (sets open to true).
- TC-12-14: Cmd+K toggles the palette (open -> closed).
- TC-12-15: Ctrl+K opens the palette on non-macOS.
- TC-12-16: Regular K key press (without Cmd/Ctrl) does not open the palette.
- TC-12-17: Cmd+K with an existing dialog open does not open the palette.

**`packages/web/src/lib/hooks/__tests__/use-local-storage.test.ts`**
- TC-12-18: Returns initial value when localStorage is empty.
- TC-12-19: Persists value to localStorage on update.
- TC-12-20: Reads persisted value on mount.
- TC-12-21: Handles corrupted localStorage data gracefully (falls back to initial value).

### Integration Tests

- TC-12-22: Command palette integrates with TanStack Query -- projects from cache appear in results.
- TC-12-23: Selecting a project navigates to `/projects/<id>`.
- TC-12-24: Selecting an escalation navigates to `/escalations` with the escalation ID in the URL.

### E2E Tests (Playwright)

- TC-12-25: Press Cmd+K, type "dash", see "Go to Dashboard" highlighted, press Enter, verify URL is `/dashboard`.
- TC-12-26: Press Cmd+K, type project name, select project, verify navigation to project page.
- TC-12-27: Press Cmd+K, press Escape, verify palette is closed.
- TC-12-28: Click the search icon in the header on mobile viewport, verify palette opens.

---

## 12.6 Acceptance Criteria

- **AC-12-1**: Pressing Cmd+K (macOS) or Ctrl+K (Windows/Linux) opens the command palette from any page in the dashboard.
- **AC-12-2**: The palette displays grouped commands: Navigation, Projects, Escalations, Held Actions, Actions.
- **AC-12-3**: Typing in the search input filters commands and entities in real time using fuzzy matching.
- **AC-12-4**: Selecting a navigation command routes to the correct page and closes the palette.
- **AC-12-5**: Selecting an escalation command navigates to the escalations page.
- **AC-12-6**: Selecting a held action command navigates to the held actions approval flow.
- **AC-12-7**: Arrow keys navigate between items; Enter selects the focused item; Escape closes the palette.
- **AC-12-8**: Recently used commands (up to 10) are stored in localStorage and displayed when the search input is empty.
- **AC-12-9**: The palette shows "No results found" when no commands match the search query.
- **AC-12-10**: A search/shortcut button in the header provides an alternative way to open the palette (required for mobile).
- **AC-12-11**: The palette does not open if another dialog is already open.
- **AC-12-12**: No backend API calls are made to render the palette -- all data comes from existing TanStack Query caches.
- **AC-12-13**: The palette is keyboard-accessible and screen-reader-friendly (proper ARIA roles from cmdk).
- **AC-12-14**: Results are limited to 10 per category to prevent the list from becoming unwieldy.

---

# Cross-Feature Considerations

## Dependency Graph

```
Feature 12 (Command Palette) -- no dependencies, can be built first
Feature 11 (Artefact Export)  -- no dependencies, can be built in parallel with 12
Feature 10 (Briefing Generator) -- depends on existing housekeeping Lambda and artefact system
```

Feature 12 can add action items for Features 10 and 11 once those are implemented (e.g. "Export RAID Log" in the command palette, "Go to Briefings" in navigation). These should be gated behind feature detection (check if the route exists).

## Budget Impact

| Feature | LLM Cost | AWS Cost |
|---|---|---|
| Feature 10 | ~$0.001-0.003 per briefing (Haiku) | Negligible (DynamoDB writes, SES sends) |
| Feature 11 | $0.00 (no LLM calls) | Negligible (DynamoDB for snapshots, SES for email) |
| Feature 12 | $0.00 (no LLM calls, no API calls) | $0.00 (purely client-side) |

## Estimated Effort

| Feature | Backend | Frontend | Total |
|---|---|---|---|
| Feature 10 | 3-4 days | 2-3 days | 5-7 days |
| Feature 11 | 2-3 days | 2-3 days | 4-6 days |
| Feature 12 | 0 days | 2-3 days | 2-3 days |

Recommended build order: Feature 12 (quick win, high UX impact) -> Feature 11 (moderate scope) -> Feature 10 (most complex, LLM integration).
