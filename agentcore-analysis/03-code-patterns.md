# Code Patterns: Step Functions + Lambda vs AgentCore Runtime

> **Role:** Backend Engineer (AI Agent Development)
> **Status:** Analysis complete
> **Date:** February 2026

---

## 1. Executive Summary

This analysis compares how our agent would be structured in two approaches:

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|------------------------|-------------------|
| Orchestration | AWS Step Functions state machine | Agent framework (LangGraph, Strands, CrewAI) |
| Compute | Individual Lambda functions | Containerised agent in microVM |
| Scheduling | EventBridge Scheduler (external) | Lambda + InvokeAgentRuntime (external trigger required) |
| State management | Step Functions passes state between Lambdas | Session-based (ephemeral) + AgentCore Memory (persistent) |
| Code reuse | `@agentic-pm/core` library | Same library, different wrapper |
| Cost model | Per-invocation Lambda + state transitions | Per-session microVM + invocation |

**Key finding:** AgentCore Runtime is designed for **interactive, long-running agent sessions** (up to 8 hours). Our use case is a **scheduled, batch-style agent** running every 15 minutes for 1-5 minutes. AgentCore introduces complexity without clear benefit for this pattern.

---

## 2. Current Architecture (Step Functions + Lambda)

### 2.1 High-Level Structure

```
EventBridge Scheduler (15-min)
         │
         ▼
    Step Functions State Machine
         │
         ├─► Lambda: Heartbeat
         ├─► Lambda: Change Detection
         ├─► Lambda: Normalise
         ├─► Lambda: Triage Sanitise (Haiku)
         ├─► Lambda: Triage Classify (Haiku)
         ├─► Lambda: Reasoning (Sonnet) [conditional]
         ├─► Lambda: Execute Actions
         └─► Lambda: Artefact Update

EventBridge Scheduler (1-min)
         │
         ▼
    Lambda: Hold Queue Processor
```

### 2.2 Code Organisation

```
packages/
├── core/                    # @agentic-pm/core - shared business logic
│   ├── src/
│   │   ├── signals/        # Jira, Outlook normalisation
│   │   ├── triage/         # Haiku sanitise + classify
│   │   ├── reasoning/      # Sonnet complex reasoning
│   │   ├── execution/      # Action boundaries, confidence
│   │   ├── artefacts/      # Schema validation, updates
│   │   ├── llm/            # Claude API client, budget tracking
│   │   ├── db/             # DynamoDB queries
│   │   └── integrations/   # Jira, Outlook, SES clients
│   └── package.json
│
├── lambdas/                # Thin Lambda handlers
│   ├── heartbeat/
│   │   └── index.ts
│   ├── change-detection/
│   │   └── index.ts
│   ├── normalise/
│   │   └── index.ts
│   ├── triage-sanitise/
│   │   └── index.ts
│   ├── triage-classify/
│   │   └── index.ts
│   ├── reasoning/
│   │   └── index.ts
│   ├── execute/
│   │   └── index.ts
│   ├── artefact-update/
│   │   └── index.ts
│   ├── housekeeping/
│   │   └── index.ts
│   └── hold-queue/
│       └── index.ts
│
└── web/                    # Next.js frontend
```

### 2.3 Lambda Handler Pattern

Each Lambda is a thin wrapper around core business logic:

```typescript
// packages/lambdas/triage-sanitise/index.ts
import { sanitiseSignals } from '@agentic-pm/core/triage';
import { checkBudget, recordTokenUsage } from '@agentic-pm/core/llm';
import { logEvent } from '@agentic-pm/core/db';
import type { Context, Handler } from 'aws-lambda';

interface TriageSanitiseInput {
  signals: NormalisedSignal[];
  projectId: string;
  cycleId: string;
}

interface TriageSanitiseOutput {
  sanitised: SanitisedSignal[];
  tokenUsage: { input: number; output: number };
  cycleId: string;
}

export const handler: Handler<TriageSanitiseInput, TriageSanitiseOutput> = async (
  event,
  context
) => {
  const { signals, projectId, cycleId } = event;

  // Budget gate - skip LLM if over budget
  const canProceed = await checkBudget('haiku');
  if (!canProceed) {
    await logEvent({
      projectId,
      eventType: 'budget_exceeded',
      severity: 'warning',
      summary: 'Skipping triage due to budget limit',
    });
    throw new Error('BudgetExceeded');
  }

  // Core business logic (platform-agnostic)
  const result = await sanitiseSignals(signals, projectId);

  // Record token usage for budget tracking
  await recordTokenUsage('haiku', result.tokenUsage);

  return {
    sanitised: result.sanitised,
    tokenUsage: result.tokenUsage,
    cycleId,
  };
};
```

