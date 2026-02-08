# PM Copilot on AWS AgentCore — Product Specification

> **Status:** Proposal — architecture redesign for AgentCore-native deployment
> **Created:** February 2026
> **Relationship to SPEC.md:** New product direction. Does not replace the existing
> specification; presents an alternative architecture for a conversational PM
> copilot built on AgentCore managed services.

---

## 1. Why AgentCore — And Why Now

### The original rejection was correct

The existing SPEC.md rejected AgentCore in February 2026 for sound reasons:

| Original objection | Still valid? | What changed |
|--------------------|-------------|--------------|
| Cost (~$4-9 vs ~$1-2/month) | Partially | Copilot sessions are bursty, not continuous. Per-second billing means idle = free. |
| Use-case mismatch (batch vs interactive) | **No** | We are building a copilot now, not a batch processor. AgentCore is purpose-built for interactive agents. |
| Weaker security isolation | Partially | AgentCore Policy (Cedar) provides declarative enforcement at the Gateway level — arguably stronger than per-Lambda IAM for tool governance. |
| Cloud-only development | Yes | No LocalStack equivalent. Mitigated by Gateway mock endpoints and SDK test harnesses. |
| Production maturity (GA Oct 2025) | Less so | 4 months in production. AWS re:Invent 2025 featured AgentCore prominently. Rapid iteration. |

### The vision shift changes everything

A **PM copilot** is fundamentally different from a **PM automation**:

| Dimension | PM Automation (current) | PM Copilot (proposed) |
|-----------|------------------------|----------------------|
| Primary interface | Dashboard you check | Conversation you have |
| Interaction model | Background batch → you review | You ask → it acts → you refine |
| Session model | 96 × 3-min cycles/day, no context | On-demand sessions, full context preserved |
| Intelligence | Classify-route-execute pipeline | Reason, discuss, collaborate |
| Memory | Checkpoint timestamps | Semantic recall of past decisions, project patterns, your preferences |
| Tool access | Hard-coded Jira/Outlook clients | Pluggable MCP tools added without code |
| Safety model | Code-level allowlists | Declarative Cedar policies, auditable |
| Value proposition | "It handled it while you were busy" | "It thinks alongside you" |

AgentCore provides managed infrastructure for every dimension on the right column.
Building that from scratch on Step Functions + Lambda would mean reimplementing
most of what AgentCore already offers.

### Honest trade-offs

Things we lose or accept:

- **Budget shifts from ~$15 to ~$20-35/month.** Per-second Runtime billing +
  Gateway requests + Memory storage. The copilot is more capable but not free.
  Detailed cost model in §8.
- **No local-only development.** AgentCore services are cloud-only. Unit tests
  still run locally; integration tests hit a dev-stage AgentCore deployment.
- **Vendor coupling deepens.** We go from "Lambda functions you can run anywhere"
  to "AgentCore-native agent." Acceptable for a personal tool; would be a harder
  sell for a product.
- **Some existing code is obsoleted.** Step Functions orchestration, custom
  connector framework, checkpoint management, secret caching — all replaced by
  managed services. The core business logic (triage, reasoning, artefact schemas,
  confidence scoring) carries forward.

---

## 2. Product Vision

### What it is

A conversational PM copilot that knows your projects. You talk to it naturally —
ask about project status, get RAID analysis, draft stakeholder comms, review
backlog health, make decisions. It monitors Jira and Outlook in the background
and surfaces what matters. It remembers your decisions, preferences, and project
history across sessions.

### What it is not

- Not a chatbot that looks things up on demand. It proactively monitors and
  synthesises even when you are not talking to it.
- Not a replacement for Jira or Outlook. It operates across them.
- Not a SaaS product. Single user, personal tool.

### Core interactions

```
You:    "What's the state of Project Atlas?"

Copilot: Sprint 14 is at 62% completion with 3 days remaining.
         Two blockers surfaced since yesterday:
         - ATL-342: API migration blocked on DevOps approval (raised 2 days ago)
         - ATL-389: Design assets delayed — vendor unresponsive since Monday

         The RAID log has 2 high-severity open risks.
         Shall I draft a chase email to the design vendor?

You:    "Yes, but cc the project sponsor and keep the tone collaborative."

Copilot: [Draft appears in hold queue — 5-min review window]
         Here is the draft. I have cc'd Sarah Chen (sponsor) and used
         collaborative framing. Review window: 5 minutes.
         Approve, edit, or cancel?
```

```
You:    "Summarise what happened while I was in meetings this afternoon."

Copilot: Since 13:00:
         - 3 Jira tickets moved to Done (ATL-340, ATL-341, ATL-344)
         - 1 new blocker raised by DevOps (ATL-350 — environment access)
         - Outlook: Sarah replied to your scope question — she approves
           the reduced scope for Phase 2
         - I updated the delivery state artefact and added the new
           blocker to the RAID log.

         The DevOps blocker needs your input. Want me to escalate it
         or shall I draft a request to the DevOps lead?
```

```
You:    "Run a health check on backlog grooming quality."

Copilot: Analysing 47 backlog items against refinement criteria...

         Issues found:
         - 8 stories missing acceptance criteria
         - 3 epics with no child stories
         - 2 tickets stale >30 days with no update
         - 1 priority conflict: ATL-280 marked Critical but not in sprint

         Want me to create a refinement checklist and flag these in Jira?
```

### Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Users | 1 (you) | Personal tool |
| Budget ceiling | $35/month | AWS AgentCore + LLM — higher than v1 but justified by copilot capability |
| Active projects | 1-3 at a time | Copilot context window management |
| LLM | Claude (Anthropic API) | Not Bedrock model invocation — direct API for cost control and model flexibility |

---

## 3. Architecture

### High-level system diagram

```
YOU
 ├── Browser (Next.js dashboard + chat interface)
 │     └── WebSocket → AgentCore Runtime (streaming responses)
 │
 └── [Future: Slack / CLI / mobile — all via same Runtime endpoint]


                    ┌─────────────────────────────────────────────┐
                    │         AgentCore Runtime                   │
                    │                                             │
                    │  ┌─────────────────────────────────────┐   │
                    │  │  PM Copilot Agent (Python/TS)       │   │
                    │  │                                     │   │
                    │  │  ┌───────────┐  ┌───────────────┐  │   │
                    │  │  │ Reasoning │  │ Artefact Mgmt │  │   │
                    │  │  │ Engine    │  │ (RAID, State) │  │   │
                    │  │  └───────────┘  └───────────────┘  │   │
                    │  │  ┌───────────┐  ┌───────────────┐  │   │
                    │  │  │ Triage &  │  │ Communication │  │   │
                    │  │  │ Analysis  │  │ Drafter       │  │   │
                    │  │  └───────────┘  └───────────────┘  │   │
                    │  │                                     │   │
                    │  └──────────────┬──────────────────────┘   │
                    │                 │                           │
                    │     ┌───────────▼──────────┐               │
                    │     │  AgentCore Memory    │               │
                    │     │  STM: session context │               │
                    │     │  LTM: project history,│               │
                    │     │       preferences,    │               │
                    │     │       decisions        │               │
                    │     └──────────────────────┘               │
                    └──────────────┬──────────────────────────────┘
                                   │ MCP tool calls
                                   ▼
                    ┌─────────────────────────────────────────────┐
                    │         AgentCore Gateway                   │
                    │                                             │
                    │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │
                    │  │ Jira MCP │ │ Outlook  │ │ SES Email  │ │
                    │  │ Tools    │ │ MCP Tools│ │ MCP Tools  │ │
                    │  └──────────┘ └──────────┘ └────────────┘ │
                    │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │
                    │  │ DynamoDB │ │ Future:  │ │ Future:    │ │
                    │  │ MCP Tools│ │ Asana    │ │ Confluence │ │
                    │  └──────────┘ └──────────┘ └────────────┘ │
                    │                                             │
                    │          AgentCore Policy (Cedar)           │
                    │  "Never delete data"                        │
                    │  "Hold stakeholder emails for 5 min"        │
                    │  "Block scope changes without approval"     │
                    │                                             │
                    │          AgentCore Identity                  │
                    │  OAuth tokens: Jira, Graph API              │
                    │  API keys: Claude, SES                      │
                    └─────────────────────────────────────────────┘


        ┌─────────────────────────────────┐
        │  EventBridge Scheduler          │
        │  (background monitoring cycle)  │
        │  Every 15 min → invoke Runtime  │
        │  with "background_check" prompt │
        └─────────────────────────────────┘


        ┌─────────────────────────────────┐
        │  Next.js on Amplify             │
        │  - Dashboard (retained)         │
        │  - Chat interface (new)         │
        │  - Decision/escalation UI       │
        │  - Settings & autonomy dial     │
        └─────────────────────────────────┘


        ┌─────────────────────────────────┐
        │  DynamoDB (retained)            │
        │  - Projects, artefact content   │
        │  - Escalations, held actions    │
        │  - Events (activity feed)       │
        │  - Agent action audit trail     │
        │  (AgentCore Memory handles      │
        │   session state & LTM — DynamoDB│
        │   is for structured PM data)    │
        └─────────────────────────────────┘
```

### What replaces what

| Current component | Replaced by | Rationale |
|-------------------|-------------|-----------|
| Step Functions state machine | AgentCore Runtime | Agent logic lives in a single runtime, not a state machine. Orchestration is LLM-driven, not ASL-defined. |
| 10 Lambda functions | Single agent container in Runtime | Business logic consolidates into one agent with MCP tool access. No Lambda cold starts. |
| EventBridge → Step Functions | EventBridge → Runtime invocation | Background monitoring still runs on schedule, but invokes the same agent. |
| Custom Jira/Outlook/SES clients | MCP tools via AgentCore Gateway | Standard tool protocol. Add new integrations by registering Gateway targets, not writing Lambda code. |
| AWS Secrets Manager (manual) | AgentCore Identity | Managed OAuth flows, token refresh, credential vault. |
| Custom DECISION_BOUNDARIES | AgentCore Policy (Cedar) | Declarative, auditable, enforceable at Gateway level before tools execute. |
| DynamoDB checkpoints | AgentCore Memory (STM) | Session context preserved across interactions. Checkpoint state becomes implicit. |
| Custom activity logging | AgentCore Observability | OpenTelemetry traces, tool call logs, reasoning step visibility. |
| CloudWatch alarms | AgentCore Observability + CloudWatch | Agent-specific metrics from Observability; infrastructure alarms remain in CloudWatch. |

