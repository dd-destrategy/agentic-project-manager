# SPEC.md Updates: Sections 7, 9, 10 (AWS Migration)

> **Author:** Platform Engineer Agent
> **Date:** February 2026
> **Purpose:** Updated sections for AWS-native architecture

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

**Checkpoint:** Store `last_sync_timestamp` in DynamoDB AgentCheckpoints table. Use JQL `updated >= "{checkpoint}"` to fetch only changes.

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

**Checkpoint:** Store Graph API delta token in DynamoDB AgentCheckpoints table. Delta queries return only changes since last token — no timestamp-based polling.

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

**IAM permissions required:**
```json
{
  "Effect": "Allow",
  "Action": [
    "ses:SendEmail",
    "ses:SendRawEmail"
  ],
  "Resource": "arn:aws:ses:*:*:identity/*"
}
```

This integration is independent of Azure AD and available from day one.

### 7.4 Integration health monitoring

Each integration runs a health check on every agent cycle:

- **Jira:** `GET /rest/api/3/myself` — validates auth
- **Outlook:** `GET /users/{userId}` — validates Graph API access
- **SES:** `ses:GetSendQuota` — validates sending capability and quota

Failed health checks log a warning event to CloudWatch and DynamoDB Events table. Three consecutive failures log an error event and trigger an SES notification to the user.

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
| Database connection | AWS Secrets Manager (`/agentic-pm/database/connection`) | All Lambdas, Frontend |

**Lambda compromise scenario:** An attacker who compromises the Triage Lambda cannot access integration credentials — IAM denies access. The Triage Lambda role only permits access to the LLM API key and database connection. This is enforced at the AWS IAM level, not application code.

### 9.3 IAM security model

Each component has its own IAM role following least-privilege principles:

#### Triage Lambda Role (`agentic-pm-triage-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/llm/*`, `/agentic-pm/database/*` | LLM and database access only |
| `bedrock:InvokeModel` | `anthropic.claude-3-haiku-*` | Haiku models only (not Sonnet) |
| `logs:*` | Lambda log group | CloudWatch logging |

**Explicit denials:** No access to Jira, Graph, or SES credentials. No access to Sonnet models.

#### Reasoning Lambda Role (`agentic-pm-reasoning-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/llm/*`, `/agentic-pm/database/*` | LLM and database access only |
| `bedrock:InvokeModel` | `anthropic.claude-3-haiku-*`, `anthropic.claude-3-5-sonnet-*` | Both Haiku and Sonnet |
| `logs:*` | Lambda log group | CloudWatch logging |

**Explicit denials:** No access to integration credentials. Receives only sanitised input from Triage Lambda.

#### Agent Lambda Role (`agentic-pm-agent-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/jira/*`, `/agentic-pm/graph/*`, `/agentic-pm/database/*` | Integration and database access |
| `ses:SendEmail` | SES identity ARN | Send notifications |
| `dynamodb:*` | All project tables | Full database access |
| `logs:*` | Lambda log group | CloudWatch logging |

**Explicit denials:** No direct LLM access — calls other Lambdas via Step Functions.

#### Step Functions Role (`agentic-pm-stepfunctions-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `lambda:InvokeFunction` | `agentic-pm-*` functions | Orchestrate agent workflow |
| `logs:*` | Step Functions log group | Execution logging |

#### Frontend Role (`agentic-pm-frontend-role`)

| Permission | Resource | Purpose |
|------------|----------|---------|
| `secretsmanager:GetSecretValue` | `/agentic-pm/database/*`, `/agentic-pm/auth/*` | Database and auth only |
| `dynamodb:GetItem`, `Query`, `PutItem`, `UpdateItem` | All project tables | User-initiated reads and writes |

**Explicit denials:** No access to integration credentials, LLM API key, or SES.

### 9.4 Outbound action allowlist

The agent can only perform actions in the `decisionBoundaries` allowlist (section 5.3). Any action not in the list is rejected by the execution layer regardless of what Claude recommends. This is a code-level constraint, not a prompt-level one. IAM permissions provide a second layer of enforcement.

