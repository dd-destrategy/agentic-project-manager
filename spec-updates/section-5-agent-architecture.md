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
│   │  Artefact   │  Update JSONB if signals warrant                     │
│   │   Update    │  Timeout: 180s (may invoke Haiku)                    │
│   └──────┬──────┘                         │                            │
│          │                                │                            │
│   ┌──────▼──────────────────────────────────                           │
│   │     Check Housekeeping Due?           │                            │
│   └──────┬──────────────────────────────────                           │
│          │                                │                            │
│   ┌──────▼──────┐                         │                            │
│   │Housekeeping │  Daily: prune old data, send digest                  │
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

### 5.2 State machine diagram

```
                         ┌─────────────┐
                         │  Heartbeat  │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │   Change    │
                         │  Detection  │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                    No   │ Has Changes?│   Yes
               ┌─────────┤             ├──────────┐
               │         └─────────────┘          │
               │                           ┌──────▼──────┐
               │                           │  Normalise  │
               │                           │   Signals   │
               │                           └──────┬──────┘
               │                                  │
               │                           ┌──────▼──────┐
               │                           │   Triage    │
               │                           │  Sanitise   │
               │                           │   (Haiku)   │
               │                           └──────┬──────┘
               │                                  │
               │                           ┌──────▼──────┐
               │                           │   Triage    │
               │                           │  Classify   │
               │                           │   (Haiku)   │
               │                           └──────┬──────┘
               │                                  │
               │                           ┌──────▼──────┐
               │                      No   │   Needs     │  Yes
               │                   ┌───────┤  Reasoning? ├───────┐
               │                   │       └─────────────┘       │
               │                   │                      ┌──────▼──────┐
               │                   │                      │   Complex   │
               │                   │                      │  Reasoning  │
               │                   │                      │  (Sonnet)   │
               │                   │                      └──────┬──────┘
               │                   │                             │
               │                   │       ┌─────────────────────┘
               │                   │       │
               │            ┌──────▼───────▼──┐
               │            │ Execute Actions │
               │            └────────┬────────┘
               │                     │
               │            ┌────────▼────────┐
               │            │ Update Artefacts│
               │            └────────┬────────┘
               │                     │
               │         ┌───────────▼───────────┐
               └────────►│  Check Housekeeping   │
                         │    (daily due?)       │
                         └───────────┬───────────┘
                                     │
                              ┌──────▼──────┐
                         No   │Housekeeping │  Yes
                      ┌───────┤    Due?     ├───────┐
                      │       └─────────────┘       │
                      │                      ┌──────▼──────┐
                      │                      │    Run      │
                      │                      │ Housekeeping│
                      │                      └──────┬──────┘
                      │                             │
               ┌──────▼─────────────────────────────▼──────┐
               │                 Success                    │
               └────────────────────────────────────────────┘
```

### 5.3 Lambda function breakdown

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
| `agent-artefact-update` | Update artefact JSONB content if warranted by signals | 180s | 2x with 30s backoff |
| `agent-housekeeping` | Daily pruning, storage check, digest email | 120s | 2x with 30s backoff |
| `agent-hold-queue` | Process held actions past their `held_until` timestamp | 60s | 2x with 10s backoff |

**Lambda handler pattern:**

```typescript
// packages/lambdas/triage-sanitise/index.ts
import { sanitiseSignals } from '@agentic-pm/core/triage';
import { checkBudget } from '@agentic-pm/core/llm';
import type { Context } from 'aws-lambda';

interface TriageSanitiseInput {
  signals: NormalisedSignal[];
  projectId: string;
}

interface TriageSanitiseOutput {
  sanitised: SanitisedSignal[];
  tokenUsage: { input: number; output: number };
}

export async function handler(
  event: TriageSanitiseInput,
  context: Context
): Promise<TriageSanitiseOutput> {
  // Budget check before LLM call
  const canProceed = await checkBudget('haiku');
  if (!canProceed) {
    throw new Error('BudgetExceeded');
  }

  // Core business logic (shared library)
  const result = await sanitiseSignals(event.signals, event.projectId);

  return {
    sanitised: result.sanitised,
    tokenUsage: result.tokenUsage,
  };
}
```

**Error handling strategy:**

| Error type | Handling |
|------------|----------|
| LLM timeout | Retry 2x with backoff (30s, 60s) |
| LLM rate limit | Retry 3x with exponential backoff |
| Database connection | Retry 3x, then fail (alert via SNS) |
| Integration API error | Log and continue (skip that source) |
| Schema validation | Log error, use previous artefact version |
| Budget exceeded | Skip LLM steps, log heartbeat only |

### 5.4 Signal source abstraction

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

### 5.5 Decision boundaries

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

### 5.6 Structured confidence scoring

Do not ask Claude for a single confidence number. Instead, score four independent dimensions:

| Dimension | What it measures | How it's computed |
|-----------|-----------------|-------------------|
| **Source agreement** | Do multiple sources corroborate? | Deterministic: count confirming signals |
| **Boundary compliance** | Is the action within defined boundaries? | Deterministic: lookup in decisionBoundaries |
| **Schema validity** | Did Claude return valid structured output? | Deterministic: validate against schema |
| **Precedent match** | Has this type of action succeeded before? | Query agent_actions for similar past actions |

