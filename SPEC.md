# Agentic PM Workbench — Implementation Specification

> **Status:** Implementation-ready. This document is the single source of truth.
> **Supersedes:** `# Fully Agentic PM Workbench - Complete .md`, `Original-Cloud-Hosting-Spec.md`, `PLAN-consolidated-spec.md`
> **Last updated:** February 2026

---

## 1. Product Vision

### What it is

A fully autonomous personal project management assistant. The agent monitors Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog summary, decision log), and handles routine PM work with minimal human intervention.

### What it is not

- Not a SaaS product. Single user, no multi-tenancy, no RBAC.
- Not a replacement for Jira/Asana. It synthesises data from those tools; it does not duplicate them.
- Not a chatbot. The primary interface is a dashboard, not a conversation.

### Core value proposition

Cross-platform synthesis. The agent creates structured PM artefacts that do not exist in any single tool — RAID logs built from Jira signals and email threads, delivery states assembled from sprint data and stakeholder communications. No single-vendor AI feature (Jira Rovo, Asana AI Teammates) provides this cross-tool view.

### Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Users | 1 (you) | Personal tool |
| Budget ceiling | $10/month total | Infrastructure + LLM |
| Active projects | 1-2 at a time | Scope control |
| Database storage | 0.5 GB (Neon free tier) | Cost ceiling |

---

## 2. Locked Decisions

All architectural and technology decisions are final. Do not revisit unless a blocking issue is discovered during implementation.

### Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend hosting | Vercel (free hobby tier) | Best Next.js DX, sufficient for single user |
| Agent runtime | Hetzner VPS CX22 (~$4/month) | Persistent Node.js process, no execution time limits |
| Database | Neon PostgreSQL (free tier, 0.5 GB) | Serverless Postgres, free |
| ORM | Drizzle ORM | Lighter than Prisma, better TypeScript inference, good migrations |
| Frontend framework | Next.js (App Router) | Locked in CLAUDE.md |
| UI components | shadcn/ui | Unstyled, composable, no runtime cost |
| Language | TypeScript (strict mode) | All application code |
| Process manager | pm2 | Simpler than systemd for solo developer, built-in log management |
| Reverse proxy | Caddy | Automatic HTTPS via Let's Encrypt, simpler config than nginx |
| Auth | NextAuth.js + Credentials provider | Single user — simplest session management with CSRF protection |
| Spelling | British English | User is Australian |

### Integrations

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP integrations | Jira Cloud + Outlook (via Graph API) | Minimum for cross-source value |
| Phase 2 integration | Asana | Add when second project needs it |
| MS Teams | **Deferred indefinitely** | Requires Azure AD admin consent; read-only monitoring adds limited value relative to setup cost |
| Agent-to-user notifications | Resend (free tier, 100 emails/day) | Breaks circular dependency between daily digest and Outlook integration |
| Jira variant | Cloud only | No Server/Data Center support |
| Polling strategy | Polling-first | Webhooks deferred; infrastructure (Caddy + TLS) ready for future webhook support |
| Graph API pattern | Delta queries | Not timestamp-based polling. Delta queries eliminate missed-message and duplicate-processing bugs |

### Agent design

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM output parsing | Claude tool-use (function calling) | No raw JSON.parse on free-text responses |
| Confidence scoring | Structured multi-dimensional | Not LLM self-reported confidence. Score: source agreement, action boundaries, schema validity, precedent match |
| Communication safety | Draft-then-send with hold queue | 30-min default hold, graduating down after consecutive approvals |
| Artefact versioning | Single `previous_version` column | One-deep undo. Full version history exhausts 0.5 GB in ~2 months |
| Agent state | Dedicated `agent_checkpoints` table | Atomic updates without read-modify-write races on JSONB blobs |
| Change detection gate | Required (first-class) | Check APIs for deltas before invoking LLM. Without this, budget is impossible |
| Local development DB | Neon branching | Not SQLite (different JSON handling causes false-positive tests) |
| Agent communication style | Impersonal active voice | No first-person in stakeholder-facing content. Dashboard uses active voice without "I" |
| Kill switch framing | "Autonomy dial" / mode selector | Not emergency stop language. Slider with labelled zones: Observe / Maintain / Act |

### Explicitly excluded

No Redis. No Pinecone. No Pusher. No S3. No Vercel Blob. No Vercel Cron (agent runs on VPS). No LangGraph. No multi-user auth. No RBAC. No Slack integration. No GitHub integration. No SharePoint. No Calendar integration. No mobile-specific builds. No dark mode (MVP). No i18n framework. No animation library.

---

## 3. Architecture

