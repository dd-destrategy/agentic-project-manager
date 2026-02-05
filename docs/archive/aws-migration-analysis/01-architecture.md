# AWS Migration Architecture for Agentic PM Workbench

> **Status:** Proposal for review
> **Author:** Solutions Architect
> **Date:** February 2026

---

## Executive Summary

This document proposes a complete migration from the current Vercel Pro + Hetzner VPS + Neon PostgreSQL architecture to AWS-native services. The design prioritises:

1. **Serverless-first** — No persistent VMs to manage
2. **Cost efficiency** — Target similar or lower monthly cost (~$35)
3. **AWS-native orchestration** — Step Functions for agent workflow
4. **Managed LLM** — Amazon Bedrock for Claude models

**Key architectural decisions:**

| Current | AWS Replacement | Rationale |
|---------|-----------------|-----------|
| Vercel Pro (Next.js) | AWS Amplify Hosting | Native Next.js SSR support, Server Actions |
| Hetzner VPS (Node.js agent) | Step Functions + Lambda | Serverless orchestration, no VM management |
| Neon PostgreSQL | DynamoDB | Serverless, pay-per-request, no cold starts |
| Claude API (direct) | Amazon Bedrock | Unified AWS billing, IAM integration |
| Resend | Amazon SES | AWS-native, higher free tier |

---

## 1. Architecture Overview

