# Backend Agent Runtime: AWS Migration Analysis

> **Role:** Backend Engineer
> **Status:** Analysis complete
> **Date:** February 2026

---

## 1. Current Architecture Summary

The agent currently runs as a **persistent Node.js process** on a Hetzner VPS ($4/month) managed by pm2. Key characteristics:

| Aspect | Current Implementation |
|--------|----------------------|
| Runtime | Persistent Node.js process |
| Scheduling | Internal 15-minute loop |
| Database keepalive | SELECT 1 every 4 minutes |
| LLM calls | Direct Claude API (Haiku/Sonnet) |
| Process manager | pm2 with auto-restart |
| Execution model | Long-running, stateful |

### Agent Loop Summary (from SPEC.md Section 5.1)

```
Every 15 minutes:
1. KEEPALIVE          → Neon SELECT 1, heartbeat log
2. CHANGE DETECTION   → Poll Jira/Outlook for deltas (zero LLM cost)
3. SIGNAL NORMALISE   → Convert to NormalisedSignal objects
4. TWO-PASS TRIAGE    → Haiku: sanitise → classify
5. REASONING          → Sonnet (only 15% of cycles)
6. EXECUTION          → Auto-execute, hold queue, or escalate
7. ARTEFACT UPDATE    → Update JSONB content if needed
8. HOLD QUEUE CHECK   → Release held actions past their window
9. HOUSEKEEPING       → Daily pruning, digest email
```

### Critical Design Constraints

1. **Change detection gate is mandatory** — without it, LLM costs exceed budget
2. **LLM calls take 10-30 seconds** — must handle long API latency
3. **Hold queue requires time-based processing** — actions release after delay
4. **Neon keepalive prevents cold starts** — 4-minute interval
5. **Daily housekeeping** — runs on first cycle after midnight

---

## 2. AWS Design Options Analysis

### Option A: Step Functions State Machine

**Architecture:**
```
EventBridge (15-min schedule)
    │
    ▼
Step Functions State Machine
    │
    ├─→ Lambda: ChangeDetection
    │       │ (check Jira/Outlook deltas)
    │       ▼
    │   [Choice: changes found?]
    │       │
    │   [No] → End (log heartbeat only)
    │       │
    │   [Yes] ↓
    ├─→ Lambda: SignalNormalise
    │       │
    │       ▼
    ├─→ Lambda: TriagePass1 (sanitise)
    │       │
    │       ▼
    ├─→ Lambda: TriagePass2 (classify)
    │       │
    │       ▼
    ├─→ Lambda: Reasoning (conditional)
    │       │
    │       ▼
    ├─→ Lambda: Execution
    │       │
    │       ▼
    └─→ Lambda: ArtefactUpdate
```

**Pros:**
- Native AWS integration with full observability
- Built-in retry and error handling per step
- Pay only for execution time (no idle costs)
- State machine visualisation for debugging
- Each step independently scalable and testable
- Supports parallel execution for independent signals
- Native timeout handling per step
- Automatic state persistence between steps

**Cons:**
- Cold starts accumulate (6-8 Lambdas per cycle)
- State passing overhead between steps
- Step Functions pricing adds up: $0.025 per 1,000 state transitions
- Complex orchestration for hold queue (needs separate scheduled process)
- Database connection management across multiple Lambdas
- 15-minute Lambda timeout is tight for complex cycles

**Cost estimate (monthly):**
- Lambda: ~$3-5 (assuming 20 active cycles/day × 30 days)
- Step Functions: ~$1-2 (state transitions)
- EventBridge: negligible
- **Total: ~$4-7/month**

---

### Option B: Fargate Scheduled Task

**Architecture:**
```
EventBridge (15-min schedule)
    │
    ▼
ECS Fargate Task
    │
    └─→ Container runs full agent cycle
        (Change Detection → Triage → Reasoning → Execution)
        │
        └─→ Exits when complete
```

**Pros:**
- Single container runs entire cycle (no cold start accumulation)
- No execution time limit (unlike Lambda 15-min)
- Matches current architecture closely
- Simple deployment (Docker container)
- Full control over runtime environment
- Native support for long-running LLM calls
- Database connection pooling within container lifecycle