```
YOU (browser)
  │
  ▼
┌─────────────────────────────┐
│  Vercel (free hobby tier)   │
│  Next.js App Router         │
│  - Dashboard (Mission Ctrl) │
│  - Activity feed            │
│  - Decision interface       │
│  - Agent config             │
│  - API routes (read from DB)│
└─────────────┬───────────────┘
              │ reads (Neon serverless driver)
              ▼
┌─────────────────────────────┐
│  Neon PostgreSQL (free)     │
│  0.5 GB storage             │
│  - Projects, artefacts      │
│  - Agent actions log        │
│  - Escalations/decisions    │
│  - Events table             │
│  - Agent checkpoints        │
│  - Integration configs      │
└─────────────┬───────────────┘
              │ reads/writes (node-postgres)
              ▼
┌─────────────────────────────┐
│  Hetzner VPS CX22 (~$4/mo) │
│  Ubuntu, Caddy, pm2         │
│  Node.js agent process      │
│  - 15-min polling loop      │
│  - Change detection gate    │
│  - Jira Cloud API           │
│  - MS Graph API (Outlook)   │
│  - Claude API calls         │
│  - Action execution         │
│  - Heartbeat logging        │
│  - Resend API (notifications│
└─────────────────────────────┘
```

### Key architectural rules

1. **All LLM calls route through the VPS, never through Vercel functions.** The Vercel 10-second hobby tier limit combined with Neon cold starts leaves insufficient headroom.
2. **Vercel reads from the database only.** It never writes agent state, actions, or artefacts. The VPS owns all writes except user config changes.
3. **The events table is the backbone for frontend-agent coordination.** It powers the activity feed, dashboard stats, and heartbeat signal from a single table.
4. **Neon keepalive: the agent sends `SELECT 1` every 4 minutes** to prevent cold starts (2-5 seconds) on every 15-minute cycle.
5. **Static shell pattern for frontend:** The dashboard serves a static shell from CDN with client-side data fetching. This gives sub-500ms first contentful paint regardless of Neon state.

### Database connection strategy

| Component | Driver | Why |
|-----------|--------|-----|
| Vercel (frontend) | `@neondatabase/serverless` | HTTP-based, works in serverless/edge |
| VPS (agent) | `pg` (node-postgres) | Persistent connection, lower latency, supports transactions |

---

## 4. Data Model

### 4.1 Database schema

```sql
-- No users table. Single user. Auth via NextAuth Credentials provider.

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  source TEXT NOT NULL CHECK (source IN ('jira', 'asana')),
  source_project_key TEXT NOT NULL, -- e.g. "MCU" for Jira
  autonomy_level TEXT NOT NULL DEFAULT 'monitoring'
    CHECK (autonomy_level IN ('monitoring', 'artefact', 'tactical')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artefacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL
    CHECK (type IN ('delivery_state', 'raid_log', 'backlog_summary', 'decision_log')),
  content JSONB NOT NULL, -- structured artefact data (see schemas below)
  previous_version JSONB, -- one-deep undo
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, type)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  event_type TEXT NOT NULL, -- 'heartbeat', 'signal_detected', 'action_taken',
                            -- 'escalation_created', 'artefact_updated', 'error'
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  summary TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_project_created ON events (project_id, created_at DESC);
CREATE INDEX idx_events_type_created ON events (event_type, created_at DESC);

CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  context JSONB NOT NULL, -- structured context for the decision
  options JSONB NOT NULL, -- array of options with pros/cons
  agent_recommendation TEXT,
  agent_rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'decided', 'expired', 'superseded')),
  user_decision TEXT,
  user_notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  action_type TEXT NOT NULL, -- 'artefact_update', 'email_sent', 'jira_update',
                             -- 'escalation_created', 'notification_sent'
  description TEXT NOT NULL,
  detail JSONB,
  confidence JSONB, -- structured confidence scores (see section 5.4)
  executed BOOLEAN NOT NULL DEFAULT false,
  held_until TIMESTAMPTZ, -- for draft-then-send hold queue
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_checkpoints (
  project_id UUID NOT NULL REFERENCES projects(id),
  integration TEXT NOT NULL, -- 'jira', 'outlook', 'asana'
  checkpoint_key TEXT NOT NULL, -- e.g. 'last_sync', 'delta_token'
  checkpoint_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, integration, checkpoint_key)
);

CREATE TABLE integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration TEXT NOT NULL UNIQUE
    CHECK (integration IN ('jira', 'asana', 'outlook', 'resend')),
  config_encrypted BYTEA NOT NULL, -- AES-256 encrypted credentials
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'error')),
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Seed with defaults:
-- 'polling_interval_minutes' -> 15
-- 'budget_ceiling_daily_usd' -> 0.33
-- 'hold_queue_minutes' -> 30
-- 'working_hours' -> {"start": "08:00", "end": "18:00", "timezone": "Australia/Sydney"}
```

### 4.2 Artefact JSON schemas

These schemas define the structured content stored in `artefacts.content`. The agent generates and maintains these via Claude tool-use.

#### Delivery State

