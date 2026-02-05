# Development Guide

> **Branch:** `feature/phase-1-foundation`
> **Status:** Ready for development
> **Date:** February 2026

This guide synthesizes 561KB of solution design documentation into actionable development phases. It is the primary reference for engineering work.

---

## Quick Start

```bash
# 1. Clone and setup
git clone <repo> && cd agentic-project-manager
git checkout feature/phase-1-foundation
pnpm install

# 2. Start local services
docker-compose up -d

# 3. Run tests
pnpm test

# 4. Deploy to dev
pnpm cdk deploy --context env=dev
```

---

## Phase 0: Pre-Code Validation

**Duration:** 1-2 weeks
**Blockers:** Must complete before writing production code

### Critical Blockers (4)

| # | Blocker | Owner | Resolution |
|---|---------|-------|------------|
| 1 | **Azure AD admin consent** | User | Attempt consent request. If denied → Jira-only MVP fallback |
| 2 | **Claude tool-use reliability** | Dev | Run S1 spike. Kill threshold: <95% valid outputs |
| 3 | **Jira API access** | User | Verify API token works with target Jira instance |
| 4 | **AWS account setup** | User | Create account, IAM user with CDK deploy permissions |

### Validation Spikes

| Spike | Question | Method | Pass Criteria | Effort |
|-------|----------|--------|---------------|--------|
| **S1** | Does Claude tool-use reliably generate valid artefact JSON? | 5 real Jira snapshots → Claude Haiku → validate schema. Run 3x each | 100% schema-valid, subjectively useful | 1-2 days |
| **S2** | What is actual monthly LLM cost? | Build representative prompts, measure tokens, multiply by pricing | ≤$8/month with change detection gate | 1 day |
| **S3** | Can we get Graph API access? | Register Azure AD app, request permissions, test delta query | Read email + send test email | 1-2 days |
| **S4** | Do DynamoDB access patterns work? | Create table locally, implement all queries, test GSI1 | All patterns work, TTL deletes items | 1 day |
| **S5** | What is Step Functions cold start overhead? | Deploy state machine, trigger 10 executions, measure | <5 min total, <30s cold start cumulative | 1 day |

### User Actions Required

- [ ] Attempt Azure AD admin consent (blocking for Outlook)
- [ ] Verify Jira Cloud API access with API token
- [ ] Set up AWS account with IAM user
- [ ] Request SES production access (exit sandbox)
- [ ] Baseline one week of PM time (passive tracking)

---

## Phase 1: Foundation

**Duration:** 4-6 sprints (8-12 weeks)
**Budget:** ~$5-8/month infrastructure

### Repository Structure