### 1.1 ASCII Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               AWS Cloud                                          │
│                                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌───────────────────────────────────┐  │
│  │  Route 53   │────▶│ CloudFront  │────▶│     AWS Amplify Hosting           │  │
│  │   (DNS)     │     │   (CDN)     │     │     Next.js App Router (SSR)      │  │
│  └─────────────┘     └─────────────┘     │                                   │  │
│                                          │  • Mission Control Dashboard      │  │
│                                          │  • Activity Feed                  │  │
│                                          │  • Decision Interface             │  │
│                                          │  • Project Detail                 │  │
│                                          │  • Settings                       │  │
│                                          │  • Server Actions                 │  │
│                                          └────────────┬──────────────────────┘  │
│                                                       │                         │
│                          ┌────────────────────────────┼────────────────────┐    │
│                          │                            │                    │    │
│                          ▼                            ▼                    ▼    │
│  ┌───────────────────────────┐   ┌─────────────────────────┐  ┌──────────────┐ │
│  │        DynamoDB           │   │    Secrets Manager      │  │  Cognito     │ │
│  │                           │   │                         │  │  (Auth)      │ │
│  │  Tables:                  │   │  • jira-api-token       │  │              │ │
│  │  • Projects               │   │  • graph-api-creds      │  │  Single-user │ │
│  │  • Artefacts              │   │  • ses-credentials      │  │  pool        │ │
│  │  • Events                 │   │  • nextauth-secret      │  └──────────────┘ │
│  │  • Escalations            │   └─────────────────────────┘                   │
│  │  • AgentActions           │                                                  │
│  │  • AgentCheckpoints       │                                                  │
│  │  • AgentConfig            │                                                  │
│  │  • IntegrationConfigs     │                                                  │
│  └─────────────┬─────────────┘                                                  │
│                │                                                                │
│                │ reads/writes                                                   │
│                ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        EventBridge Scheduler                              │  │
│  │                     (every 15 minutes trigger)                            │  │
│  └────────────────────────────────┬─────────────────────────────────────────┘  │
│                                   │                                             │
│                                   ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      Step Functions State Machine                         │  │
│  │                      "AgentLoopOrchestrator"                              │  │
│  │                                                                           │  │
│  │   ┌─────────────┐   ┌──────────────────┐   ┌─────────────────────────┐   │  │
│  │   │   START     │──▶│ 1. Heartbeat     │──▶│ 2. Change Detection     │   │  │
│  │   │             │   │    Lambda        │   │    Lambda (Parallel)    │   │  │
│  │   └─────────────┘   └──────────────────┘   │                         │   │  │
│  │                                            │  ┌─────────────────────┐│   │  │
│  │                                            │  │ 2a. Poll Jira API   ││   │  │
│  │                                            │  └─────────────────────┘│   │  │
│  │                                            │  ┌─────────────────────┐│   │  │
│  │                                            │  │ 2b. Poll Graph API  ││   │  │
│  │                                            │  │     (Outlook delta) ││   │  │
│  │                                            │  └─────────────────────┘│   │  │
│  │                                            └────────────┬────────────┘   │  │
│  │                                                         │                │  │
│  │                                            ┌────────────┴────────────┐   │  │
│  │                                            │ Choice: Changes Found?  │   │  │
│  │                                            └────────────┬────────────┘   │  │
│  │                                    No changes │         │ Changes found  │  │
│  │                                               ▼         ▼                │  │
│  │                               ┌───────────┐  ┌──────────────────────┐   │  │
│  │                               │   END     │  │ 3. Signal Normalise  │   │  │
│  │                               │(log only) │  │    Lambda            │   │  │
│  │                               └───────────┘  └──────────┬───────────┘   │  │
│  │                                                         │               │  │
│  │                                                         ▼               │  │
│  │                                              ┌──────────────────────┐   │  │
│  │                                              │ 4. Two-Pass Triage   │   │  │
│  │                                              │    Lambda            │   │  │
│  │                                              │  ┌────────────────┐  │   │  │
│  │                                              │  │ Bedrock Haiku  │  │   │  │
│  │                                              │  │ (sanitise +    │  │   │  │
│  │                                              │  │  classify)     │  │   │  │
│  │                                              │  └────────────────┘  │   │  │
│  │                                              └──────────┬───────────┘   │  │
│  │                                                         │               │  │
│  │                                            ┌────────────┴────────────┐  │  │
│  │                                            │ Choice: Complex Signal? │  │  │
│  │                                            └────────────┬────────────┘  │  │
│  │                                     Simple │            │ Complex       │  │
│  │                                            │            ▼               │  │
│  │                                            │ ┌──────────────────────┐   │  │
│  │                                            │ │ 5. Reasoning Lambda  │   │  │
│  │                                            │ │  ┌────────────────┐  │   │  │
│  │                                            │ │  │ Bedrock Sonnet │  │   │  │
│  │                                            │ │  └────────────────┘  │   │  │
│  │                                            │ └──────────┬───────────┘   │  │
│  │                                            │            │               │  │
│  │                                            └─────┬──────┘               │  │
│  │                                                  ▼                      │  │
│  │                                       ┌──────────────────────┐          │  │
│  │                                       │ 6. Execution Lambda  │          │  │
│  │                                       │  • Confidence check  │          │  │
│  │                                       │  • Boundary check    │          │  │
│  │                                       │  • Execute/queue/    │          │  │
│  │                                       │    escalate          │          │  │
│  │                                       └──────────┬───────────┘          │  │
│  │                                                  │                      │  │
│  │                                                  ▼                      │  │
│  │                                       ┌──────────────────────┐          │  │
│  │                                       │ 7. Artefact Update   │          │  │
│  │                                       │    Lambda            │          │  │
│  │                                       └──────────┬───────────┘          │  │
│  │                                                  │                      │  │
│  │                                                  ▼                      │  │
│  │                                       ┌──────────────────────┐          │  │
│  │                                       │ 8. Hold Queue Check  │          │  │
│  │                                       │    Lambda            │          │  │
│  │                                       └──────────┬───────────┘          │  │
│  │                                                  │                      │  │
│  │                                                  ▼                      │  │
│  │                                       ┌──────────────────────┐          │  │
│  │                                       │ 9. Housekeeping      │          │  │
│  │                                       │    (daily check)     │          │  │
│  │                                       └──────────┬───────────┘          │  │
│  │                                                  │                      │  │
│  │                                                  ▼                      │  │
│  │                                            ┌───────────┐                │  │
│  │                                            │    END    │                │  │
│  │                                            └───────────┘                │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌────────────────────────┐  ┌────────────────────────┐                       │
│  │    Amazon Bedrock      │  │      Amazon SES        │                       │
│  │                        │  │                        │                       │
│  │  • Claude 3.5 Haiku    │  │  • Agent notifications │                       │
│  │  • Claude 3.5 Sonnet   │  │  • Daily digest        │                       │
│  │  • Tool-use enabled    │  │  • Escalation alerts   │                       │
│  └────────────────────────┘  └────────────────────────┘                       │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                          CloudWatch                                       │  │
│  │  • Lambda logs (all functions)                                           │  │
│  │  • Step Functions execution history                                      │  │
│  │  • Custom metrics (LLM cost, signal count, artefact updates)            │  │
│  │  • Alarms (budget threshold, execution failures, heartbeat missed)      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘

External Integrations:
┌─────────────────────┐     ┌─────────────────────┐
│   Jira Cloud API    │     │ Microsoft Graph API │
│   (polling)         │     │   (Outlook delta)   │
└─────────────────────┘     └─────────────────────┘
```

### 1.2 Data Flow Summary

1. **User access:** Route 53 → CloudFront → Amplify Hosting (Next.js SSR)
2. **Agent scheduling:** EventBridge (every 15 min) → Step Functions
3. **Agent workflow:** Step Functions orchestrates Lambda chain
4. **LLM calls:** Lambda → Bedrock (Claude Haiku/Sonnet)
5. **Data persistence:** All Lambdas → DynamoDB
6. **Notifications:** Execution Lambda → SES
7. **Monitoring:** All components → CloudWatch

---

## 2. Component Mapping

### 2.1 Frontend: Vercel Pro → AWS Amplify Hosting

**Current:** Vercel Pro ($20/month) running Next.js App Router with SSR, Server Actions, and TanStack Query for real-time updates.

**AWS equivalent:** AWS Amplify Hosting

| Feature | Vercel Pro | AWS Amplify Hosting |
|---------|------------|---------------------|
| Next.js SSR | Yes (native) | Yes (native since Dec 2023) |
| Server Actions | Yes | Yes |
| Server Components | Yes | Yes |
| Edge Functions | Yes | Lambda@Edge (via CloudFront) |
| Custom domain | Included | Route 53 + ACM (free cert) |
| Build minutes | 6000/month | 1000 free, then $0.01/min |
| Bandwidth | 1 TB included | 15 GB free, then $0.15/GB |
| Function timeout | 300s (Pro) | 15s default, 900s max (Lambda) |

**Implementation notes:**
- Amplify Hosting auto-detects Next.js and configures SSR
- Use Amplify Environment Variables for secrets (NextAuth secret, DynamoDB table names)
- Server Actions work natively; no changes needed
- TanStack Query polling continues to work unchanged

**Alternative considered:** App Runner
- Pros: Container-based, more control, predictable pricing
- Cons: More setup for Next.js, no native SSR optimisation
- Decision: Amplify is simpler for Next.js-specific workloads

### 2.2 Agent Runtime: Hetzner VPS → Step Functions + Lambda

**Current:** Persistent Node.js process on Hetzner VPS (~$4/month), managed by pm2, with a 15-minute polling loop.

**AWS equivalent:** EventBridge Scheduler + Step Functions + Lambda

**Why Step Functions over a single Lambda:**

The agent loop has nine distinct steps with conditional branching (change detection gate, complex signal routing). Step Functions provides:

1. **Visual workflow debugging** — See exactly where execution stopped
2. **Automatic retries** — Per-step retry configuration
3. **Parallel execution** — Poll Jira and Outlook simultaneously
4. **State passing** — Clean data flow between steps without Lambda-to-Lambda invocations
5. **15-minute timeout avoidance** — Each step is a separate Lambda (15-min max), but the workflow can run longer

**Lambda function breakdown:**

| Lambda | Responsibility | Estimated Duration | Memory |
|--------|---------------|-------------------|--------|
| `heartbeat` | Log heartbeat event, check agent health | <1s | 128 MB |
| `change-detection-jira` | Poll Jira API, check for deltas | 2-5s | 256 MB |
| `change-detection-outlook` | Poll Graph API delta query | 2-5s | 256 MB |
| `signal-normalise` | Convert raw API responses to signals | <1s | 256 MB |
| `triage` | Two-pass Haiku (sanitise + classify) | 5-15s | 512 MB |
| `reasoning` | Sonnet for complex signals | 10-30s | 512 MB |
| `execution` | Confidence check, execute/queue/escalate | 2-10s | 256 MB |
| `artefact-update` | Update artefacts via tool-use | 5-15s | 512 MB |
| `hold-queue-process` | Execute held actions past threshold | 2-5s | 256 MB |
| `housekeeping` | Daily pruning, digest email | 5-10s | 256 MB |

**Handling the Neon keepalive pattern:**

The current architecture sends `SELECT 1` every 4 minutes to prevent Neon cold starts. With DynamoDB, this is unnecessary — DynamoDB has no cold starts. The pattern is eliminated.

**Step Functions State Machine definition (ASL excerpt):**

```json
{
  "Comment": "Agent Loop Orchestrator",
  "StartAt": "Heartbeat",
  "States": {
    "Heartbeat": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:heartbeat",
      "Next": "ChangeDetection"
    },
    "ChangeDetection": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "PollJira",
          "States": {
            "PollJira": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:change-detection-jira",
              "End": true
            }
          }
        },
        {
          "StartAt": "PollOutlook",
          "States": {
            "PollOutlook": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:change-detection-outlook",
              "End": true
            }
          }
        }
      ],
      "Next": "CheckForChanges"
    },
    "CheckForChanges": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.hasChanges",
          "BooleanEquals": false,
          "Next": "NoChangesEnd"
        }
      ],
      "Default": "SignalNormalise"
    },
    "NoChangesEnd": {
      "Type": "Succeed"
    },
    "SignalNormalise": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:signal-normalise",
      "Next": "Triage"
    }
  }
}
```

### 2.3 Database: Neon PostgreSQL → DynamoDB

**Current:** Neon PostgreSQL (free tier, 0.5 GB) with structured JSONB in the `artefacts.content` column.

**AWS equivalent:** DynamoDB (on-demand capacity)

**Why DynamoDB over Aurora Serverless v2:**

| Factor | DynamoDB | Aurora Serverless v2 |
|--------|----------|---------------------|
| Cold starts | None | 15-30s after idle |
| Minimum cost | $0 (on-demand, pay-per-request) | ~$48/month (0.5 ACU minimum) |
| JSONB equivalent | Native JSON document storage | PostgreSQL JSONB |
| Schema migration | Schemaless (simpler) | Drizzle migrations (familiar) |
| Querying | Limited (GSI-based) | Full SQL |
| Transactions | Yes (limited) | Full ACID |

**Decision:** DynamoDB wins on cost and cold start elimination. The application's query patterns (primary key lookups, time-range scans on events) are well-suited to DynamoDB's access patterns.

**DynamoDB table design:**

```
Table: Projects
  PK: PROJECT#{projectId}
  SK: METADATA
  Attributes: name, description, status, source, sourceProjectKey, autonomyLevel, config, createdAt, updatedAt

