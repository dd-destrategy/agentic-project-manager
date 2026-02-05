# Agentic PM Workbench — Implementation Specification

> **Status:** Implementation-ready. This document is the single source of truth.
> **Supersedes:** `# Fully Agentic PM Workbench - Complete .md`, `Original-Cloud-Hosting-Spec.md`, `PLAN-consolidated-spec.md`
> **Last updated:** February 2026
> **Architecture:** AWS Serverless (Step Functions + Lambda + DynamoDB)

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
| Budget ceiling | $15/month total | Infrastructure (~$5-8) + LLM (~$7) |
| Active projects | 1-2 at a time | Scope control |

**Note:** Database storage constraint removed. DynamoDB on-demand scales automatically within budget; no fixed storage ceiling required.

---

## 2. Locked Decisions

All architectural and technology decisions are final. Do not revisit unless a blocking issue is discovered during implementation.

### Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend hosting | AWS Amplify Hosting (~$0.50/month) | Static/SSR hosting, integrated with AWS ecosystem, significantly cheaper than Vercel Pro |
| Agent runtime | AWS Step Functions + Lambda | Serverless orchestration, no server management, pay-per-use, built-in retry/error handling |
| Scheduling | EventBridge Scheduler | 15-min main cycle, 1-min hold queue check; native AWS integration |
| Database | DynamoDB (on-demand, ~$0.25/month) | Single-table design, serverless, no cold starts, scales to zero |
| Secrets management | AWS Secrets Manager (~$2/month) | Secure credential storage, automatic rotation support, native Lambda integration |
| Frontend framework | Next.js (App Router) | Locked in CLAUDE.md; deployed via Amplify |
| UI components | shadcn/ui | Unstyled, composable, no runtime cost |
| Language | TypeScript (strict mode) | All application code |
| Auth | NextAuth.js + Credentials provider | Single user — simplest session management with CSRF protection |
| Logging/Monitoring | CloudWatch (~$1-2/month) | Unified logging for Lambda, Step Functions, and application metrics |
| Spelling | British English | User is Australian |

### Integrations

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP integrations | Jira Cloud + Outlook (via Graph API) | Minimum for cross-source value |
| Phase 2 integration | Asana | Add when second project needs it |
| MS Teams | **Deferred indefinitely** | Requires Azure AD admin consent; read-only monitoring adds limited value relative to setup cost |
| Agent-to-user notifications | Amazon SES (free tier, 62,000 emails/month) | AWS-native, generous free tier, breaks circular dependency between daily digest and Outlook integration |
| Jira variant | Cloud only | No Server/Data Center support |
| Polling strategy | Polling-first via EventBridge | Webhooks deferred; API Gateway ready for future webhook support |
| Graph API pattern | Delta queries | Not timestamp-based polling. Delta queries eliminate missed-message and duplicate-processing bugs |

### Agent design

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestration | Step Functions Standard Workflows | Visual state machine, built-in retry/catch, execution history, long-running support |
| Compute | Lambda (outside VPC) | No NAT Gateway costs; direct internet access for external APIs |
| LLM output parsing | Claude tool-use (function calling) | No raw JSON.parse on free-text responses |
| Confidence scoring | Structured multi-dimensional | Not LLM self-reported confidence. Score: source agreement, action boundaries, schema validity, precedent match |
| Communication safety | Draft-then-send with hold queue | 30-min default hold, graduating down after consecutive approvals |
| Artefact versioning | Single `previousVersion` attribute | One-deep undo. Full version history not needed for personal tool |
| Agent state | DynamoDB items with atomic updates | Conditional writes prevent race conditions |
| Change detection gate | Required (first-class) | Check APIs for deltas before invoking LLM. Without this, budget is impossible |
| Local development | LocalStack + DynamoDB Local | Full offline development capability |
| Agent communication style | Impersonal active voice | No first-person in stakeholder-facing content. Dashboard uses active voice without "I" |
| Kill switch framing | "Autonomy dial" / mode selector | Not emergency stop language. Slider with labelled zones: Observe / Maintain / Act |

### Explicitly excluded

**Infrastructure:** VPS (Hetzner, DigitalOcean, etc.), Vercel, Neon PostgreSQL, NAT Gateway, Aurora Serverless, RDS, EC2, ECS/Fargate, ElastiCache, VPC for Lambda.

**Services:** Amazon Bedrock (direct Claude API preferred for cost/flexibility), Redis, Pinecone, Pusher, S3 (except for Amplify deployment artefacts), Vercel Blob, LangGraph.

**Features:** Multi-user auth, RBAC, Slack integration, GitHub integration, SharePoint, Calendar integration, mobile-specific builds, dark mode (MVP), i18n framework, animation library.

---

## 3. Architecture