**Cons:**
- Minimum 1-minute billing granularity (wasteful for short cycles)
- ~30-60 second container startup time
- Fargate pricing higher than Lambda for short tasks
- No built-in orchestration (all logic in container)
- Hold queue still needs separate scheduled process
- Less granular observability than Step Functions

**Cost estimate (monthly):**
- Fargate: ~$8-12 (0.25 vCPU, 0.5GB, ~5min per task, 96 tasks/day)
- EventBridge: negligible
- **Total: ~$8-12/month**

---

### Option C: Lambda with Long-Running Support

**Architecture:**
```
EventBridge (15-min schedule)
    │
    ▼
Single Lambda Function (15-min timeout)
    │
    └─→ Runs entire agent cycle
```

**Pros:**
- Simplest architecture (single function)
- Low cost when cycles are short
- Easy deployment and testing
- No container build/push cycle

**Cons:**
- **Critical: 15-minute hard limit is problematic**
  - Complex cycles with Sonnet reasoning can approach this limit
  - No recovery if timeout occurs mid-execution
- Cold starts affect every cycle (no persistent connections)
- Cannot handle hold queue processing (different schedule)
- Memory limited to 10GB (adequate but constrained)
- Database connection overhead per invocation
- Risk of partial execution with no rollback

**Cost estimate (monthly):**
- Lambda: ~$2-4
- EventBridge: negligible
- **Total: ~$2-4/month**

**Risk assessment:** The 15-minute timeout is a **hard constraint** that creates unacceptable risk. A single slow Claude API response or network hiccup could cause the function to timeout mid-execution, leaving the system in an inconsistent state.

---

### Option D: ECS Service (Persistent Container)

**Architecture:**
```
ECS Service (always running)
    │
    └─→ Container with pm2/supervisor
        │
        ├─→ 15-min agent loop (internal scheduler)
        ├─→ 4-min Neon keepalive
        └─→ Hold queue processor
```

**Pros:**
- Closest to current VPS architecture
- No cold starts (persistent container)
- Internal scheduling (same as current pm2)
- Persistent database connections
- Hold queue and keepalive run in same process
- Unlimited execution time for complex cycles
- Simple migration from current codebase

**Cons:**
- Always-on cost even when idle
- Single point of failure (needs health checks)
- Less "cloud-native" than serverless options
- Manual scaling if needed (not relevant for single-user)
- Overprovisioned most of the time

**Cost estimate (monthly):**
- Fargate: ~$15-20 (0.25 vCPU, 0.5GB, always-on)
- **Total: ~$15-20/month**

---

## 3. Recommendation: Hybrid Step Functions + Lambda

**Recommended approach: Option A (Step Functions) with architectural refinements**

### Rationale

1. **Cost efficiency:** Only pay for actual execution (~$4-7/month vs $15-20 for persistent)

2. **Observability:** Step Functions provides visual workflow debugging, execution history, and per-step metrics — invaluable for an autonomous agent

3. **Resilience:** Built-in retry logic and error handling per step. If Claude API times out, only that step retries

4. **Separation of concerns:** Each step has a single responsibility, making testing and debugging easier

5. **Hold queue handling:** Use a separate EventBridge rule (1-minute schedule) to trigger a dedicated hold queue Lambda

6. **Future-proof:** If complexity grows, can add parallel processing, branching, or additional steps without restructuring

### Why Not the Others?

| Option | Rejection reason |
|--------|-----------------|
| B (Fargate scheduled) | Higher cost for short cycles; 30-60s startup overhead |
| C (Single Lambda) | 15-minute timeout is unacceptable risk for LLM-heavy cycles |
| D (Persistent ECS) | 3-4x cost of Step Functions for a 15-min polling use case |

---

## 4. Step Functions State Machine Design

### 4.1 Main Agent State Machine

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

### 4.2 State Machine Diagram

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

### 4.3 Hold Queue State Machine (Separate)

The hold queue runs on a **1-minute EventBridge schedule** as a simple Lambda:

```json
{
  "Comment": "Hold Queue Processor",
  "StartAt": "ProcessHoldQueue",
  "States": {
    "ProcessHoldQueue": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-hold-queue",
      "End": true,
      "TimeoutSeconds": 60,
      "Retry": [
        {
          "ErrorEquals": ["States.TaskFailed"],
          "IntervalSeconds": 10,
          "MaxAttempts": 2
        }
      ]
    }
  }
}
```

### 4.4 Error Handling Strategy

| Error Type | Handling |
|------------|----------|
| LLM timeout | Retry 2x with backoff (30s, 60s) |
| LLM rate limit | Retry 3x with exponential backoff |
| Database connection | Retry 3x, then fail (alert via SNS) |
| Integration API error | Log and continue (skip that source) |
| Schema validation | Log error, use previous artefact version |
| Budget exceeded | Skip LLM steps, log heartbeat only |

### 4.5 Neon Keepalive Solution

The 4-minute keepalive is handled by a **separate scheduled Lambda**:

```
EventBridge (4-minute rate)
    │
    ▼
Lambda: neon-keepalive
    │
    └─→ SELECT 1 to Neon
```

This runs independently of the main agent cycle.

---

## 5. LLM Integration Strategy

### 5.1 Recommendation: Keep Claude API (Do Not Switch to Bedrock)

**Rationale:**

| Factor | Claude API | Amazon Bedrock |
|--------|------------|----------------|
| Model availability | Haiku 4.5, Sonnet 4.5 (latest) | May lag behind API releases |
| Tool-use support | Native, mature | Via Bedrock, potential abstraction issues |
| Pricing | Known, spec'd for budget | Variable, cross-region complexity |
| Prompt caching | Supported | May not be available for all models |
| Migration risk | None (current implementation) | Re-test all prompts, tool schemas |

**Decision:** Keep Claude API. The spec is already optimised around Claude tool-use. Switching to Bedrock introduces migration risk with minimal benefit for a single-user application.

### 5.2 Handling 10-30 Second LLM Calls in Lambda

**Challenge:** Claude API calls typically take 10-30 seconds. Lambda functions must handle this gracefully.

**Solution:**

1. **Set appropriate timeouts:**
   - Triage Lambdas: 120 seconds
   - Reasoning Lambda: 300 seconds (5 minutes)
   - Step Functions task timeout: slightly higher than Lambda

2. **Implement streaming where beneficial:**
   ```typescript
   // For long reasoning calls, use streaming to detect hangs
   const response = await anthropic.messages.create({
     model: 'claude-sonnet-4-5-20250514',
     max_tokens: 4096,
     stream: true,
     // ...
   });

   for await (const event of response) {
     // Process incrementally, detect stalls
   }
   ```

3. **Budget check before LLM call:**
   ```typescript
   async function checkBudgetBeforeLLM(model: 'haiku' | 'sonnet'): Promise<boolean> {
     const dailySpend = await getDailySpend();
     const limit = getDegradationLimit();

     if (dailySpend >= limit.hardCeiling) {
       return false; // Skip LLM entirely
     }

     if (dailySpend >= limit.tier3 && model === 'sonnet') {
       return false; // Haiku-only mode
     }

     return true;
   }
   ```

### 5.3 Cost Implications on AWS

The LLM cost model remains unchanged from the spec:

| Model | Monthly estimate |
|-------|-----------------|
| Haiku 4.5 (70% of calls) | ~$3.68 |
| Sonnet 4.5 (30% of calls) | ~$2.16 |
| With prompt caching | ~$4.22 |

**AWS-specific considerations:**
- VPC endpoints to Claude API not required (public API)
- No additional cost for LLM traffic
- Secrets Manager for API key storage: ~$0.40/month

---

## 6. Code Structure

### 6.1 Repository Organisation

