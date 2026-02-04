> **SUPERSEDED — Consolidation is complete.**
> The output of this plan is `SPEC.md`, which is now the single source of truth.
> Retained for historical reference only.

# Plan: Consolidated PM Workbench Spec

## Context

Two existing docs describe the product but contradict each other in scope and architecture. This plan defines the work to produce a single, coherent, implementation-ready specification.

**User inputs:**
- Personal tool only (no multi-user/SaaS)
- Integrations: Jira, Asana, MS Teams (read-only), Outlook
- Budget ceiling: $10/month total (infra + LLM)
- Scale: 1-2 active projects at a time
- Artefacts are new concepts (don't exist today — tool creates them from integration data)
- MS Teams: read/monitor only, no posting

---

## 1. Key Decisions to Lock In

### 1a. Strip Multi-User Features
Remove from spec: RBAC, `project_collaborators` table, multi-tenancy, role-based auth, collaborator invites, domain-restricted login. Replace with simple single-user auth (passkey or basic password, no OAuth complexity needed for one user).

### 1b. Runtime Architecture
**Problem:** Vercel Cron has a 10-second execution limit on the hobby plan. The agent loop (poll 4 APIs + Claude reasoning) needs 10-30 seconds minimum.

**Proposed solution:** Vercel hobby (free) for the Next.js frontend/API + a $4/month Hetzner VPS (CX22) running the agent as a persistent Node.js process. This gives unlimited execution time, full control, and stays within budget.

- Agent runs on VPS as a simple `setInterval` loop (every 15 minutes)
- Calls project management APIs (Jira/Asana), MS Teams, Outlook
- Calls Claude API for interpretation/decisions
- Writes results to Neon DB
- Frontend polls DB for updates (SSE or simple polling — no Pusher needed for single user)

**Budget breakdown:**
| Component | Cost |
|-----------|------|
| Vercel hobby (frontend) | $0 |
| Hetzner VPS (agent) | ~$4/month |
| Neon PostgreSQL (free tier) | $0 |
| Claude API (Haiku primary, Sonnet for complex) | ~$3-5/month |
| **Total** | **~$7-9/month** |

### 1c. LLM Strategy
- **Haiku** for: signal detection, routine checks, artefact updates, "anything changed?" triage
- **Sonnet** for: risk interpretation, decision analysis, stakeholder communication drafting, escalation briefs
- Estimated 85% Haiku / 15% Sonnet split
- With 1-2 projects and 15-minute polling, expect ~$3-5/month

### 1d. Integrations for MVP
**Phase 1 (MVP):** Jira OR Asana (whichever the current project uses) + Outlook
**Phase 2:** Add the other project tracker + MS Teams
**Rationale:** Each integration is 2-3 weeks of work. Ship something useful with 2 integrations first.

### 1e. Cut from MVP
- Vector DB / Pinecone (premature — use DB-stored context initially)
- Real-time WebSocket / Pusher (single user — simple polling or SSE is fine)
- SharePoint integration
- GitHub integration
- Calendar integration
- "Respond to routine questions in Teams" (too risky for v1)
- Autonomy Level 4 (strategic autonomy — future consideration)

---

## 2. Revised Architecture

```
YOU (browser)
  │
  ▼
┌─────────────────────────┐
│  Vercel (free hobby)    │
│  Next.js frontend + API │
│  - Mission Control UI   │
│  - Decision interface   │
│  - Activity feed        │
│  - Agent config         │
└───────────┬─────────────┘
            │ reads/writes
            ▼
┌─────────────────────────┐
│  Neon PostgreSQL (free) │
│  - Projects, artefacts  │
│  - Agent actions log    │
│  - Escalations/decisions│
│  - Agent config         │
└───────────┬─────────────┘
            │ reads/writes
            ▼
┌─────────────────────────┐
│  Hetzner VPS (~$4/mo)   │
│  Node.js agent process  │
│  - 15-min polling loop  │
│  - Jira/Asana API       │
│  - MS Teams API         │
│  - Outlook API          │
│  - Claude API calls     │
│  - Action execution     │
└─────────────────────────┘
```

**Simplified from the original:** No Redis, no Pinecone, no Pusher, no S3, no Render. Artefact content stored as text/JSON in PostgreSQL (sufficient for 1-2 projects). File attachments in Vercel Blob if needed.

---

## 3. Revised Database Schema (Personal Tool)

Strip to essentials:
- `projects` (no owner_id needed — it's all yours)
- `artefacts` (content stored as TEXT in DB, not S3)
- `agent_actions` (audit log)
- `escalations` (decisions requiring your input)
- `integration_configs` (API tokens, encrypted)
- `agent_config` (autonomy level, polling interval, boundaries)

Remove: `users`, `project_collaborators`, role columns, per-user encryption.

---

## 4. Gaps to Resolve in Spec

### 4a. MS Teams Integration (Read-Only)
The current spec assumes Slack with read+write. MS Teams is read-only, which simplifies things but still requires:
- Azure AD app registration
- Application permissions (not delegated — agent runs unattended)
- Microsoft Graph API for reading channel messages
- MSAL auth flow

Read-only is significantly simpler than write. No Adaptive Cards, no bot registration. Just polling `/teams/{id}/channels/{id}/messages` via Graph API.

Spec needs a section on Azure AD setup and Graph API usage.

### 4b. Agent State Management
The spec doesn't detail how the agent tracks:
- "Last check" timestamps per integration per project
- In-flight escalations awaiting your decision
- Deduplication (don't re-process the same Jira change)
- Backoff on repeated failures

Need a `agent_state` table or JSON field.

### 4c. Prompt Engineering Strategy
The `interpret()` and `decide()` prompts in the spec are placeholders. Need:
- Structured output schemas (JSON with defined fields)
- Error handling for malformed LLM responses
- Context window management (what project state to include, what to summarize)
- Few-shot examples for common scenarios

### 4d. Webhook vs Polling
Jira, MS Teams, and Outlook all support webhooks. Webhooks would be:
- More responsive (instant vs 15-minute delay)
- Cheaper (fewer API calls)
- But require a publicly accessible endpoint (the VPS provides this)

Spec should evaluate webhook-first vs polling-first approach.

### 4e. Testing Strategy
Missing entirely. Need:
- Integration mocks for Jira/Asana/Teams/Outlook
- Sandbox mode (agent logs actions but doesn't execute)
- Test scenarios for each autonomy level
- Rollback procedures

### 4f. "Artefact" Definition and Bootstrap
Artefacts are new — the tool creates them. The spec needs to define:
- The schema/structure of each artefact type (RAID log, delivery state, backlog, etc.)
- How they're bootstrapped from Jira/Asana data on project setup
- Whether they're markdown, JSON, or structured DB records (recommendation: structured JSON in DB, rendered as markdown in UI)
- How the agent keeps them in sync with source-of-truth systems (Jira/Asana)
- Version history approach (simple: store previous version on each update)

**Bootstrap flow** (new concept needed in spec):
1. User creates project, connects Jira/Asana
2. Agent pulls current sprint, backlog, recent activity
3. Agent uses Claude to generate initial artefacts (delivery state, backlog summary, initial risk assessment)
4. User reviews and adjusts
5. Agent maintains from that point forward

---

## 5. Proposed Spec Document Structure

Merge both documents into a single spec with these sections:

1. **Product Vision** — What it is, who it's for, what "fully agentic" means
2. **User Interaction Model** — Daily/weekly touchpoints, autonomy levels
3. **Agent Architecture** — Perception → Reasoning → Planning → Execution → Learning
4. **Decision Boundaries** — canAutoExecute / requireApproval / neverDo
5. **Integrations** — Jira, Asana, MS Teams, Outlook (specifics for each)
6. **Data Model** — DB schema, artefact definitions, state management
7. **Infrastructure** — Vercel + Hetzner + Neon, deployment, monitoring
8. **Web Interface** — Mission Control, Activity Feed, Decision Interface
9. **LLM Strategy** — Haiku/Sonnet split, prompt design, cost management
10. **Security** — Encryption, auth, API token management
11. **MVP Scope** — What's in v1, what's deferred
12. **Implementation Roadmap** — Phased with realistic timelines
13. **Risk Register** — Known risks with mitigations

---

## 6. Work Plan

### Step 1: Create consolidated spec document
Write a single `SPEC.md` replacing both existing docs. Follow the structure in section 5. Incorporate all decisions from section 1, the revised architecture from section 2, and address all gaps from section 4.

### Step 2: Define artefact schemas
For each artefact type (RAID log, delivery state, backlog, decisions, etc.), define:
- JSON schema
- Fields and their sources (which integration provides the data)
- Update triggers (what causes the agent to update this artefact)
- Bootstrap logic (how it's created from scratch)

### Step 3: Define MVP agent behaviours
For autonomy levels 1-3, specify exactly:
- What signals the agent monitors
- What actions it takes at each level
- What gets escalated
- Example scenarios with expected agent behaviour

### Step 4: Revise implementation roadmap
Realistic phasing based on personal-tool scope, 2 initial integrations, and the gaps identified. No artificial week counts — focus on milestones and dependencies.

### Step 5: Clean up repository
- Replace the two existing docs with the consolidated spec
- Remove v0 prompts and SaaS-oriented content
- Keep the spec focused and implementation-ready
