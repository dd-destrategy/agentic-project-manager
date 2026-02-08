# Vercel Architecture — Triggers, Crons & Workflows

> Reimagining the Agentic PM Workbench on Vercel. The interface and agent don't
> run 24/7 — we fill that need with triggers and crons.

## 1. Motivation

The current AWS architecture works, but carries operational weight
disproportionate to what is ultimately a single-user personal tool:

| Concern                    | AWS (current)                             | Vercel (proposed)                  |
| -------------------------- | ----------------------------------------- | ---------------------------------- |
| Infrastructure definition  | AWS CDK — 3 stacks, ~800 lines of IaC     | Zero IaC — framework-defined infra |
| Deployment                 | CDK synth → CloudFormation → Lambda + SFn | `git push` → deployed             |
| Orchestration              | Step Functions state machine (JSON ASL)   | Vercel Workflow (`'use workflow'`) |
| Scheduling                 | EventBridge Scheduler                     | Vercel Cron Jobs (`vercel.json`)  |
| Secrets                    | AWS Secrets Manager ($2/month, 4 secrets) | Vercel Environment Variables       |
| Observability              | CloudWatch Logs + X-Ray                   | Vercel dashboard (logs, traces)   |
| Database                   | DynamoDB single-table design              | Neon Postgres (relational, JSONB) |
| Email                      | Amazon SES                                | Resend (Vercel ecosystem)         |
| IAM / security boundaries  | 3 IAM roles, explicit DENY policies       | Function-level isolation           |
| Services to reason about   | 9 (Lambda, SFn, DynamoDB, SES, SM, EB, CW, KMS, SQS) | 3 (Vercel, Neon, Resend) |

The agent runs for 5–10 minutes every 15 minutes, then sleeps. The dashboard
sees a handful of requests per day. Neither workload justifies managing nine AWS
services. Vercel's serverless primitives — cron jobs, durable workflows, and
serverless functions — are purpose-built for this pattern.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VERCEL PLATFORM                             │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐   │
│  │  Next.js App  │   │  Vercel Cron Jobs │   │  Jira Webhook     │   │
│  │  (Dashboard)  │   │                  │   │  (push trigger)   │   │
│  │              │   │  */15 * * * *    │   │                   │   │
│  │  SSR + API   │   │  agent cycle     │   │  POST /api/       │   │
│  │  Routes      │   │                  │   │  webhooks/jira    │   │
│  │              │   │  * * * * *       │   │                   │   │
│  │              │   │  hold queue      │   │                   │   │
│  │              │   │                  │   │                   │   │
│  │              │   │  0 8 * * 1-5     │   │                   │   │
│  │              │   │  daily digest    │   │                   │   │
│  └──────┬───────┘   └────────┬─────────┘   └────────┬──────────┘   │
│         │                    │                       │              │
│         ▼                    ▼                       ▼              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Vercel Workflow (WDK)                       │   │
│  │                                                              │   │
│  │  'use workflow'  ──►  Agent Cycle Workflow                   │   │
│  │                                                              │   │
│  │    Step 1: heartbeat       (health + budget check)           │   │
│  │    Step 2: detectChanges   (poll Jira/Outlook delta)         │   │
│  │    Step 3: normalise       (raw → NormalisedSignal)          │   │
│  │    Step 4: sanitise        (prompt injection defence)        │   │
│  │    Step 5: classify        (route signals)                   │   │
│  │    Step 6: reason          (Sonnet, if complex)              │   │
│  │    Step 7: execute         (actions + hold queue)            │   │
│  │    Step 8: updateArtefacts (RAID, delivery state, etc.)      │   │
│  │                                                              │   │
│  │  'use workflow'  ──►  Hold Queue Workflow                    │   │
│  │    Step 1: queryExpired    (held actions past heldUntil)     │   │
│  │    Step 2: executeActions  (send emails, Jira transitions)   │   │
│  │    Step 3: updateGraduation (consecutive approval tracking)  │   │
│  │                                                              │   │
│  │  'use workflow'  ──►  Housekeeping Workflow                  │   │
│  │    Step 1: gatherStats     (cycles, signals, budget)         │   │
│  │    Step 2: auditCoherence  (artefact consistency)            │   │
│  │    Step 3: sendDigest      (HTML email via Resend)           │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌──────────────┐ ┌─────────────┐ ┌─────────────┐
     │ Neon Postgres │ │   Resend    │ │  Claude API │
     │  (database)   │ │  (email)    │ │  (LLM)      │
     │  Free tier    │ │  Free tier  │ │  Haiku 70%  │
     │  0.5 GB       │ │  3K/month   │ │  Sonnet 30% │
     └──────────────┘ └─────────────┘ └─────────────┘