### What we keep

| Component | Why it stays |
|-----------|-------------|
| **DynamoDB** | Structured PM data (artefacts, projects, escalations) is domain-specific. AgentCore Memory stores conversational context, not structured RAID logs. |
| **Next.js on Amplify** | Frontend hosting unchanged. Add chat interface alongside existing dashboard. |
| **Core business logic** | Triage classification, artefact schemas (Zod), confidence scoring dimensions, communication drafting templates — all carry forward as agent capabilities. |
| **Artefact content schemas** | Delivery state, RAID log, backlog summary, decision log — same Zod schemas, now used as MCP tool parameters. |
| **Two-stage triage concept** | Sanitise-then-classify pattern remains, but implemented as agent reasoning steps rather than separate Lambda invocations with IAM isolation. Cedar policies provide the enforcement boundary. |
| **Hold queue & graduation** | Communication safety pattern unchanged. Copilot drafts, holds, user approves/edits. Graduation logic (consecutive approvals → shorter hold) carries forward. |

---

## 4. AgentCore Runtime — The Copilot Agent

### Agent structure

The PM Copilot is a single agent deployed as a container to AgentCore Runtime.
It handles both interactive conversations and background monitoring within the
same codebase.

```
pm-copilot-agent/
├── src/
│   ├── agent.ts                  # Main agent entry point
│   ├── capabilities/
│   │   ├── triage.ts             # Signal classification & analysis
│   │   ├── reasoning.ts          # Complex multi-signal reasoning
│   │   ├── artefact-manager.ts   # CRUD for PM artefacts
│   │   ├── communication.ts      # Draft & hold stakeholder comms
│   │   ├── backlog-analyst.ts    # Backlog health & grooming checks
│   │   └── status-reporter.ts    # Project status synthesis
│   ├── tools/                    # MCP tool definitions (registered in Gateway)
│   │   ├── jira-tools.ts         # Search, comment, transition, create
│   │   ├── outlook-tools.ts      # Read, send, search
│   │   ├── ses-tools.ts          # Send notification
│   │   ├── dynamo-tools.ts       # Artefact CRUD, event log, escalations
│   │   └── analysis-tools.ts     # Backlog scan, RAID review, coherence check
│   ├── prompts/
│   │   ├── system.ts             # Core copilot identity & instructions
│   │   ├── triage.ts             # Signal classification prompts
│   │   ├── artefact-update.ts    # Per-artefact update prompts
│   │   └── communication.ts      # Drafting tone & style prompts
│   ├── schemas/                  # Zod schemas (carried from @agentic-pm/core)
│   │   ├── artefacts.ts
│   │   ├── signals.ts
│   │   └── actions.ts
│   └── memory/
│       ├── strategies.ts         # Custom memory extraction strategies
│       └── retrieval.ts          # Context-aware memory retrieval
├── Dockerfile
├── requirements.txt              # Or package.json for TypeScript
└── tests/
```

### Invocation modes

The agent handles two invocation patterns through the same Runtime endpoint:

**1. Interactive (user-initiated)**

User opens chat → WebSocket connection to AgentCore Runtime → streaming
responses. Session persists across multiple exchanges (up to 8 hours or 15 min
inactivity). AgentCore Memory preserves context.

```
POST /runtime/invoke
{
  "runtimeSessionId": "user-session-2026-02-08-am",
  "input": "What's the state of Project Atlas?"
}
→ Streaming response via WebSocket
```

**2. Background (scheduled)**

EventBridge triggers every 15 minutes with a background monitoring prompt.
The agent polls for changes, triages signals, updates artefacts, and queues
any escalations — exactly as the current system does, but expressed as agent
reasoning rather than a state machine.

```
POST /runtime/invoke
{
  "runtimeSessionId": "background-cycle-2026-02-08T10:45:00Z",
  "input": "Run background monitoring cycle. Check Jira and Outlook for changes since last cycle. Triage any new signals. Update artefacts if warranted. Escalate anything that needs my attention."
}
```

The agent uses the same tools and reasoning for both modes. The difference is
who initiates the conversation — you or the scheduler.

### Versioning & deployment

- Agent container image pushed to ECR
- AgentCore Runtime version created per deployment
- DEFAULT endpoint updated (zero-downtime)
- Dev endpoint for testing before promotion

---

## 5. AgentCore Gateway — MCP Tool Registry

### Tool catalogue

Every external action the copilot can take is registered as an MCP tool in
AgentCore Gateway. The copilot discovers tools at runtime via the Gateway
endpoint.

#### Jira tools (Gateway target: Lambda or OpenAPI)

| Tool name | Description | Policy |
|-----------|-------------|--------|
| `jira_search_issues` | Search tickets by JQL | Always allowed |
| `jira_get_issue` | Fetch single issue detail | Always allowed |
| `jira_get_sprint` | Current sprint info | Always allowed |
| `jira_add_comment` | Add comment to ticket | Auto-execute |
| `jira_transition_issue` | Change ticket status | Hold queue (5 min) |
| `jira_create_issue` | Create new ticket | Requires approval |
| `jira_update_fields` | Modify ticket fields | Hold queue (5 min) |

#### Outlook tools (Gateway target: Lambda wrapping Graph API)