```
YOU (browser)
  │
  ▼
┌─────────────────────────────────┐
│  AWS Amplify (~$0.50/month)     │
│  Next.js App Router (SSR)       │
│  - Dashboard (Mission Control)  │
│  - Activity feed                │
│  - Decision interface           │
│  - Project detail               │
│  - Settings                     │
│  - API routes → Lambda          │
└─────────────┬───────────────────┘
              │ reads + user writes
              │ (AWS SDK v3)
              ▼
┌─────────────────────────────────┐
│  DynamoDB (~$0.25/month)        │
│  Single-table design            │
│  On-demand capacity             │
│  - Projects, artefacts          │
│  - Agent actions log            │
│  - Escalations/decisions        │
│  - Events (activity feed)       │
│  - Agent checkpoints            │
│  - Integration configs          │
└─────────────┬───────────────────┘
              │ reads/writes (AWS SDK v3)
              ▼
┌─────────────────────────────────────────────────────┐
│  AWS Step Functions (~$1/month)                     │
│  Agent State Machine                                │
│                                                     │
│  EventBridge Scheduler                              │
│  ├─ 15-min: Main agent cycle                        │
│  └─ 1-min: Hold queue processor                     │
│                                                     │
│  Lambda Functions (outside VPC):                    │
│  ├─ change-detector     (Jira/Outlook delta check)  │
│  ├─ signal-normaliser   (transform raw signals)     │
│  ├─ triage-haiku        (sanitise + classify)       │
│  ├─ reasoning-sonnet    (complex decisions)         │
│  ├─ action-executor     (execute approved actions)  │
│  ├─ artefact-updater    (maintain PM artefacts)     │
│  ├─ hold-queue-checker  (process held items)        │
│  └─ housekeeping        (daily cleanup)             │
│                                                     │
│  External API calls:                                │
│  ├─ Claude API (Haiku 4.5 / Sonnet 4.5)             │
│  ├─ Jira Cloud API                                  │
│  ├─ MS Graph API (Outlook)                          │
│  └─ Amazon SES (notifications)                      │
└─────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  AWS Secrets Manager (~$2/mo)   │
│  - Claude API key               │
│  - Jira API token               │
│  - Azure AD credentials         │
│  - Encryption keys              │
└─────────────────────────────────┘
```

### Key architectural rules

1. **Lambda functions run OUTSIDE VPC.** This is critical for cost control. NAT Gateway costs ~$33/month — more than double the entire target budget. Lambda outside VPC has direct internet access for Claude API, Jira, and Graph API calls.

2. **Step Functions orchestrates, Lambda executes.** The state machine defines the agent loop logic (branching, retries, error handling). Each Lambda function is a discrete, testable unit of work.

3. **EventBridge Scheduler drives timing.** Two schedules: (a) 15-minute cycle triggers the main agent state machine, (b) 1-minute cycle triggers hold queue processor Lambda directly.

4. **DynamoDB single-table design.** All entities (projects, artefacts, events, actions, checkpoints, configs) share one table with composite keys. No joins needed — access patterns are predefined. No cold starts, no connection pooling complexity.

5. **Amplify reads from DynamoDB; user-initiated writes via API routes.** Step Functions owns all agent-initiated writes (artefacts, events, actions). Amplify API routes handle user decisions, config changes, and approvals.

6. **The events partition is the backbone for frontend-agent coordination.** It powers the activity feed, dashboard stats, and heartbeat signal from a single access pattern.

7. **Hybrid SSR pattern for frontend:** Server Components render initial page data for dashboard views (Mission Control, Activity, Project Detail). TanStack Query handles subsequent polling for real-time data (agent status, activity updates). Settings remains client-rendered.

8. **Secrets Manager for all credentials.** Lambda retrieves secrets at cold start, caches in memory for warm invocations. No credentials in environment variables or code.

### DynamoDB single-table design

| Entity | PK | SK | Example |
|--------|----|----|---------|
| Project | `PROJECT#<id>` | `METADATA` | `PK=PROJECT#abc, SK=METADATA` |
| Artefact | `PROJECT#<id>` | `ARTEFACT#<type>` | `PK=PROJECT#abc, SK=ARTEFACT#raid_log` |
| Event | `PROJECT#<id>` | `EVENT#<timestamp>#<id>` | `PK=PROJECT#abc, SK=EVENT#2026-02-05T10:30:00Z#xyz` |
| Escalation | `PROJECT#<id>` | `ESCALATION#<id>` | `PK=PROJECT#abc, SK=ESCALATION#def` |
| Agent Action | `PROJECT#<id>` | `ACTION#<timestamp>#<id>` | `PK=PROJECT#abc, SK=ACTION#2026-02-05T10:30:00Z#ghi` |
| Checkpoint | `PROJECT#<id>` | `CHECKPOINT#<integration>#<key>` | `PK=PROJECT#abc, SK=CHECKPOINT#jira#last_sync` |
| Config | `CONFIG` | `<key>` | `PK=CONFIG, SK=polling_interval_minutes` |
| Integration | `INTEGRATION` | `<name>` | `PK=INTEGRATION, SK=jira` |

**Global Secondary Index (GSI1):** For cross-project queries (all pending escalations, recent events across all projects).

| Entity | GSI1PK | GSI1SK |
|--------|--------|--------|
| Event | `EVENTS` | `<timestamp>#<project_id>` |
| Escalation (pending) | `ESCALATIONS#pending` | `<created_at>#<id>` |
| Agent Action (held) | `ACTIONS#held` | `<held_until>#<id>` |

### Database access strategy