```
/
├── packages/
│   ├── core/                    # Shared business logic
│   │   ├── src/
│   │   │   ├── signals/         # Signal normalisation
│   │   │   │   ├── types.ts
│   │   │   │   ├── jira.ts
│   │   │   │   └── outlook.ts
│   │   │   ├── triage/          # Triage logic
│   │   │   │   ├── sanitise.ts
│   │   │   │   └── classify.ts
│   │   │   ├── reasoning/       # Complex reasoning
│   │   │   │   └── sonnet.ts
│   │   │   ├── execution/       # Action execution
│   │   │   │   ├── boundaries.ts
│   │   │   │   ├── confidence.ts
│   │   │   │   └── executor.ts
│   │   │   ├── artefacts/       # Artefact management
│   │   │   │   ├── schemas.ts
│   │   │   │   └── updater.ts
│   │   │   ├── llm/             # Claude API abstraction
│   │   │   │   ├── client.ts
│   │   │   │   ├── tools.ts
│   │   │   │   └── budget.ts
│   │   │   ├── db/              # Database access
│   │   │   │   ├── schema.ts
│   │   │   │   ├── queries.ts
│   │   │   │   └── connection.ts
│   │   │   └── integrations/    # External APIs
│   │   │       ├── jira.ts
│   │   │       ├── outlook.ts
│   │   │       └── resend.ts
│   │   └── package.json
│   │
│   ├── lambdas/                 # Lambda function handlers
│   │   ├── heartbeat/
│   │   │   └── index.ts
│   │   ├── change-detection/
│   │   │   └── index.ts
│   │   ├── normalise/
│   │   │   └── index.ts
│   │   ├── triage-sanitise/
│   │   │   └── index.ts
│   │   ├── triage-classify/
│   │   │   └── index.ts
│   │   ├── reasoning/
│   │   │   └── index.ts
│   │   ├── execute/
│   │   │   └── index.ts
│   │   ├── artefact-update/
│   │   │   └── index.ts
│   │   ├── housekeeping/
│   │   │   └── index.ts
│   │   ├── hold-queue/
│   │   │   └── index.ts
│   │   └── neon-keepalive/
│   │       └── index.ts
│   │
│   └── web/                     # Next.js frontend (unchanged)
│       └── ...
│
├── infra/                       # AWS CDK / Terraform
│   ├── lib/
│   │   ├── step-functions.ts
│   │   ├── lambdas.ts
│   │   ├── eventbridge.ts
│   │   └── secrets.ts
│   └── bin/
│       └── deploy.ts
│
├── state-machines/              # Step Functions definitions
│   ├── agent-cycle.asl.json
│   └── hold-queue.asl.json
│
└── package.json                 # Monorepo root (pnpm workspaces)
```

### 6.2 Lambda Handler Pattern

Each Lambda is a thin wrapper around core business logic:

```typescript
// packages/lambdas/triage-sanitise/index.ts
import { sanitiseSignals } from '@agentic-pm/core/triage';
import { getDbConnection } from '@agentic-pm/core/db';
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
  // Budget check
  const canProceed = await checkBudget('haiku');
  if (!canProceed) {
    throw new Error('BudgetExceeded');
  }

  // Core business logic (same code as VPS version)
  const result = await sanitiseSignals(event.signals, event.projectId);

  return {
    sanitised: result.sanitised,
    tokenUsage: result.tokenUsage,
  };
}
```

### 6.3 Shared Library Design

The `@agentic-pm/core` package contains all business logic and is:

1. **Platform-agnostic** — works in Lambda, ECS, or local Node.js
2. **Testable in isolation** — no AWS dependencies in core logic
3. **Typed end-to-end** — strict TypeScript with Zod schemas

```typescript
// packages/core/src/llm/client.ts
import Anthropic from '@anthropic-ai/sdk';
import { getSecret } from '../secrets';

let client: Anthropic | null = null;

export async function getLLMClient(): Promise<Anthropic> {
  if (!client) {
    const apiKey = await getSecret('ANTHROPIC_API_KEY');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Platform-agnostic secret retrieval
async function getSecret(name: string): Promise<string> {
  // In Lambda: AWS Secrets Manager
  // In local dev: environment variable
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return getSecretFromSecretsManager(name);
  }
  return process.env[name]!;
}
```

### 6.4 Database Connection Strategy

```typescript
// packages/core/src/db/connection.ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

let pool: Pool | null = null;

export async function getDb() {
  if (!pool) {
    const connectionString = await getSecret('DATABASE_URL');
    pool = new Pool({
      connectionString,
      max: 1,  // Lambda: single connection
      idleTimeoutMillis: 120000,  // Keep alive during Lambda warm period
    });
  }
  return drizzle(pool);
}

// Cleanup for Lambda cold start prevention
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

---

## 7. Local Development Workflow

### 7.1 Running Locally

```bash
# Install dependencies
pnpm install