| Tool name | Description | Policy |
|-----------|-------------|--------|
| `outlook_search_mail` | Search inbox/folders | Always allowed |
| `outlook_read_message` | Read specific email | Always allowed |
| `outlook_list_recent` | Recent messages delta | Always allowed |
| `outlook_send_email` | Send email | Hold queue (30 min for external, 5 min for internal) |

#### PM artefact tools (Gateway target: Lambda wrapping DynamoDB)

| Tool name | Description | Policy |
|-----------|-------------|--------|
| `artefact_get` | Read artefact (RAID, delivery state, etc.) | Always allowed |
| `artefact_update` | Update artefact content | Auto-execute |
| `artefact_revert` | Revert to previous version | Requires approval |
| `project_list` | List active projects | Always allowed |
| `project_get` | Get project detail | Always allowed |
| `event_log` | Write to activity feed | Auto-execute |
| `escalation_create` | Create escalation for user | Auto-execute |
| `held_action_create` | Queue action for review | Auto-execute |

#### Notification tools

| Tool name | Description | Policy |
|-----------|-------------|--------|
| `ses_send_notification` | Send email to user (digest, alert) | Auto-execute |

#### Analysis tools (no external side-effects)

| Tool name | Description | Policy |
|-----------|-------------|--------|
| `analyse_backlog_health` | Scan backlog for quality issues | Always allowed |
| `analyse_raid_coherence` | Check RAID log for staleness/conflicts | Always allowed |
| `analyse_delivery_risk` | Cross-reference signals against milestones | Always allowed |

### Adding new integrations

To add a new tool source (e.g., Asana, Confluence, GitHub):

1. Write an OpenAPI spec or Lambda handler for the API operations
2. Register as a Gateway target: `aws bedrock-agentcore create-gateway-target`
3. Add Cedar policies for the new tools
4. The copilot discovers them automatically via MCP — no agent code changes

This replaces the custom ConnectorDescriptor/ConnectorRegistry/ConnectorRuntime
framework with a managed equivalent.

---

## 6. AgentCore Memory — Project Knowledge

### Memory architecture

AgentCore Memory replaces both DynamoDB checkpoints and the concept of
"agent state" with a managed memory service. DynamoDB remains for structured
PM data (artefacts, escalations) — Memory handles conversational context and
learned knowledge.

#### Short-term memory (within session)

Automatic. AgentCore Runtime preserves full conversation context within a
session (up to 8 hours). No explicit management needed.

Use cases:
- Multi-turn conversations ("Yes, draft that email" refers to earlier context)
- Background cycle context ("I already checked Jira, now checking Outlook")

#### Long-term memory (across sessions)

Three memory strategies configured for the copilot:

**1. Semantic memory (facts & knowledge)**

Automatically extracts and stores facts from conversations:
- "Project Atlas uses 2-week sprints starting on Mondays"
- "Sarah Chen is the project sponsor and prefers email over Slack"
- "The design vendor (Acme Studios) has been unreliable since January"
- "DevOps approvals typically take 2-3 business days"

Retrieved via semantic search when the copilot needs project context.

**2. Summary memory (session summaries)**

After each session, AgentCore Memory generates a summary:
- "Morning session: reviewed sprint progress, drafted vendor chase email,
  updated RAID log with new DevOps blocker"

Provides continuity across sessions without replaying full conversation history.

**3. Episodic memory (decision patterns)**

Captures structured episodes of significant interactions:
- "User approved the scope reduction for Phase 2 after reviewing 3 options.
  Preferred option B (reduced scope) over option A (timeline extension)
  because of budget constraints."

Enables the copilot to learn decision patterns and offer better recommendations
over time.

### Memory retrieval in practice

When the user asks "What's the state of Project Atlas?", the copilot:

1. **Semantic search** → retrieves relevant facts about Atlas (sprint cadence,
   team, recent risks)
2. **Session summary** → checks most recent session for continuity
3. **Episodic recall** → finds relevant past decisions (scope change approved
   last week)
4. **MCP tools** → calls `jira_search_issues` and `artefact_get` for live data
5. **Synthesises** all sources into a coherent response

This is richer context than the current system, which only has DynamoDB
checkpoint timestamps and the current cycle's signals.

---

## 7. AgentCore Policy — Safety Governance (Cedar)

### Replacing DECISION_BOUNDARIES with Cedar

The current system enforces safety via a TypeScript allowlist
(`DECISION_BOUNDARIES`) checked in the execute Lambda. This is effective but
code-coupled — changing boundaries requires a code deployment.

AgentCore Policy uses Cedar, a deterministic policy language that enforces
rules at the Gateway level before tool calls execute. Policies are declarative,
auditable, and changeable without redeployment.

### Policy set

