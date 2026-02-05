# SPEC.md Sections 2-3: AWS Migration Update

> **Status:** Draft for review
> **Replaces:** Sections 2-3 of current SPEC.md
> **Last updated:** February 2026

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
| Artefact versioning | Single `previous_version` attribute | One-deep undo. Full version history not needed for personal tool |
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

## Migration notes

### Changes from original spec

| Area | Before | After |
|------|--------|-------|
| Frontend hosting | Vercel Pro ($20/month) | Amplify (~$0.50/month) |
| Agent runtime | Hetzner VPS ($4/month) | Step Functions + Lambda (~$1/month) |
| Database | Neon PostgreSQL (free) | DynamoDB (~$0.25/month) |
| ORM | Drizzle ORM | AWS SDK v3 (no ORM needed) |
| Notifications | Resend | Amazon SES |
| Secrets | Encrypted in DB + Vercel env | AWS Secrets Manager |
| Process manager | pm2 | Step Functions (managed) |
| Reverse proxy | Caddy | Not needed (Amplify/API Gateway) |
| Scheduling | Node.js setInterval | EventBridge Scheduler |

### Sections requiring updates elsewhere in SPEC.md

- **Section 4 (Data Model):** Replace SQL schema with DynamoDB access patterns
- **Section 5 (Agent Architecture):** Update agent loop for Step Functions state machine
- **Section 7 (Integrations):** Replace Resend with SES
- **Section 9 (Security):** Update credential security for Secrets Manager, remove VPS hardening
- **Section 10 (MVP Scope):** Update Phase 0/1 tasks for AWS provisioning
- **Section 11 (Risk Register):** Remove VPS-specific risks, add Lambda/Step Functions considerations
- **Appendix B (Spikes):** Update S4 for DynamoDB instead of Neon