| Component | Access method | Why |
|-----------|---------------|-----|
| Amplify (frontend) | AWS SDK v3 (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`) | Direct DynamoDB access, IAM auth via Amplify |
| Lambda (agent) | AWS SDK v3 (same) | Consistent access pattern, automatic credential handling |

**No connection pooling required.** DynamoDB is HTTP-based; each request is independent. No cold start latency for database connections (unlike PostgreSQL).

### Cost breakdown

| Service | Monthly estimate | Notes |
|---------|------------------|-------|
| Amplify Hosting | ~$0.50 | Build minutes + hosting; low traffic |
| Lambda | ~$0 | Free tier covers ~1M requests/month |
| Step Functions | ~$1.00 | ~2,900 executions/month (96/day × 30) |
| DynamoDB | ~$0.25 | On-demand pricing, minimal storage |
| Secrets Manager | ~$2.00 | 4 secrets × $0.40 + API calls |
| SES | ~$0 | Free tier for low volume |
| CloudWatch | ~$1-2 | Logs, metrics, alarms |
| Claude API | ~$7.00 | Per section 6 cost model |
| **Total** | **~$11-13** | Down from $35 ceiling |

---

## 4. Data Model

### 4.1 DynamoDB table schema

Single-table design with on-demand capacity. Table name: `AgenticPM`.

#### Key structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TABLE: AgenticPM                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ PK (Partition Key)        │ SK (Sort Key)              │ Entity Type        │
├───────────────────────────┼────────────────────────────┼────────────────────┤
│ PROJECT#<uuid>            │ METADATA                   │ Project            │
│ PROJECT#<uuid>            │ ARTEFACT#<type>            │ Artefact           │
│ PROJECT#<uuid>            │ EVENT#<timestamp>#<ulid>   │ Event              │
│ PROJECT#<uuid>            │ ESCALATION#<uuid>          │ Escalation         │
│ PROJECT#<uuid>            │ ACTION#<timestamp>#<ulid>  │ Agent Action       │
│ PROJECT#<uuid>            │ CHECKPOINT#<integ>#<key>   │ Agent Checkpoint   │
│ INTEGRATION#<name>        │ CONFIG                     │ Integration Config │
│ AGENT                     │ CONFIG#<key>               │ Agent Config       │
│ GLOBAL                    │ EVENT#<timestamp>#<ulid>   │ Global Event       │
└───────────────────────────┴────────────────────────────┴────────────────────┘
```

#### Entity definitions

**Project**

```
PK: PROJECT#<uuid>
SK: METADATA

Attributes:
  id             String (UUID)           Required
  name           String                  Required
  description    String                  Optional
  status         String                  Required, one of: active | paused | archived
  source         String                  Required, one of: jira | asana
  sourceProjectKey String                Required, e.g. "MCU" for Jira
  autonomyLevel  String                  Required, one of: monitoring | artefact | tactical
  config         Map                     Required, default: {}
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
  GSI1PK         String                  STATUS#<status>
  GSI1SK         String                  PROJECT#<uuid>
```

**Artefact**

```
PK: PROJECT#<uuid>
SK: ARTEFACT#<type>

Attributes:
  id             String (UUID)           Required
  projectId      String (UUID)           Required
  type           String                  Required, one of: delivery_state | raid_log | backlog_summary | decision_log
  content        Map                     Required, structured artefact data (see section 4.2)
  previousVersion Map                    Optional, one-deep undo
  version        Number                  Required, default: 1
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
```

**Event**

```
PK: PROJECT#<uuid>
SK: EVENT#<timestamp>#<ulid>

Attributes:
  id             String (ULID)           Required
  projectId      String (UUID)           Optional (null for global events)
  eventType      String                  Required, e.g. heartbeat | signal_detected | action_taken | escalation_created | artefact_updated | error
  severity       String                  Required, one of: info | warning | error | critical
  summary        String                  Required
  detail         Map                     Optional
  createdAt      String (ISO 8601)       Required
  TTL            Number (Unix epoch)     Required, createdAt + 30 days
  GSI1PK         String                  EVENT#<date>
  GSI1SK         String                  <timestamp>#<ulid>
```

**Escalation**

```
PK: PROJECT#<uuid>
SK: ESCALATION#<uuid>

Attributes:
  id             String (UUID)           Required
  projectId      String (UUID)           Required
  title          String                  Required
  context        Map                     Required, structured context for the decision
  options        List                    Required, array of options with pros/cons
  agentRecommendation String             Optional
  agentRationale String                  Optional
  status         String                  Required, one of: pending | decided | expired | superseded
  userDecision   String                  Optional
  userNotes      String                  Optional
  decidedAt      String (ISO 8601)       Optional
  createdAt      String (ISO 8601)       Required
  GSI1PK         String                  ESCALATION#<status>
  GSI1SK         String                  <timestamp>#<uuid>
```

**Agent Action**

```
PK: PROJECT#<uuid>
SK: ACTION#<timestamp>#<ulid>

Attributes:
  id             String (ULID)           Required
  projectId      String (UUID)           Optional
  actionType     String                  Required, e.g. artefact_update | email_sent | jira_update | escalation_created | notification_sent
  description    String                  Required
  detail         Map                     Optional
  confidence     Map                     Optional, structured confidence scores (see section 5.6)
  executed       Boolean                 Required, default: false
  heldUntil      String (ISO 8601)       Optional, for draft-then-send hold queue
  executedAt     String (ISO 8601)       Optional
  createdAt      String (ISO 8601)       Required
  TTL            Number (Unix epoch)     Required, createdAt + 90 days
```

**Agent Checkpoint**

```
PK: PROJECT#<uuid>
SK: CHECKPOINT#<integration>#<key>

Attributes:
  projectId      String (UUID)           Required
  integration    String                  Required, e.g. jira | outlook | asana
  checkpointKey  String                  Required, e.g. last_sync | delta_token
  checkpointValue String                 Required
  updatedAt      String (ISO 8601)       Required
```

**Integration Config**

```
PK: INTEGRATION#<name>
SK: CONFIG

Attributes:
  id             String (UUID)           Required
  integration    String                  Required, one of: jira | asana | outlook | ses
  configEncrypted String (Base64)        Required, KMS-encrypted credentials
  status         String                  Required, one of: active | inactive | error
  lastHealthCheck String (ISO 8601)      Optional
  createdAt      String (ISO 8601)       Required
  updatedAt      String (ISO 8601)       Required
```

**Agent Config**

```
PK: AGENT
SK: CONFIG#<key>

Attributes:
  key            String                  Required
  value          Any (String/Number/Map) Required
  updatedAt      String (ISO 8601)       Required

Default entries:
  CONFIG#polling_interval_minutes    → 15
  CONFIG#budget_ceiling_daily_usd    → 0.23
  CONFIG#hold_queue_minutes          → 30
  CONFIG#working_hours               → {"start": "08:00", "end": "18:00", "timezone": "Australia/Sydney"}
```

#### Global Secondary Index (GSI1)

```
┌─────────────────────────────────────────────────────────────────┐
│                           GSI1                                  │
├─────────────────────────────────────────────────────────────────┤
│ GSI1PK                        │ GSI1SK                          │
├───────────────────────────────┼─────────────────────────────────┤
│ STATUS#active                 │ PROJECT#<uuid>                  │
│ STATUS#paused                 │ PROJECT#<uuid>                  │
│ ESCALATION#pending            │ <timestamp>#<uuid>              │
│ ESCALATION#decided            │ <timestamp>#<uuid>              │
│ EVENT#2026-02-04              │ <timestamp>#<ulid>              │
└───────────────────────────────┴─────────────────────────────────┘

Projection: ALL (all attributes projected for full entity retrieval)
```

**GSI1 access patterns:**

| Access Pattern | Query |
|---------------|-------|
| Get pending escalations (global) | GSI1PK = `ESCALATION#pending` |
| Get active projects | GSI1PK = `STATUS#active` |
| Get events by date (global) | GSI1PK = `EVENT#<date>` |

#### TTL configuration

DynamoDB TTL automatically deletes expired items at no cost.

| Entity | TTL Attribute | Retention |
|--------|---------------|-----------|
| Event | `TTL` | 30 days from creation |
| Global Event Reference | `TTL` | 30 days from creation |
| Agent Action | `TTL` | 90 days from creation |

**TTL calculation:**
```typescript
const eventTTL = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);    // 30 days
const actionTTL = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);   // 90 days
```

### 4.2 Artefact JSON schemas

These schemas define the structured content stored in the artefact `content` attribute. The agent generates and maintains these via Claude tool-use.

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

DynamoDB on-demand pricing eliminates the fixed storage ceiling. Storage scales automatically with usage.

#### Projected storage

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| Projects + metadata | ~1 KB per project | Negligible at 1-2 projects |
| Artefacts (current + previous_version) | ~100 KB per artefact | 4 artefact types × 2 versions × ~12 KB each |
| Events (30-day window) | ~50 MB | TTL auto-expires; ~2000 events/month × 25 KB average |
| Agent actions (90-day window) | ~30 MB | TTL auto-expires; ~3000 actions/quarter × 10 KB average |
| Escalations | ~5 MB | Rarely large; accumulates over time |
| Checkpoints + configs | ~100 KB | Tiny, fixed overhead |
| GSI1 overhead | ~30 MB | Partial attribute projection |
| **Total projected** | **~120 MB** | Well under DynamoDB practical limits |

#### Monthly cost estimate

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| Storage | 0.12 GB × $0.25/GB | $0.03 |
| Write requests | ~50K × $1.25/million | $0.06 |
| Read requests | ~200K × $0.25/million | $0.05 |
| GSI storage | ~0.03 GB × $0.25/GB | $0.01 |
| GSI writes | ~50K × $1.25/million | $0.06 |
| GSI reads | ~50K × $0.25/million | $0.01 |
| Point-in-time recovery | 0.12 GB × $0.20/GB | $0.02 |
| **Total** | | **~$0.25/month** |

#### Retention policy

Automatic via DynamoDB TTL:

| Entity | Retention | Mechanism |
|--------|-----------|-----------|
| Events | 30 days | TTL attribute, auto-deleted |
| Global event references | 30 days | TTL attribute, auto-deleted |
| Agent actions | 90 days | TTL attribute, auto-deleted |
| Artefacts | Indefinite | No TTL; only current + previous_version retained |
| Escalations | Indefinite | No TTL; historical record |
| Projects | Indefinite | No TTL; user-managed archival |

---

## 5. Agent Architecture

### 5.1 Agent cycle (Step Functions orchestration)

The agent runs as a **Step Functions state machine** triggered by EventBridge on a 15-minute schedule. Each step is an independent Lambda function, with the state machine handling orchestration, retries, and error handling.

**Key architectural decisions:**

- **No database keepalive required.** DynamoDB is always-on with no cold start penalty.
- **Each step is isolated.** Failures in one step retry independently without restarting the entire cycle.
- **State passes between Lambdas.** The state machine maintains execution context; individual Lambdas are stateless.
- **Hold queue runs separately.** A 1-minute EventBridge schedule triggers the hold queue processor independently of the main cycle.

```
EVENTBRIDGE (15-minute schedule)
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    STEP FUNCTIONS STATE MACHINE                        │
│                                                                        │
│   ┌─────────────┐                                                      │
│   │  Heartbeat  │  Log cycle start, check agent health                 │
│   │   Lambda    │  Timeout: 30s                                        │
│   └──────┬──────┘                                                      │
│          │                                                             │
│   ┌──────▼──────┐                                                      │
│   │   Change    │  Poll Jira + Outlook for deltas (zero LLM cost)      │
│   │  Detection  │  Timeout: 60s | Retry: 3x                            │
│   └──────┬──────┘                                                      │
│          │                                                             │
│   ┌──────▼──────┐                                                      │
│   │ Has Changes?│─────────────No──────────┐                            │
│   └──────┬──────┘                         │                            │
│          │ Yes                            │                            │
│   ┌──────▼──────┐                         │                            │
│   │  Normalise  │  Convert to NormalisedSignal objects                 │
│   │   Lambda    │  Timeout: 30s                                        │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │   Triage    │  Strip untrusted content (Haiku)                     │
│   │  Sanitise   │  Timeout: 120s | Retry: 2x on LLM timeout            │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │   Triage    │  Classify signals, recommend actions (Haiku)         │
│   │  Classify   │  Timeout: 120s | Retry: 2x on LLM timeout            │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │   Needs     │─────────No─────────┐    │                            │
│   │ Reasoning?  │                    │    │                            │
│   └──────┬──────┘                    │    │                            │
│          │ Yes                       │    │                            │
│   ┌──────▼──────┐                    │    │                            │
│   │  Complex    │  Multi-source reasoning (Sonnet)                     │
│   │ Reasoning   │  Timeout: 300s | Retry: 2x on LLM timeout            │
│   └──────┬──────┘                    │    │                            │
│          │                           │    │                            │
│   ┌──────▼───────────────────────────▼────│                            │
│   │        Execute Actions                │                            │
│   │  Auto-execute, hold queue, escalate   │                            │
│   │  Timeout: 60s                         │                            │
│   └──────┬────────────────────────────────┘                            │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │  Artefact   │  Update content if signals warrant                   │
│   │   Update    │  Timeout: 180s (may invoke Haiku)                    │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼──────────────────────────────────                           │
│   │     Check Housekeeping Due?           │                            │
│   └──────┬──────────────────────────────────                           │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │Housekeeping │  Daily: storage check, send digest                   │
│   │  (if due)   │  Timeout: 120s                                       │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼────────────────────────────────▼───┐                        │
│   │                  Success                   │                        │
│   └────────────────────────────────────────────┘                        │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘


EVENTBRIDGE (1-minute schedule) ──► Hold Queue Lambda
                                    Process actions past their held_until
                                    Timeout: 60s
```

### 5.2 Lambda function breakdown

All Lambda functions share the `@agentic-pm/core` library for business logic. Each Lambda is a thin handler wrapper.

| Lambda | Purpose | Timeout | Retry strategy |
|--------|---------|---------|----------------|
| `agent-heartbeat` | Log cycle start, check agent health, verify integrations | 30s | 2x with 5s backoff |
| `agent-change-detection` | Poll Jira and Outlook APIs for deltas since last checkpoint | 60s | 3x with 10s backoff |
| `agent-normalise` | Convert raw API responses to `NormalisedSignal` objects | 30s | None (deterministic) |
| `agent-triage-sanitise` | Strip/neutralise untrusted content from signals (Haiku) | 120s | 2x with 30s backoff |
| `agent-triage-classify` | Classify signal importance and recommend actions (Haiku) | 120s | 2x with 30s backoff |
| `agent-reasoning` | Complex multi-source reasoning for difficult signals (Sonnet) | 300s | 2x with 60s backoff |
| `agent-execute` | Execute auto-approved actions, queue hold items, create escalations | 60s | 2x with 10s backoff |
| `agent-artefact-update` | Update artefact content if warranted by signals | 180s | 2x with 30s backoff |
| `agent-housekeeping` | Daily storage check, digest email | 120s | 2x with 30s backoff |
| `agent-hold-queue` | Process held actions past their `heldUntil` timestamp | 60s | 2x with 10s backoff |

### 5.3 Signal source abstraction

Each integration implements a common interface:

```typescript
interface SignalSource {
  integration: 'jira' | 'outlook' | 'asana';

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

### 5.4 Decision boundaries

```typescript
const decisionBoundaries = {
  canAutoExecute: [
    'artefact_update',        // Update RAID log, delivery state, backlog, decisions
    'heartbeat_log',          // Log agent health
    'notification_internal',  // Send digest/alert to user via SES
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

### 5.5 Structured confidence scoring

Do not ask Claude for a single confidence number. Instead, score four independent dimensions:

| Dimension | What it measures | How it's computed |
|-----------|-----------------|-------------------|
| **Source agreement** | Do multiple sources corroborate? | Deterministic: count confirming signals |
| **Boundary compliance** | Is the action within defined boundaries? | Deterministic: lookup in decisionBoundaries |
| **Schema validity** | Did Claude return valid structured output? | Deterministic: validate against schema |
| **Precedent match** | Has this type of action succeeded before? | Query agent_actions for similar past actions |

**Auto-execute rule:** All four dimensions must pass. If any dimension fails, escalate. This is deterministic and inspectable, not a magic number from the LLM.

### 5.6 Autonomy levels

| Level | Name | Agent does autonomously | Agent escalates |
|-------|------|------------------------|-----------------|
| 1 | **Monitoring** | Observe, log, maintain heartbeat. No external actions. | Everything |
| 2 | **Artefact** | All of Level 1 + update artefacts, send user notifications via SES | External communications, Jira writes |
| 3 | **Tactical** | All of Level 2 + send stakeholder emails (via hold queue), update Jira tickets, respond to routine patterns | Strategic decisions, external comms, scope changes |

**Graduation criteria** (must be met before promoting):

| From → To | Criteria |
|-----------|----------|
| 1 → 2 | 7 consecutive days of monitoring with zero false signal classifications (manual review) |
| 2 → 3 | 14 consecutive days of artefact updates with zero manual corrections needed; user has reviewed and approved at least 5 held communications |

Level 4 (Strategic) is explicitly deferred from all planning.

### 5.7 Shared library (`@agentic-pm/core`)

All Lambda functions import business logic from a shared library. This ensures:

1. **Consistency:** Same logic across all Lambdas
2. **Testability:** Core logic is unit-testable without AWS dependencies
3. **Local development:** Full agent cycle runs locally with `pnpm dev:agent`

```
packages/core/
├── src/
│   ├── signals/         # Signal normalisation
│   │   ├── types.ts
│   │   ├── jira.ts
│   │   └── outlook.ts
│   ├── triage/          # Triage logic
│   │   ├── sanitise.ts
│   │   └── classify.ts
│   ├── reasoning/       # Complex reasoning
│   │   └── sonnet.ts
│   ├── execution/       # Action execution
│   │   ├── boundaries.ts
│   │   ├── confidence.ts
│   │   └── executor.ts
│   ├── artefacts/       # Artefact management
│   │   ├── schemas.ts
│   │   └── updater.ts
│   ├── llm/             # Claude API abstraction
│   │   ├── client.ts
│   │   ├── tools.ts
│   │   └── budget.ts
│   ├── db/              # Database access
│   │   ├── schema.ts
│   │   ├── queries.ts
│   │   └── dynamodb.ts
│   └── integrations/    # External APIs
│       ├── jira.ts
│       ├── outlook.ts
│       └── ses.ts
└── package.json
```

---

## 6. LLM Strategy

### 6.1 Model selection

| Model | Use | % of calls |
|-------|-----|-----------|
| **Haiku 4.5** | Signal sanitisation, triage, classification, routine artefact updates | ~70% |
| **Sonnet 4.5** | Risk assessment, stakeholder communication drafting, RAID log synthesis, complex multi-source reasoning | ~30% |

The 70/30 split provides better quality for stakeholder-facing outputs at ~$1/month additional cost.

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

The $15/month ceiling allocates: ~$5-8/month fixed (AWS infrastructure) and ~$7-10/month variable (LLM). LLM budget is ~$7/month with ~$1-3 buffer.

**AWS infrastructure breakdown:**

| Service | Est. Monthly Cost |
|---------|------------------|
| Amplify Hosting | $0.50 |
| Lambda | $0.00 (free tier) |
| Step Functions | $1.00 |
| DynamoDB | $0.25 |
| Secrets Manager | $2.00 |
| SES | $0.00 (free tier) |
| CloudWatch | $1-2 |
| **Total** | **$5-8** |

**Critical cost traps to AVOID:**
- NAT Gateway: $33/month — Lambda MUST run outside VPC
- Aurora Serverless v2: $44/month minimum — use DynamoDB instead
- RDS: $15/month minimum — use DynamoDB instead

**LLM degradation ladder:**

| Control | Value |
|---------|-------|
| Daily LLM budget (baseline) | $0.23 (= $7/month ÷ 30) |
| Degradation tier 1 | At $0.23/day: Reduce to 85/15 Haiku/Sonnet split |
| Degradation tier 2 | At $0.27/day: 85/15 split + 20-min polling interval |
| Degradation tier 3 | At $0.30/day: Haiku-only + 30-min polling |
| Daily hard ceiling | $0.40/day: monitoring-only (no LLM calls) |
| Monthly LLM ceiling | $8.00 — agent enters monitoring-only mode for remainder of month |

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

**Checkpoint:** Store `last_sync_timestamp` in DynamoDB agent_checkpoints. Use JQL `updated >= "{checkpoint}"` to fetch only changes.

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

**Checkpoint:** Store Graph API delta token in DynamoDB agent_checkpoints. Delta queries return only changes since last token — no timestamp-based polling.

**Fallback:** If Azure AD admin consent cannot be obtained, Outlook integration is deferred and the agent operates with Jira + SES only. This is still a viable MVP (artefact generation from Jira data, notifications via SES).

### 7.3 Amazon SES (notifications)

**API:** AWS SDK for JavaScript v3 (`@aws-sdk/client-ses`)
**Auth:** IAM role (Lambda execution role with `ses:SendEmail` permission)
**Free tier:** 62,000 emails/month when sent from Lambda
**Purpose:** Agent-to-user notifications only (daily digest, health alerts, escalation notices). Not for stakeholder communications.

**Key operations:**

| Purpose | SDK Method |
|---------|-----------|
| Send email | `SendEmailCommand` |
| Send templated email | `SendTemplatedEmailCommand` |

**Setup requirements:**
- Verify sending domain in SES console
- Request production access (exit sandbox mode)
- Create email templates for digest and alerts (optional)

This integration is independent of Azure AD and available from day one.

### 7.4 Integration health monitoring

Each integration runs a health check on every agent cycle:

- **Jira:** `GET /rest/api/3/myself` — validates auth
- **Outlook:** `GET /users/{userId}` — validates Graph API access
- **SES:** `ses:GetSendQuota` — validates sending capability and quota

Failed health checks log a warning event. Three consecutive failures log an error event and trigger an SES notification to the user.

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

- **Next.js App Router** with React Server Components for data-heavy views
- **Hybrid SSR pattern:** Server Components render initial page data; TanStack Query handles real-time polling (30-second refresh for agent status, activity feed)
- **SSR views:** Mission Control, Activity Feed, Decision Interface, Project Detail — render with data on first load
- **Client-rendered views:** Settings (interactive forms), modals/dialogs
- **API routes:** User decisions on escalations, autonomy changes, config updates, hold queue approvals
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

**Mitigation: two-stage triage architecture with Lambda isolation** (section 5.1, step 4). A separate Triage Lambda with restricted IAM permissions sanitises external content before it enters reasoning prompts. The Triage Lambda has no access to integration credentials (Jira, Graph, SES) — it cannot send emails or update tickets even if compromised.

### 9.2 Credential security

| Credential | Storage | Access |
|------------|---------|--------|
| Jira API token | AWS Secrets Manager (`/agentic-pm/jira/api-token`) | Agent Lambda (via IAM role) |
| Graph API credentials | AWS Secrets Manager (`/agentic-pm/graph/credentials`) | Agent Lambda (via IAM role) |
| Claude API key | AWS Secrets Manager (`/agentic-pm/llm/api-key`) | Triage Lambda, Reasoning Lambda |
| NextAuth secret | AWS Secrets Manager (`/agentic-pm/auth/nextauth-secret`) | Frontend (Amplify environment) |

**Lambda compromise scenario:** An attacker who compromises the Triage Lambda cannot access integration credentials — IAM denies access. The Triage Lambda role only permits access to the LLM API key and database connection. This is enforced at the AWS IAM level, not application code.

### 9.3 IAM security model

Each component has its own IAM role following least-privilege principles:

#### Triage Lambda Role (`agentic-pm-triage-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/llm/*` | LLM access only |
| `dynamodb:GetItem`, `Query`, `PutItem` | AgenticPM table | Database access |
| `logs:*` | Lambda log group | CloudWatch logging |

**Explicit denials:** No access to Jira, Graph, or SES credentials.

#### Agent Lambda Role (`agentic-pm-agent-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/jira/*`, `/agentic-pm/graph/*` | Integration access |
| `ses:SendEmail` | SES identity ARN | Send notifications |
| `dynamodb:*` | AgenticPM table | Full database access |
| `logs:*` | Lambda log group | CloudWatch logging |

#### Step Functions Role (`agentic-pm-stepfunctions-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `lambda:InvokeFunction` | `agentic-pm-*` functions | Orchestrate agent workflow |
| `logs:*` | Step Functions log group | Execution logging |

### 9.4 Outbound action allowlist

The agent can only perform actions in the `decisionBoundaries` allowlist (section 5.4). Any action not in the list is rejected by the execution layer regardless of what Claude recommends. This is a code-level constraint, not a prompt-level one. IAM permissions provide a second layer of enforcement.

### 9.5 Network security

**Lambda deployment:** Outside VPC (public internet access)

This is simpler and sufficient because:
- DynamoDB is accessed via AWS endpoints (no VPC required)
- All external APIs (Jira, Graph, Claude) are public endpoints
- No internal resources require VPC access
- Avoids NAT Gateway costs (~$33/month)

**Security controls without VPC:**
- IAM roles enforce access to AWS services
- Secrets Manager encrypts credentials at rest (AES-256 via KMS)
- All traffic uses TLS 1.2+
- CloudTrail logs all API activity

**No SSH, no firewall configuration required.** Lambda functions are managed by AWS with no direct network access.

### 9.6 Authentication

Single user. NextAuth.js with Credentials provider. Username and bcrypt-hashed password stored in Secrets Manager (retrieved at runtime by Amplify). Session cookie with CSRF protection.

---

## 10. MVP Scope & Phases

### Phase 0: Pre-code (before any implementation)

| # | Action | Status |
|---|--------|--------|
| 1 | Validate Azure AD app registration and Graph API permissions | Pending (user action) |
| 2 | Verify Jira Cloud API access with API token | Pending (user action) |
| 3 | Set up AWS account with appropriate IAM user | Pending (user action) |
| 4 | Verify SES sending domain and exit sandbox mode | Pending (user action) |
| 5 | Baseline one week of actual PM time (passive tracking) | Pending (user action) |
| 6 | Run Spike S1: Can Claude reliably generate artefacts via tool-use from real Jira data? | Pending |
| 7 | Run Spike S2: Measure actual token usage with real prompts at current pricing | Pending |

**Kill threshold:** If after 100 hours of development the tool is not saving at least 3 hours/week of PM work, stop building.

### Phase 1: Foundation

| # | Task |
|---|------|
| F1 | Set up AWS CDK project, configure IAM roles and permission boundaries |
| F2 | Create DynamoDB table with GSI1, configure TTL |
| F3 | Deploy Next.js app to AWS Amplify Hosting with NextAuth |
| F4 | Build Step Functions state machine for agent workflow, configure EventBridge 15-minute schedule |
| F5 | Create Lambda functions: heartbeat, change-detection, signal-normalise |
| F6 | Build LLM abstraction layer: Haiku/Sonnet routing, tool-use, cost tracking |
| F7 | Implement budget controls and degradation ladder |
| F8 | Build events writes and activity feed (frontend reads from DynamoDB) |
| F9 | Set up SES integration for agent-to-user notifications, verify domain |
| F10 | Build agent status indicator in dashboard header |
| F11 | CI/CD: Amplify auto-deploy for frontend, GitHub Actions for Lambda deployment via CDK |

### Phase 2: Core Product (Level 1 → Level 2)

| # | Task |
|---|------|
| C1 | Build Jira signal source (SignalSource interface implementation) |
| C2 | Build signal normalisation pipeline |
| C3 | Build two-pass triage Lambdas (sanitise + classify) with isolated IAM roles |
| C4 | Build context assembly module (testable, cache-friendly) |
| C5 | Implement artefact bootstrap: generate initial delivery state, RAID log, backlog summary, decision log from Jira data |
| C6 | Build change detection gate (zero-LLM-cost delta check) |
| C7 | Implement dry-run mode (log actions but don't execute) |
| C8 | Build Mission Control dashboard with project cards |
| C9 | Build escalation workflow (create, present, decide) |
| C10 | Build basic health monitoring (integration health checks, CloudWatch alarms for missed heartbeat) |
| C11 | Configure DynamoDB TTL for data retention (Events: 30 days, AgentActions: 90 days) |
| C12 | Build daily digest email via SES |
| C13 | Graduate to Level 2: autonomous artefact updates |

### Phase 3: Enhancements (Level 2 → Level 3)

| # | Task |
|---|------|
| E1 | Build Outlook signal source (Graph API delta queries) |
| E2 | Implement draft-then-send with hold queue (separate 1-minute EventBridge schedule) |
| E3 | Build communication preview in dashboard |
| E4 | Implement structured confidence scoring |
| E5 | Build reasoning transparency (show why agent took each action) |
| E6 | Implement anti-complacency spot checks (fortnightly random review) |
| E7 | Build autonomy graduation ceremony (evidence dashboard + confirmation) |
| E8 | Implement Level 3 tactical actions (stakeholder email, Jira updates via hold queue) |
| E9 | Build Sonnet reasoning Lambda for complex multi-source signals |
| E10 | Validate prompt injection defence (Triage Lambda IAM isolation) |
| E11 | Build project detail view (artefact viewer with diff against previousVersion) |
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
- VPC deployment for Lambdas (not needed for current architecture)
- Amazon Bedrock migration (keep Claude API direct for now)

---

## 11. Risk Register

### Critical (halt implementation if unresolved)

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Azure AD admin consent unavailable → no Outlook | Fallback: Jira-only MVP + SES notifications. Still viable for artefact generation. |
| 2 | LLM budget exceeded despite controls | Degradation ladder (section 6.3). Hard ceiling with monitoring-only fallback. |
| 3 | Claude tool-use produces invalid artefact JSON | Schema validation on every response. Retry once on failure. Fall back to previous version from DynamoDB. |
| 4 | NAT Gateway accidentally provisioned | Lambda MUST run outside VPC. Infrastructure-as-code must explicitly exclude NAT Gateway. Review AWS bills weekly during first month. |

### Significant (address during development)

| # | Risk | Mitigation |
|---|------|-----------|
| 5 | Prompt injection via Jira/email content | Two-stage triage (section 9.1). Outbound action allowlist. |
| 6 | Agent crashes silently, dashboard shows stale "healthy" state | Heartbeat logging. Dashboard reads last heartbeat, not a frontend timer. Alert via SES if no heartbeat for 30 minutes. |
| 7 | User stops reviewing daily digest (automation complacency) | Anti-complacency spot checks every 2 weeks. |
| 8 | Scope creep during development | Kill threshold defined. Deferred list is explicit. |
| 9 | Lambda cold starts cause slow agent cycles | Monitor P95 latency. Accept up to 2-second cold start; agent is background process. If user-facing latency affected, consider provisioned concurrency (adds ~$3/month). |
| 10 | Step Functions state transition costs exceed estimates | Monitor transitions weekly. If exceeding 50,000/month, refactor to reduce transitions or switch to Express Workflows. |

### Watch

| # | Risk | Notes |
|---|------|-------|
| 11 | Jira API rate limits | Monitor. Current free tier allows 100 requests/minute — sufficient for 15-min polling. |
| 12 | Competitive landscape (Jira Rovo, Asana AI) | Unique value is cross-platform synthesis. Monitor competitor features quarterly. |
| 13 | Claude API pricing changes | Budget model assumes current pricing. Re-validate quarterly. |
| 14 | Monthly cost overrun | Monitor actual vs projected spend. Value gates at $12, $15, $20 thresholds. Alert at $12/month (80% of ceiling). |
| 15 | DynamoDB on-demand pricing spikes | Monitor read/write unit consumption. If sustained high usage, evaluate switching to provisioned capacity mode. |
| 16 | AWS free tier expiration | Some free tiers are 12-month only. Audit free tier assumptions annually. |

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
- DynamoDB operations (use DynamoDB Local)
- SES email sending (use test mode)

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

### Local development

**DynamoDB Local + LocalStack** provide full offline development:

```bash
# Start local services
docker-compose up -d dynamodb-local localstack

# Run agent locally
pnpm dev:agent

# Run tests
pnpm test
```

---

## Appendix A: File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `SPEC.md` | **Active — source of truth** | This document |
| `CLAUDE.md` | Active | Project instructions for Claude Code |
| `REVIEW-product-ideation.md` | Reference | 29-specialist product review |
| `ANALYSIS-review-synthesis.md` | Reference | Synthesised analysis of the review |
| `analysis-outputs/*.md` | Reference | Raw analysis outputs (7 files) |
| `aws-migration-analysis/*.md` | Reference | AWS migration analysis (6 files) |
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

### S4: DynamoDB access patterns

**Question:** Do the single-table design access patterns work correctly?
**Method:** Create table locally with DynamoDB Local. Implement all queries from section 4.1. Verify GSI1 queries return expected results. Test TTL configuration.
**Pass criteria:** All access patterns work as designed. TTL deletes items correctly.
**Effort:** 1 day.

### S5: Step Functions cold start

**Question:** What is the cold start overhead for the full agent cycle?
**Method:** Deploy state machine to AWS. Trigger 10 executions with 15-minute gaps. Measure total cycle time and per-Lambda cold start contribution.
**Pass criteria:** Total cycle time < 5 minutes. Cold start overhead < 30 seconds cumulative.
**Effort:** 1 day.