```cedar
// ─── AUTO-EXECUTE: Safe actions that need no human review ───

permit (
  principal,
  action == Action::"invoke_tool",
  resource in Tool::"artefact_update"
);

permit (
  principal,
  action == Action::"invoke_tool",
  resource in Tool::"jira_add_comment"
);

permit (
  principal,
  action == Action::"invoke_tool",
  resource in Tool::"ses_send_notification"
);

permit (
  principal,
  action == Action::"invoke_tool",
  resource in Tool::"event_log"
);

permit (
  principal,
  action == Action::"invoke_tool",
  resource in Tool::"escalation_create"
);

// ─── READ-ONLY: All read tools are always permitted ───

permit (
  principal,
  action == Action::"invoke_tool",
  resource
) when {
  resource.readonly == true
};

// ─── HOLD QUEUE: Actions that require a review window ───

// Stakeholder emails: 5 min hold for internal, 30 min for external
permit (
  principal,
  action == Action::"invoke_tool",
  resource == Tool::"outlook_send_email"
) when {
  context.hold_queue_approved == true
};

// Jira status changes: 5 min hold
permit (
  principal,
  action == Action::"invoke_tool",
  resource == Tool::"jira_transition_issue"
) when {
  context.hold_queue_approved == true
};

// ─── REQUIRE APPROVAL: High-impact actions need explicit user consent ───

permit (
  principal,
  action == Action::"invoke_tool",
  resource == Tool::"jira_create_issue"
) when {
  context.user_approved == true
};

permit (
  principal,
  action == Action::"invoke_tool",
  resource == Tool::"artefact_revert"
) when {
  context.user_approved == true
};

// ─── NEVER-DO: Hard deny, no exceptions ───

forbid (
  principal,
  action == Action::"invoke_tool",
  resource
) when {
  resource.category == "destructive"
};

forbid (
  principal,
  action == Action::"invoke_tool",
  resource == Tool::"outlook_send_email"
) when {
  context.contains_confidential == true
};
```

### Policy advantages over code-level boundaries

| Aspect | Code (current) | Cedar (proposed) |
|--------|----------------|------------------|
| Change mechanism | Code deploy | Policy update (no redeploy) |
| Enforcement point | Inside agent code | Gateway level (before tool executes) |
| Audit trail | Application logs | Policy evaluation logs |
| Formal verification | Unit tests | Cedar automated reasoning (prove no policy conflicts) |
| Expressiveness | Boolean allowlist | Conditional logic on context, attributes |
| Bypass risk | Agent code bug could skip check | Gateway enforces regardless of agent behaviour |

### Autonomy dial mapping

The autonomy dial (Observe / Maintain / Act) maps to Cedar policy sets:

| Level | Cedar policy set | Behaviour |
|-------|-----------------|-----------|
| **Observe** | Deny all write tools | Read-only monitoring, log events |
| **Maintain** | Permit artefact writes + notifications | Update RAID, delivery state; notify user |
| **Act** | Permit held actions + Jira writes | Full copilot: draft emails, update tickets, hold queue |

Switching levels = swapping the active Cedar policy set. No code changes.

---

## 8. AgentCore Identity — Credential Management

### Replacing Secrets Manager

AgentCore Identity manages OAuth flows and credential lifecycle:

| Credential | Current (Secrets Manager) | Proposed (AgentCore Identity) |
|------------|--------------------------|-------------------------------|
| Jira Cloud | API token stored manually | OAuth 2.0 managed flow, auto-refresh |
| Microsoft Graph | Client credentials stored manually | OAuth 2.0 app flow, auto-refresh |
| Claude API | API key in secret | API key in Identity vault |
| SES | IAM role (no secret) | IAM role (unchanged) |

### Benefits

- **No manual token rotation.** Identity handles OAuth refresh automatically.
- **Credential isolation.** Agent code never sees raw credentials — Identity
  injects auth headers into Gateway tool calls.
- **Audit trail.** Every credential use is logged in Observability.

---

## 9. Cost Model

### AgentCore pricing estimate

| Service | Usage pattern | Monthly estimate |
|---------|--------------|-----------------|
| **AgentCore Runtime** | ~30 min interactive/day + 96 × 2 min background = ~222 min/day active. Mostly I/O-wait (LLM calls, API polling), so CPU near minimum. | $3-6 |
| **AgentCore Gateway** | ~500 tool calls/day (reads + writes) × 30 days = 15,000/month @ $0.005/1000 | $0.08 |
| **AgentCore Memory** | ~200 events/day (STM) + ~20 LTM extractions/day | $1-2 |
| **AgentCore Identity** | 4 credential sets, ~500 auth operations/day | $0.50 |
| **AgentCore Policy** | ~500 evaluations/day × 30 = 15,000/month | $0.50 |
| **AgentCore Observability** | Trace storage for ~500 spans/day | $0.50 |
| **DynamoDB** | Same as current (artefacts, events, escalations) | $0.25 |
| **Amplify** | Same as current (Next.js hosting) | $0.50 |
| **SES** | Same as current (free tier) | $0 |
| **CloudWatch** | Reduced (Observability handles agent metrics) | $0.50 |
| **ECR** | Agent container image storage | $0.10 |
| **EventBridge** | Same as current (15-min + 1-min schedules) | $0.05 |
| **AgentCore subtotal** | | **$5-10** |
| **AWS infrastructure subtotal** | | **$7-12** |
| **Claude API** | Similar to current — Haiku 70% / Sonnet 30%, with caching | $5-8 |
| **Total** | | **$12-20** |

### Cost comparison

| | Current (Step Functions) | Proposed (AgentCore) |
|-|-------------------------|---------------------|
| AWS infrastructure | $5-8/month | $7-12/month |
| Claude API | $4-8/month | $5-8/month |
| **Total** | **$9-16/month** | **$12-20/month** |
| Capability | Dashboard + batch automation | Dashboard + conversational copilot + batch monitoring |