```

---

## 3. Vercel Cron Jobs — The Heartbeat

Three cron jobs replace EventBridge Scheduler. Defined in `vercel.json`:

```jsonc
{
  "crons": [
    {
      "path": "/api/cron/agent-cycle",
      "schedule": "*/15 * * * *"       // Every 15 minutes
    },
    {
      "path": "/api/cron/hold-queue",
      "schedule": "* * * * *"           // Every minute
    },
    {
      "path": "/api/cron/housekeeping",
      "schedule": "0 8 * * 1-5"         // 08:00 UTC weekdays
    }
  ]
}
```

Each cron endpoint is a standard Next.js API route that triggers a Vercel
Workflow run. The cron handler validates `CRON_SECRET`, starts the workflow, and
returns immediately — the workflow executes durably in the background.

```typescript
// app/api/cron/agent-cycle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { agentCycleWorkflow } from '@/workflows/agent-cycle';

export async function GET(req: NextRequest) {
  // Vercel injects CRON_SECRET for authentication
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const run = await agentCycleWorkflow();
  return NextResponse.json({ status: 'triggered', runId: run.id });
}
```

### Plan requirements

| Cron job        | Frequency  | Hobby | Pro |
| --------------- | ---------- | ----- | --- |
| Agent cycle     | */15 min   | No (daily only) | Yes |
| Hold queue      | */1 min    | No    | Yes |
| Housekeeping    | Daily 8am  | Yes   | Yes |

**Verdict:** Pro plan ($20/month) required for minute-level and 15-minute crons.
Hobby is limited to 2 cron jobs at once-per-day frequency.

---

## 4. Vercel Workflow — Replacing Step Functions

The Workflow Development Kit (WDK) replaces AWS Step Functions entirely. Instead
of a JSON state machine definition, the orchestration is TypeScript with two
directives: `'use workflow'` and `'use step'`.

### 4.1 Agent Cycle Workflow

```typescript
// app/workflows/agent-cycle.ts
import { sleep } from 'workflow';

export async function agentCycleWorkflow() {
  'use workflow';

  // Step 1 — Heartbeat: health checks + budget status
  const heartbeat = await checkHeartbeat();

  if (heartbeat.budgetExhausted) {
    await logEvent('budget_exhausted', heartbeat);
    return { status: 'skipped', reason: 'budget_ceiling' };
  }

  // Step 2 — Change Detection: poll integrations for deltas
  const changes = await detectChanges(heartbeat.activeProjects);

  if (!changes.hasChanges) {
    await logEvent('no_changes', { projects: heartbeat.activeProjects.length });
    return { status: 'completed', reason: 'no_changes' };
  }

  // Step 3 — Normalise: raw API responses → NormalisedSignal[]
  const signals = await normaliseSignals(changes.rawSignals);

  // Step 4 — Sanitise: prompt injection defence
  const sanitised = await sanitiseSignals(signals);

  // Step 5 — Classify: route each signal
  const classified = await classifySignals(sanitised);

  // Step 6 — Reasoning: complex signals get Sonnet treatment
  const reasoned = await reasonIfNeeded(classified);

  // Step 7 — Execute: actions, hold queue, escalations
  const executed = await executeActions(reasoned);

  // Step 8 — Artefact updates: RAID log, delivery state, etc.
  await updateArtefacts(executed);

  return { status: 'completed', signalsProcessed: signals.length };
}
```

Each called function is a **step** — an isolated, retryable unit of work:

```typescript
// app/workflows/steps/detect-changes.ts
import { db } from '@/lib/db';
import { jiraClient } from '@/lib/integrations/jira';