```
agentic-pm/
├── packages/
│   ├── core/                    # @agentic-pm/core - shared business logic
│   │   ├── src/
│   │   │   ├── signals/         # Signal normalisation
│   │   │   ├── triage/          # Sanitise + classify
│   │   │   ├── reasoning/       # Sonnet reasoning
│   │   │   ├── execution/       # Action execution
│   │   │   ├── artefacts/       # Artefact management
│   │   │   ├── llm/             # Claude API client
│   │   │   ├── db/              # DynamoDB access
│   │   │   └── integrations/    # Jira, Outlook, SES
│   │   └── package.json
│   │
│   ├── lambdas/                 # Lambda function handlers
│   │   ├── heartbeat/
│   │   ├── change-detection/
│   │   ├── normalise/
│   │   ├── triage-sanitise/
│   │   ├── triage-classify/
│   │   ├── reasoning/
│   │   ├── execute/
│   │   ├── artefact-update/
│   │   ├── housekeeping/
│   │   └── hold-queue/
│   │
│   ├── web/                     # Next.js frontend
│   │   ├── app/
│   │   │   ├── (dashboard)/     # Mission Control, Activity, etc.
│   │   │   ├── api/             # API routes for user actions
│   │   │   └── auth/            # NextAuth routes
│   │   └── package.json
│   │
│   └── cdk/                     # Infrastructure as Code
│       ├── lib/
│       │   ├── database-stack.ts
│       │   ├── compute-stack.ts
│       │   ├── frontend-stack.ts
│       │   └── monitoring-stack.ts
│       └── package.json
│
├── docker-compose.yml           # Local development services
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### Sprint 0: Infrastructure Setup (Week 1-2)

**Goal:** Working local development environment and CI/CD pipeline

| Task | Description | Deliverable |
|------|-------------|-------------|
| S0-01 | Initialize pnpm monorepo | `pnpm-workspace.yaml`, `turbo.json` |
| S0-02 | Create `packages/core` skeleton | TypeScript config, empty modules |
| S0-03 | Create `packages/lambdas` skeleton | 10 Lambda handler stubs |
| S0-04 | Create `packages/web` with Next.js | App Router, NextAuth stub |
| S0-05 | Create `packages/cdk` project | CDK TypeScript app |
| S0-06 | Write `docker-compose.yml` | DynamoDB Local, LocalStack |
| S0-07 | Configure GitHub Actions | Build, test, deploy workflows |
| S0-08 | Create DynamoDB table (CDK) | Table with GSI1, TTL |
| S0-09 | Create IAM roles (CDK) | Triage, Agent, StepFunctions roles |
| S0-10 | Create Secrets Manager secrets | Placeholder secrets |

**Definition of Done:**
- `pnpm install` works
- `docker-compose up` starts local services
- `pnpm test` passes (empty tests)
- `pnpm cdk deploy --context env=dev` succeeds

### Sprint 1: Agent Core (Week 3-4)

**Goal:** Step Functions state machine running with heartbeat

| Task | Description | Deliverable |
|------|-------------|-------------|
| S1-01 | Implement DynamoDB access layer | `@agentic-pm/core/db` |
| S1-02 | Implement event entity | Create/query events |
| S1-03 | Implement agent config entity | Budget tracking, settings |
| S1-04 | Build heartbeat Lambda | Log cycle start, health check |
| S1-05 | Build change-detection Lambda (stub) | Returns `{ hasChanges: false }` |
| S1-06 | Build normalise Lambda (stub) | Passthrough |
| S1-07 | Create Step Functions state machine | ASL definition in CDK |
| S1-08 | Configure EventBridge 15-min schedule | Trigger state machine |
| S1-09 | Set up CloudWatch logging | Log groups, retention |
| S1-10 | Write heartbeat integration test | Verify DynamoDB writes |

**Definition of Done:**
- State machine triggers every 15 minutes
- Heartbeat events written to DynamoDB
- CloudWatch logs show execution history
- Local tests pass with DynamoDB Local

### Sprint 2: LLM Integration (Week 5-6)

**Goal:** Claude API integration with budget controls

| Task | Description | Deliverable |
|------|-------------|-------------|
| S2-01 | Build Claude API client | `@agentic-pm/core/llm/client.ts` |
| S2-02 | Implement tool-use wrapper | `@agentic-pm/core/llm/tools.ts` |
| S2-03 | Define artefact tool schemas | JSON schemas matching SPEC 4.2 |
| S2-04 | Implement budget tracker | `@agentic-pm/core/llm/budget.ts` |
| S2-05 | Implement degradation ladder | Tier 1-3 + hard ceiling |
| S2-06 | Build triage-sanitise Lambda | Strip untrusted content |
| S2-07 | Build triage-classify Lambda | Classify signals |
| S2-08 | Update state machine | Add triage steps |
| S2-09 | Write budget control tests | Verify degradation triggers |
| S2-10 | Measure actual token usage | Compare to SPEC estimates |

**Definition of Done:**
- Claude API calls work with tool-use
- Budget tracking writes to DynamoDB
- Degradation ladder triggers correctly
- Actual token usage within 50% of estimates

### Sprint 3: Jira Integration (Week 7-8)

**Goal:** Jira signals flowing through the agent

| Task | Description | Deliverable |
|------|-------------|-------------|
| S3-01 | Build Jira client | `@agentic-pm/core/integrations/jira.ts` |
| S3-02 | Implement SignalSource interface | `authenticate`, `fetchDelta`, `healthCheck` |
| S3-03 | Implement checkpoint storage | Store last_sync in DynamoDB |
| S3-04 | Build change detection gate | Skip LLM if no changes |
| S3-05 | Implement signal normalisation | Raw Jira → NormalisedSignal |
| S3-06 | Update change-detection Lambda | Real Jira polling |
| S3-07 | Update normalise Lambda | Transform Jira signals |
| S3-08 | Write Jira integration tests | Mock API responses |
| S3-09 | Test with real Jira instance | End-to-end validation |
| S3-10 | Measure API request count | Verify under rate limit |

**Definition of Done:**
- Jira polling detects ticket changes
- Change detection gate skips LLM when idle
- Signals normalised to standard format
- API requests well under 100/minute limit

### Sprint 4: Artefact Generation (Week 9-10)

**Goal:** Agent generates and updates PM artefacts

| Task | Description | Deliverable |
|------|-------------|-------------|
| S4-01 | Implement artefact entity | CRUD operations |
| S4-02 | Define delivery state schema | Zod schema + TypeScript type |
| S4-03 | Define RAID log schema | Zod schema + TypeScript type |
| S4-04 | Define backlog summary schema | Zod schema + TypeScript type |
| S4-05 | Define decision log schema | Zod schema + TypeScript type |
| S4-06 | Build artefact updater | `@agentic-pm/core/artefacts/updater.ts` |
| S4-07 | Build artefact-update Lambda | Generate/update artefacts |
| S4-08 | Implement previousVersion | One-deep undo |
| S4-09 | Write golden scenario tests | 10 scenarios, 5 runs each |
| S4-10 | Validate artefact quality | Manual review |

**Definition of Done:**
- All 4 artefact types generated from Jira data
- previousVersion stored on each update
- Schema validation passes 100%
- Golden scenarios pass ≥90% accuracy

### Sprint 5: Frontend Foundation (Week 11-12)

**Goal:** Dashboard showing agent status and activity

| Task | Description | Deliverable |
|------|-------------|-------------|
| S5-01 | Deploy Next.js to Amplify | Working deployment |
| S5-02 | Configure NextAuth | Credentials provider |
| S5-03 | Build Mission Control layout | Header, sidebar, main area |
| S5-04 | Build agent status indicator | Active/Paused/Error |
| S5-05 | Build activity feed component | Scrolling event list |
| S5-06 | Implement event polling | TanStack Query, 30s refresh |
| S5-07 | Build empty states | Guidance for new users |
| S5-08 | Build project card component | Health, metrics summary |
| S5-09 | Add shadcn/ui components | Card, Badge, Button, etc. |
| S5-10 | Write component tests | React Testing Library |

**Definition of Done:**
- Dashboard shows real-time agent status
- Activity feed displays events
- Authentication works
- Estimated hosting cost ~$0.50/month

---

## Phase 2: Core Product (Level 1 → Level 2)

**Duration:** 4-6 sprints
**Goal:** Agent autonomously updates artefacts

### Epics

| Epic | Description | Stories |
|------|-------------|---------|
| EP-007 | Jira Integration (complete) | Signal source, change detection |
| EP-008 | Two-Pass Triage | Sanitise (security) + Classify (routing) |
| EP-009 | Escalation Workflow | Create, present, decide |
| EP-010 | Health Monitoring | Integration checks, CloudWatch alarms |
| EP-011 | Daily Digest | SES email with summary |
| EP-012 | Level 2 Graduation | Autonomous artefact updates |

### Key Milestones

- [ ] Dry-run mode operational (log actions, don't execute)
- [ ] Escalations appearing in dashboard
- [ ] Daily digest emails sending
- [ ] 7 consecutive days monitoring with zero false classifications
- [ ] Graduate to Level 2: autonomous artefact updates

---

## Phase 3: Enhancements (Level 2 → Level 3)

**Duration:** 4-6 sprints
**Goal:** Agent sends stakeholder communications

### Epics

| Epic | Description |
|------|-------------|
| EP-013 | Outlook Integration | Graph API delta queries |
| EP-014 | Hold Queue | Draft-then-send with 30-min window |
| EP-015 | Confidence Scoring | Four-dimensional scoring |
| EP-016 | Communication Preview | Dashboard approval UI |
| EP-017 | Level 3 Graduation | Stakeholder emails via hold queue |

---

## Technical Standards

### Code Style

```typescript
// TypeScript strict mode - no any
// Zod for runtime validation
// Explicit return types on functions
// British English in comments and strings
```

### Testing Pyramid

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit | Vitest | 80% of core logic |
| Integration | Vitest + DynamoDB Local | All DB operations |
| E2E | Playwright | Critical user flows |
| LLM Quality | Golden scenarios | 10 scenarios, ≥90% accuracy |

### Error Handling

```typescript
// Always use typed errors
class LLMTimeoutError extends Error {}
class BudgetExceededError extends Error {}
class SchemaValidationError extends Error {}