### 2.4 Step Functions State Machine Definition

```json
{
  "Comment": "Agentic PM Agent Cycle",
  "StartAt": "Heartbeat",
  "States": {
    "Heartbeat": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-heartbeat",
      "ResultPath": "$.heartbeat",
      "Next": "ChangeDetection",
      "Retry": [{ "ErrorEquals": ["States.TaskFailed"], "MaxAttempts": 2 }]
    },

    "ChangeDetection": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-change-detection",
      "ResultPath": "$.changes",
      "Next": "HasChanges",
      "Retry": [{ "ErrorEquals": ["States.TaskFailed"], "MaxAttempts": 3 }]
    },

    "HasChanges": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.changes.hasChanges",
        "BooleanEquals": false,
        "Next": "CheckHousekeeping"
      }],
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
      "TimeoutSeconds": 120
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
      "Choices": [{
        "Variable": "$.classified.requiresSonnet",
        "BooleanEquals": true,
        "Next": "ComplexReasoning"
      }],
      "Default": "ExecuteActions"
    },

    "ComplexReasoning": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-reasoning",
      "ResultPath": "$.reasoning",
      "Next": "ExecuteActions",
      "TimeoutSeconds": 300
    },

    "ExecuteActions": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-execute",
      "ResultPath": "$.execution",
      "Next": "UpdateArtefacts"
    },

    "UpdateArtefacts": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-artefact-update",
      "ResultPath": "$.artefacts",
      "Next": "CheckHousekeeping",
      "TimeoutSeconds": 180
    },

    "CheckHousekeeping": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.heartbeat.housekeepingDue",
        "BooleanEquals": true,
        "Next": "RunHousekeeping"
      }],
      "Default": "Success"
    },

    "RunHousekeeping": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:agent-housekeeping",
      "Next": "Success"
    },

    "Success": { "Type": "Succeed" }
  }
}
```

### 2.5 Change Detection Gate Implementation

```typescript
// packages/lambdas/change-detection/index.ts
import { getJiraChanges, getOutlookChanges } from '@agentic-pm/core/integrations';
import { getCheckpoint, saveCheckpoint } from '@agentic-pm/core/db';

interface ChangeDetectionInput {
  projectId: string;
  cycleId: string;
}

interface ChangeDetectionOutput {
  hasChanges: boolean;
  jiraChanges: RawJiraChange[];
  outlookChanges: RawOutlookChange[];
  newCheckpoints: {
    jira: string;
    outlook: string;
  };
}

export const handler = async (event: ChangeDetectionInput): Promise<ChangeDetectionOutput> => {
  const { projectId } = event;

  // Get checkpoints from last successful run
  const jiraCheckpoint = await getCheckpoint(projectId, 'jira', 'last_sync');
  const outlookCheckpoint = await getCheckpoint(projectId, 'outlook', 'delta_token');

  // Fetch deltas from APIs (zero LLM cost)
  const [jiraResult, outlookResult] = await Promise.all([
    getJiraChanges(projectId, jiraCheckpoint),
    getOutlookChanges(projectId, outlookCheckpoint),
  ]);

  const hasChanges = jiraResult.changes.length > 0 || outlookResult.changes.length > 0;

  // Only save checkpoints if we'll process the changes
  if (hasChanges) {
    await Promise.all([
      saveCheckpoint(projectId, 'jira', 'last_sync', jiraResult.newCheckpoint),
      saveCheckpoint(projectId, 'outlook', 'delta_token', outlookResult.newCheckpoint),
    ]);
  }

  return {
    hasChanges,
    jiraChanges: jiraResult.changes,
    outlookChanges: outlookResult.changes,
    newCheckpoints: {
      jira: jiraResult.newCheckpoint,
      outlook: outlookResult.newCheckpoint,
    },
  };
};
```

### 2.6 Hold Queue Implementation (Separate Lambda)