**Auto-execute rule:** All four dimensions must pass. If any dimension fails, escalate. This is deterministic and inspectable, not a magic number from the LLM.

### 5.7 Autonomy levels

| Level | Name | Agent does autonomously | Agent escalates |
|-------|------|------------------------|-----------------|
| 1 | **Monitoring** | Observe, log, maintain heartbeat. No external actions. | Everything |
| 2 | **Artefact** | All of Level 1 + update artefacts, send user notifications via Resend | External communications, Jira writes |
| 3 | **Tactical** | All of Level 2 + send stakeholder emails (via hold queue), update Jira tickets, respond to routine patterns | Strategic decisions, external comms, scope changes |

**Graduation criteria** (must be met before promoting):

| From - To | Criteria |
|-----------|----------|
| 1 - 2 | 7 consecutive days of monitoring with zero false signal classifications (manual review) |
| 2 - 3 | 14 consecutive days of artefact updates with zero manual corrections needed; user has reviewed and approved at least 5 held communications |

Level 4 (Strategic) is explicitly deferred from all planning.

### 5.8 Schedule configuration

| Schedule | Target | Purpose |
|----------|--------|---------|
| EventBridge: `rate(15 minutes)` | Main state machine | Primary agent cycle |
| EventBridge: `rate(1 minute)` | `agent-hold-queue` Lambda | Release held actions past their window |

**Housekeeping timing:** The main state machine checks if housekeeping is due (first cycle after midnight in configured timezone). If due, it invokes the housekeeping step. This is evaluated within the state machine, not via a separate schedule.

### 5.9 State machine definition (ASL excerpt)

```json
{
  "Comment": "Agentic PM Agent Cycle",
  "StartAt": "Heartbeat",
  "States": {
    "Heartbeat": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-heartbeat",
      "Next": "ChangeDetection",
      "Retry": [
        {
          "ErrorEquals": ["States.TaskFailed"],
          "IntervalSeconds": 5,
          "MaxAttempts": 2
        }
      ],
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "Next": "LogError"
        }
      ]
    },

    "ChangeDetection": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-change-detection",
      "ResultPath": "$.changes",
      "Next": "HasChanges",
      "Retry": [
        {
          "ErrorEquals": ["States.TaskFailed"],
          "IntervalSeconds": 10,
          "MaxAttempts": 3
        }
      ]
    },

    "HasChanges": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.changes.hasChanges",
          "BooleanEquals": false,
          "Next": "CheckHousekeeping"
        }
      ],
      "Default": "NormaliseSignals"
    },

    "NormaliseSignals": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-normalise",
      "ResultPath": "$.signals",
      "Next": "TriageSanitise"
    },

    "TriageSanitise": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-triage-sanitise",
      "ResultPath": "$.sanitised",
      "Next": "TriageClassify",
      "TimeoutSeconds": 120,
      "Retry": [
        {
          "ErrorEquals": ["LLMTimeoutError"],
          "IntervalSeconds": 30,
          "MaxAttempts": 2
        }
      ]
    },

    "TriageClassify": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-triage-classify",
      "ResultPath": "$.classified",
      "Next": "NeedsReasoning",
      "TimeoutSeconds": 120
    },

    "NeedsReasoning": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.classified.requiresSonnet",
          "BooleanEquals": true,
          "Next": "ComplexReasoning"
        }
      ],
      "Default": "ExecuteActions"
    },

    "ComplexReasoning": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-reasoning",
      "ResultPath": "$.reasoningResult",
      "Next": "ExecuteActions",
      "TimeoutSeconds": 300,
      "Retry": [
        {
          "ErrorEquals": ["LLMTimeoutError"],
          "IntervalSeconds": 60,
          "MaxAttempts": 2
        }
      ]
    },

    "ExecuteActions": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-execute",
      "ResultPath": "$.executionResult",
      "Next": "UpdateArtefacts"
    },

    "UpdateArtefacts": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-artefact-update",
      "ResultPath": "$.artefactResult",
      "Next": "CheckHousekeeping",
      "TimeoutSeconds": 180
    },

    "CheckHousekeeping": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.housekeepingDue",
          "BooleanEquals": true,
          "Next": "RunHousekeeping"
        }
      ],
      "Default": "Success"
    },

    "RunHousekeeping": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-housekeeping",
      "Next": "Success"
    },

    "LogError": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-log-error",
      "Next": "Fail"
    },

    "Fail": {
      "Type": "Fail",
      "Error": "AgentCycleError",
      "Cause": "Agent cycle failed after retries"
    },

    "Success": {
      "Type": "Succeed"
    }
  }
}
```

### 5.10 Shared library (`@agentic-pm/core`)

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
│   │   └── connection.ts
│   └── integrations/    # External APIs
│       ├── jira.ts
│       ├── outlook.ts
│       └── resend.ts
└── package.json
```

---
