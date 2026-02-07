# Feature Backlog — Epics & Stories

## Epic 1: Reliability & Safety Foundation

**Goal:** Guarantee safe autonomous operation — idempotent execution, dead man's switch, atomic budget tracking.

### Story 1.1: Idempotent External Action Execution (Feature #3)
- Add `executing` status to `HeldActionStatus` type union
- Add atomic status transition `pending → executing` before action execution in hold-queue handler
- Add SES `MessageDeduplicationId` for email actions
- Add Jira pre-transition status check before Jira actions
- Add housekeeping detection of stuck `executing` items (>5 min)
- **AC:** No duplicate external side-effects under Lambda crash/retry

### Story 1.2: Dead Man's Switch — Heartbeat Staleness Alarm (Feature #4)
- Add `AgentHeartbeatEmitted` to `MetricName` type in metrics.ts
- Emit custom metric in heartbeat Lambda handler
- Add CloudWatch Alarm in monitoring-stack.ts with `treatMissingData: BREACHING`
- Wire alarm to existing SNS alert topic
- **AC:** Alarm fires within 30 minutes of agent cycle stopping

### Story 1.3: Atomic Budget Counters (Feature #13)
- Replace `BudgetTracker.saveToDb()` `put()` with DynamoDB `UpdateExpression: ADD`
- Use `db.update()` for atomic increment of `dailySpendUsd` and `monthlySpendUsd`
- Keep `loadFromDb()` for reads
- Add condition expression to prevent negative spend
- **AC:** Concurrent Lambda LLM calls cannot overwrite each other's spend data

---

## Epic 2: Intelligence & Analytics Engine

**Goal:** Transform artefact data into compounding intelligence — reports, memory, decision tracking, coherence auditing.

### Story 2.1: Status Report Generator (Feature #1)
- New `packages/core/src/reports/` module with status-report.ts
- New Zod schema for StatusReport entity
- New `StatusReportRepository` in core/db/repositories/
- DynamoDB entity: `PK=PROJECT#{id}, SK=REPORT#{timestamp}`
- New API route: `POST /api/reports/generate`, `GET /api/reports/[projectId]`
- New hook: `use-reports.ts`
- New page: `/reports` with template selection (executive, team, steering)
- Preview/edit component, export/send via SES
- **AC:** One-click generates stakeholder-ready status report from artefact data

### Story 2.2: Longitudinal Project Memory (Feature #2)
- New `ArtefactSnapshotRepository` — weekly snapshots with TTL 180 days
- DynamoDB entity: `PK=PROJECT#{id}, SK=SNAPSHOT#{date}`
- Extend housekeeping Lambda to create weekly snapshots
- New API route: `GET /api/snapshots/[projectId]`
- New hook: `use-snapshots.ts`
- Trend chart component on project detail page
- **AC:** Sprint-over-sprint artefact comparison available after 2 weeks

### Story 2.3: Decision Outcome Tracking (Feature #8)
- Extend decision log schema with `outcomeAssessment`, `expectedOutcomeDate`, `lastReviewedAt`
- Extend housekeeping Lambda to review decisions past expected outcome date
- Haiku call to assess whether expected outcomes materialised
- API route: `GET /api/decisions/[projectId]/outcomes`
- Dashboard section showing decision quality
- **AC:** Decisions auto-reviewed when they reach expected outcome date

### Story 2.4: Artefact Coherence Auditor (Feature #15)
- New `packages/core/src/compliance/coherence.ts` module
- Cross-artefact consistency check (blockers count in delivery_state vs RAID log)
- One Haiku call per update cycle in artefact-update Lambda
- Surface inconsistencies as events via EventRepository
- **AC:** Contradictions between artefacts detected and logged

---

## Epic 3: Ingestion & Query Platform

**Goal:** Expand the ingestion interface into a bidirectional intelligence platform.

### Story 3.1: Meeting Notes Pipeline (Feature #5)
- Extend ingestion interface with meeting-specific mode
- Meeting metadata: date, attendees, type (standup/retro/steering/1:1)
- Meeting-optimised LLM prompts for extraction
- Categorise extracted items to RAID categories automatically
- **AC:** Paste meeting transcript, get categorised items for review

### Story 3.2: Natural Language Project Query (Feature #6)
- New API route: `POST /api/query`
- Retrieve relevant context from DynamoDB (events, artefacts by project)
- Haiku call with retrieved context + user question
- New `/ask` page or panel in dashboard
- Query history in localStorage
- **AC:** PM asks "What blocked the API migration?" and gets grounded answer

### Story 3.3: "Since You Left" Catch-Up Synthesiser (Feature #7)
- Track `lastVisitTimestamp` in localStorage
- New API route: `GET /api/catchup?since={timestamp}`
- Haiku call to prioritise and summarise gap events
- Dismissible card at top of dashboard
- **AC:** On return visit, user sees prioritised summary of what changed

---

## Epic 4: Stakeholder & Proactive Intelligence

**Goal:** Make the agent proactive — stakeholder tracking, meeting prep, stale item follow-ups.

### Story 4.1: Stakeholder Intelligence (Feature #9)
- New `StakeholderRepository` — `PK=PROJECT#{id}, SK=STAKEHOLDER#{name}`
- Deterministic actor extraction from signal metadata (Jira assignees, email senders)
- Interaction counts, last-seen timestamps, communication frequency
- New API route: `GET /api/stakeholders/[projectId]`
- New hook: `use-stakeholders.ts`
- Dashboard panel showing key people and engagement anomalies
- **AC:** Stakeholder engagement graph built from signal data

### Story 4.2: Pre-Meeting Cadence Briefing Generator (Feature #10)
- Cadence schedule config in agent config (DynamoDB)
- Extend housekeeping or separate Lambda trigger
- Haiku/Sonnet call with artefact diffs and recent events
- SES delivery or dashboard notification
- New API route: `GET /api/briefings/[projectId]`
- **AC:** Briefing generated 30 min before scheduled ceremony

### Story 4.3: Stale Item Watchdog (Feature #14)
- Monitor RAID log items and blockers for staleness
- Configurable thresholds (7 days blockers, 14 days RAID items)
- Auto-draft follow-up messages via Haiku
- Route through existing hold queue
- New event type for stale item detection
- **AC:** Stale blockers trigger follow-up drafts in hold queue

---

## Epic 5: UX & Export Excellence

**Goal:** Frontend-only improvements for usability and value delivery.

### Story 5.1: Artefact Export & Shareable Snapshots (Feature #11)
- Copy-as-markdown for all artefact types
- Export via SES (reuse existing email infrastructure)
- Export JSON for all artefacts
- Export individual or all artefacts
- New API route: `POST /api/artefacts/[projectId]/export`
- **AC:** User can copy artefact as markdown or send via email

### Story 5.2: Command Palette (Feature #12)
- Global Cmd+K / Ctrl+K shortcut
- `cmdk` library integration
- Search across pages, projects, escalations, held actions
- Contextual actions (approve held action, view escalation)
- Pure frontend component, no backend changes
- **AC:** Cmd+K opens searchable palette with navigation and actions