# Start local development
pnpm dev:agent

# This runs the full agent loop locally (same as current VPS)
# Uses local environment variables for secrets
# Connects to Neon dev branch
```

### 7.2 Local Agent Runner

```typescript
// packages/core/src/local-runner.ts
import { runAgentCycle } from './agent';

async function main() {
  console.log('Starting local agent runner...');

  // Run immediately, then every 15 minutes
  await runAgentCycle();

  setInterval(async () => {
    await runAgentCycle();
  }, 15 * 60 * 1000);
}

main().catch(console.error);
```

### 7.3 Testing Individual Steps

```bash
# Test a single Lambda locally
pnpm test:lambda triage-sanitise

# Run with sample input
echo '{"signals": [...]}' | pnpm invoke:local triage-sanitise

# Run Step Functions locally with SAM
sam local invoke AgentTriageSanitise --event events/sample-signals.json
```

### 7.4 Integration Testing

```bash
# Run against Neon dev branch
NEON_BRANCH=dev pnpm test:integration

# Run with mocked external APIs
MOCK_EXTERNAL=true pnpm test:integration
```

---

## 8. Migration Path

### Phase 1: Prepare Core Library

1. Extract business logic from current VPS codebase into `@agentic-pm/core`
2. Add platform-agnostic secret and connection handling
3. Ensure all logic passes existing tests

### Phase 2: Build Lambda Handlers

1. Create thin Lambda wrappers for each agent step
2. Test each Lambda in isolation with `sam local invoke`
3. Validate LLM calls work within Lambda timeouts

### Phase 3: Step Functions Deployment

1. Deploy state machine to AWS
2. Configure EventBridge schedules (15-min main, 1-min hold queue, 4-min keepalive)
3. Test full cycle in AWS with dry-run mode enabled

### Phase 4: Parallel Running

1. Run both VPS and Step Functions in parallel
2. VPS in monitoring-only mode, Step Functions in dry-run
3. Compare outputs for 1 week

### Phase 5: Cutover

1. Disable VPS agent
2. Enable Step Functions execution mode
3. Monitor for 48 hours
4. Decommission VPS

---

## 9. Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Step Functions | ~$1-2 |
| Lambda (all functions) | ~$3-4 |
| EventBridge | ~$0.10 |
| Secrets Manager | ~$0.40 |
| CloudWatch Logs | ~$1-2 |
| **Total Agent Runtime** | **~$6-9/month** |

Compared to current VPS ($4/month), the AWS solution is slightly more expensive but provides:
- Full observability and debugging via Step Functions console
- Automatic retry and error handling
- No server maintenance
- Better scaling if ever needed

---

## 10. Open Questions

1. **Cold start optimisation:** Should we use provisioned concurrency for the LLM-calling Lambdas? Adds ~$3-5/month but eliminates cold start latency.

2. **State machine granularity:** Should triage be one Lambda (sanitise + classify) or two? Current design uses two for clearer observability but adds state transition cost.

3. **Parallel signal processing:** When multiple signals arrive, should we process them in parallel within the state machine? Current design processes sequentially for simplicity.

4. **VPC placement:** Should Lambdas be in a VPC for RDS access? Neon is publicly accessible, so VPC adds complexity without benefit for the current architecture.

---

## 11. Conclusion

The **Step Functions + Lambda** architecture is the recommended approach for AWS migration. It provides:

- **Cost efficiency:** ~$6-9/month vs $15-20 for persistent containers
- **Observability:** Visual workflow debugging and execution history
- **Resilience:** Built-in retry and error handling per step
- **Maintainability:** Clear separation of concerns in the codebase

The architecture preserves all critical features from the current spec:
- Change detection gate (zero LLM cost when no changes)
- Two-pass triage for prompt injection defence
- Hold queue processing (separate scheduled Lambda)
- Budget controls and degradation ladder
- Neon keepalive (separate scheduled Lambda)

The migration path allows parallel running with the VPS, enabling safe cutover with rollback capability.