### 9.5 Permission boundaries

A permission boundary is applied to all roles to prevent privilege escalation:

```json
{
  "Statement": [
    {
      "Effect": "Deny",
      "Action": ["iam:*", "organizations:*", "account:*"],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["secretsmanager:DeleteSecret", "secretsmanager:PutSecretValue"],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["dynamodb:DeleteTable", "lambda:DeleteFunction"],
      "Resource": "*"
    }
  ]
}
```

### 9.6 Network security

**Lambda deployment:** Outside VPC (public internet access)

This is simpler and sufficient because:
- Neon PostgreSQL is publicly accessible with TLS
- All external APIs (Jira, Graph, Claude) are public endpoints
- No internal resources require VPC access
- Avoids NAT Gateway costs (~$32/month)

**Security controls without VPC:**
- IAM roles enforce access to AWS services
- Secrets Manager encrypts credentials at rest (AES-256 via KMS)
- All traffic uses TLS 1.2+
- CloudTrail logs all API activity

**No SSH, no firewall configuration required.** Lambda functions are managed by AWS with no direct network access.

### 9.7 Authentication

Single user. NextAuth.js with Credentials provider. Username and bcrypt-hashed password stored in Secrets Manager (retrieved at runtime by Amplify). Session cookie with CSRF protection.

### 9.8 Audit logging

**CloudTrail:** Enabled for all API activity, including:
- `secretsmanager:GetSecretValue` — track all credential access
- `bedrock:InvokeModel` — track all LLM calls (if using Bedrock)
- `lambda:Invoke` — track function invocations
- IAM policy changes — alert immediately

**CloudWatch Logs:** Structured JSON logging from all Lambda functions with 30-day retention.

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
| F2 | Create DynamoDB tables (Projects, Artefacts, Events, Escalations, AgentActions, AgentCheckpoints, AgentConfig, IntegrationConfigs) |
| F3 | Deploy Next.js app to AWS Amplify Hosting with NextAuth |
| F4 | Build Step Functions state machine for agent workflow, configure EventBridge 15-minute schedule |
| F5 | Create Lambda functions: heartbeat, change-detection, signal-normalise |
| F6 | Build LLM abstraction layer: Haiku/Sonnet routing, tool-use, cost tracking |
| F7 | Implement budget controls and degradation ladder |
| F8 | Build events table writes and activity feed (frontend reads from DynamoDB) |
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
| C11 | Implement DynamoDB TTL for data retention (Events: 30 days, AgentActions: 90 days) |
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
| E11 | Build project detail view (artefact viewer with diff against previous_version) |
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

## Summary of Changes from Original Spec

### Section 7 - Integrations

| Original | AWS Migration |
|----------|---------------|
| Resend for notifications | Amazon SES (62,000 free emails/month from Lambda) |
| Store checkpoints in PostgreSQL | Store checkpoints in DynamoDB |

### Section 9 - Security

| Original | AWS Migration |
|----------|---------------|
| AES-256 encrypted credentials in DB | AWS Secrets Manager |
| Encryption key on Vercel | IAM role-based access |
| VPS hardening (SSH, UFW, Caddy) | Lambda outside VPC (no infrastructure to harden) |
| pm2 runs as non-root user | Managed Lambda execution environment |
| Two-stage triage (code boundary) | Two-stage triage (Lambda + IAM boundary) |

### Section 10 - MVP Scope

| Original | AWS Migration |
|----------|---------------|
| F1: Provision Hetzner VPS | F1: Set up AWS CDK, IAM roles |
| F2: Neon database, Drizzle migrations | F2: DynamoDB table creation |
| F3: Deploy to Vercel | F3: Deploy to Amplify Hosting |
| F4: pm2-managed agent process | F4: Step Functions state machine |
| F5: Neon keepalive (SELECT 1) | Removed (DynamoDB has no cold starts) |
| F9: Resend integration | F9: SES integration |
| F11: GitHub Actions → Vercel + SSH deploy | F11: Amplify auto-deploy + GitHub Actions → CDK |