```json
{
  "overall_status": "green | amber | red",
  "status_summary": "One-paragraph summary of project health",
  "current_sprint": {
    "name": "Sprint 12",
    "start_date": "2026-02-03T00:00:00Z",
    "end_date": "2026-02-14T00:00:00Z",
    "goal": "Complete user profile migration",
    "progress": {
      "total_points": 34,
      "completed_points": 21,
      "in_progress_points": 8,
      "blocked_points": 5
    }
  },
  "milestones": [
    {
      "name": "Beta launch",
      "due_date": "2026-03-15T00:00:00Z",
      "status": "on_track | at_risk | delayed | completed",
      "notes": "Dependent on API migration completing by March 1"
    }
  ],
  "blockers": [
    {
      "id": "B001",
      "description": "Design assets for profile page not delivered",
      "owner": "Sarah K",
      "raised_date": "2026-01-28T00:00:00Z",
      "severity": "high | medium | low",
      "source_ticket": "MCU-142"
    }
  ],
  "key_metrics": {
    "velocity_trend": "increasing | stable | decreasing",
    "avg_cycle_time_days": 4.2,
    "open_blockers": 1,
    "active_risks": 3
  },
  "next_actions": [
    "Follow up with Sarah on design assets by Feb 5",
    "Review sprint 13 scope with team"
  ]
}
```

#### RAID Log

```json
{
  "items": [
    {
      "id": "R001",
      "type": "risk | assumption | issue | dependency",
      "title": "API vendor announces EOL",
      "description": "Vendor A API will be decommissioned June 2026. Migration to Vendor B required.",
      "severity": "critical | high | medium | low",
      "status": "open | mitigating | resolved | accepted | closed",
      "owner": "Damien",
      "raised_date": "2026-01-15T00:00:00Z",
      "due_date": "2026-03-01T00:00:00Z",
      "mitigation": "Evaluate Vendor B, begin migration by Feb 15",
      "resolution": null,
      "resolved_date": null,
      "source": "agent_detected | user_added | integration_signal",
      "source_reference": "MCU-156",
      "last_reviewed": "2026-02-01T00:00:00Z"
    }
  ]
}
```

#### Decision Log

```json
{
  "decisions": [
    {
      "id": "D001",
      "title": "Delay beta launch to mid-April",
      "context": "API vendor migration requires 3 weeks. Original March 15 date at risk.",
      "options_considered": [
        {
          "option": "Delay to mid-April",
          "pros": ["Lower risk", "Within contingency budget"],
          "cons": ["4-week delay to market"]
        },
        {
          "option": "Rush migration, keep March date",
          "pros": ["On-time delivery"],
          "cons": ["High quality risk", "Team burnout", "$7k premium"]
        }
      ],
      "decision": "Delay to mid-April",
      "rationale": "Lower risk, within budget, maintains quality standards",
      "made_by": "user",
      "date": "2026-02-03T00:00:00Z",
      "status": "active | superseded | reversed",
      "related_raid_items": ["R001"]
    }
  ]
}
```

#### Backlog Summary

```json
{
  "source": "jira | asana",
  "last_synced": "2026-02-04T10:30:00Z",
  "summary": {
    "total_items": 47,
    "by_status": {
      "to_do": 22,
      "in_progress": 8,
      "done_this_sprint": 12,
      "blocked": 5
    },
    "by_priority": {
      "critical": 2,
      "high": 11,
      "medium": 24,
      "low": 10
    }
  },
  "highlights": [
    {
      "ticket_id": "MCU-142",
      "title": "Profile page redesign",
      "flag": "blocked | stale | missing_criteria | scope_creep | new",
      "detail": "Blocked on design assets from Sarah. No update in 7 days.",
      "suggested_action": "Escalate to design lead"
    }
  ],
  "refinement_candidates": [
    {
      "ticket_id": "MCU-155",
      "title": "Implement LinkedIn import",
      "issue": "Missing acceptance criteria"
    }
  ],
  "scope_notes": "3 new tickets added mid-sprint (possible scope creep)"
}
```

### 4.3 Storage budget

With 0.5 GB total, allocate conservatively:

| Category | Budget | Notes |
|----------|--------|-------|
| Artefacts (current + previous_version) | 50 MB | ~10 artefacts × 2 versions × ~50 KB each, generous margin |
| Events table | 200 MB | 30-day rolling window, prune daily |
| Agent actions | 100 MB | 90-day retention, prune weekly |
| Escalations | 20 MB | Rarely large |
| Checkpoints + configs | 10 MB | Tiny |
| Indexes + overhead | 100 MB | PostgreSQL overhead |
| **Headroom** | **~30 MB** | Buffer |

**Retention policy:** The agent prunes events older than 30 days and agent_actions older than 90 days on a daily schedule (part of the agent loop).

---

## 5. Agent Architecture

### 5.1 Agent loop

The agent runs as a persistent Node.js process on the VPS, managed by pm2.