Table: Artefacts
  PK: PROJECT#{projectId}
  SK: ARTEFACT#{type}
  Attributes: content (JSON), previousVersion (JSON), version, createdAt, updatedAt

Table: Events
  PK: PROJECT#{projectId}  (or "GLOBAL" for cross-project)
  SK: EVENT#{timestamp}#{eventId}
  GSI1: EventTypeIndex (eventType, createdAt)
  Attributes: eventType, severity, summary, detail (JSON), createdAt
  TTL: expiresAt (30-day auto-delete)

Table: Escalations
  PK: PROJECT#{projectId}
  SK: ESCALATION#{escalationId}
  GSI1: StatusIndex (status, createdAt)
  Attributes: title, context, options, agentRecommendation, agentRationale, status, userDecision, userNotes, decidedAt, createdAt

Table: AgentActions
  PK: PROJECT#{projectId}
  SK: ACTION#{timestamp}#{actionId}
  GSI1: ExecutedIndex (executed, createdAt)
  Attributes: actionType, description, detail, confidence, executed, heldUntil, executedAt, createdAt
  TTL: expiresAt (90-day auto-delete)

Table: AgentCheckpoints
  PK: PROJECT#{projectId}
  SK: CHECKPOINT#{integration}#{key}
  Attributes: checkpointValue, updatedAt

Table: AgentConfig
  PK: CONFIG
  SK: #{key}
  Attributes: value (JSON), updatedAt