// Lambda retry strategy
const retryConfig = {
  LLMTimeout: { attempts: 2, backoff: [30, 60] },
  RateLimit: { attempts: 3, backoff: 'exponential' },
  Database: { attempts: 3, backoff: [5, 10, 20] },
};
```

### Security Requirements

1. **IAM Isolation:** Triage Lambda cannot access integration credentials
2. **No VPC:** Lambda runs outside VPC (no NAT Gateway)
3. **Secrets Manager:** All credentials stored encrypted
4. **Action Allowlist:** Only actions in `decisionBoundaries` can execute
5. **Input Validation:** Zod schemas validate all external input

---

## Cost Monitoring

### Weekly Checks (First Month)

- [ ] AWS Cost Explorer: Total spend vs $5-8 target
- [ ] NAT Gateway: Must be $0 (verify Lambda outside VPC)
- [ ] DynamoDB: Check for unexpected throughput
- [ ] Step Functions: Verify state transition count
- [ ] Claude API: Daily spend vs $0.23 target

### Budget Alerts (CloudWatch)

| Alert | Threshold | Action |
|-------|-----------|--------|
| Daily LLM | $0.23 | Trigger degradation tier 1 |
| Daily LLM | $0.40 | Hard ceiling, monitoring-only |
| Monthly AWS | $10 | Review for cost leaks |
| Monthly Total | $12 | 80% of ceiling, investigate |

---

## Reference Documents

| Document | Purpose | Location |
|----------|---------|----------|
| SPEC.md | Source of truth | `/SPEC.md` |
| Gap Analysis | Pre-implementation risks | `/solution-design/00-gap-analysis.md` |
| Technical Architecture | Diagrams, ASL, sequences | `/solution-design/01-technical-architecture.md` |
| API Schemas | TypeScript types, Zod | `/solution-design/02-api-schemas.md` |
| Dev Backlog | User stories, sprints | `/solution-design/03-dev-backlog.md` |
| Competitor Analysis | Market positioning | `/solution-design/04-competitor-analysis.md` |
| Scalability Analysis | Growth scenarios | `/solution-design/05-scalability-analysis.md` |
| Prompt Library | System prompts, tools | `/solution-design/06-prompt-library.md` |
| Testing Strategy | Test pyramid, golden scenarios | `/solution-design/07-testing-strategy.md` |
| Infrastructure Code | CDK, CI/CD, docker-compose | `/solution-design/08-infrastructure-code.md` |

---

## Kill Threshold

> If after **100 hours of development** the tool is not saving at least **3 hours/week** of PM work, stop building.

Track development hours and user-reported time savings from Sprint 3 onwards.