```
EVERY 15 MINUTES (configurable):

  1. KEEPALIVE
     - Send SELECT 1 to Neon (prevent cold starts)
     - Log heartbeat event (even when nothing happens)

  2. CHANGE DETECTION GATE (zero LLM cost)
     For each active project:
       - Poll Jira API: any changes since last checkpoint?
       - Poll Outlook via Graph delta query: any new emails?
       - If NO changes anywhere: log "no changes", skip to next cycle
       - If changes found: proceed to step 3

  3. SIGNAL NORMALISATION
     Convert raw API responses into normalised signals:
       { source, timestamp, type, summary, raw_data }
     This is deterministic code, not LLM.

  4. TWO-PASS TRIAGE (Haiku)
     Pass 1 (SANITISE): Strip/neutralise untrusted content.
       - Input: raw signal text from external sources
       - Output: sanitised summary safe for reasoning prompts
       - Purpose: prompt injection defence layer
     Pass 2 (CLASSIFY): Determine signal importance and type.
       - Input: sanitised signals + project context (cached)
       - Output: classified signals with action recommendations
       - Tool-use response with structured schema

  5. REASONING (Sonnet, only when needed ~15% of calls)
     For complex signals (multi-source conflict, risk assessment,
     stakeholder communication drafting):
       - Input: classified signals + full artefact context
       - Output: action plan via tool-use

  6. EXECUTION
     For each recommended action:
       - Check structured confidence score (see 5.4)
       - Check decision boundaries (see 5.3)
       - If auto-executable: write to agent_actions with executed=true
       - If hold-queue action (email): write with held_until timestamp
       - If needs approval: create escalation
       - Log event for every action

  7. ARTEFACT MAINTENANCE
     If signals warrant artefact updates:
       - Read current artefact
       - Copy current content to previous_version
       - Generate updated content via tool-use
       - Write new content, increment version

  8. HOLD QUEUE CHECK
     Process any held actions whose held_until has passed:
       - Execute the action (send email, etc.)
       - Mark as executed

  9. HOUSEKEEPING (daily, on first cycle after midnight)
     - Prune events older than 30 days
     - Prune agent_actions older than 90 days
     - Check storage usage
     - Send daily digest via Resend (if configured)
```

### 5.2 Signal source abstraction

Each integration implements a common interface:

```typescript
interface SignalSource {
  integrate: 'jira' | 'outlook' | 'asana';

  authenticate(): Promise<void>;
  fetchDelta(checkpoint: string | null): Promise<{
    signals: NormalisedSignal[];
    newCheckpoint: string;
  }>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

interface NormalisedSignal {
  source: string;       // 'jira', 'outlook', 'asana'
  timestamp: string;    // ISO 8601
  type: string;         // 'ticket_updated', 'email_received', 'sprint_closed', etc.
  summary: string;      // human-readable one-liner
  raw: Record<string, unknown>; // original API payload
  project_id: string;
}
```

### 5.3 Decision boundaries

```typescript
const decisionBoundaries = {
  canAutoExecute: [
    'artefact_update',        // Update RAID log, delivery state, backlog, decisions
    'heartbeat_log',          // Log agent health
    'notification_internal',  // Send digest/alert to user via Resend
    'jira_comment',           // Add comment to Jira ticket
  ],

  requireHoldQueue: [
    'email_stakeholder',      // Email to known internal stakeholders (30-min hold)
    'jira_status_change',     // Change ticket status (5-min hold)
  ],

  requireApproval: [
    'email_external',         // Email to external recipients
    'jira_create_ticket',     // Create new Jira tickets
    'scope_change',           // Any scope-affecting action
    'milestone_change',       // Adjust milestones or dates
  ],

  neverDo: [
    'delete_data',
    'share_confidential',
    'modify_integration_config',
    'change_own_autonomy_level',
  ],
};
```

### 5.4 Structured confidence scoring

Do not ask Claude for a single confidence number. Instead, score four independent dimensions:

| Dimension | What it measures | How it's computed |
|-----------|-----------------|-------------------|
| **Source agreement** | Do multiple sources corroborate? | Deterministic: count confirming signals |
| **Boundary compliance** | Is the action within defined boundaries? | Deterministic: lookup in decisionBoundaries |
| **Schema validity** | Did Claude return valid structured output? | Deterministic: validate against schema |
| **Precedent match** | Has this type of action succeeded before? | Query agent_actions for similar past actions |

**Auto-execute rule:** All four dimensions must pass. If any dimension fails, escalate. This is deterministic and inspectable, not a magic number from the LLM.

### 5.5 Autonomy levels

| Level | Name | Agent does autonomously | Agent escalates |
|-------|------|------------------------|-----------------|
| 1 | **Monitoring** | Observe, log, maintain heartbeat. No external actions. | Everything |
| 2 | **Artefact** | All of Level 1 + update artefacts, send user notifications via Resend | External communications, Jira writes |
| 3 | **Tactical** | All of Level 2 + send stakeholder emails (via hold queue), update Jira tickets, respond to routine patterns | Strategic decisions, external comms, scope changes |

**Graduation criteria** (must be met before promoting):

| From → To | Criteria |
|-----------|----------|
| 1 → 2 | 7 consecutive days of monitoring with zero false signal classifications (manual review) |
| 2 → 3 | 14 consecutive days of artefact updates with zero manual corrections needed; user has reviewed and approved at least 5 held communications |