```typescript
// packages/lambdas/hold-queue/index.ts
import { getHeldActions, executeAction, releaseAction } from '@agentic-pm/core/execution';
import { logEvent } from '@agentic-pm/core/db';

export const handler = async () => {
  // Query DynamoDB GSI for actions past their heldUntil time
  const heldActions = await getHeldActions();

  for (const action of heldActions) {
    try {
      // Execute the held action (send email, update Jira, etc.)
      await executeAction(action);

      // Mark as released
      await releaseAction(action.id);

      await logEvent({
        projectId: action.projectId,
        eventType: 'action_released',
        severity: 'info',
        summary: `Released held action: ${action.description}`,
        detail: { actionId: action.id, actionType: action.actionType },
      });
    } catch (error) {
      await logEvent({
        projectId: action.projectId,
        eventType: 'action_failed',
        severity: 'error',
        summary: `Failed to execute held action: ${action.description}`,
        detail: { actionId: action.id, error: error.message },
      });
    }
  }

  return { processed: heldActions.length };
};
```

---

## 3. AgentCore Runtime Approach

### 3.1 How AgentCore Runtime Works

AgentCore Runtime is designed for **interactive, session-based agents**:

- Each invocation creates a **dedicated microVM** with isolated CPU, memory, and filesystem
- Sessions persist for up to **8 hours** of total runtime
- Sessions are **ephemeral** - state is lost when the session terminates
- Long-term state requires **AgentCore Memory** service
- Supports frameworks like LangGraph, CrewAI, Strands Agents

**Session lifecycle:**
```
InvokeAgentRuntime (AWS SDK call)
         │
         ▼
    Create microVM
         │
         ▼
    Load agent container
         │
         ▼
    Execute agent logic
         │
         ▼
    Return response
         │
         ▼
    Session stays IDLE (up to 15 min inactive)
         │
         ▼
    Session TERMINATES (microVM destroyed)
```

### 3.2 Proposed AgentCore Structure (with LangGraph)

If we used AgentCore Runtime with LangGraph, the structure would look like:

```
packages/
├── core/                    # @agentic-pm/core - same shared library
│   └── ... (unchanged)
│
├── agent/                   # AgentCore agent definition
│   ├── src/
│   │   ├── main.py         # Agent entrypoint
│   │   ├── graph.py        # LangGraph state machine
│   │   ├── nodes/          # Graph nodes (same logic as Lambdas)
│   │   │   ├── heartbeat.py
│   │   │   ├── change_detection.py
│   │   │   ├── normalise.py
│   │   │   ├── triage.py
│   │   │   ├── reasoning.py
│   │   │   ├── execute.py
│   │   │   └── artefact_update.py
│   │   └── state.py        # Graph state definition
│   ├── requirements.txt
│   └── Dockerfile
│
├── trigger/                 # Lambda to trigger AgentCore on schedule
│   └── index.ts
│
└── web/                     # Next.js frontend (unchanged)
```

### 3.3 LangGraph State Machine Definition

```python
# packages/agent/src/state.py
from typing import TypedDict, Optional, List
from dataclasses import dataclass

class AgentState(TypedDict):
    # Cycle metadata
    cycle_id: str
    project_id: str
    started_at: str

    # Change detection
    has_changes: bool
    jira_changes: List[dict]
    outlook_changes: List[dict]

    # Normalised signals
    signals: List[dict]

    # Triage results
    sanitised_signals: List[dict]
    classified_signals: List[dict]
    requires_sonnet: bool

    # Reasoning results
    reasoning_result: Optional[dict]

    # Execution
    actions_to_execute: List[dict]
    execution_result: Optional[dict]

    # Artefact updates
    artefact_updates: List[dict]

    # Housekeeping
    housekeeping_due: bool
```