Table: IntegrationConfigs
  PK: INTEGRATION#{integrationName}
  SK: METADATA
  Attributes: status, lastHealthCheck, createdAt, updatedAt
  (Credentials stored in Secrets Manager, not DynamoDB)
```

**Migration notes:**
- DynamoDB TTL replaces the manual retention policy. Set `expiresAt` on Events (30 days) and AgentActions (90 days).
- The `previous_version` pattern works identically — store as JSON attribute.
- Querying events by time range: Use sort key prefix `EVENT#` with begins_with and between.

### 2.4 LLM: Claude API → Amazon Bedrock

**Current:** Direct Claude API calls to Haiku 4.5 (~70%) and Sonnet 4.5 (~30%).

**AWS equivalent:** Amazon Bedrock with Claude models

**Model availability on Bedrock (as of Feb 2026):**

| Model | Bedrock Model ID | Available |
|-------|-----------------|-----------|
| Claude 3.5 Haiku | anthropic.claude-3-5-haiku-20241022-v1:0 | Yes |
| Claude 3.5 Sonnet | anthropic.claude-3-5-sonnet-20241022-v2:0 | Yes |
| Claude 3 Opus | anthropic.claude-3-opus-20240229-v1:0 | Yes |

**Note:** Bedrock model versions may lag direct API by weeks. Verify Haiku 4.5 and Sonnet 4.5 availability. If not available, use Claude 3.5 variants which are functionally equivalent for this use case.

**Pricing comparison (per 1M tokens):**

| Model | Direct API Input | Direct API Output | Bedrock Input | Bedrock Output |
|-------|-----------------|------------------|---------------|----------------|
| Haiku | $1.00 | $5.00 | $1.00 | $5.00 |
| Sonnet | $3.00 | $15.00 | $3.00 | $15.00 |

Pricing is identical. Bedrock adds unified billing and IAM integration at no extra cost.

**Tool-use (function calling):**

Bedrock supports Claude's tool-use feature natively. The `tools` parameter works identically:

```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });

const response = await client.send(new InvokeModelCommand({
  modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
  contentType: "application/json",
  body: JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    tools: [
      {
        name: "update_raid_log",
        description: "Update the RAID log artefact",
        input_schema: {
          type: "object",
          properties: {
            items: { type: "array", items: { /* RAID item schema */ } }
          },
          required: ["items"]
        }
      }
    ],
    messages: [{ role: "user", content: "..." }]
  })
}));
```

**Prompt caching:**

Bedrock supports prompt caching for Claude models. The cache-friendly prompt structure (system prompt + artefact context as cacheable prefix) works identically. Expected savings: ~28% as per original spec.

### 2.5 Notifications: Resend → Amazon SES

**Current:** Resend (free tier, 100 emails/day) for agent-to-user notifications.

**AWS equivalent:** Amazon SES

| Feature | Resend Free | SES |
|---------|-------------|-----|
| Free tier | 100 emails/day, 3000/month | 62,000 emails/month (from EC2/Lambda) |
| Price after | $20/month for 50k | $0.10 per 1000 |
| Setup complexity | Simple (API key) | Moderate (domain verification, sandbox exit) |
| Deliverability | Good | Excellent (if configured properly) |

**Implementation:**
- Verify sending domain in SES
- Request production access (exit sandbox)
- Use `@aws-sdk/client-ses` in Lambda functions
- Daily digest and escalation alerts via SES

### 2.6 Authentication: NextAuth.js + Credentials → Cognito (or keep NextAuth)

**Options:**

1. **Keep NextAuth.js with Credentials provider** — Works unchanged on Amplify
2. **Migrate to Amazon Cognito** — AWS-native, but more setup for single-user

**Recommendation:** Keep NextAuth.js. It's simpler for single-user and already implemented. Cognito adds unnecessary complexity.

If Cognito is preferred for AWS-native consistency:
- Create a User Pool with a single user
- Use Cognito Hosted UI or Amplify Auth SDK
- Store user credentials in Cognito, not environment variables

### 2.7 Secrets Management: Custom AES-256 → AWS Secrets Manager

**Current:** Integration credentials encrypted with AES-256, key stored in Vercel env var, agent retrieves via authenticated API endpoint.