Level 4 (Strategic) is explicitly deferred from all planning.

---

## 6. LLM Strategy

### 6.1 Model selection

| Model | Use | % of calls |
|-------|-----|-----------|
| **Haiku 4.5** | Signal sanitisation, triage, classification, routine artefact updates | ~85% |
| **Sonnet 4.5** | Risk assessment, stakeholder communication drafting, complex multi-source reasoning | ~15% |

### 6.2 Cost model (February 2026 pricing)

| Model | Input/MTok | Output/MTok | Cache read/MTok |
|-------|-----------|------------|----------------|
| Haiku 4.5 | $1.00 | $5.00 | $0.10 |
| Sonnet 4.5 | $3.00 | $15.00 | $0.30 |

**Critical requirement: the change detection gate.** Without it, all 64 daily cycles invoke Claude and the budget is ~$16/month on Haiku alone. With it, only cycles with actual changes invoke Claude.

**Realistic daily usage (with change detection gate):**

| Component | Calls/day | Input tokens | Output tokens |
|-----------|----------|-------------|--------------|
| Triage (Haiku) | ~13 | 26,000 | 6,500 |
| Actions (Haiku) | ~8 | 24,000 | 8,000 |
| Complex reasoning (Sonnet) | ~3 | 9,000 | 3,000 |

**Monthly cost:**

| Model | Input cost | Output cost | Total |
|-------|-----------|------------|-------|
| Haiku (21 calls/day × 30) | 1.5 MTok × $1.00 = $1.50 | 0.44 MTok × $5.00 = $2.18 | $3.68 |
| Sonnet (3 calls/day × 30) | 0.27 MTok × $3.00 = $0.81 | 0.09 MTok × $15.00 = $1.35 | $2.16 |
| **Total** | | | **$5.84** |

**With prompt caching** (system prompt + artefact context = ~80% of input tokens are cacheable):

| Component | Without caching | With caching | Savings |
|-----------|----------------|-------------|---------|
| Haiku input | $1.50 | ~$0.42 | 72% |
| Sonnet input | $0.81 | ~$0.27 | 67% |
| **Revised total** | $5.84 | **~$4.22** | 28% |

### 6.3 Budget controls

| Control | Value |
|---------|-------|
| Daily budget ceiling | $0.33 (= $10/month ÷ 30) |
| Degradation tier 1 | At $0.25/day: Haiku-only (no Sonnet) |
| Degradation tier 2 | At $0.30/day: 30-min polling interval |
| Degradation tier 3 | At $0.33/day: monitoring-only (no LLM calls, just API polling and logging) |
| Monthly hard ceiling | $10.00 — agent enters monitoring-only mode |

The agent tracks cumulative daily spend in `agent_config` and checks before every LLM call.

### 6.4 Prompt engineering principles

1. **Prompts are the core IP, not the orchestration code.** Treat them as first-class source files, version-controlled and tested.
2. **Always use tool-use for structured outputs.** Define tools with JSON schemas matching the artefact schemas in section 4.2.
3. **Context assembly is a distinct, testable module.** The function that builds the prompt context (project state, recent signals, relevant artefact excerpts) is separated from the LLM call and unit-testable.
4. **Cache-friendly prompt structure:** System prompt and artefact context go in a cacheable prefix block. Variable content (new signals) goes after the cache boundary.

---

## 7. Integrations

### 7.1 Jira Cloud

**API:** Jira Cloud REST API v3
**Auth:** API token (Basic auth with email + token) or OAuth 2.0 (3LO) — start with API token for simplicity
**Key endpoints:**

| Purpose | Endpoint | Polling pattern |
|---------|----------|----------------|
| Sprint status | `GET /rest/agile/1.0/board/{boardId}/sprint` | Every cycle |
| Sprint issues | `GET /rest/agile/1.0/sprint/{sprintId}/issue` | Every cycle |
| Issue changes | `GET /rest/api/3/search` with `updatedDate` JQL | Every cycle, filtered by checkpoint |
| Issue detail | `GET /rest/api/3/issue/{issueId}` | On-demand when signal detected |
| Add comment | `POST /rest/api/3/issue/{issueId}/comment` | Action execution |
| Update status | `POST /rest/api/3/issue/{issueId}/transitions` | Action execution (hold queue) |

**Checkpoint:** Store `last_sync_timestamp` in agent_checkpoints. Use JQL `updated >= "{checkpoint}"` to fetch only changes.

### 7.2 Outlook (Microsoft Graph API)

**API:** Microsoft Graph API v1.0
**Auth:** Azure AD app registration with application permissions (requires tenant admin consent)
**Required permissions:** `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`
**Auth flow:** Client credentials (daemon app — no user interaction)

**Key endpoints:**

| Purpose | Endpoint | Pattern |
|---------|----------|---------|
| Read emails | `GET /users/{userId}/messages/delta` | Delta query with delta token |
| Send email | `POST /users/{userId}/sendMail` | Action execution (hold queue) |
| Search mail | `GET /users/{userId}/messages?$filter=...&$search=...` | On-demand |