```python
# packages/agent/src/graph.py
from typing import Literal
from langgraph.graph import StateGraph, START, END
from state import AgentState
from nodes import (
    heartbeat_node,
    change_detection_node,
    normalise_node,
    triage_sanitise_node,
    triage_classify_node,
    reasoning_node,
    execute_node,
    artefact_update_node,
    housekeeping_node,
)

def route_after_change_detection(state: AgentState) -> Literal["normalise", "check_housekeeping"]:
    """Skip LLM pipeline if no changes detected."""
    if state["has_changes"]:
        return "normalise"
    return "check_housekeeping"

def route_after_classify(state: AgentState) -> Literal["reasoning", "execute"]:
    """Route to Sonnet reasoning only when needed."""
    if state["requires_sonnet"]:
        return "reasoning"
    return "execute"

def route_after_artefact(state: AgentState) -> Literal["housekeeping", "end"]:
    """Run housekeeping if due."""
    if state["housekeeping_due"]:
        return "housekeeping"
    return "end"

# Build the graph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("heartbeat", heartbeat_node)
workflow.add_node("change_detection", change_detection_node)
workflow.add_node("normalise", normalise_node)
workflow.add_node("triage_sanitise", triage_sanitise_node)
workflow.add_node("triage_classify", triage_classify_node)
workflow.add_node("reasoning", reasoning_node)
workflow.add_node("execute", execute_node)
workflow.add_node("artefact_update", artefact_update_node)
workflow.add_node("housekeeping", housekeeping_node)
workflow.add_node("check_housekeeping", lambda s: s)  # Pass-through

# Add edges
workflow.add_edge(START, "heartbeat")
workflow.add_edge("heartbeat", "change_detection")
workflow.add_conditional_edges(
    "change_detection",
    route_after_change_detection,
    {
        "normalise": "normalise",
        "check_housekeeping": "check_housekeeping",
    }
)
workflow.add_edge("normalise", "triage_sanitise")
workflow.add_edge("triage_sanitise", "triage_classify")
workflow.add_conditional_edges(
    "triage_classify",
    route_after_classify,
    {
        "reasoning": "reasoning",
        "execute": "execute",
    }
)
workflow.add_edge("reasoning", "execute")
workflow.add_edge("execute", "artefact_update")
workflow.add_conditional_edges(
    "artefact_update",
    route_after_artefact,
    {
        "housekeeping": "housekeeping",
        "end": END,
    }
)
workflow.add_conditional_edges(
    "check_housekeeping",
    route_after_artefact,
    {
        "housekeeping": "housekeeping",
        "end": END,
    }
)
workflow.add_edge("housekeeping", END)

# Compile the graph
agent_graph = workflow.compile()
```

### 3.4 LangGraph Node Implementations

```python
# packages/agent/src/nodes/change_detection.py
from state import AgentState
from agentic_pm_core import get_jira_changes, get_outlook_changes, get_checkpoint, save_checkpoint

def change_detection_node(state: AgentState) -> AgentState:
    """Check Jira and Outlook for changes since last sync."""
    project_id = state["project_id"]

    # Get checkpoints
    jira_checkpoint = get_checkpoint(project_id, "jira", "last_sync")
    outlook_checkpoint = get_checkpoint(project_id, "outlook", "delta_token")

    # Fetch deltas (zero LLM cost)
    jira_result = get_jira_changes(project_id, jira_checkpoint)
    outlook_result = get_outlook_changes(project_id, outlook_checkpoint)

    has_changes = len(jira_result.changes) > 0 or len(outlook_result.changes) > 0

    # Save checkpoints if changes found
    if has_changes:
        save_checkpoint(project_id, "jira", "last_sync", jira_result.new_checkpoint)
        save_checkpoint(project_id, "outlook", "delta_token", outlook_result.new_checkpoint)

    return {
        **state,
        "has_changes": has_changes,
        "jira_changes": jira_result.changes,
        "outlook_changes": outlook_result.changes,
    }
```

```python
# packages/agent/src/nodes/triage.py
from state import AgentState
from agentic_pm_core import sanitise_signals, classify_signals, check_budget, record_token_usage

def triage_sanitise_node(state: AgentState) -> AgentState:
    """Sanitise signals to remove potential prompt injection."""
    if not check_budget("haiku"):
        raise Exception("BudgetExceeded")

    result = sanitise_signals(state["signals"], state["project_id"])
    record_token_usage("haiku", result.token_usage)

    return {
        **state,
        "sanitised_signals": result.sanitised,
    }

def triage_classify_node(state: AgentState) -> AgentState:
    """Classify signals and determine if Sonnet reasoning needed."""
    if not check_budget("haiku"):
        raise Exception("BudgetExceeded")

    result = classify_signals(state["sanitised_signals"], state["project_id"])
    record_token_usage("haiku", result.token_usage)

    return {
        **state,
        "classified_signals": result.classified,
        "requires_sonnet": result.requires_sonnet,
        "actions_to_execute": result.recommended_actions,
    }
```