The ~$4-6/month increase buys: conversational interface, persistent memory,
managed credentials, declarative policy governance, and MCP tool extensibility.

### Cost controls

- **Runtime idle = free.** Sessions that are waiting on user input incur memory
  charges only (~$0.0000015/sec for 1 GB). CPU is near-zero during I/O wait.
- **Background cycles are short.** 2-3 min per cycle, terminated immediately
  after. No 8-hour sessions running idle.
- **Change detection gate preserved.** Background cycle checks for API deltas
  before calling LLM tools. No-change cycles complete in <30 seconds.
- **LLM budget unchanged.** Same Haiku/Sonnet routing, same degradation ladder.
  AgentCore Runtime does not dictate which LLM you use.
- **Gateway caching.** Repeated read-tool calls within a session can be cached
  at the Gateway level, reducing downstream API calls.

---

## 10. What Carries Forward (Reuse Map)

### Code that migrates directly

| Current module | New location | Changes |
|----------------|-------------|---------|
| `packages/core/src/schemas/` | `pm-copilot-agent/src/schemas/` | None — Zod schemas unchanged |
| `packages/core/src/artefacts/` | `pm-copilot-agent/src/capabilities/artefact-manager.ts` | Refactor from Lambda handler to agent capability |
| `packages/core/src/triage/` | `pm-copilot-agent/src/capabilities/triage.ts` | Consolidate sanitise + classify into single capability |
| `packages/core/src/reasoning/` | `pm-copilot-agent/src/capabilities/reasoning.ts` | Minor refactor |
| `packages/core/src/execution/` | `pm-copilot-agent/src/capabilities/communication.ts` | Hold queue + graduation logic preserved |
| `packages/core/src/llm/` | `pm-copilot-agent/src/llm/` | Same Claude client, tool-use patterns |
| `packages/core/src/reports/` | `pm-copilot-agent/src/capabilities/` | Coherence audit, stale watchdog become agent capabilities |
| `packages/web/src/` | `packages/web/src/` | Add chat interface; dashboard components retained |
| `packages/cdk/lib/stacks/foundation-stack.ts` | Keep | DynamoDB, some secrets |

### Code that is replaced

| Current module | Replaced by |
|----------------|-------------|
| `packages/lambdas/` (10 handlers) | Single agent container |
| `packages/cdk/lib/stacks/agent-stack.ts` | AgentCore Runtime CDK construct |
| `packages/core/src/connectors/` | AgentCore Gateway |
| `packages/core/src/integrations/jira.ts` | Jira MCP tools in Gateway |
| `packages/core/src/integrations/outlook.ts` | Outlook MCP tools in Gateway |
| `packages/core/src/integrations/ses.ts` | SES MCP tool in Gateway |
| `packages/core/src/db/checkpoint-repository.ts` | AgentCore Memory (STM) |
| Custom secrets caching (`getCachedSecret`) | AgentCore Identity |
| Step Functions ASL definition | Agent reasoning loop |
| Custom CloudWatch logging | AgentCore Observability |

### Tests

- **1,695 existing tests**: ~60% carry forward (schemas, artefact logic,
  confidence scoring, triage classification). ~40% need rewriting (Lambda
  handler tests, Step Functions integration tests, DynamoDB checkpoint tests).
- **4 Playwright E2E specs**: Carry forward. Add specs for chat interface.

---

## 11. Frontend Changes

### New: Chat interface

Add a conversational interface alongside the existing dashboard:

```
┌───────────────────────────────────────────────────┐
│  PM Copilot                              [≡] [⚙]  │
├───────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Copilot ──────────────────────────────────────┐│
│  │ Good morning. Since your last session:          ││
│  │ - 2 Jira tickets completed                     ││
│  │ - 1 new blocker (ATL-350: env access)          ││
│  │ - Delivery state updated to Amber              ││
│  │                                                 ││
│  │ The DevOps blocker needs your input.            ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ You ──────────────────────────────────────────┐│
│  │ Draft a polite escalation to the DevOps lead.   ││
│  │ Mention it's blocking the beta launch.          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Copilot ──────────────────────────────────────┐│
│  │ Here is a draft email to Jamie Park (DevOps     ││
│  │ Lead). I have placed it in the hold queue with  ││
│  │ a 5-minute review window.                       ││
│  │                                                 ││
│  │ [View Draft] [Approve] [Edit] [Cancel]          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌──────────────────────────────────┐ [Send ↵]     │
│  │ Type a message...                │               │
│  └──────────────────────────────────┘               │
└───────────────────────────────────────────────────┘
```

### Existing dashboard: retained

The Mission Control dashboard, activity feed, artefact viewers, escalation
interface, settings, and autonomy dial all remain. The chat interface is an
additional panel — not a replacement for the dashboard.

**Navigation:**
- `/` — Mission Control dashboard (existing)
- `/chat` — Copilot conversation (new)
- `/activity` — Activity feed (existing)
- `/projects/[id]` — Project detail (existing)
- `/escalations/[id]` — Decision interface (existing)
- `/settings` — Settings & autonomy dial (existing)

### WebSocket integration

The chat interface connects to AgentCore Runtime via WebSocket for streaming
responses:

```typescript
// Simplified — actual implementation uses AgentCore SDK
const ws = new WebSocket(agentCoreEndpoint);

ws.send(JSON.stringify({
  runtimeSessionId: sessionId,
  input: userMessage,
}));

ws.onmessage = (event) => {
  // Stream partial responses to the chat UI
  appendToConversation(event.data);
};
```

TanStack Query continues to handle dashboard polling (30-second refresh).

---

## 12. Background Monitoring (Retained Pattern)

The copilot is not purely reactive. It still runs background monitoring cycles
to catch changes between conversations.

### EventBridge schedule

Same as current:
- **Every 15 minutes:** Background monitoring cycle
- **Every 1 minute:** Hold queue check

### Background cycle as agent invocation

Instead of triggering a Step Functions state machine, EventBridge invokes the
AgentCore Runtime with a system prompt:

```json
{
  "runtimeSessionId": "bg-2026-02-08T10:45Z",
  "input": "SYSTEM: Run background monitoring cycle.\n\n1. Check Jira for issues updated since last cycle.\n2. Check Outlook for new messages (delta query).\n3. For each new signal: classify importance, update artefacts if needed.\n4. Create escalations for anything requiring user attention.\n5. If no changes detected, log heartbeat and terminate.\n\nDo not send any external communications. Background cycles are observe-and-record only unless an artefact update is clearly warranted."
}
```

The agent uses the same MCP tools (Jira, Outlook, DynamoDB) as interactive
sessions. The Cedar policy set can include additional constraints for background
invocations (e.g., deny `outlook_send_email` during background cycles).

### Change detection gate (preserved)

The agent's first action in a background cycle is checking for changes. If Jira
and Outlook return no deltas, the agent logs a heartbeat and terminates the
session. This keeps background cycle costs under 30 seconds per no-change run.

---

## 13. Security Architecture

### Threat model changes

| Threat | Current mitigation | AgentCore mitigation |
|--------|-------------------|---------------------|
| Prompt injection via Jira/Outlook content | Two-stage Lambda isolation (IAM) | Agent sanitises input + Cedar policies deny dangerous tool calls regardless of agent reasoning |
| Credential theft | Per-Lambda IAM roles, secrets cached in memory | AgentCore Identity vault — agent never sees raw credentials |
| Unauthorised external action | Code-level DECISION_BOUNDARIES | Cedar policies enforced at Gateway (outside agent code) |
| Agent hallucination → wrong action | 4-D confidence scoring | 4-D confidence scoring (preserved) + Cedar policy hard limits |
| Session hijacking | NextAuth CSRF | NextAuth CSRF + AgentCore IAM/OAuth for Runtime access |

### Defence in depth

```
Layer 1: Input sanitisation (agent capability — carried from current triage)
   ↓
Layer 2: Agent reasoning (confidence scoring, precedent matching)
   ↓
Layer 3: Cedar policy evaluation (Gateway-level, before tool executes)
   ↓
Layer 4: Tool-level validation (MCP tool validates parameters)
   ↓
Layer 5: External API permissions (Jira API token scope, Graph API permissions)
```

Cedar policies at Layer 3 are the key improvement. In the current system,
if the agent's execute Lambda has a bug that skips the DECISION_BOUNDARIES
check, the action proceeds. With Cedar, the Gateway enforces policy before
the tool call reaches the backend — the agent cannot bypass it.

### Prompt injection resilience

The two-stage triage concept (sanitise untrusted content before LLM processing)
carries forward as an agent capability. The key difference:

- **Current:** IAM isolation guarantees the sanitise Lambda cannot access
  integration credentials. This is a strong structural guarantee.
- **AgentCore:** The sanitisation step runs within the same agent process.
  Structural IAM isolation is lost. However:
  - Cedar policies still prevent the agent from executing dangerous tools
    regardless of what the LLM decides.
  - AgentCore Identity never exposes raw credentials to agent code.
  - The net security posture is comparable: the enforcement point shifts from
    IAM (Lambda level) to Cedar (Gateway level).

---

## 14. Migration Path

### Phase 0: Foundation (2 weeks)

- Set up AgentCore Runtime with a minimal agent (echo bot)
- Configure AgentCore Gateway with one tool (Jira read-only)
- Deploy dev-stage endpoint
- Validate WebSocket streaming from Next.js
- Establish CI/CD pipeline (ECR push → Runtime version → endpoint update)

### Phase 1: Tool migration (2 weeks)

- Register all MCP tools in Gateway (Jira, Outlook, SES, DynamoDB)
- Write Cedar policy set matching current DECISION_BOUNDARIES
- Configure AgentCore Identity for Jira OAuth and Graph API
- Validate tool calls through Gateway match current behaviour

### Phase 2: Agent core logic (3 weeks)

- Port triage, reasoning, artefact management into agent capabilities
- Configure AgentCore Memory (semantic + summary + episodic strategies)
- Implement background monitoring cycle via EventBridge → Runtime
- Validate artefact updates match current quality (golden scenarios)

### Phase 3: Chat interface (2 weeks)

- Build chat UI component in Next.js
- WebSocket connection to AgentCore Runtime
- Streaming response rendering
- Hold queue approval inline in chat
- Session management (resume, new session)

### Phase 4: Validation & cutover (1 week)

- Run both systems in parallel (Step Functions + AgentCore)
- Compare outputs for 1 week
- Decommission Step Functions, Lambda handlers
- Update CLAUDE.md and SPEC.md with new architecture decisions