**Checkpoint:** Store Graph API delta token in agent_checkpoints. Delta queries return only changes since last token — no timestamp-based polling.

**Fallback:** If Azure AD admin consent cannot be obtained, Outlook integration is deferred and the agent operates with Jira + Resend only. This is still a viable MVP (artefact generation from Jira data, notifications via Resend).

### 7.3 Resend (notifications)

**API:** Resend REST API
**Auth:** API key
**Free tier:** 100 emails/day, 3,000 emails/month
**Purpose:** Agent-to-user notifications only (daily digest, health alerts, escalation notices). Not for stakeholder communications.

**Key endpoints:**

| Purpose | Endpoint |
|---------|----------|
| Send email | `POST /emails` |

This integration is independent of Azure AD and available from day one.

### 7.4 Integration health monitoring

Each integration runs a health check on every agent cycle:

- **Jira:** `GET /rest/api/3/myself` — validates auth
- **Outlook:** `GET /users/{userId}` — validates Graph API access
- **Resend:** `GET /domains` — validates API key

Failed health checks log a warning event. Three consecutive failures log an error event and trigger a Resend notification to the user.

---

## 8. Web Interface

### 8.1 Views

| View | Purpose | Data source |
|------|---------|-------------|
| **Mission Control** | Dashboard: project health, agent status, pending escalations, 24h stats | events, projects, escalations, agent_actions |
| **Activity Feed** | Scrolling feed of agent events, filterable by project and type | events table |
| **Decision Interface** | Full-screen escalation detail with options and decision buttons | escalations table |
| **Project Detail** | Artefacts (delivery state, RAID, backlog, decisions) for one project | artefacts table |
| **Settings** | Integration config, autonomy level, polling interval, budget status | agent_config, integration_configs |

### 8.2 Frontend architecture