export async function detectChanges(activeProjects: Project[]) {
  'use step';

  const allSignals: RawSignal[] = [];

  for (const project of activeProjects) {
    const checkpoint = await db.checkpoint.get(project.id, 'jira');
    const { signals, newCheckpoint } = await jiraClient.fetchDelta(
      checkpoint?.value ?? null,
      project.sourceProjectKey,
    );

    if (signals.length > 0) {
      allSignals.push(...signals);
      await db.checkpoint.upsert(project.id, 'jira', newCheckpoint);
    }
  }

  return {
    hasChanges: allSignals.length > 0,
    rawSignals: allSignals,
  };
}
```

### 4.2 Hold Queue Workflow

```typescript
// app/workflows/hold-queue.ts
export async function holdQueueWorkflow() {
  'use workflow';

  const expired = await queryExpiredActions();

  if (expired.length === 0) {
    return { status: 'empty' };
  }

  const results = await executeHeldActions(expired);
  await updateGraduationState(results);

  return { status: 'processed', count: expired.length };
}
```

### 4.3 Housekeeping Workflow

```typescript
// app/workflows/housekeeping.ts
export async function housekeepingWorkflow() {
  'use workflow';

  const stats = await gatherDailyStats();
  const audit = await runCoherenceAudit();
  await sendDailyDigest(stats, audit);

  return { status: 'sent' };
}
```

### Why Workflow over raw serverless functions

| Concern              | Raw Vercel Functions            | Vercel Workflow                  |
| -------------------- | ------------------------------- | -------------------------------- |
| Timeout              | 5 min max (Pro)                 | No limit — steps chain durably   |
| Failure recovery     | Manual retry logic              | Automatic per-step retry         |
| State between steps  | Must persist to DB manually     | Framework-managed event log      |
| Observability        | Custom logging                  | Built-in run traces in dashboard |
| Cost on failure      | Re-run entire pipeline          | Resume from failed step only     |

The agent cycle can take 5–10 minutes end-to-end. A single Vercel Function
would hit the 5-minute Pro timeout. Workflow breaks this into steps that each
run within limits, with the framework managing handoff between them.

---

## 5. Event-Driven Triggers — Jira Webhooks

The current architecture polls Jira every 15 minutes. On Vercel, we can
**also** accept Jira webhooks for near-real-time response:

```typescript
// app/api/webhooks/jira/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyJiraWebhook } from '@/lib/integrations/jira';
import { agentCycleWorkflow } from '@/workflows/agent-cycle';

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!verifyJiraWebhook(body, req.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Store the raw event, then trigger the workflow
  await db.event.create({
    type: 'jira_webhook',
    payload: body,
    receivedAt: new Date().toISOString(),
  });

  const run = await agentCycleWorkflow();

  return NextResponse.json({ status: 'accepted', runId: run.id });
}
```

This creates a **dual-trigger model**:

```
                    ┌──────────────────────┐
  Cron (*/15 min) ──►                      │
                    │  Agent Cycle Workflow  │
  Jira Webhook   ──►                      │
                    └──────────────────────┘