### Total: ~8 weeks from start to production

---

## 15. Open Questions

| # | Question | Impact | Default if unresolved |
|---|----------|--------|----------------------|
| 1 | AgentCore Runtime pricing for I/O-wait time — is CPU truly near-zero during LLM API calls? | Cost model accuracy | Assume $0.0000015/sec memory-only during wait |
| 2 | Cedar Policy GA status — still in preview? | Safety governance readiness | Use Cedar if GA; fall back to agent-level checks if preview |
| 3 | AgentCore Memory — can custom schemas be stored in LTM, or only unstructured text? | Artefact storage strategy | Keep DynamoDB for structured artefacts, Memory for conversational context |
| 4 | TypeScript support in AgentCore SDK — Python appears primary. Is TS first-class? | Language choice for agent | Use Python if TS SDK is immature; keep Next.js frontend in TS |
| 5 | Local development story — any emulator or mock available? | Developer experience | Accept cloud-only for integration tests; unit tests remain local |
| 6 | WebSocket connection from Amplify-hosted Next.js to AgentCore Runtime — any CORS or auth complications? | Frontend integration | Validate in Phase 0 spike |
| 7 | Multi-agent pattern (separate triage agent + reasoning agent) — worth the complexity? | Architecture simplicity | Single agent unless performance or security demands separation |

---

## 16. Decision Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Product direction | PM Copilot (conversational) | Higher value than batch automation; AgentCore is purpose-built for this |
| Agent runtime | AgentCore Runtime | Managed sessions, memory, tool orchestration — no Step Functions needed |
| Tool protocol | MCP via AgentCore Gateway | Standard protocol, managed routing, Cedar policy enforcement |
| Structured PM data | DynamoDB (retained) | Artefact schemas are domain-specific; Memory is for conversational context |
| Frontend | Next.js on Amplify (retained) + chat panel | Preserve existing dashboard investment; add conversational interface |
| LLM provider | Claude via direct API (not Bedrock invocation) | Cost control, model flexibility, existing prompt library |
| Background monitoring | EventBridge → Runtime invocation | Same 15-min cycle, same change detection gate, different execution model |
| Safety governance | Cedar policies (AgentCore Policy) | Declarative, Gateway-enforced, auditable, changeable without redeploy |
| Credential management | AgentCore Identity | Managed OAuth, no manual secret rotation |
| Budget ceiling | $35/month (up from $15) | Higher capability justifies higher ceiling; actual spend likely $12-20 |
| Existing SPEC.md | Preserved as-is | This document is additive, not a replacement |

---

## Appendix A: Mapping Current Tests to New Architecture

| Test category | Current count | Carries forward | Needs rewrite | New tests needed |
|---------------|--------------|----------------|---------------|-----------------|
| Schema validation (Zod) | ~300 | ~300 | 0 | 0 |
| Triage/classification | ~200 | ~150 | ~50 | ~30 (Cedar policy) |
| Artefact generation | ~250 | ~200 | ~50 | 0 |
| Confidence scoring | ~150 | ~150 | 0 | 0 |
| Execution/hold queue | ~200 | ~100 | ~100 | ~50 (Gateway integration) |
| DynamoDB repository | ~200 | ~200 | 0 | 0 |
| Lambda handlers | ~200 | 0 | ~200 | 0 (replaced by agent tests) |
| Integration clients | ~100 | 0 | ~100 | 0 (replaced by MCP tool tests) |
| Frontend components | ~200 | ~180 | ~20 | ~50 (chat UI) |
| E2E (Playwright) | 4 | 4 | 0 | 2 (chat flows) |
| **Total** | **~1,695** | **~1,284** | **~520** | **~132** |

Estimated test count post-migration: **~1,416** (carried) + **~132** (new) = **~1,548**
Net reduction of ~150 tests (Lambda handler tests eliminated, partially offset by
new Gateway/chat tests).

---

## Appendix B: AgentCore Service Map

```
┌────────────────────────────────────────────────────────────────────┐
│                     Amazon Bedrock AgentCore                       │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│
│  │   Runtime     │  │   Gateway    │  │   Memory                 ││
│  │              │  │              │  │                          ││
│  │  Agent       │  │  MCP tools   │  │  STM: session context    ││
│  │  container   │◄─┤  Cedar       │  │  LTM: semantic, summary, ││
│  │  Sessions    │  │  policy      │  │       episodic           ││
│  │  Versions    │  │  enforcement │  │  Retrieval: semantic     ││
│  │  Endpoints   │  │              │  │            search        ││
│  └──────────────┘  └──────────────┘  └──────────────────────────┘│
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│
│  │   Identity   │  │ Observability│  │   Evaluations            ││
│  │              │  │              │  │                          ││
│  │  OAuth vault │  │  OTel traces │  │  Response quality        ││
│  │  Token       │  │  Tool call   │  │  Tool selection accuracy ││
│  │  refresh     │  │  metrics     │  │  Artefact accuracy       ││
│  │  Credential  │  │  Agent       │  │  Safety compliance       ││
│  │  isolation   │  │  reasoning   │  │  Golden scenario         ││
│  │              │  │  visibility  │  │  regression              ││
│  └──────────────┘  └──────────────┘  └──────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```