**AWS equivalent:** AWS Secrets Manager

```
Secrets:
  /agentic-pm/jira-api-token
  /agentic-pm/graph-api-credentials
  /agentic-pm/ses-identity-arn
  /agentic-pm/nextauth-secret
```

**Benefits:**
- No custom encryption code
- Automatic rotation support (future)
- IAM-based access control
- Audit logging via CloudTrail

**Cost:** $0.40/secret/month + $0.05/10,000 API calls = ~$2/month for 4 secrets

### 2.8 Monitoring: Custom → CloudWatch

**Current:** Custom heartbeat logging, events table serves as activity feed.

**AWS equivalent:** CloudWatch Logs + Metrics + Alarms

**Logs:**
- All Lambda functions log to CloudWatch automatically
- Step Functions execution history in CloudWatch
- Structured JSON logging for searchability

**Custom Metrics:**
- `AgentLoop/LLMCostDaily` — Track daily LLM spend
- `AgentLoop/SignalsProcessed` — Count of signals per cycle
- `AgentLoop/ArtefactUpdates` — Count of artefact changes
- `AgentLoop/EscalationsCreated` — Count of new escalations

**Alarms:**
- `LLMBudgetExceeded` — Alert when daily spend > $0.35
- `StepFunctionsExecutionFailed` — Alert on workflow failure
- `HeartbeatMissed` — Alert if no successful execution in 30 minutes

---

## 3. Cost Analysis

### 3.1 Current Architecture Cost

| Component | Monthly Cost |
|-----------|-------------|
| Vercel Pro | $20.00 |
| Hetzner VPS CX22 | $4.00 |
| Neon PostgreSQL | $0.00 (free tier) |
| Claude API (direct) | ~$5.00 |
| Resend | $0.00 (free tier) |
| **Total** | **~$29.00** |

### 3.2 AWS Architecture Cost Estimate

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| **Amplify Hosting** | $5-15 | Depends on traffic; low-traffic personal tool ~$5 |
| **Route 53** | $0.50 | Hosted zone |
| **CloudFront** | $0-2 | 1 TB free, minimal for personal tool |
| **Step Functions** | $0.50 | ~2,880 executions/month (96/day × 30) |
| **Lambda** | $0-2 | Free tier covers most; ~$1-2 after |
| **DynamoDB** | $1-3 | On-demand, low-traffic ~$1-3 |
| **Bedrock (Claude)** | $5-7 | Same as direct API |
| **SES** | $0.10 | ~100 emails/month |
| **Secrets Manager** | $2.00 | 4 secrets |
| **CloudWatch** | $1-3 | Logs, metrics, alarms |
| **Total** | **$15-35** | Range based on traffic |

**Realistic estimate for personal tool:** ~$20-25/month

### 3.3 Cost Comparison

| Scenario | Current | AWS |
|----------|---------|-----|
| Minimal usage | $24 | ~$15 |
| Normal usage | $29 | ~$22 |
| High usage | $35 | ~$30 |

**AWS is potentially cheaper** due to:
- No fixed $20/month Vercel Pro cost
- No fixed $4/month VPS cost
- Pay-per-use model scales down for low usage

**AWS could be more expensive** if:
- High frontend traffic (unlikely for personal tool)
- Frequent Step Functions executions beyond schedule
- CloudWatch log retention grows large

---

## 4. Migration Strategy

### 4.1 Phased Migration

**Phase M1: Infrastructure Setup (1-2 days)**
1. Create AWS account (if not existing)
2. Set up IAM roles for Step Functions, Lambda, Amplify
3. Create DynamoDB tables
4. Configure Secrets Manager secrets
5. Set up SES domain verification

**Phase M2: Agent Migration (2-3 days)**
1. Refactor agent code into Lambda functions
2. Create Step Functions state machine
3. Configure EventBridge scheduler
4. Test agent loop end-to-end
5. Verify Bedrock Claude integration

**Phase M3: Frontend Migration (1-2 days)**
1. Configure Amplify Hosting for Next.js
2. Update database queries for DynamoDB
3. Deploy and test SSR functionality
4. Configure custom domain in Route 53