### 3.5 AgentCore Entrypoint

```python
# packages/agent/src/main.py
from bedrock_agentcore import BedrockAgentCoreApp
from graph import agent_graph
from state import AgentState
import uuid
from datetime import datetime

app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload: dict) -> dict:
    """
    Main agent entrypoint.

    Called by: Lambda trigger function via InvokeAgentRuntime
    Payload: { "project_id": "abc123" }
    """
    project_id = payload.get("project_id")
    if not project_id:
        return {"error": "project_id required"}

    # Initialize state
    initial_state: AgentState = {
        "cycle_id": str(uuid.uuid4()),
        "project_id": project_id,
        "started_at": datetime.utcnow().isoformat(),
        "has_changes": False,
        "jira_changes": [],
        "outlook_changes": [],
        "signals": [],
        "sanitised_signals": [],
        "classified_signals": [],
        "requires_sonnet": False,
        "reasoning_result": None,
        "actions_to_execute": [],
        "execution_result": None,
        "artefact_updates": [],
        "housekeeping_due": should_run_housekeeping(),
    }

    # Execute the graph
    try:
        final_state = agent_graph.invoke(initial_state)
        return {
            "success": True,
            "cycle_id": final_state["cycle_id"],
            "changes_processed": final_state["has_changes"],
            "actions_taken": len(final_state.get("execution_result", {}).get("actions", [])),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }

if __name__ == "__main__":
    app.run()
```

### 3.6 Scheduled Trigger (Lambda + InvokeAgentRuntime)

AgentCore Runtime **does not have native scheduling**. We need a Lambda to trigger it:

```typescript
// packages/trigger/index.ts
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand
} from '@aws-sdk/client-bedrock-agentcore';

const client = new BedrockAgentCoreClient({ region: 'us-east-1' });

interface TriggerEvent {
  projectId: string;
}

export const handler = async (event: TriggerEvent) => {
  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: process.env.AGENT_RUNTIME_ARN,
    runtimeSessionId: `cycle-${Date.now()}`, // New session per cycle
    payload: JSON.stringify({
      project_id: event.projectId,
    }),
  });

  try {
    const response = await client.send(command);
    return {
      statusCode: 200,
      body: response.payload,
    };
  } catch (error) {
    console.error('Failed to invoke agent:', error);
    throw error;
  }
};
```

EventBridge still triggers the Lambda on schedule:
```json
{
  "ScheduleExpression": "rate(15 minutes)",
  "Target": {
    "Arn": "arn:aws:lambda:REGION:ACCOUNT:function:agent-trigger",
    "Input": "{\"projectId\": \"default\"}"
  }
}
```

### 3.7 Hold Queue Problem

AgentCore sessions are ephemeral. The hold queue requires persistent state and time-based processing:

**Option A: Separate Lambda (same as current)**
- Still need a 1-minute scheduled Lambda to check held actions
- Hold queue logic remains outside AgentCore

**Option B: AgentCore Memory + Separate Processor**
- Store held actions in AgentCore Memory
- Separate Lambda reads from Memory and processes releases
- Adds complexity and cost

**Conclusion:** The hold queue pattern doesn't benefit from AgentCore. A simple Lambda is cleaner.

---

## 4. Side-by-Side Comparison

### 4.1 Scheduling and Triggering

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|------------------------|-------------------|
| 15-min trigger | EventBridge → Step Functions | EventBridge → Lambda → InvokeAgentRuntime |
| Trigger complexity | Direct (1 hop) | Indirect (2 hops) |
| 1-min hold queue | EventBridge → Lambda | EventBridge → Lambda (same) |
| Startup latency | Lambda cold start (~1-2s) | MicroVM startup (~3-5s) |

### 4.2 Change Detection Gate

**Step Functions:**
```json
{
  "HasChanges": {
    "Type": "Choice",
    "Choices": [{
      "Variable": "$.changes.hasChanges",
      "BooleanEquals": false,
      "Next": "CheckHousekeeping"
    }],
    "Default": "NormaliseSignals"
  }
}
```

**LangGraph:**
```python
def route_after_change_detection(state: AgentState) -> Literal["normalise", "check_housekeeping"]:
    if state["has_changes"]:
        return "normalise"
    return "check_housekeeping"

workflow.add_conditional_edges("change_detection", route_after_change_detection, {...})
```