```

- **Cron** guarantees the agent runs at least every 15 minutes (catches anything
  webhooks missed, handles Outlook polling, runs housekeeping checks)
- **Webhooks** provide near-instant response to Jira changes (issue updated,
  comment added, status changed)
- The change detection step is idempotent — duplicate triggers are harmless
  because checkpoints prevent reprocessing

---

## 6. Database — Neon Postgres Replaces DynamoDB

The current DynamoDB single-table design served the serverless constraint, but
the PM domain is inherently relational. Neon Postgres (serverless, free tier
via Vercel Marketplace) is a better fit.

### 6.1 Schema

```sql
-- Projects
CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  source_key    TEXT,              -- e.g. Jira project key "MCU"
  status        TEXT NOT NULL DEFAULT 'active',
  autonomy_tier INTEGER NOT NULL DEFAULT 0,
  config        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PM Artefacts (RAID log, delivery state, backlog summary, decision log)
CREATE TABLE artefacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  type            TEXT NOT NULL,    -- 'delivery_state' | 'raid_log' | 'backlog_summary' | 'decision_log'
  content         JSONB NOT NULL,
  previous_version JSONB,           -- one-deep undo
  version         INTEGER NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, type)
);

-- Activity events
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  type        TEXT NOT NULL,
  summary     TEXT,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_project_date ON events(project_id, created_at DESC);
CREATE INDEX idx_events_type ON events(type, created_at DESC);

-- Escalations
CREATE TABLE escalations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id),
  status       TEXT NOT NULL DEFAULT 'pending',
  signal_type  TEXT NOT NULL,
  summary      TEXT NOT NULL,
  context      JSONB NOT NULL DEFAULT '{}',
  decision     JSONB,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);
CREATE INDEX idx_escalations_pending ON escalations(status) WHERE status = 'pending';

-- Held actions (draft-then-send queue)
CREATE TABLE held_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id),
  action_type  TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'held',     -- 'held' | 'approved' | 'cancelled' | 'executed'
  held_until   TIMESTAMPTZ NOT NULL,
  executed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_held_pending ON held_actions(held_until) WHERE status = 'held';

-- Integration checkpoints (last sync timestamps / delta tokens)
CREATE TABLE checkpoints (
  project_id      UUID NOT NULL REFERENCES projects(id),
  integration     TEXT NOT NULL,       -- 'jira' | 'outlook'
  checkpoint_key  TEXT NOT NULL,
  checkpoint_val  TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, integration, checkpoint_key)
);