- **Next.js App Router** with React Server Components where possible
- **TanStack Query** for client-side data fetching with polling (30-second refresh)
- **Static shell pattern:** Layout and navigation render instantly from CDN; data fetches client-side
- **No SSR for dashboard data:** Avoids Vercel function time limits and Neon cold start dependency on page load
- **shadcn/ui** components: Card, Badge, Button, Separator, Tabs, Dialog
- **Accessibility:** Semantic HTML, ARIA live regions for activity feed, keyboard navigation, WCAG contrast ratios (note: amber #f59e0b fails AA at 2.1:1 contrast — use #d97706 instead)

### 8.3 Key UI patterns

**Agent status indicator:** Always visible in header. Shows "Active (next check in Xm)" or "Paused" or "Error: [detail]". Derived from latest heartbeat event, not a frontend timer.

**Empty states:** Every view has a designed empty state with guidance. The activity feed shows "Your agent is setting up. First sync will happen at [time]" before first cycle completes.

**Heartbeat distinction:** The feed distinguishes between "checked, nothing new" (grey, collapsed) and "checked, found changes" (coloured, expanded). This eliminates the ambiguity between "agent is working but idle" and "agent is dead."

**Autonomy dial:** A labelled slider (Observe / Maintain / Act) replacing a dropdown with numeric levels. The agent acknowledges changes: "Understood. I'll hold all actions for your review."

---

## 9. Security

### 9.1 Threat model

The primary threat is **prompt injection via untrusted external content**. Jira ticket descriptions, email bodies, and (future) Teams messages are all attacker-controllable text that flows directly into Claude prompts. At Level 3, a malicious Jira ticket could instruct Claude to exfiltrate data via email.

**Mitigation: two-stage triage architecture** (section 5.1, step 4). A separate, tool-less Haiku call sanitises external content before it enters reasoning prompts. The sanitisation call has no access to tools — it cannot send emails or update tickets even if compromised.

### 9.2 Credential security

| Credential | Storage | Access |
|------------|---------|--------|
| Integration API tokens | Encrypted in `integration_configs` table (AES-256) | Agent decrypts at runtime |
| Encryption key | Vercel environment variable (not on VPS) | Agent retrieves via authenticated Vercel API endpoint, caches in memory with TTL |
| NextAuth secret | Vercel environment variable | Frontend only |
| Database connection string | pm2 ecosystem config (VPS), Vercel env var (frontend) | Each component accesses its own |

**VPS compromise scenario:** An attacker who gains VPS access cannot read integration credentials (encryption key is on Vercel). They can read the database connection string, but the database contains no credentials in plaintext.

### 9.3 Outbound action allowlist

The agent can only perform actions in the `decisionBoundaries` allowlist (section 5.3). Any action not in the list is rejected by the execution layer regardless of what Claude recommends. This is a code-level constraint, not a prompt-level one.

### 9.4 VPS hardening

- SSH key-only auth (no password)
- UFW firewall: allow 22 (SSH), 80 (HTTP→HTTPS redirect), 443 (HTTPS)
- Unattended security updates enabled
- Caddy for automatic TLS certificate management
- pm2 runs as non-root user

### 9.5 Authentication

Single user. NextAuth.js with Credentials provider. Username and bcrypt-hashed password stored in environment variables (not in the database). Session cookie with CSRF protection.

---

## 10. MVP Scope & Phases

### Phase 0: Pre-code (before any implementation)

| # | Action | Status |
|---|--------|--------|
| 1 | Validate Azure AD app registration and Graph API permissions | Pending (user action) |
| 2 | Verify Jira Cloud API access with API token | Pending (user action) |
| 3 | Confirm Neon free tier limits (0.5 GB, 191.9 compute hours) | Pending (user action) |
| 4 | Set up Resend account, verify sending domain | Pending (user action) |
| 5 | Baseline one week of actual PM time (passive tracking) | Pending (user action) |
| 6 | Run Spike S1: Can Claude reliably generate artefacts via tool-use from real Jira data? | Pending |
| 7 | Run Spike S2: Measure actual token usage with real prompts at current pricing | Pending |

**Kill threshold:** If after 100 hours of development the tool is not saving at least 3 hours/week of PM work, stop building.

### Phase 1: Foundation

| # | Task |
|---|------|
| F1 | Provision Hetzner VPS, install Caddy + pm2 + Node.js |
| F2 | Create Neon database, run schema migrations (Drizzle) |
| F3 | Deploy empty Next.js app to Vercel with NextAuth |
| F4 | Build agent process skeleton: pm2-managed, 15-min loop, heartbeat logging |
| F5 | Implement Neon keepalive (SELECT 1 every 4 minutes) |
| F6 | Build LLM abstraction layer: Haiku/Sonnet routing, tool-use, cost tracking |
| F7 | Implement budget controls and degradation ladder |
| F8 | Build events table and activity feed (frontend reads, agent writes) |
| F9 | Set up Resend integration for agent-to-user notifications |
| F10 | Build agent status indicator in dashboard header |
| F11 | CI/CD: GitHub Actions → Vercel (frontend) + SSH deploy to VPS (agent) |

### Phase 2: Core Product (Level 1 → Level 2)

| # | Task |
|---|------|
| C1 | Build Jira signal source (SignalSource interface implementation) |
| C2 | Build signal normalisation pipeline |
| C3 | Build two-pass triage (sanitise + classify) with Haiku |
| C4 | Build context assembly module (testable, cache-friendly) |
| C5 | Implement artefact bootstrap: generate initial delivery state, RAID log, backlog summary, decision log from Jira data |
| C6 | Build change detection gate (zero-LLM-cost delta check) |
| C7 | Implement dry-run mode (log actions but don't execute) |
| C8 | Build Mission Control dashboard with project cards |
| C9 | Build escalation workflow (create, present, decide) |
| C10 | Build basic health monitoring (integration health checks, agent heartbeat) |
| C11 | Implement data retention pruning (daily housekeeping) |
| C12 | Build daily digest email via Resend |
| C13 | Graduate to Level 2: autonomous artefact updates |

### Phase 3: Enhancements (Level 2 → Level 3)

| # | Task |
|---|------|
| E1 | Build Outlook signal source (Graph API delta queries) |
| E2 | Implement draft-then-send with hold queue |
| E3 | Build communication preview in dashboard |
| E4 | Implement structured confidence scoring |
| E5 | Build reasoning transparency (show why agent took each action) |
| E6 | Implement anti-complacency spot checks (fortnightly random review) |
| E7 | Build autonomy graduation ceremony (evidence dashboard + confirmation) |
| E8 | Implement Level 3 tactical actions (stakeholder email, Jira updates via hold queue) |
| E9 | Build Sonnet reasoning path for complex multi-source signals |
| E10 | Implement prompt injection defence (two-stage sanitisation) |
| E11 | Build project detail view (artefact viewer with diff against previous_version) |
| E12 | Build settings view (integration config, autonomy dial, budget status) |

### Deferred (not in MVP)

- Asana integration
- MS Teams integration
- Level 4 (Strategic) autonomy
- Automated learning loop
- Webhook-first architecture
- Dark mode
- Mobile responsive design
- Analytics dashboard beyond basic stats
- Backlog artefact (full, not summary)
- Project archival workflow
- n8n evaluation (worth a spike but not committed)

---

## 11. Risk Register

### Critical (halt implementation if unresolved)

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Azure AD admin consent unavailable → no Outlook | Fallback: Jira-only MVP + Resend notifications. Still viable for artefact generation. |
| 2 | LLM budget exceeded despite controls | Degradation ladder (section 6.3). Hard ceiling with monitoring-only fallback. |
| 3 | Claude tool-use produces invalid artefact JSON | Schema validation on every response. Retry once on failure. Fall back to previous_version. |
| 4 | Neon 0.5 GB exhausted | Aggressive retention policy (section 4.3). Monitor weekly. Alert at 80%. |

### Significant (address during development)

| # | Risk | Mitigation |
|---|------|-----------|
| 5 | Prompt injection via Jira/email content | Two-stage triage (section 9.1). Outbound action allowlist. |
| 6 | Agent crashes silently, dashboard shows stale "healthy" state | Heartbeat logging. Dashboard reads last heartbeat, not a frontend timer. Alert via Resend if no heartbeat for 30 minutes. |
| 7 | Neon cold starts cause Vercel function timeouts | Static shell pattern. Keepalive from agent. No SSR for dashboard data. |
| 8 | User stops reviewing daily digest (automation complacency) | Anti-complacency spot checks every 2 weeks. |
| 9 | Scope creep during development | Kill threshold defined. Deferred list is explicit. |

### Watch

| # | Risk | Notes |
|---|------|-------|
| 10 | Jira API rate limits | Monitor. Current free tier allows 100 requests/minute — sufficient for 15-min polling. |
| 11 | Competitive landscape (Jira Rovo, Asana AI) | Unique value is cross-platform synthesis. Monitor competitor features quarterly. |
| 12 | Claude API pricing changes | Budget model assumes current pricing. Re-validate quarterly. |
| 13 | Hetzner VPS availability | Single point of failure. Acceptable for personal tool. Backup: redeploy to another provider in <1 hour. |

---

## 12. Testing Strategy

### Unit tests

- Context assembly module (deterministic, no LLM)
- Signal normalisation (deterministic)
- Decision boundary checks (deterministic)
- Confidence scoring (deterministic)
- Artefact schema validation (deterministic)
- Budget control logic (deterministic)

### Integration tests

- Each SignalSource implementation against mocked API responses
- Database operations (use Neon branch)
- Resend email sending (use test mode)

### Evaluation tests (LLM quality)

Build 10 golden scenarios (real Jira data snapshots + expected agent behaviour). Run each scenario 5 times. Assert:

- Signal classification accuracy ≥ 90% across runs
- Artefact updates match expected structure 100%
- No hallucinated actions (actions not supported by input signals)

Expand to 30 scenarios post-MVP as real usage data accumulates.

### Dry-run mode

The agent's dry-run mode (C7) serves triple duty:
1. **Development tool:** Test the full pipeline without side effects
2. **Level 1 implementation:** Monitoring-only mode is just dry-run that's always on
3. **Trust building:** User can see what the agent *would* do before enabling it

---

## Appendix A: File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `SPEC.md` | **Active — source of truth** | This document |
| `CLAUDE.md` | Active | Project instructions for Claude Code |
| `REVIEW-product-ideation.md` | Reference | 29-specialist product review |
| `ANALYSIS-review-synthesis.md` | Reference | Synthesised analysis of the review |
| `analysis-outputs/*.md` | Reference | Raw analysis outputs (7 files) |
| `# Fully Agentic PM Workbench - Complete .md` | **Superseded** | Original spec — do not use for implementation decisions |
| `Original-Cloud-Hosting-Spec.md` | **Superseded** | Original cloud/UI spec — do not use |
| `PLAN-consolidated-spec.md` | **Superseded** | Plan for consolidation — now complete |

## Appendix B: Spike Definitions

### S1: Artefact generation quality

**Question:** Can Claude reliably generate structured artefacts via tool-use from real Jira data?
**Method:** Export 5 real Jira sprint snapshots. Define tool schemas matching section 4.2. Call Claude (Haiku) with each snapshot. Validate output against schema. Run 3 times each.
**Pass criteria:** 100% schema-valid outputs. Subjective quality review: are the artefacts useful?
**Effort:** 1-2 days.

### S2: Token usage measurement

**Question:** What is actual monthly cost at current pricing with real prompts?
**Method:** Build representative prompts (system prompt + artefact context + signal batch). Measure token counts. Multiply by pricing. Compare against section 6.2 estimates.
**Pass criteria:** Estimated monthly cost ≤ $8 with change detection gate.
**Effort:** 1 day.

### S3: Microsoft Graph API access

**Question:** Can you get application permissions for Mail.Read and Mail.Send?
**Method:** Register Azure AD app. Request permissions. Attempt admin consent. Test delta query on mailbox.
**Pass criteria:** Successfully read email via delta query and send test email.
**Effort:** 1-2 days.

### S4: Neon free tier performance

**Question:** What is cold start latency under the agent's actual access pattern?
**Method:** Create schema on Neon free tier. Simulate agent access pattern (query every 15 min for 24 hours, then with 4-min keepalive). Measure latency distribution.
**Pass criteria:** P95 query latency < 500ms with keepalive. Understand cold start behaviour without keepalive.
**Effort:** 1 day.

### S5: n8n evaluation

**Question:** Does n8n meaningfully reduce integration development time?
**Method:** Install n8n on local machine. Build Jira polling + signal extraction workflow. Compare effort vs custom TypeScript. Evaluate: can n8n trigger custom code for the reasoning layer?
**Pass criteria:** If n8n saves ≥ 2 weeks of integration work and doesn't constrain the architecture, adopt it.
**Effort:** 4 hours.