Both approaches implement the gate identically. No advantage either way.

### 4.3 Two-Stage Triage (Sanitise then Classify)

**Step Functions:**
```json
"TriageSanitise": {
  "Type": "Task",
  "Resource": "arn:aws:lambda:...:agent-triage-sanitise",
  "Next": "TriageClassify"
},
"TriageClassify": {
  "Type": "Task",
  "Resource": "arn:aws:lambda:...:agent-triage-classify",
  "Next": "NeedsReasoning"
}
```

Each stage is a separate Lambda with its own IAM role. The sanitise Lambda has no access to integration credentials (Jira, Graph, SES).

**LangGraph:**
```python
workflow.add_node("triage_sanitise", triage_sanitise_node)
workflow.add_node("triage_classify", triage_classify_node)
workflow.add_edge("triage_sanitise", "triage_classify")
```

Both stages run in the same microVM with the same permissions. **IAM isolation is lost.**

**Security implication:** Our two-stage triage design relies on IAM role isolation to mitigate prompt injection. In AgentCore, both stages run with the same permissions, reducing the defence depth.

### 4.4 Error Handling and Retries

**Step Functions:**
```json
"TriageSanitise": {
  "Type": "Task",
  "TimeoutSeconds": 120,
  "Retry": [{
    "ErrorEquals": ["LLMTimeoutError"],
    "IntervalSeconds": 30,
    "MaxAttempts": 2
  }],
  "Catch": [{
    "ErrorEquals": ["States.ALL"],
    "Next": "LogError"
  }]
}
```

Built-in retry logic with configurable backoff per step.

**LangGraph:**
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=30))
def triage_sanitise_node(state: AgentState) -> AgentState:
    # ...
```

Requires manual retry decoration on each node.

### 4.5 State Persistence Between Cycles

**Step Functions:**
- State lives in DynamoDB
- Each Lambda reads/writes to DynamoDB directly
- Checkpoints, events, artefacts all in DynamoDB
- No session state needed

**AgentCore:**
- Session state is ephemeral (lost when session ends)
- Must use AgentCore Memory for persistence
- Or continue using DynamoDB directly (same as Lambda)
- AgentCore Memory adds another service and cost

### 4.6 Observability

**Step Functions:**
- Visual workflow diagram in AWS Console
- Per-step execution timing and status
- Built-in execution history (last 90 days)
- CloudWatch Logs per Lambda
- X-Ray tracing available

**AgentCore:**
- OpenTelemetry integration via SDK
- No native visual workflow (LangGraph has LangSmith, but it's a separate service)
- CloudWatch Logs for the agent container
- Less granular step visibility

### 4.7 Cost Comparison

**Step Functions + Lambda (per month):**
| Component | Cost |
|-----------|------|
| Lambda invocations | ~$0 (free tier) |
| Lambda duration | ~$1-2 |
| Step Functions transitions | ~$1-2 |
| EventBridge | ~$0.10 |
| **Total** | **~$2-4** |

**AgentCore Runtime (per month):**
| Component | Cost |
|-----------|------|
| Trigger Lambda | ~$0 |
| AgentCore invocations | ~$1-2 (estimated) |
| AgentCore session time | ~$3-5 (estimated, microVM runtime) |
| Hold queue Lambda | ~$0 |
| **Total** | **~$4-7** |

AgentCore is likely **more expensive** due to microVM overhead, though exact pricing would need verification.

---

## 5. Using @agentic-pm/core in AgentCore

### 5.1 Can We Reuse the Library?

Yes, with caveats:

**TypeScript core library in Python agent:**
- Option A: Port core logic to Python (duplication)
- Option B: Call TypeScript via subprocess/WASM (complex)
- Option C: Expose core as HTTP microservice (adds latency)

**Recommendation:** If using AgentCore with Python/LangGraph, we'd need to **port @agentic-pm/core to Python** or maintain two codebases. This is significant additional work.

### 5.2 Alternative: TypeScript Agent with Strands

If we want to keep TypeScript, we could use Strands Agents (supports TypeScript):

```typescript
// packages/agent/src/main.ts
import { BedrockAgentCoreApp } from '@bedrock-agentcore/sdk';
import { runAgentCycle } from '@agentic-pm/core/agent';