-- Agent configuration
CREATE TABLE agent_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integration credentials & health
CREATE TABLE integrations (
  name        TEXT PRIMARY KEY,       -- 'jira' | 'outlook' | 'ses'
  config      JSONB NOT NULL,         -- encrypted at rest by Neon
  health      JSONB NOT NULL DEFAULT '{"status": "unknown"}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Graduation state
CREATE TABLE graduation_state (
  project_id          UUID PRIMARY KEY REFERENCES projects(id),
  current_tier        INTEGER NOT NULL DEFAULT 0,
  consecutive_approvals INTEGER NOT NULL DEFAULT 0,
  evidence            JSONB NOT NULL DEFAULT '[]',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingestion sessions (PM Copilot)
CREATE TABLE ingestion_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  status      TEXT NOT NULL DEFAULT 'active',
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extracted items (from ingestion)
CREATE TABLE extracted_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES ingestion_sessions(id),
  project_id  UUID REFERENCES projects(id),
  type        TEXT NOT NULL,
  content     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'applied' | 'dismissed'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stakeholders
CREATE TABLE stakeholders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 Why Postgres over DynamoDB

| Concern                  | DynamoDB (current)                          | Neon Postgres (proposed)            |
| ------------------------ | ------------------------------------------- | ----------------------------------- |
| Query flexibility        | PK/SK + GSI only — limited ad-hoc queries   | Full SQL — any query, any join      |
| Artefact content         | Stored as opaque DynamoDB map               | JSONB with indexing and operators   |
| Cross-entity queries     | Requires GSI per access pattern             | Standard JOINs                     |
| Schema evolution         | Manual attribute management                 | Migrations with Drizzle ORM        |
| Local development        | DynamoDB Local (Docker)                     | Neon branching or local Postgres   |
| Cost                     | ~$0.25/month on-demand                      | $0 (free tier: 0.5 GB, 190 hrs)   |
| Connection model         | HTTP API (no connection pooling needed)      | Serverless driver (HTTP, no pool)  |
| Tooling                  | AWS SDK v3, no ORM                          | Drizzle ORM, type-safe queries     |

### 6.3 ORM — Drizzle

Drizzle provides type-safe queries with zero runtime overhead. It generates SQL
at build time and works natively with Neon's serverless driver:

```typescript
// lib/db/schema.ts
import { pgTable, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sourceKey: text('source_key'),
  status: text('status').notNull().default('active'),
  autonomyTier: integer('autonomy_tier').notNull().default(0),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// lib/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

---

## 7. Secrets — Vercel Environment Variables

AWS Secrets Manager ($2/month for 4 secrets) is replaced by Vercel's encrypted
environment variables at zero cost:

| Secret                    | Vercel env var            | Scope       |
| ------------------------- | ------------------------- | ----------- |
| Claude API key            | `ANTHROPIC_API_KEY`       | Production  |
| Jira API token            | `JIRA_API_TOKEN`          | Production  |
| Jira base URL             | `JIRA_BASE_URL`           | All         |
| Jira email                | `JIRA_EMAIL`              | All         |
| Graph API credentials     | `GRAPH_*` (3 vars)        | Production  |
| NextAuth secret           | `NEXTAUTH_SECRET`         | Production  |
| NextAuth password         | `NEXTAUTH_PASSWORD`       | Production  |
| Resend API key            | `RESEND_API_KEY`          | Production  |
| Cron secret               | `CRON_SECRET`             | Production  |
| Database URL              | `DATABASE_URL`            | All (auto)  |

Vercel encrypts environment variables at rest and injects them at runtime.
The Neon integration auto-provisions `DATABASE_URL` when you connect via the
Vercel Marketplace.

---

## 8. Email — Resend Replaces SES

Amazon SES requires domain verification, IAM credentials, and sandbox exit
requests. Resend is built for the Vercel ecosystem:

| Concern          | SES (current)                   | Resend (proposed)              |
| ---------------- | ------------------------------- | ------------------------------ |
| Setup            | Verify domain, exit sandbox     | API key, verify domain         |
| SDK              | AWS SDK v3 `@aws-sdk/client-ses` | `resend` npm package           |
| Free tier        | 62K emails/month                | 3K emails/month (100/day)     |
| Dashboard        | CloudWatch                      | Resend dashboard (logs, stats) |
| Cost             | ~$0                             | $0 (free tier is sufficient)   |
| Vercel integration | Manual env vars               | Marketplace integration        |

For a single-user tool sending 1 daily digest + occasional notifications, the
free tier (3,000 emails/month) is more than sufficient.

```typescript
// lib/integrations/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDigestEmail(html: string, text: string) {
  'use step';

  await resend.emails.send({
    from: 'Agentic PM <pm@yourdomain.com>',
    to: process.env.DIGEST_EMAIL!,
    subject: `Daily Digest — ${new Date().toLocaleDateString('en-GB')}`,
    html,
    text,
  });
}
```

---

## 9. Security Model — Adapted for Vercel

### 9.1 Prompt injection defence

The two-stage triage isolation transfers directly. On AWS, this was enforced by
separate IAM roles. On Vercel, isolation is achieved by **never importing
integration clients in triage steps**:

```typescript
// Triage steps — NO access to Jira/email/Resend clients
async function sanitiseSignals(signals: NormalisedSignal[]) {
  'use step';
  // Only imports: Claude client + sanitisation logic
  // Cannot import jiraClient, resend, or outbound integrations
  const claude = createClaudeClient(); // uses ANTHROPIC_API_KEY only
  return await Promise.all(signals.map(s => claude.sanitise(s)));
}
```

This is a **code-level isolation boundary** rather than IAM-level. For a
single-user personal tool, this is proportionate — an attacker who can modify
the deployed code already has full access.

### 9.2 Cron authentication

Vercel injects a `CRON_SECRET` environment variable. Cron routes verify this
to prevent external invocation:

```typescript
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
}
```

### 9.3 Webhook verification

Jira webhooks are verified using the shared secret configured in Jira's webhook
settings.

### 9.4 Database encryption

Neon encrypts data at rest (AES-256) and in transit (TLS). Sensitive integration
credentials stored in the `integrations` table are additionally encrypted at the
application level using `ENCRYPTION_KEY` from environment variables.

---

## 10. Project Structure — Simplified

The current monorepo has 3 packages (`web`, `core`, `lambdas`) plus CDK. On
Vercel, the lambdas and CDK packages disappear — everything collapses into the
Next.js application:

```
agentic-project-manager/
├── app/
│   ├── (dashboard)/              # Existing pages (unchanged)
│   │   ├── page.tsx              # Mission Control
│   │   ├── escalations/
│   │   ├── projects/[id]/
│   │   ├── pending/
│   │   ├── settings/
│   │   ├── ingest/
│   │   ├── copilot/
│   │   └── ...
│   ├── api/
│   │   ├── cron/                 # Cron job endpoints
│   │   │   ├── agent-cycle/route.ts
│   │   │   ├── hold-queue/route.ts
│   │   │   └── housekeeping/route.ts
│   │   ├── webhooks/             # External triggers
│   │   │   └── jira/route.ts
│   │   ├── projects/             # Existing API routes
│   │   ├── escalations/
│   │   ├── artefacts/
│   │   └── ...
│   └── workflows/                # Vercel Workflow definitions
│       ├── agent-cycle.ts
│       ├── hold-queue.ts
│       ├── housekeeping.ts
│       └── steps/
│           ├── heartbeat.ts
│           ├── detect-changes.ts
│           ├── normalise.ts
│           ├── sanitise.ts
│           ├── classify.ts
│           ├── reason.ts
│           ├── execute.ts
│           └── update-artefacts.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── index.ts              # Neon connection
│   │   └── migrations/           # Drizzle migrations
│   ├── integrations/
│   │   ├── jira.ts
│   │   ├── outlook.ts
│   │   └── email.ts              # Resend
│   ├── llm/
│   │   ├── claude.ts
│   │   └── budget.ts
│   ├── artefacts/
│   ├── signals/
│   ├── triage/
│   └── types/
├── components/                   # Existing UI (unchanged)
├── drizzle.config.ts
├── vercel.json                   # Cron definitions
├── package.json
└── tsconfig.json
```

**What's gone:**
- `packages/cdk/` — no infrastructure to define
- `packages/lambdas/` — logic moves to `app/workflows/steps/`
- `packages/core/` — logic moves to `lib/`
- Turborepo / pnpm workspaces — single package

**What's new:**
- `app/workflows/` — Vercel Workflow definitions
- `app/api/cron/` — cron job endpoints
- `app/api/webhooks/` — external trigger endpoints
- `lib/db/schema.ts` — Drizzle ORM schema
- `drizzle.config.ts` — migration config

---

## 11. Cost Comparison

### Vercel Pro + ecosystem

| Service              | Monthly cost | Notes                                      |
| -------------------- | ------------ | ------------------------------------------ |
| Vercel Pro           | $20.00       | Hosting, functions, crons, observability   |
| Neon Postgres        | $0.00        | Free tier (0.5 GB storage, 190 hrs)        |
| Resend               | $0.00        | Free tier (3K emails/month)                |
| Claude API           | $5.84        | Haiku 70% / Sonnet 30% (unchanged)        |
| **Total**            | **$25.84**   |                                            |

### Compared to current AWS

| Service              | Monthly cost |
| -------------------- | ------------ |
| AWS (9 services)     | $11–13       |
| Claude API           | $5.84        |
| **Total**            | **$17–19**   |

### The trade-off

Vercel Pro costs ~$8–9 more per month than the AWS setup. In return:

- **Zero IaC** — no CDK stacks, no CloudFormation, no IAM policies
- **Single deployment target** — `git push` deploys everything
- **3 external services** instead of 9
- **Built-in observability** — workflow traces, function logs, cron history
- **Faster iteration** — no CDK synth/deploy cycle
- **Preview deployments** — every PR gets a full preview environment
- **Local development** — `vercel dev` runs everything locally

For a personal tool where the builder's time is the scarcest resource, the
simplification is worth the premium.

### Hobby plan variant (budget-constrained)

If $25/month is too steep, a Hobby-compatible variant is possible with
compromises:

| Approach                                   | Trade-off                              |
| ------------------------------------------ | -------------------------------------- |
| Use Jira webhooks only (no polling cron)   | No Outlook polling, miss webhook gaps  |
| GitHub Actions for 15-min cron trigger     | External dependency, free tier limits  |
| Single daily cron for housekeeping         | Works on Hobby's 2-cron limit          |
| Hold queue checked hourly not per-minute   | Slower action execution (acceptable?)  |

**Hobby variant cost: ~$5.84/month** (Claude API only). But this sacrifices the
reliability and operational simplicity that makes the Pro plan worthwhile.

---

## 12. Migration Path

The migration from AWS to Vercel is incremental. The core business logic
(`@agentic-pm/core`) is already platform-agnostic TypeScript.

### Phase 1 — Database migration

1. Define Drizzle schema matching current DynamoDB entities
2. Run initial migration on Neon
3. Write data migration script (DynamoDB → Postgres)
4. Update repository layer to use Drizzle queries

### Phase 2 — Workflow migration

1. Create Vercel Workflow definitions mirroring Step Functions flow
2. Move Lambda handler logic into workflow steps
3. Replace SES calls with Resend
4. Replace Secrets Manager reads with `process.env`

### Phase 3 — Deployment switch

1. Configure `vercel.json` with cron definitions
2. Set up Jira webhook pointing to Vercel deployment
3. Set environment variables in Vercel dashboard
4. Deploy and verify agent cycle runs correctly
5. Decommission AWS infrastructure (CDK destroy)

### Phase 4 — Simplify project structure

1. Flatten monorepo into single Next.js application
2. Remove CDK, Lambda, and Turborepo configuration
3. Update tests to run against Postgres (Neon branching or local)
4. Update CI/CD to Vercel's GitHub integration

---

## 13. Open Questions

| # | Question                                             | Recommendation                          |
|---|------------------------------------------------------|-----------------------------------------|
| 1 | Vercel Workflow is in beta — production-ready?       | Evaluate stability during Phase 2       |
| 2 | Pro plan exceeds $15/month budget ceiling            | Accept trade-off or use Hobby variant   |
| 3 | Neon free tier 190 compute-hours sufficient?         | Yes — serverless scales to zero         |
| 4 | Outlook Graph API polling in Vercel Functions?       | Same HTTP calls, no platform dependency |
| 5 | Function timeout for Sonnet reasoning (300s)?        | Workflow steps avoid single-function timeout |
| 6 | Jira webhook reliability vs polling?                 | Dual model (webhook + cron fallback)    |

---

## 14. Decision

**Recommended:** Proceed with Vercel Pro architecture. The ~$9/month premium
over AWS buys a dramatically simpler operational model — one platform, one
deployment, one dashboard — appropriate for a personal tool where the builder's
time matters most.

The current AWS architecture is well-engineered but over-provisioned for the
workload. Nine services, three CDK stacks, and IAM policy management are
enterprise patterns applied to a single-user tool. Vercel's opinionated platform
absorbs this complexity into the framework.