**Phase M4: Cutover (1 day)**
1. Run parallel systems for 24 hours
2. Verify data consistency
3. Switch DNS to AWS
4. Decommission Vercel + Hetzner + Neon

### 4.2 Data Migration

**Projects, Artefacts, Escalations:**
- Export from Neon PostgreSQL as JSON
- Transform to DynamoDB item format
- Batch write to DynamoDB

**Events and AgentActions:**
- Consider starting fresh (historical data less valuable)
- Or migrate last 7 days only

**Integration Configs:**
- Decrypt credentials from Neon
- Store in Secrets Manager

---

## 5. Trade-offs and Risks

### 5.1 Benefits of AWS Migration

| Benefit | Impact |
|---------|--------|
| **No VM management** | Eliminates VPS patching, security updates, pm2 babysitting |
| **Unified billing** | One AWS bill vs Vercel + Hetzner + Neon + Claude |
| **Better observability** | CloudWatch provides integrated logs, metrics, traces |
| **Scalability** | Not needed now, but available if requirements change |
| **Cost flexibility** | Pay-per-use can be cheaper for low-traffic personal tool |
| **IAM security** | Fine-grained access control vs API keys |

### 5.2 Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| **Lambda cold starts delay agent loop** | Medium | Low | Use provisioned concurrency if needed (~$5/month). 15-min schedule leaves room for cold starts. |
| **DynamoDB query patterns don't fit** | Low | High | Design single-table patterns carefully. Migrate to Aurora if blocking issues found. |
| **Bedrock Claude version lag** | Medium | Medium | Verify model availability before migration. Direct API fallback if needed. |
| **Step Functions complexity** | Medium | Medium | Start with simple linear workflow. Add parallelism later. |
| **Cost exceeds current** | Low | Medium | Set CloudWatch billing alarms. Review after 1 month. |
| **Learning curve** | Medium | Low | AWS services are well-documented. Single developer can manage. |

### 5.3 What We Lose

1. **Simplicity of VPS** — A persistent Node.js process is conceptually simpler than Step Functions orchestration
2. **PostgreSQL familiarity** — SQL queries are more flexible than DynamoDB's GSI-based access
3. **Drizzle ORM** — No direct equivalent for DynamoDB (use AWS SDK directly or dynamodb-toolbox)
4. **Vercel's Next.js optimisations** — Amplify is good but Vercel is the gold standard for Next.js
5. **Quick iteration** — VPS allows SSH + edit + restart; Lambda requires deploy cycle

### 5.4 Alternative: Minimal AWS Migration

If the full migration seems too complex, consider a **minimal migration** that keeps some current components:

| Component | Keep | Migrate |
|-----------|------|---------|
| Frontend | Vercel Pro | - |
| Agent | - | Step Functions + Lambda |
| Database | - | DynamoDB |
| LLM | - | Bedrock |
| Notifications | Resend | - |

This hybrid approach:
- Keeps Vercel's excellent Next.js support
- Moves only the agent and database to AWS
- Reduces migration complexity
- May cost more ($20 Vercel + AWS agent)

---

## 6. Recommendations

### 6.1 Primary Recommendation: Full AWS Migration

For a personal tool with budget constraints and no need for multi-tenancy, the full AWS migration offers:

1. **Lower cost** at typical usage levels
2. **Reduced operational burden** (no VPS)
3. **Better monitoring** out of the box
4. **Future flexibility** if requirements grow

### 6.2 Key Implementation Decisions

1. **Use Amplify Hosting** for frontend (simplest Next.js on AWS)
2. **Use Step Functions Standard** (not Express) for agent orchestration
3. **Use DynamoDB on-demand** (not provisioned) for cost efficiency
4. **Keep Claude models via Bedrock** (same pricing, better integration)
5. **Use Secrets Manager** instead of custom encryption
6. **Set aggressive CloudWatch alarms** for cost and health monitoring

### 6.3 When NOT to Migrate

Do not migrate if:
- The current architecture is working well and cost is acceptable
- AWS learning curve is undesirable for a personal project
- You prefer the simplicity of a VPS over serverless orchestration
- Vercel's Next.js experience is highly valued

---

## 7. Next Steps

If proceeding with AWS migration:

1. **Review this document** — Confirm component choices
2. **Create AWS cost estimate** — Use AWS Pricing Calculator with realistic usage
3. **Spike: DynamoDB schema** — Validate single-table design with sample queries
4. **Spike: Step Functions workflow** — Build minimal POC with 2-3 Lambdas
5. **Spike: Amplify + Next.js** — Deploy current frontend to Amplify, verify SSR
6. **Document final architecture** — Lock decisions before implementation

---

## Appendix A: AWS Service Alternatives Considered

### Frontend Hosting

| Option | Verdict | Reason |
|--------|---------|--------|
| **Amplify Hosting** | **Selected** | Native Next.js SSR, simplest setup |
| App Runner | Rejected | Overkill for frontend, container-based |
| ECS Fargate | Rejected | Too complex for single Next.js app |
| Lambda@Edge + S3 | Rejected | No SSR support |
| EC2 | Rejected | VM management overhead |

### Agent Orchestration

| Option | Verdict | Reason |
|--------|---------|--------|
| **Step Functions + Lambda** | **Selected** | Visual debugging, parallel execution, automatic retries |
| Single Lambda | Rejected | 15-min timeout risk, no workflow visibility |
| ECS Fargate (persistent) | Rejected | Higher cost, VM-like management |
| EC2 (persistent) | Rejected | Same as current VPS, no improvement |
| Bedrock Agents | Rejected | Too opinionated, doesn't fit custom workflow |

### Database

| Option | Verdict | Reason |
|--------|---------|--------|
| **DynamoDB** | **Selected** | Serverless, no cold starts, pay-per-request |
| Aurora Serverless v2 | Rejected | $48/month minimum, cold starts |
| RDS PostgreSQL | Rejected | $12-15/month minimum, fixed cost |
| DocumentDB | Rejected | Overkill, higher cost |

### LLM

| Option | Verdict | Reason |
|--------|---------|--------|
| **Amazon Bedrock (Claude)** | **Selected** | Same models, unified billing, IAM |
| Direct Claude API | Alternative | If Bedrock lacks needed model version |
| Bedrock (other models) | Rejected | Claude quality is proven for this use case |

---

## Appendix B: DynamoDB Access Patterns

| Access Pattern | Table | Key Condition | Index |
|---------------|-------|---------------|-------|
| Get project by ID | Projects | PK = PROJECT#id | Table |
| List all projects | Projects | Scan (small table) | Table |
| Get artefact by project and type | Artefacts | PK = PROJECT#id, SK = ARTEFACT#type | Table |
| List events for project (recent first) | Events | PK = PROJECT#id, SK begins_with EVENT# (desc) | Table |
| List events by type | Events | eventType = X, createdAt desc | GSI1 |
| Get pending escalations | Escalations | status = pending, createdAt desc | GSI1 |
| Get unexecuted actions | AgentActions | executed = false, createdAt desc | GSI1 |
| Get checkpoint | AgentCheckpoints | PK = PROJECT#id, SK = CHECKPOINT#integration#key | Table |
| Get config value | AgentConfig | PK = CONFIG, SK = #key | Table |

---

## Appendix C: IAM Policy Summary

```json
{
  "LambdaExecutionRole": {
    "DynamoDB": ["GetItem", "PutItem", "UpdateItem", "Query", "Scan", "DeleteItem"],
    "SecretsManager": ["GetSecretValue"],
    "Bedrock": ["InvokeModel"],
    "SES": ["SendEmail"],
    "CloudWatch": ["PutMetricData"],
    "Logs": ["CreateLogGroup", "CreateLogStream", "PutLogEvents"]
  },
  "StepFunctionsRole": {
    "Lambda": ["InvokeFunction"],
    "Logs": ["CreateLogDelivery", "GetLogDelivery", "UpdateLogDelivery", "DeleteLogDelivery", "ListLogDeliveries", "PutResourcePolicy", "DescribeResourcePolicies", "DescribeLogGroups"]
  },
  "AmplifyRole": {
    "DynamoDB": ["GetItem", "PutItem", "UpdateItem", "Query"],
    "SecretsManager": ["GetSecretValue"]
  }
}
```

---

*End of AWS Migration Architecture Document*