const app = new BedrockAgentCoreApp();

app.entrypoint(async (payload: { projectId: string }) => {
  const result = await runAgentCycle(payload.projectId);
  return result;
});

app.run();
```

This preserves TypeScript but loses LangGraph's state machine features.

---

## 6. Framework Comparison for AgentCore

| Framework | Language | State Machine | Best For |
|-----------|----------|---------------|----------|
| LangGraph | Python | Native graph-based | Complex agent logic with branching |
| Strands Agents | Python, TypeScript | Tool-calling focused | Simple request/response agents |
| CrewAI | Python | Multi-agent focused | Team of specialised agents |
| Custom | Any | Manual | Full control, existing codebase |

**For our use case:** LangGraph's state machine is closest to Step Functions semantics. However, it's Python-only, requiring us to port our TypeScript core library.

---

## 7. Answer to Key Questions

### Q1: Can AgentCore Runtime be triggered on a schedule (EventBridge)?

**No, not directly.** AgentCore Runtime is invoked via `InvokeAgentRuntime` API. You need:
1. EventBridge schedule triggers a Lambda
2. Lambda calls `InvokeAgentRuntime`

This adds a hop compared to Step Functions (EventBridge → Step Functions directly).

### Q2: How do we implement the change detection gate (skip LLM if no changes)?

**Same as Step Functions:** Conditional edge in LangGraph routes to either the LLM pipeline or directly to housekeeping check. The pattern is identical; only the syntax differs.

### Q3: How do we implement the hold queue (actions held for 30 min)?

**Same as Step Functions:** A separate Lambda on a 1-minute schedule. AgentCore sessions are ephemeral and unsuitable for time-delayed processing.

AgentCore Memory could store held actions, but you still need external processing to check and release them. No advantage over DynamoDB + Lambda.

### Q4: Can we use our existing @agentic-pm/core library in AgentCore?

**Partially:**
- If using TypeScript Strands: Yes, directly
- If using Python LangGraph: Need to port to Python or call as service
- Core business logic (Jira client, Outlook client, LLM client) would need reimplementation

### Q5: What framework would be best? (LangGraph for state machines?)

**LangGraph** is the best match for our state machine requirements, but:
- It's Python-only
- Requires porting our TypeScript codebase
- LangSmith (observability) is a paid service

**Strands Agents** with TypeScript would preserve our codebase but lacks native state machine primitives.

### Q6: How do we handle the two-stage triage (sanitise then classify)?

**In LangGraph:** Two sequential nodes connected by an edge. However, **IAM isolation is lost** since both run in the same microVM with identical permissions. This weakens our prompt injection defence.

---

## 8. Recommendation

### Stay with Step Functions + Lambda

| Factor | Step Functions | AgentCore |
|--------|---------------|-----------|
| Scheduling | Native EventBridge | Requires Lambda trigger |
| Hold queue | Simple Lambda | Same (no benefit) |
| IAM isolation | Per-Lambda roles | Single container (less secure) |
| Observability | Built-in visual + history | Requires LangSmith or manual |
| Language | TypeScript (existing) | Python (requires port) |
| Cost | ~$2-4/month | ~$4-7/month |
| Complexity | Lower | Higher (new paradigm) |

**AgentCore Runtime is designed for:**
- Interactive, conversational agents
- Long-running sessions (hours)
- Multi-agent collaboration
- User-facing request/response

**Our agent is:**
- Scheduled, batch-style processing
- Short cycles (1-5 minutes)
- Single autonomous agent
- No user interaction during cycles

**Conclusion:** Step Functions + Lambda is the better fit. AgentCore adds complexity and cost without solving any problem we have.

### When AgentCore Would Make Sense

AgentCore would be appropriate if we added:
- A conversational interface (chat with the agent)
- Long-running analysis tasks (hours)
- Multi-agent coordination
- Real-time interactive features

For a scheduled, autonomous PM agent running every 15 minutes, Step Functions + Lambda is simpler, cheaper, and more secure.

---

## 9. References

- [Amazon Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html)
- [AgentCore Python SDK](https://github.com/aws/bedrock-agentcore-sdk-python)
- [LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [LangGraph: Build Stateful AI Agents](https://realpython.com/langgraph-python/)
- [AgentCore Samples Repository](https://github.com/awslabs/amazon-bedrock-agentcore-samples)
