# Agentic PM Workbench - Development Backlog

> **Document Status:** Active
> **Created:** February 2026
> **Source of Truth:** SPEC.md Section 10 (MVP Scope & Phases)

---

## Table of Contents

1. [Epic Breakdown](#1-epic-breakdown)
2. [User Stories](#2-user-stories)
3. [Technical Tasks](#3-technical-tasks)
4. [Sprint Planning Suggestion](#4-sprint-planning-suggestion)
5. [Definition of Done](#5-definition-of-done)

---

## 1. Epic Breakdown

### Phase 1: Foundation

#### EP-001: AWS Infrastructure Foundation

**Description:** Establish the core AWS infrastructure using CDK, including IAM roles with proper permission boundaries, DynamoDB single-table design, and CI/CD pipelines for automated deployment.

**Business Value:** Provides the secure, scalable, and cost-effective foundation that all other features depend on. Proper IAM isolation is critical for security (Triage Lambda cannot access integration credentials).

**Acceptance Criteria:**
- AWS CDK project initialised with TypeScript configuration
- DynamoDB table created with single-table design (PK/SK structure per SPEC section 4.1)
- GSI1 configured for cross-project queries
- TTL enabled on the table
- IAM roles created with least-privilege permissions:
  - `agentic-pm-triage-role` (LLM access only)
  - `agentic-pm-agent-role` (integration access)
  - `agentic-pm-stepfunctions-role` (Lambda invocation)
- Secrets Manager secrets created for all credentials
- GitHub Actions workflow deploys Lambda functions via CDK
- Amplify auto-deploy configured for frontend
- All infrastructure costs within $5-8/month allocation

**Dependencies:** None (foundational)

**SPEC Reference:** F1, F2, F11

---

#### EP-002: Authentication & Frontend Hosting

**Description:** Deploy Next.js application to AWS Amplify Hosting with NextAuth.js single-user authentication using Credentials provider.

**Business Value:** Provides secure, session-based access to the dashboard with CSRF protection. Single-user authentication simplifies the security model while maintaining appropriate access controls.

**Acceptance Criteria:**
- Next.js App Router application deployed to Amplify Hosting
- NextAuth.js configured with Credentials provider
- Username/bcrypt-hashed password stored in Secrets Manager
- Session cookie with CSRF protection enabled
- Build and deploy working via Amplify auto-deploy
- Application accessible via HTTPS
- Estimated hosting cost ~$0.50/month

**Dependencies:** EP-001 (Secrets Manager for credentials)

**SPEC Reference:** F3

---

#### EP-003: Agent Orchestration Engine

**Description:** Build the Step Functions state machine that orchestrates the agent workflow, including EventBridge scheduling and foundational Lambda functions.

**Business Value:** Creates the "heartbeat" of the agent system. The 15-minute polling cycle ensures timely detection of project changes while the orchestration layer provides visibility, retry logic, and error handling.

**Acceptance Criteria:**
- Step Functions Standard Workflow state machine deployed
- State machine matches the flowchart in SPEC section 5.1
- EventBridge Scheduler configured for 15-minute main cycle
- Lambda functions deployed (outside VPC):
  - `agent-heartbeat` (30s timeout, 2x retry)
  - `agent-change-detection` (60s timeout, 3x retry)
  - `agent-normalise` (30s timeout, no retry - deterministic)
- Lambdas share `@agentic-pm/core` library
- Heartbeat logs cycle start and health status to DynamoDB
- CloudWatch logging configured for all Lambdas
- Step Functions execution history retained

**Dependencies:** EP-001 (IAM roles, DynamoDB)

**SPEC Reference:** F4, F5

---

#### EP-004: LLM Integration Layer

**Description:** Build the abstraction layer for Claude API integration, including model routing (Haiku/Sonnet), tool-use implementation, cost tracking, and budget controls with degradation ladder.

**Business Value:** Enables intelligent agent behaviour while controlling costs. The 70/30 Haiku/Sonnet split optimises quality vs cost. Budget controls prevent runaway spend and ensure the $7/month LLM budget is respected.

**Acceptance Criteria:**
- Claude API client abstraction (`@agentic-pm/core/llm`)
- Haiku 4.5 and Sonnet 4.5 model support
- Tool-use (function calling) for all structured outputs
- JSON schema definitions matching artefact schemas (SPEC section 4.2)
- Daily budget tracking stored in DynamoDB (`agent_config`)
- Degradation ladder implemented:
  - Tier 1 ($0.23/day): Reduce to 85/15 Haiku/Sonnet
  - Tier 2 ($0.27/day): 85/15 + 20-min polling
  - Tier 3 ($0.30/day): Haiku-only + 30-min polling
  - Hard ceiling ($0.40/day): monitoring-only mode
- Monthly ceiling of $8.00 enforced (monitoring-only for remainder)
- Prompt caching structure implemented (cacheable prefix)
- Cost per call logged with cumulative tracking

**Dependencies:** EP-001 (Secrets Manager for API key)

**SPEC Reference:** F6, F7

---

#### EP-005: Activity & Events System

**Description:** Build the events infrastructure that powers the activity feed and agent status indicator. Events are the backbone for frontend-agent coordination.

**Business Value:** Provides transparency into agent behaviour. Users can see what the agent is doing, verify it's working correctly, and distinguish between "checked but idle" and "not running."

**Acceptance Criteria:**
- Event entity implemented per SPEC section 4.1 schema
- Events written to DynamoDB with TTL (30 days)
- Event types implemented: `heartbeat`, `signal_detected`, `action_taken`, `escalation_created`, `artefact_updated`, `error`
- GSI1 configured for cross-project event queries
- Activity feed component displays events in scrolling feed
- Filter by project and event type
- Heartbeat distinction: grey (no changes) vs coloured (changes detected)
- Empty state: "Your agent is setting up. First sync will happen at [time]"
- Agent status indicator in dashboard header:
  - "Active (next check in Xm)" - derived from last heartbeat
  - "Paused" - when autonomy level is monitoring
  - "Error: [detail]" - when last cycle failed

**Dependencies:** EP-001 (DynamoDB), EP-002 (Frontend), EP-003 (Heartbeat Lambda)

**SPEC Reference:** F8, F10

---

#### EP-006: Notification System

**Description:** Integrate Amazon SES for agent-to-user notifications including health alerts and daily digest foundation.

**Business Value:** Enables the agent to alert the user about important events (errors, escalations) without requiring active dashboard monitoring. Foundation for daily digest feature.

**Acceptance Criteria:**
- SES integration via AWS SDK v3 (`@aws-sdk/client-ses`)
- Sending domain verified in SES
- Production access requested (exit sandbox mode)
- Lambda execution role has `ses:SendEmail` permission
- Basic email templates created (HTML + plain text fallback)
- Health alert emails triggered on:
  - Three consecutive integration health check failures
  - No heartbeat for 30 minutes
- Email content uses impersonal active voice (no "I")
- Free tier usage (62,000 emails/month from Lambda)

**Dependencies:** EP-001 (IAM roles)

**SPEC Reference:** F9

---

### Phase 2: Core Product

#### EP-007: Jira Integration

**Description:** Build the Jira Cloud signal source implementation, including authentication, delta detection, and change detection gate to minimise LLM costs.

**Business Value:** Jira is the primary source of project signals. The change detection gate is critical for budget control - without it, every 15-minute cycle would invoke Claude even when nothing changed.

**Acceptance Criteria:**
- SignalSource interface implemented for Jira Cloud
- Authentication via API token (Basic auth)
- Endpoints implemented:
  - Sprint status (`GET /rest/agile/1.0/board/{boardId}/sprint`)
  - Sprint issues (`GET /rest/agile/1.0/sprint/{sprintId}/issue`)
  - Issue changes (`GET /rest/api/3/search` with JQL)
  - Issue detail (on-demand)
- Checkpoint stored in DynamoDB (`last_sync_timestamp`)
- JQL filter: `updated >= "{checkpoint}"`
- Health check: `GET /rest/api/3/myself`
- Change detection gate implemented:
  - Check API for deltas before invoking LLM
  - If no changes, skip triage/reasoning steps entirely
  - Log "checked, nothing new" heartbeat event
- Raw API responses transformed to `NormalisedSignal` format

**Dependencies:** EP-001 (Secrets Manager, DynamoDB), EP-003 (change-detection Lambda)

**SPEC Reference:** C1, C2, C6

---

#### EP-008: Signal Processing Pipeline

**Description:** Build the two-pass triage system with separate sanitisation and classification steps, and the context assembly module for LLM prompts.

**Business Value:** The two-pass triage is the core security feature - external content (Jira tickets, emails) is sanitised before entering reasoning prompts. IAM isolation ensures a compromised Triage Lambda cannot send emails or modify Jira.

**Acceptance Criteria:**
- Triage Lambda deployed with restricted IAM role:
  - Access to LLM API key only
  - No access to Jira, Graph, or SES credentials
- Two-pass triage implemented:
  - Pass 1 (Sanitise): Strip/neutralise untrusted content (Haiku)
  - Pass 2 (Classify): Classify signal importance, recommend actions (Haiku)
- Context assembly module (`@agentic-pm/core/context`):
  - Testable without LLM dependency
  - Cache-friendly structure (system prompt + artefact context as cacheable prefix)
  - Variable content (new signals) after cache boundary
- Triage Lambda timeout: 120s with 2x retry
- All triage outputs validated against schema

**Dependencies:** EP-004 (LLM layer), EP-007 (Jira signals)

**SPEC Reference:** C3, C4

---

#### EP-009: Artefact Management

**Description:** Build the artefact bootstrap system to generate initial PM artefacts from Jira data, and implement the artefact update pipeline with one-deep version history.

**Business Value:** The artefacts (Delivery State, RAID Log, Backlog Summary, Decision Log) are the core product outputs. They synthesise data that doesn't exist in any single tool. One-deep versioning enables undo without storage bloat.

**Acceptance Criteria:**
- Artefact entity implemented per SPEC section 4.1
- Four artefact types with schemas from SPEC section 4.2:
  - Delivery State (overall status, sprint progress, blockers, metrics)
  - RAID Log (risks, assumptions, issues, dependencies)
  - Backlog Summary (status breakdown, highlights, refinement candidates)
  - Decision Log (decisions with options, rationale, status)
- Artefact bootstrap from Jira data:
  - Generate initial delivery state from sprint data
  - Generate initial RAID log (empty or from flagged tickets)
  - Generate initial backlog summary from issue counts
  - Generate empty decision log
- `previousVersion` attribute stores one-deep history
- Version number incremented on each update
- DynamoDB TTL configured:
  - Events: 30 days
  - Agent Actions: 90 days
  - Artefacts: no TTL (indefinite retention)

**Dependencies:** EP-007 (Jira data), EP-004 (LLM for generation)

**SPEC Reference:** C5, C11

---

#### EP-010: Dashboard & Daily Digest

**Description:** Build the Mission Control dashboard with project cards and implement the daily digest email summarising agent activity.

**Business Value:** Mission Control is the primary user interface - a single view of project health, agent status, and pending decisions. Daily digest keeps the user informed without requiring active monitoring.

**Acceptance Criteria:**
- Mission Control view implemented with:
  - Project cards showing health status (green/amber/red)
  - Agent status indicator (derived from heartbeat)
  - Pending escalation count with quick access
  - 24-hour stats (signals processed, actions taken, escalations)
- Hybrid SSR pattern:
  - Server Components render initial data
  - TanStack Query for 30-second polling refresh
- shadcn/ui components: Card, Badge, Button
- Accessibility: semantic HTML, keyboard navigation, WCAG contrast
- Amber badge uses #d97706 (not #f59e0b - fails AA contrast)
- Daily digest email via SES:
  - Sent at configured time (from `working_hours` config)
  - Summary of previous 24 hours
  - Pending escalations count
  - Artefact update summary
  - Link to dashboard

**Dependencies:** EP-005 (Events), EP-006 (SES), EP-009 (Artefacts)

**SPEC Reference:** C8, C12

---

#### EP-011: Escalation & Health Monitoring

**Description:** Build the escalation workflow (create, present, decide) and implement health monitoring with CloudWatch alarms.

**Business Value:** Escalations are the agent's mechanism for seeking human input on decisions that exceed its autonomy level. Health monitoring ensures the system is reliable and failures are detected promptly.

**Acceptance Criteria:**
- Escalation entity implemented per SPEC section 4.1
- Escalation workflow:
  - Agent creates escalation with title, context, options, recommendation
  - Escalation appears in Mission Control with count badge
  - Decision Interface view: full-screen escalation detail
  - Options displayed with pros/cons
  - Agent recommendation shown with rationale
  - Decision buttons: Accept recommendation, Choose alternative, Dismiss
  - User notes captured with decision
  - Status transitions: pending -> decided/expired/superseded
- GSI1 query for pending escalations across all projects
- Health monitoring:
  - Integration health checks on every cycle
  - Jira: `GET /rest/api/3/myself`
  - SES: `ses:GetSendQuota`
  - CloudWatch alarms:
    - No heartbeat for 30 minutes
    - Three consecutive integration failures
    - Step Functions execution failures
  - Alarms trigger SES notification to user

**Dependencies:** EP-003 (Agent orchestration), EP-006 (SES), EP-010 (Dashboard)

**SPEC Reference:** C9, C10

---

#### EP-012: Autonomy Modes & Dry-Run

**Description:** Implement dry-run mode and the three autonomy levels (Monitoring, Artefact, Tactical) with proper decision boundaries.

**Business Value:** Dry-run mode enables safe testing and trust building. Autonomy levels provide a graduated path from observation to action, with clear boundaries preventing the agent from exceeding its authority.

**Acceptance Criteria:**
- Dry-run mode implemented:
  - Log all actions but don't execute
  - UI shows "what agent would do"
  - Toggle in settings
- Decision boundaries enforced (SPEC section 5.4):
  - Auto-execute: artefact_update, heartbeat_log, notification_internal, jira_comment
  - Require hold queue: email_stakeholder, jira_status_change
  - Require approval: email_external, jira_create_ticket, scope_change, milestone_change
  - Never do: delete_data, share_confidential, modify_integration_config, change_own_autonomy_level
- Autonomy levels:
  - Level 1 (Monitoring): Observe, log, heartbeat only
  - Level 2 (Artefact): + update artefacts, send SES notifications
  - Level 3 (Tactical): + stakeholder emails, Jira updates via hold queue
- Autonomy dial in settings (Observe / Maintain / Act slider)
- Agent acknowledges level changes: "Understood. I'll hold all actions for your review."
- Level 2 graduation: Project starts at Level 1, graduates after C13 criteria met

**Dependencies:** EP-003 (Agent execution), EP-009 (Artefact updates)

**SPEC Reference:** C7, C13

---

### Phase 3: Enhancements

#### EP-013: Outlook Integration

**Description:** Build the Microsoft Graph API signal source for Outlook email monitoring using delta queries.

**Business Value:** Email is a critical source of PM signals (stakeholder concerns, decisions, blockers). Cross-platform synthesis of Jira + email creates insights not available in either tool alone.

**Acceptance Criteria:**
- SignalSource interface implemented for Outlook
- Azure AD app registration with application permissions
- Required permissions: Mail.Read, Mail.Send, Mail.ReadWrite
- Client credentials auth flow (daemon app)
- Delta queries for email changes (not timestamp-based)
- Delta token stored in DynamoDB checkpoint
- Endpoints implemented:
  - Read emails: `GET /users/{userId}/messages/delta`
  - Send email: `POST /users/{userId}/sendMail`
  - Search mail (on-demand)
- Health check: `GET /users/{userId}`
- Fallback defined: If admin consent unavailable, Outlook deferred

**Dependencies:** EP-007 (SignalSource pattern established)

**SPEC Reference:** E1

---

#### EP-014: Hold Queue & Communications

**Description:** Implement draft-then-send with hold queue for stakeholder communications, and the communication preview in the dashboard.

**Business Value:** Hold queue is the key safety mechanism for Level 3 autonomy. Stakeholder emails are held for review (default 30 min), graduating down after consecutive approvals. This builds trust while enabling tactical autonomy.

**Acceptance Criteria:**
- Hold queue Lambda deployed
- EventBridge Scheduler configured for 1-minute hold queue check
- Agent Action entity extended with `heldUntil` attribute
- Hold durations:
  - Stakeholder email: 30 minutes (default)
  - Jira status change: 5 minutes
- Hold queue processor:
  - Query GSI1 for actions past `heldUntil`
  - Execute action if not cancelled
  - Log execution event
- Communication preview in dashboard:
  - Pending held items displayed
  - Email preview with recipient, subject, body
  - Approve/Cancel buttons
  - Time remaining indicator
- Graduation: Hold time reduces after consecutive approvals
- Level 3 tactical actions enabled via hold queue

**Dependencies:** EP-012 (Autonomy levels), EP-013 (Outlook for sending)

**SPEC Reference:** E2, E3, E8

---

#### EP-015: Reasoning & Transparency

**Description:** Implement structured confidence scoring, reasoning transparency (explaining agent decisions), and Sonnet reasoning Lambda for complex multi-source signals.

**Business Value:** Transparency builds trust. Users can see why the agent took each action, based on objective scoring criteria (not LLM self-reported confidence). Sonnet handles complex reasoning that exceeds Haiku's capabilities.

**Acceptance Criteria:**
- Structured confidence scoring (SPEC section 5.5):
  - Source agreement: Do multiple sources corroborate?
  - Boundary compliance: Is action within defined boundaries?
  - Schema validity: Did Claude return valid structured output?
  - Precedent match: Has this type of action succeeded before?
- Auto-execute rule: All four dimensions must pass
- Confidence scores logged with each action
- Reasoning transparency:
  - Activity feed shows "why" for each action
  - Expandable detail with source signals and scores
- Sonnet reasoning Lambda:
  - Invoked for complex multi-source signals
  - 300s timeout with 2x retry
  - Used for ~30% of LLM calls (complex reasoning only)
  - Risk assessment, stakeholder communication drafting, RAID synthesis

**Dependencies:** EP-008 (Triage pipeline), EP-004 (LLM layer)

**SPEC Reference:** E4, E5, E9

---

#### EP-016: Trust & Compliance

**Description:** Implement anti-complacency spot checks, autonomy graduation ceremony, and validate prompt injection defences.

**Business Value:** Prevents automation complacency where users stop reviewing agent actions. Graduation ceremony makes level transitions explicit and evidence-based. Security validation ensures the two-stage triage architecture works.

**Acceptance Criteria:**
- Anti-complacency spot checks:
  - Every 2 weeks, present random action for review
  - Track review rate and outcomes
  - Alert if reviews are consistently skipped
- Autonomy graduation ceremony:
  - Evidence dashboard showing qualification criteria
  - Level 1 -> 2: 7 days, zero false classifications (manual review)
  - Level 2 -> 3: 14 days, zero manual corrections, 5+ approved communications
  - Explicit confirmation required to graduate
- Prompt injection defence validation:
  - Test Triage Lambda IAM isolation
  - Verify cannot access Jira/Graph/SES credentials
  - Test with known injection payloads
  - Document test results

**Dependencies:** EP-012 (Autonomy levels), EP-014 (Hold queue)

**SPEC Reference:** E6, E7, E10

---

#### EP-017: Advanced UI Views

**Description:** Build the project detail view with artefact viewer and diff, and the settings view with integration config and budget status.

**Business Value:** Project detail view provides deep access to PM artefacts with change history. Settings view enables configuration of integrations, autonomy levels, and budget controls.

**Acceptance Criteria:**
- Project detail view:
  - Tabs for each artefact type
  - Artefact content rendered with appropriate formatting
  - Diff view: compare current vs previousVersion
  - Timestamp of last update
  - Link to relevant signals that triggered update
- Settings view:
  - Integration configuration
    - Jira: project key, board ID, API token status
    - Outlook: user ID, connection status (if available)
    - SES: verified domain, sending status
  - Autonomy dial (Observe / Maintain / Act)
  - Polling interval (read-only, adjusts with budget degradation)
  - Budget status:
    - Current month spend (LLM)
    - Daily average
    - Degradation tier (if any)
    - Remaining budget
- Settings is client-rendered (interactive forms)

**Dependencies:** EP-009 (Artefacts), EP-012 (Autonomy), EP-004 (Budget tracking)

**SPEC Reference:** E11, E12

---

## 2. User Stories

### EP-001: AWS Infrastructure Foundation

#### US-001: CDK Project Initialisation
**As a** developer
**I want** an AWS CDK project with TypeScript configuration
**So that** I can define infrastructure as code and deploy consistently

**Acceptance Criteria:**
- Given a fresh repository clone
- When I run `pnpm install && pnpm cdk:synth`
- Then the CDK synthesises CloudFormation templates without errors

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-002: DynamoDB Single-Table Design
**As a** developer
**I want** a DynamoDB table with the single-table design from SPEC section 4.1
**So that** all entities share one table with predictable access patterns

**Acceptance Criteria:**
- Given the CDK stack is deployed
- When I query the table
- Then PK/SK structure matches SPEC (PROJECT#, ARTEFACT#, EVENT#, etc.)
- And GSI1 is configured with GSI1PK/GSI1SK
- And TTL is enabled on the table

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-003: IAM Role - Triage Lambda
**As a** security-conscious developer
**I want** a restricted IAM role for the Triage Lambda
**So that** prompt injection attacks cannot access integration credentials

**Acceptance Criteria:**
- Given the Triage Lambda is deployed
- When it attempts to access `/agentic-pm/jira/*` secrets
- Then access is denied by IAM
- And when it accesses `/agentic-pm/llm/*` secrets
- Then access is granted

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-004: IAM Role - Agent Lambda
**As a** developer
**I want** an IAM role for agent Lambdas with integration access
**So that** the agent can interact with Jira, SES, and other integrations

**Acceptance Criteria:**
- Given the Agent Lambda is deployed
- When it accesses Jira and SES credentials
- Then access is granted
- And when it writes to DynamoDB
- Then the operation succeeds

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-005: Secrets Manager Configuration
**As a** developer
**I want** secrets stored in AWS Secrets Manager
**So that** credentials are never in code or environment variables

**Acceptance Criteria:**
- Given the CDK stack is deployed
- When I check Secrets Manager
- Then secrets exist for: `/agentic-pm/llm/api-key`, `/agentic-pm/jira/api-token`, `/agentic-pm/graph/credentials`, `/agentic-pm/auth/nextauth-secret`
- And secrets are encrypted with KMS

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-006: GitHub Actions CI/CD
**As a** developer
**I want** GitHub Actions to deploy Lambda functions via CDK
**So that** code changes are automatically deployed to AWS

**Acceptance Criteria:**
- Given I push to the main branch
- When the GitHub Actions workflow runs
- Then CDK deploys updated Lambda functions
- And deployment status is reported

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-007: Amplify Auto-Deploy
**As a** developer
**I want** Amplify to auto-deploy the frontend on push
**So that** UI changes are deployed without manual intervention

**Acceptance Criteria:**
- Given I push frontend changes to the main branch
- When Amplify detects the change
- Then the Next.js app is built and deployed
- And the new version is accessible via HTTPS

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-002: Authentication & Frontend Hosting

#### US-008: NextAuth Credentials Provider
**As a** user
**I want** to log in with username and password
**So that** only I can access my PM workbench

**Acceptance Criteria:**
- Given I am on the login page
- When I enter valid credentials
- Then I am authenticated and redirected to Mission Control
- And a session cookie is set with CSRF protection

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-009: Authentication Guard
**As a** user
**I want** protected routes to require authentication
**So that** my data is secure from unauthenticated access

**Acceptance Criteria:**
- Given I am not authenticated
- When I try to access Mission Control
- Then I am redirected to the login page
- And after successful login, I am redirected back

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-010: Session Management
**As a** user
**I want** my session to persist across browser refreshes
**So that** I don't have to log in repeatedly

**Acceptance Criteria:**
- Given I am authenticated
- When I close and reopen the browser
- Then my session is still valid (for configured duration)
- And I can access protected routes

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-003: Agent Orchestration Engine

#### US-011: Step Functions State Machine
**As a** developer
**I want** a Step Functions state machine orchestrating the agent workflow
**So that** the agent runs reliably with retry logic and error handling

**Acceptance Criteria:**
- Given the state machine is deployed
- When it is triggered
- Then it executes the steps in order per SPEC section 5.1
- And failed steps retry according to configuration
- And execution history is visible in AWS console

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-012: EventBridge 15-Minute Schedule
**As a** user
**I want** the agent to run every 15 minutes
**So that** project changes are detected in a timely manner

**Acceptance Criteria:**
- Given the agent is deployed
- When 15 minutes pass
- Then EventBridge triggers the state machine
- And a new execution is created

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-013: Heartbeat Lambda
**As a** user
**I want** the agent to log a heartbeat on each cycle
**So that** I know the agent is running and healthy

**Acceptance Criteria:**
- Given the agent cycle starts
- When the heartbeat Lambda executes
- Then an event is written to DynamoDB with eventType `heartbeat`
- And the event includes integration health status

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-014: Change Detection Lambda
**As a** developer
**I want** a Lambda that checks for changes across integrations
**So that** the agent only processes when there are changes

**Acceptance Criteria:**
- Given the change detection Lambda is invoked
- When there are no changes since last checkpoint
- Then it returns `{ hasChanges: false }`
- And when there are changes
- Then it returns `{ hasChanges: true, signals: [...] }`

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-015: Signal Normalise Lambda
**As a** developer
**I want** raw API responses converted to NormalisedSignal objects
**So that** the triage pipeline has a consistent input format

**Acceptance Criteria:**
- Given raw Jira or Outlook data
- When the normalise Lambda processes it
- Then output matches `NormalisedSignal` interface
- And source, timestamp, type, summary, raw, and project_id are populated

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-016: Lambda Outside VPC
**As a** cost-conscious developer
**I want** all Lambdas deployed outside VPC
**So that** NAT Gateway costs are avoided (~$33/month savings)

**Acceptance Criteria:**
- Given the CDK stack is deployed
- When I check Lambda configurations
- Then no Lambda is configured with VPC settings
- And Lambdas have direct internet access for external APIs

**Story Points:** 1
**Priority:** Must (MVP)

---

### EP-004: LLM Integration Layer

#### US-017: Claude API Client
**As a** developer
**I want** a Claude API client abstraction
**So that** LLM calls are consistent and testable

**Acceptance Criteria:**
- Given I import the LLM client
- When I call `invoke(prompt, options)`
- Then the request is sent to Claude API
- And the response is parsed and returned
- And errors are handled gracefully

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-018: Tool-Use Implementation
**As a** developer
**I want** to use Claude tool-use for structured outputs
**So that** artefact generation is reliable (no raw JSON.parse)

**Acceptance Criteria:**
- Given I define a tool schema
- When Claude is invoked with the tool
- Then the response uses the tool
- And output matches the defined schema

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-019: Haiku/Sonnet Model Routing
**As a** developer
**I want** automatic model routing based on task complexity
**So that** simple tasks use cheap Haiku and complex tasks use Sonnet

**Acceptance Criteria:**
- Given a triage task
- When the LLM is invoked
- Then Haiku 4.5 is used (~70% of calls)
- And given a complex reasoning task
- When the LLM is invoked
- Then Sonnet 4.5 is used (~30% of calls)

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-020: Cost Tracking
**As a** user
**I want** LLM costs tracked per call and cumulatively
**So that** I know how much the agent is spending

**Acceptance Criteria:**
- Given an LLM call is made
- When the response is received
- Then input/output tokens are logged
- And cost is calculated using current pricing
- And cumulative daily/monthly spend is updated in DynamoDB

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-021: Budget Degradation Tier 1
**As a** user
**I want** the agent to reduce Sonnet usage at $0.23/day
**So that** costs are controlled proactively

**Acceptance Criteria:**
- Given daily spend reaches $0.23
- When the next LLM call is needed
- Then model split changes to 85/15 Haiku/Sonnet
- And an info event is logged

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-022: Budget Degradation Tier 2
**As a** user
**I want** polling interval increased at $0.27/day
**So that** costs are further controlled

**Acceptance Criteria:**
- Given daily spend reaches $0.27
- When the agent checks configuration
- Then polling interval becomes 20 minutes
- And a warning event is logged

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-023: Budget Degradation Tier 3
**As a** user
**I want** Haiku-only mode at $0.30/day
**So that** the LLM budget is respected

**Acceptance Criteria:**
- Given daily spend reaches $0.30
- When the next LLM call is needed
- Then only Haiku is used
- And polling interval is 30 minutes
- And a warning event is logged

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-024: Budget Hard Ceiling
**As a** user
**I want** the agent to stop LLM calls at $0.40/day or $8/month
**So that** the budget is never exceeded

**Acceptance Criteria:**
- Given daily spend reaches $0.40 or monthly reaches $8.00
- When the agent cycle runs
- Then LLM calls are skipped
- And the agent enters monitoring-only mode
- And an error event is logged with SES notification

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-025: Prompt Caching Structure
**As a** developer
**I want** prompts structured for caching
**So that** repeated context reduces costs

**Acceptance Criteria:**
- Given a prompt is assembled
- When system prompt and artefact context are included
- Then they are in the cacheable prefix block
- And variable content (new signals) is after the cache boundary

**Story Points:** 2
**Priority:** Should (MVP)

---

### EP-005: Activity & Events System

#### US-026: Event Entity Implementation
**As a** developer
**I want** events stored in DynamoDB per SPEC schema
**So that** agent activity is recorded consistently

**Acceptance Criteria:**
- Given an event is created
- When it is written to DynamoDB
- Then it has PK, SK, and all required attributes
- And TTL is set to 30 days from creation

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-027: Activity Feed Display
**As a** user
**I want** to see agent events in a scrolling feed
**So that** I can monitor what the agent is doing

**Acceptance Criteria:**
- Given I am on the Activity Feed page
- When events exist
- Then they are displayed in reverse chronological order
- And I can scroll to load more
- And each event shows type, summary, and timestamp

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-028: Activity Feed Filtering
**As a** user
**I want** to filter the activity feed by project and event type
**So that** I can focus on relevant events

**Acceptance Criteria:**
- Given I am on the Activity Feed page
- When I select a project filter
- Then only events for that project are shown
- And when I select an event type filter
- Then only events of that type are shown

**Story Points:** 2
**Priority:** Should (MVP)

---

#### US-029: Heartbeat Visual Distinction
**As a** user
**I want** heartbeats with no changes shown differently than those with changes
**So that** I can distinguish "idle but running" from "actively processing"

**Acceptance Criteria:**
- Given a heartbeat event with no changes detected
- When it is displayed
- Then it appears grey and collapsed
- And given a heartbeat with changes detected
- When it is displayed
- Then it appears coloured and expanded

**Story Points:** 2
**Priority:** Should (MVP)

---

#### US-030: Activity Feed Empty State
**As a** new user
**I want** guidance when the activity feed is empty
**So that** I understand the agent hasn't run yet

**Acceptance Criteria:**
- Given no events exist
- When I view the Activity Feed
- Then I see "Your agent is setting up. First sync will happen at [time]"
- And the expected first run time is shown

**Story Points:** 1
**Priority:** Should (MVP)

---

#### US-031: Agent Status Indicator
**As a** user
**I want** to see the agent status in the dashboard header
**So that** I always know if the agent is running

**Acceptance Criteria:**
- Given the agent is running normally
- When I view any dashboard page
- Then I see "Active (next check in Xm)" in the header
- And given the agent is paused
- Then I see "Paused"
- And given the last cycle failed
- Then I see "Error: [detail]"

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-006: Notification System

#### US-032: SES Integration
**As a** developer
**I want** SES configured for sending emails
**So that** the agent can notify me of important events

**Acceptance Criteria:**
- Given SES is configured
- When the Lambda sends an email
- Then it is delivered to my verified email address
- And the sender is from my verified domain

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-033: Health Alert Emails
**As a** user
**I want** to receive email alerts for agent health issues
**So that** I know when intervention is needed

**Acceptance Criteria:**
- Given three consecutive integration health check failures
- When the agent detects this
- Then an email alert is sent via SES
- And given no heartbeat for 30 minutes
- Then an email alert is sent

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-034: Email Templates
**As a** user
**I want** well-formatted email notifications
**So that** alerts are easy to read and understand

**Acceptance Criteria:**
- Given an alert email is sent
- When I receive it
- Then it has HTML formatting with plain text fallback
- And the content is clear and actionable
- And it uses impersonal active voice (no "I")

**Story Points:** 2
**Priority:** Should (MVP)

---

### EP-007: Jira Integration

#### US-035: Jira Signal Source
**As a** developer
**I want** a SignalSource implementation for Jira
**So that** Jira data flows into the agent pipeline

**Acceptance Criteria:**
- Given Jira credentials are configured
- When `fetchDelta` is called
- Then changes since the checkpoint are returned
- And signals are in NormalisedSignal format

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-036: Jira Authentication
**As a** user
**I want** to connect my Jira account via API token
**So that** the agent can access my project data

**Acceptance Criteria:**
- Given I have a Jira API token
- When I configure it in settings
- Then it is stored securely in Secrets Manager
- And the health check passes

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-037: Jira Sprint Data
**As a** user
**I want** the agent to read my sprint data
**So that** delivery state reflects actual progress

**Acceptance Criteria:**
- Given an active sprint exists
- When the agent polls Jira
- Then sprint name, dates, and progress are captured
- And issue status counts are accurate

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-038: Jira Issue Changes
**As a** user
**I want** the agent to detect issue updates
**So that** blockers and changes are identified promptly

**Acceptance Criteria:**
- Given an issue is updated in Jira
- When the agent polls
- Then the change is detected via JQL filter
- And a signal is generated

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-039: Change Detection Gate
**As a** cost-conscious user
**I want** the agent to skip LLM calls when nothing changed
**So that** the $7/month LLM budget is preserved

**Acceptance Criteria:**
- Given no Jira changes since last checkpoint
- When the agent cycle runs
- Then triage and reasoning Lambdas are not invoked
- And only a "checked, nothing new" heartbeat is logged
- And no LLM cost is incurred

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-040: Jira Checkpoint Persistence
**As a** developer
**I want** the Jira sync checkpoint stored in DynamoDB
**So that** the agent resumes from the correct position

**Acceptance Criteria:**
- Given a successful Jira poll
- When the cycle completes
- Then the checkpoint is updated in DynamoDB
- And the next poll uses this checkpoint

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-041: Jira Health Check
**As a** user
**I want** Jira connection health monitored
**So that** I'm alerted if the connection breaks

**Acceptance Criteria:**
- Given the agent cycle runs
- When Jira health check is performed
- Then `GET /rest/api/3/myself` is called
- And success/failure is logged
- And three consecutive failures trigger an alert

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-008: Signal Processing Pipeline

#### US-042: Triage Sanitise Lambda
**As a** security-conscious developer
**I want** untrusted content sanitised before reasoning
**So that** prompt injection attacks are neutralised

**Acceptance Criteria:**
- Given a signal with potentially malicious content
- When it passes through the Sanitise Lambda
- Then dangerous patterns are stripped or neutralised
- And the Lambda uses only the LLM API key (no integration secrets)

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-043: Triage Classify Lambda
**As a** user
**I want** signals classified by importance
**So that** urgent issues are prioritised

**Acceptance Criteria:**
- Given a sanitised signal
- When it is classified
- Then it receives an importance score
- And recommended actions are attached
- And output is validated against schema

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-044: Context Assembly Module
**As a** developer
**I want** a testable context assembly module
**So that** prompt construction is reliable and cacheable

**Acceptance Criteria:**
- Given project state and signals
- When context is assembled
- Then it follows cache-friendly structure
- And the module can be unit tested without LLM calls
- And output is deterministic for same inputs

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-045: Triage IAM Isolation
**As a** security-conscious user
**I want** the Triage Lambda unable to access integration credentials
**So that** a compromised triage cannot send emails or modify Jira

**Acceptance Criteria:**
- Given the Triage Lambda IAM role
- When I attempt to access Jira or Graph secrets
- Then access is denied
- And when I attempt to call SES
- Then the operation fails

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-009: Artefact Management

#### US-046: Artefact Entity Implementation
**As a** developer
**I want** artefacts stored per SPEC schema
**So that** PM artefacts are persistently maintained

**Acceptance Criteria:**
- Given an artefact is created/updated
- When it is written to DynamoDB
- Then it has correct PK/SK structure
- And previousVersion contains the prior content
- And version number is incremented

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-047: Delivery State Generation
**As a** user
**I want** a Delivery State artefact generated from Jira data
**So that** I have an at-a-glance project health view

**Acceptance Criteria:**
- Given a project is connected to Jira
- When artefact bootstrap runs
- Then a Delivery State is generated with:
  - Overall status (green/amber/red)
  - Current sprint progress
  - Blockers list
  - Key metrics
- And the structure matches SPEC section 4.2

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-048: RAID Log Generation
**As a** user
**I want** a RAID Log artefact generated from signals
**So that** risks, assumptions, issues, and dependencies are tracked

**Acceptance Criteria:**
- Given project signals exist
- When artefact bootstrap runs
- Then a RAID Log is generated
- And items are categorised as risk/assumption/issue/dependency
- And each item has severity, owner, and status

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-049: Backlog Summary Generation
**As a** user
**I want** a Backlog Summary artefact from Jira issues
**So that** I have an overview of backlog health

**Acceptance Criteria:**
- Given Jira issues exist
- When artefact bootstrap runs
- Then a Backlog Summary is generated with:
  - Total items count
  - Status breakdown
  - Priority breakdown
  - Highlighted issues (blocked, stale, missing criteria)

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-050: Decision Log Initialisation
**As a** user
**I want** an empty Decision Log created for each project
**So that** decisions can be recorded over time

**Acceptance Criteria:**
- Given a new project is created
- When artefact bootstrap runs
- Then an empty Decision Log is created
- And it is ready to record future decisions

**Story Points:** 1
**Priority:** Must (MVP)

---

#### US-051: Artefact Version History
**As a** user
**I want** the previous version of an artefact preserved
**So that** I can undo the last change if needed

**Acceptance Criteria:**
- Given an artefact is updated
- When the update completes
- Then previousVersion contains the prior content
- And only one previous version is kept (one-deep history)

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-010: Dashboard & Daily Digest

#### US-052: Mission Control Dashboard
**As a** user
**I want** a Mission Control dashboard
**So that** I can see project health at a glance

**Acceptance Criteria:**
- Given I am authenticated
- When I navigate to Mission Control
- Then I see project cards with health status
- And agent status indicator in header
- And pending escalation count
- And 24-hour activity stats

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-053: Project Health Cards
**As a** user
**I want** project cards showing RAG status
**So that** I can quickly identify projects needing attention

**Acceptance Criteria:**
- Given projects exist with delivery state artefacts
- When I view Mission Control
- Then each project shows a health badge (green/amber/red)
- And amber uses #d97706 (accessible contrast)
- And clicking a card navigates to project detail

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-054: 24-Hour Stats Display
**As a** user
**I want** to see 24-hour activity statistics
**So that** I know how active the agent has been

**Acceptance Criteria:**
- Given agent activity in the last 24 hours
- When I view Mission Control
- Then I see: signals processed, actions taken, escalations created
- And stats update on 30-second polling refresh

**Story Points:** 2
**Priority:** Should (MVP)

---

#### US-055: Daily Digest Email
**As a** user
**I want** a daily summary email
**So that** I stay informed without checking the dashboard

**Acceptance Criteria:**
- Given it is the configured digest time
- When the housekeeping Lambda runs
- Then an email is sent with:
  - Previous 24 hours summary
  - Pending escalation count
  - Artefact update summary
  - Link to dashboard

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-056: TanStack Query Polling
**As a** developer
**I want** TanStack Query for real-time data updates
**So that** the dashboard stays current without full page reloads

**Acceptance Criteria:**
- Given the dashboard is displayed
- When 30 seconds pass
- Then agent status and activity stats are refreshed
- And updates appear without page navigation

**Story Points:** 3
**Priority:** Must (MVP)

---

### EP-011: Escalation & Health Monitoring

#### US-057: Escalation Creation
**As a** developer
**I want** the agent to create escalations for decisions needing approval
**So that** I am consulted on important decisions

**Acceptance Criteria:**
- Given an action requires approval (per decision boundaries)
- When the agent identifies this
- Then an escalation is created with:
  - Title, context, options
  - Agent recommendation and rationale
  - Status: pending

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-058: Escalation Count Badge
**As a** user
**I want** to see a count of pending escalations
**So that** I know when decisions are waiting

**Acceptance Criteria:**
- Given pending escalations exist
- When I view Mission Control
- Then a badge shows the count
- And clicking it navigates to escalations

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-059: Decision Interface
**As a** user
**I want** a full-screen interface to review and decide on escalations
**So that** I have sufficient context to make good decisions

**Acceptance Criteria:**
- Given I select an escalation
- When the Decision Interface loads
- Then I see: title, context, options with pros/cons
- And agent recommendation with rationale
- And decision buttons (Accept/Choose alternative/Dismiss)
- And a notes field

**Story Points:** 5
**Priority:** Must (MVP)

---

#### US-060: Escalation Decision Recording
**As a** user
**I want** my decision recorded with notes
**So that** there is an audit trail

**Acceptance Criteria:**
- Given I make a decision on an escalation
- When I submit
- Then the escalation is updated with:
  - userDecision, userNotes, decidedAt
  - Status changes to "decided"
- And the decision is logged in Decision Log artefact

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-061: Integration Health Checks
**As a** user
**I want** integration health monitored on every cycle
**So that** I know if connections are working

**Acceptance Criteria:**
- Given the agent cycle runs
- When health checks are performed
- Then Jira: `GET /rest/api/3/myself`
- And SES: `GetSendQuota` API
- And results are logged in heartbeat event

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-062: CloudWatch Alarm - Missed Heartbeat
**As a** user
**I want** an alarm if no heartbeat for 30 minutes
**So that** agent failures are detected promptly

**Acceptance Criteria:**
- Given no heartbeat event for 30 minutes
- When CloudWatch evaluates the alarm
- Then the alarm triggers
- And an SES notification is sent

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-063: CloudWatch Alarm - Execution Failures
**As a** user
**I want** an alarm if Step Functions executions fail repeatedly
**So that** systemic issues are detected

**Acceptance Criteria:**
- Given Step Functions execution fails
- When CloudWatch evaluates the alarm
- Then after 3 consecutive failures the alarm triggers
- And an SES notification is sent

**Story Points:** 2
**Priority:** Must (MVP)

---

### EP-012: Autonomy Modes & Dry-Run

#### US-064: Dry-Run Mode Toggle
**As a** user
**I want** to toggle dry-run mode
**So that** I can see what the agent would do without executing

**Acceptance Criteria:**
- Given I toggle dry-run mode in settings
- When the agent cycle runs
- Then all actions are logged but not executed
- And the UI shows "would do" indicators

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-065: Decision Boundary Enforcement
**As a** user
**I want** decision boundaries enforced in code
**So that** the agent cannot exceed its authority

**Acceptance Criteria:**
- Given an action recommendation from the LLM
- When the execution layer processes it
- Then it is checked against decisionBoundaries
- And actions not in allowlist are rejected
- And "neverDo" actions are always blocked

**Story Points:** 3
**Priority:** Must (MVP)

---

#### US-066: Autonomy Level 1 (Monitoring)
**As a** user
**I want** Level 1 to only observe and log
**So that** the agent runs safely while I build trust

**Acceptance Criteria:**
- Given autonomy level is set to 1
- When signals are detected
- Then they are logged but no actions are taken
- And all would-be actions are escalated

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-067: Autonomy Level 2 (Artefact)
**As a** user
**I want** Level 2 to update artefacts autonomously
**So that** PM documents are maintained automatically

**Acceptance Criteria:**
- Given autonomy level is set to 2
- When artefact updates are warranted
- Then they are executed without escalation
- And SES notifications are sent autonomously
- And external communications still require approval

**Story Points:** 2
**Priority:** Must (MVP)

---

#### US-068: Autonomy Dial UI
**As a** user
**I want** a slider to set autonomy level
**So that** I can easily adjust the agent's authority

**Acceptance Criteria:**
- Given I am on the Settings page
- When I see the autonomy dial
- Then it shows Observe / Maintain / Act zones
- And moving the slider changes the level
- And the agent acknowledges the change

**Story Points:** 2
**Priority:** Should (MVP)

---

#### US-069: Autonomy Change Acknowledgement
**As a** user
**I want** the agent to acknowledge autonomy changes
**So that** I know it understood my instruction

**Acceptance Criteria:**
- Given I change the autonomy level
- When the change is saved
- Then an event is logged: "Understood. I'll hold all actions for your review." (or similar for each level)

**Story Points:** 1
**Priority:** Should (MVP)

---

### EP-013: Outlook Integration

#### US-070: Outlook Signal Source
**As a** developer
**I want** a SignalSource implementation for Outlook
**So that** email signals flow into the agent pipeline

**Acceptance Criteria:**
- Given Azure AD credentials are configured
- When `fetchDelta` is called
- Then email changes since the delta token are returned
- And signals are in NormalisedSignal format

**Story Points:** 5
**Priority:** Must (Phase 3)

---

#### US-071: Azure AD Authentication
**As a** developer
**I want** client credentials auth for Graph API
**So that** the daemon app can access mail without user interaction

**Acceptance Criteria:**
- Given Azure AD app is registered
- When credentials are configured
- Then OAuth token is obtained via client credentials flow
- And Mail.Read, Mail.Send permissions work

**Story Points:** 3
**Priority:** Must (Phase 3)

---

#### US-072: Graph API Delta Queries
**As a** developer
**I want** delta queries for email changes
**So that** no messages are missed or duplicated

**Acceptance Criteria:**
- Given an initial delta query
- When delta token is stored
- Then subsequent queries return only changes
- And the token is updated after each successful query

**Story Points:** 3
**Priority:** Must (Phase 3)

---

#### US-073: Outlook Health Check
**As a** user
**I want** Outlook connection health monitored
**So that** I'm alerted if the connection breaks

**Acceptance Criteria:**
- Given the agent cycle runs
- When Outlook health check is performed
- Then `GET /users/{userId}` is called
- And success/failure is logged

**Story Points:** 1
**Priority:** Must (Phase 3)

---

### EP-014: Hold Queue & Communications

#### US-074: Hold Queue Lambda
**As a** developer
**I want** a Lambda that processes held actions
**So that** approved communications are sent after the hold period

**Acceptance Criteria:**
- Given actions exist with `heldUntil` in the past
- When the hold queue Lambda runs
- Then those actions are executed
- And execution events are logged

**Story Points:** 3
**Priority:** Must (Phase 3)

---

#### US-075: Hold Queue 1-Minute Schedule
**As a** user
**I want** the hold queue checked every minute
**So that** communications are sent promptly after approval

**Acceptance Criteria:**
- Given EventBridge is configured
- When 1 minute passes
- Then the hold queue Lambda is invoked (independent of main cycle)

**Story Points:** 1
**Priority:** Must (Phase 3)

---

#### US-076: Stakeholder Email Hold
**As a** user
**I want** stakeholder emails held for 30 minutes
**So that** I can review before they are sent

**Acceptance Criteria:**
- Given the agent drafts a stakeholder email
- When the action is created
- Then `heldUntil` is set to now + 30 minutes
- And the email is not sent until then (or user approves)

**Story Points:** 2
**Priority:** Must (Phase 3)

---

#### US-077: Jira Status Change Hold
**As a** user
**I want** Jira status changes held for 5 minutes
**So that** I can intervene if needed

**Acceptance Criteria:**
- Given the agent recommends a status change
- When the action is created
- Then `heldUntil` is set to now + 5 minutes

**Story Points:** 1
**Priority:** Must (Phase 3)

---

#### US-078: Communication Preview
**As a** user
**I want** to preview held communications in the dashboard
**So that** I can review and approve or cancel

**Acceptance Criteria:**
- Given held actions exist
- When I view the dashboard
- Then I see a list of pending communications
- And each shows: recipient, subject, preview, time remaining
- And I can approve or cancel each

**Story Points:** 3
**Priority:** Must (Phase 3)

---

#### US-079: Hold Time Graduation
**As a** user
**I want** hold times to reduce after consecutive approvals
**So that** proven action types execute faster over time

**Acceptance Criteria:**
- Given 5 consecutive emails were approved without edits
- When the next email is drafted
- Then the hold time is reduced (e.g., 30m -> 15m -> 5m)
- And this graduation is tracked per action type

**Story Points:** 2
**Priority:** Should (Phase 3)

---

### EP-015: Reasoning & Transparency

#### US-080: Structured Confidence Scoring
**As a** developer
**I want** multi-dimensional confidence scores
**So that** auto-execute decisions are objective and inspectable

**Acceptance Criteria:**
- Given an action recommendation
- When confidence is calculated
- Then four dimensions are scored:
  - Source agreement (deterministic)
  - Boundary compliance (deterministic)
  - Schema validity (deterministic)
  - Precedent match (query-based)
- And auto-execute only if all pass

**Story Points:** 3
**Priority:** Should (Phase 3)

---

#### US-081: Reasoning Transparency in Activity Feed
**As a** user
**I want** to see why the agent took each action
**So that** I can verify its reasoning

**Acceptance Criteria:**
- Given an action was taken
- When I view it in the activity feed
- Then I can expand to see:
  - Source signals that triggered it
  - Confidence scores
  - Decision rationale

**Story Points:** 3
**Priority:** Should (Phase 3)

---

#### US-082: Sonnet Reasoning Lambda
**As a** developer
**I want** a separate Lambda for complex reasoning
**So that** Sonnet is only invoked when truly needed

**Acceptance Criteria:**
- Given a signal requires complex multi-source reasoning
- When the state machine decides
- Then the Sonnet reasoning Lambda is invoked
- And it has 300s timeout with 2x retry

**Story Points:** 3
**Priority:** Should (Phase 3)

---

### EP-016: Trust & Compliance

#### US-083: Anti-Complacency Spot Checks
**As a** user
**I want** random action reviews requested fortnightly
**So that** I don't become complacent about agent oversight

**Acceptance Criteria:**
- Given 2 weeks have passed since last spot check
- When the agent cycle runs
- Then a random recent action is presented for review
- And my response is tracked

**Story Points:** 2
**Priority:** Should (Phase 3)

---

#### US-084: Autonomy Graduation Evidence
**As a** user
**I want** to see evidence supporting level graduation
**So that** I can make an informed decision to promote

**Acceptance Criteria:**
- Given I view the graduation dashboard
- When qualification criteria are evaluated
- Then I see:
  - Days at current level
  - False classification rate
  - Manual correction count
  - Approved communications count
- And I can confirm graduation if criteria are met

**Story Points:** 3
**Priority:** Should (Phase 3)

---

#### US-085: Graduation Confirmation
**As a** user
**I want** to explicitly confirm level graduation
**So that** increased autonomy is my deliberate choice

**Acceptance Criteria:**
- Given graduation criteria are met
- When I view the graduation dashboard
- Then a confirmation dialog appears
- And I must explicitly approve the level change

**Story Points:** 2
**Priority:** Should (Phase 3)

---

#### US-086: Prompt Injection Defence Validation
**As a** security-conscious developer
**I want** documented tests of IAM isolation
**So that** the security model is verified

**Acceptance Criteria:**
- Given the Triage Lambda is deployed
- When security tests are run
- Then attempts to access integration secrets fail
- And test results are documented

**Story Points:** 2
**Priority:** Should (Phase 3)

---

### EP-017: Advanced UI Views

#### US-087: Project Detail View
**As a** user
**I want** a detailed view of each project's artefacts
**So that** I can review PM documents in full

**Acceptance Criteria:**
- Given I select a project
- When the Project Detail view loads
- Then I see tabs for each artefact type
- And artefact content is rendered with appropriate formatting

**Story Points:** 5
**Priority:** Should (Phase 3)

---

#### US-088: Artefact Diff View
**As a** user
**I want** to compare current vs previous artefact version
**So that** I can see what changed

**Acceptance Criteria:**
- Given an artefact has been updated
- When I view Project Detail
- Then I can toggle a diff view
- And changes are highlighted (additions, deletions)

**Story Points:** 3
**Priority:** Could (Phase 3)

---

#### US-089: Settings View
**As a** user
**I want** a settings page to configure integrations and preferences
**So that** I can manage my agent setup

**Acceptance Criteria:**
- Given I navigate to Settings
- When the page loads
- Then I see sections for:
  - Integration config (Jira, Outlook, SES)
  - Autonomy dial
  - Budget status
- And changes are saved via API routes

**Story Points:** 5
**Priority:** Should (Phase 3)

---

#### US-090: Budget Status Display
**As a** user
**I want** to see LLM budget status in settings
**So that** I know if costs are controlled

**Acceptance Criteria:**
- Given I view Settings
- When I see the Budget section
- Then I see:
  - Current month spend
  - Daily average
  - Active degradation tier (if any)
  - Remaining budget

**Story Points:** 2
**Priority:** Should (Phase 3)

---

## 3. Technical Tasks

### Infrastructure Setup

#### TT-001: Local Development Environment
**Description:** Set up local development environment with Docker, DynamoDB Local, and LocalStack.

**Tasks:**
- Create `docker-compose.yml` with DynamoDB Local and LocalStack
- Configure AWS SDK for local endpoints
- Create seed data scripts for development
- Document setup process in README

**Acceptance Criteria:**
- `docker-compose up -d` starts all local services
- `pnpm dev:agent` runs agent locally against local services
- `pnpm dev` starts Next.js development server

**Estimate:** 3 points

---

#### TT-002: Monorepo Structure
**Description:** Set up pnpm workspaces monorepo structure per SPEC section 5.7.

**Tasks:**
- Initialise pnpm workspace configuration
- Create package structure:
  - `apps/web` - Next.js frontend
  - `packages/core` - Shared business logic
  - `packages/cdk` - AWS CDK infrastructure
- Configure TypeScript project references
- Configure shared ESLint/Prettier

**Acceptance Criteria:**
- `pnpm install` installs all dependencies
- Packages can import from each other
- TypeScript strict mode enabled for all packages

**Estimate:** 3 points

---

#### TT-003: Testing Infrastructure
**Description:** Set up testing infrastructure for unit, integration, and evaluation tests.

**Tasks:**
- Configure Vitest for unit tests
- Configure integration test setup with DynamoDB Local
- Create test utilities and fixtures
- Set up evaluation test framework for LLM quality
- Configure code coverage reporting

**Acceptance Criteria:**
- `pnpm test` runs all unit tests
- `pnpm test:integration` runs integration tests
- `pnpm test:eval` runs LLM evaluation tests
- Coverage reports generated

**Estimate:** 5 points

---

#### TT-004: AWS CDK Bootstrap
**Description:** Initialise AWS CDK project with base stack configuration.

**Tasks:**
- Initialise CDK project with TypeScript
- Configure CDK bootstrap for target account/region
- Create base stack structure
- Set up CDK outputs for resource references
- Configure CDK diff and deploy scripts

**Acceptance Criteria:**
- `pnpm cdk:synth` generates CloudFormation templates
- `pnpm cdk:deploy` deploys to AWS
- Stack names follow naming convention

**Estimate:** 3 points

---

#### TT-005: GitHub Actions Workflow
**Description:** Create CI/CD pipeline for testing and deployment.

**Tasks:**
- Create workflow for PR checks (lint, test, build)
- Create workflow for main branch deployment
- Configure AWS credentials via OIDC
- Set up environment-specific deployments
- Configure branch protection rules

**Acceptance Criteria:**
- PRs trigger lint/test/build
- Merge to main triggers CDK deploy
- Deployment status visible in GitHub

**Estimate:** 3 points

---

#### TT-006: Amplify Configuration
**Description:** Configure AWS Amplify for Next.js hosting.

**Tasks:**
- Create Amplify app via CDK
- Configure build settings for Next.js
- Set up environment variables from Secrets Manager
- Configure custom domain (if applicable)
- Set up branch-based deployments

**Acceptance Criteria:**
- Push to main deploys frontend
- Environment variables injected at build time
- HTTPS enabled

**Estimate:** 2 points

---

#### TT-007: CloudWatch Logging and Metrics
**Description:** Configure centralised logging and monitoring.

**Tasks:**
- Configure Lambda log groups with retention
- Create CloudWatch dashboard for agent metrics
- Set up log insights queries for debugging
- Configure Step Functions logging
- Create cost monitoring dashboard

**Acceptance Criteria:**
- All Lambda logs in CloudWatch
- Dashboard shows agent health metrics
- Cost can be monitored daily

**Estimate:** 2 points

---

#### TT-008: Secrets Management Setup
**Description:** Create and configure all Secrets Manager secrets.

**Tasks:**
- Create CDK constructs for each secret
- Document secret structure and rotation policy
- Create scripts for secret population (manual step)
- Configure Lambda access patterns

**Acceptance Criteria:**
- All secrets created with correct paths
- Lambda roles have appropriate access
- Secrets encrypted with KMS

**Estimate:** 2 points

---

#### TT-009: DynamoDB Table Setup
**Description:** Create DynamoDB table with all indexes and configurations.

**Tasks:**
- Create table with PK/SK structure via CDK
- Configure GSI1 with proper projections
- Enable TTL on the table
- Enable point-in-time recovery
- Create DynamoDB Local mirror for development

**Acceptance Criteria:**
- Table created with on-demand capacity
- GSI1 queryable for cross-project access
- TTL configured and active

**Estimate:** 2 points

---

#### TT-010: Lambda Function Scaffold
**Description:** Create scaffold for all Lambda functions with shared code.

**Tasks:**
- Create Lambda handler boilerplate
- Configure esbuild bundling for Lambdas
- Set up shared layer for `@agentic-pm/core`
- Configure environment variables
- Create local invocation scripts

**Acceptance Criteria:**
- Each Lambda can be deployed independently
- Shared code bundled correctly
- Local testing possible with SAM or similar

**Estimate:** 3 points

---

## 4. Sprint Planning Suggestion

### Sprint 0: Project Setup (Week -1 to 0)
**Focus:** Development environment and infrastructure scaffolding

| Story/Task | Points |
|------------|--------|
| TT-002: Monorepo Structure | 3 |
| TT-001: Local Development Environment | 3 |
| TT-003: Testing Infrastructure | 5 |
| TT-004: AWS CDK Bootstrap | 3 |
| **Total** | **14** |

**Goal:** Developers can run the project locally and deploy empty infrastructure to AWS.

---

### Sprint 1: Infrastructure Foundation (Weeks 1-2)
**Focus:** Core AWS infrastructure and CI/CD

| Story/Task | Points |
|------------|--------|
| US-001: CDK Project Initialisation | 2 |
| US-002: DynamoDB Single-Table Design | 3 |
| TT-009: DynamoDB Table Setup | 2 |
| US-003: IAM Role - Triage Lambda | 3 |
| US-004: IAM Role - Agent Lambda | 2 |
| US-005: Secrets Manager Configuration | 2 |
| TT-008: Secrets Management Setup | 2 |
| US-006: GitHub Actions CI/CD | 3 |
| TT-005: GitHub Actions Workflow | 3 |
| **Total** | **22** |

**Goal:** AWS infrastructure deployed with proper security boundaries. CI/CD pipeline working.

---

### Sprint 2: Authentication & Frontend Foundation (Weeks 3-4)
**Focus:** Next.js deployment and authentication

| Story/Task | Points |
|------------|--------|
| US-007: Amplify Auto-Deploy | 2 |
| TT-006: Amplify Configuration | 2 |
| US-008: NextAuth Credentials Provider | 3 |
| US-009: Authentication Guard | 2 |
| US-010: Session Management | 2 |
| TT-010: Lambda Function Scaffold | 3 |
| TT-007: CloudWatch Logging and Metrics | 2 |
| **Total** | **16** |

**Goal:** Frontend deployed with authentication working. Developers can log in.

---

### Sprint 3: Agent Orchestration (Weeks 5-6)
**Focus:** Step Functions and core Lambda functions

| Story/Task | Points |
|------------|--------|
| US-011: Step Functions State Machine | 5 |
| US-012: EventBridge 15-Minute Schedule | 2 |
| US-013: Heartbeat Lambda | 3 |
| US-014: Change Detection Lambda | 3 |
| US-015: Signal Normalise Lambda | 2 |
| US-016: Lambda Outside VPC | 1 |
| US-026: Event Entity Implementation | 2 |
| **Total** | **18** |

**Goal:** Agent runs on schedule, logs heartbeats, can detect changes (with mock data).

---

### Sprint 4: LLM Integration (Weeks 7-8)
**Focus:** Claude API integration and budget controls

| Story/Task | Points |
|------------|--------|
| US-017: Claude API Client | 3 |
| US-018: Tool-Use Implementation | 3 |
| US-019: Haiku/Sonnet Model Routing | 2 |
| US-020: Cost Tracking | 3 |
| US-021: Budget Degradation Tier 1 | 2 |
| US-022: Budget Degradation Tier 2 | 2 |
| US-023: Budget Degradation Tier 3 | 2 |
| US-024: Budget Hard Ceiling | 2 |
| **Total** | **19** |

**Goal:** LLM calls working with full budget controls. Cost tracked per call.

---

### Sprint 5: Activity System & Notifications (Weeks 9-10)
**Focus:** Events, activity feed, and SES integration

| Story/Task | Points |
|------------|--------|
| US-027: Activity Feed Display | 3 |
| US-028: Activity Feed Filtering | 2 |
| US-029: Heartbeat Visual Distinction | 2 |
| US-030: Activity Feed Empty State | 1 |
| US-031: Agent Status Indicator | 2 |
| US-032: SES Integration | 3 |
| US-033: Health Alert Emails | 2 |
| US-034: Email Templates | 2 |
| **Total** | **17** |

**Goal:** Activity feed working, agent status visible, health alerts via email.

---

### Sprint 6: Jira Integration (Weeks 11-12)
**Focus:** Full Jira signal source implementation

| Story/Task | Points |
|------------|--------|
| US-035: Jira Signal Source | 5 |
| US-036: Jira Authentication | 2 |
| US-037: Jira Sprint Data | 3 |
| US-038: Jira Issue Changes | 3 |
| US-039: Change Detection Gate | 3 |
| US-040: Jira Checkpoint Persistence | 2 |
| US-041: Jira Health Check | 2 |
| **Total** | **20** |

**Goal:** Agent reads real Jira data. Change detection gate prevents unnecessary LLM calls.

---

### Sprint 7: Signal Processing (Weeks 13-14)
**Focus:** Two-pass triage and context assembly

| Story/Task | Points |
|------------|--------|
| US-042: Triage Sanitise Lambda | 5 |
| US-043: Triage Classify Lambda | 3 |
| US-044: Context Assembly Module | 3 |
| US-045: Triage IAM Isolation | 2 |
| US-025: Prompt Caching Structure | 2 |
| **Total** | **15** |

**Goal:** Full signal processing pipeline working with security isolation.

---

### Sprint 8: Artefact Management (Weeks 15-16)
**Focus:** Artefact generation and versioning

| Story/Task | Points |
|------------|--------|
| US-046: Artefact Entity Implementation | 2 |
| US-047: Delivery State Generation | 5 |
| US-048: RAID Log Generation | 5 |
| US-049: Backlog Summary Generation | 3 |
| US-050: Decision Log Initialisation | 1 |
| US-051: Artefact Version History | 2 |
| **Total** | **18** |

**Goal:** All four artefact types generated from Jira data with version history.

---

### Sprint 9: Dashboard & Digest (Weeks 17-18)
**Focus:** Mission Control and daily digest

| Story/Task | Points |
|------------|--------|
| US-052: Mission Control Dashboard | 5 |
| US-053: Project Health Cards | 3 |
| US-054: 24-Hour Stats Display | 2 |
| US-055: Daily Digest Email | 3 |
| US-056: TanStack Query Polling | 3 |
| **Total** | **16** |

**Goal:** Dashboard shows project health. Daily digest emails sent.

---

### Sprint 10: Escalations & Monitoring (Weeks 19-20)
**Focus:** Escalation workflow and health monitoring

| Story/Task | Points |
|------------|--------|
| US-057: Escalation Creation | 3 |
| US-058: Escalation Count Badge | 2 |
| US-059: Decision Interface | 5 |
| US-060: Escalation Decision Recording | 3 |
| US-061: Integration Health Checks | 2 |
| US-062: CloudWatch Alarm - Missed Heartbeat | 2 |
| US-063: CloudWatch Alarm - Execution Failures | 2 |
| **Total** | **19** |

**Goal:** Complete escalation workflow. Health monitoring with alerts.

---

### Sprint 11: Autonomy System (Weeks 21-22)
**Focus:** Autonomy levels and dry-run mode

| Story/Task | Points |
|------------|--------|
| US-064: Dry-Run Mode Toggle | 3 |
| US-065: Decision Boundary Enforcement | 3 |
| US-066: Autonomy Level 1 (Monitoring) | 2 |
| US-067: Autonomy Level 2 (Artefact) | 2 |
| US-068: Autonomy Dial UI | 2 |
| US-069: Autonomy Change Acknowledgement | 1 |
| **Total** | **13** |

**Goal:** Full autonomy system working. Agent can graduate from Level 1 to Level 2.

**Phase 1 + Phase 2 Complete**

---

### Phase 3 Sprints (Future Planning)

**Sprint 12-13:** EP-013 Outlook Integration (US-070 to US-073)
**Sprint 14-15:** EP-014 Hold Queue & Communications (US-074 to US-079)
**Sprint 16:** EP-015 Reasoning & Transparency (US-080 to US-082)
**Sprint 17:** EP-016 Trust & Compliance (US-083 to US-086)
**Sprint 18-19:** EP-017 Advanced UI Views (US-087 to US-090)

---

## 5. Definition of Done

### For All Stories

A user story is considered DONE when all of the following criteria are met:

#### Code Quality
- [ ] Code written in TypeScript strict mode
- [ ] All linting rules pass (`pnpm lint`)
- [ ] Code follows project conventions (British English, no emojis in code)
- [ ] Functions have appropriate JSDoc comments
- [ ] No `any` types (except where explicitly justified)

#### Testing
- [ ] Unit tests written and passing for all new logic
- [ ] Integration tests written for database and API interactions
- [ ] Test coverage maintained above 80% for new code
- [ ] Edge cases and error conditions tested

#### Functionality
- [ ] Acceptance criteria verified and passing
- [ ] Feature works in local development environment
- [ ] Feature works in deployed environment
- [ ] Error handling implemented with appropriate logging
- [ ] CloudWatch logs emit useful debugging information

#### Security
- [ ] No credentials in code or environment variables
- [ ] IAM permissions follow least-privilege principle
- [ ] Input validation implemented where applicable
- [ ] No new security vulnerabilities introduced

#### Documentation
- [ ] Code is self-documenting with clear naming
- [ ] Complex logic has explanatory comments
- [ ] API changes documented (if applicable)
- [ ] README updated (if developer workflow changed)

#### Review
- [ ] Code reviewed by at least one other developer (if team)
- [ ] Review comments addressed
- [ ] PR description explains the change

#### Deployment
- [ ] Changes deployed to development/staging environment
- [ ] Smoke tests pass in deployed environment
- [ ] No regression in existing functionality
- [ ] Monitoring/alerting updated (if applicable)

### Additional Criteria by Epic Type

#### Infrastructure Stories (EP-001)
- [ ] CDK synthesises without errors
- [ ] CDK diff shows expected changes
- [ ] Deployed resources match expected configuration
- [ ] Cost estimate reviewed and within budget

#### Frontend Stories (EP-002, EP-005, EP-010, EP-017)
- [ ] Accessible via keyboard navigation
- [ ] WCAG 2.1 AA contrast ratios met
- [ ] Responsive layout (desktop priority)
- [ ] Loading states implemented
- [ ] Empty states designed
- [ ] Error states handled gracefully

#### LLM Stories (EP-004, EP-008)
- [ ] Tool schemas match artefact schemas
- [ ] Cost per call logged
- [ ] Graceful degradation if LLM fails
- [ ] Response validation implemented

#### Integration Stories (EP-007, EP-013)
- [ ] Health check endpoint verified
- [ ] Checkpoint persistence working
- [ ] Rate limits respected
- [ ] Retry logic implemented

#### Agent Stories (EP-003, EP-011, EP-012)
- [ ] Step Functions execution succeeds
- [ ] Events logged appropriately
- [ ] Dry-run mode respects boundaries
- [ ] Decision boundaries enforced

---

## Appendix: Story Point Reference

| Points | Description | Example |
|--------|-------------|---------|
| 1 | Trivial change, < 2 hours | Update a constant, add a log statement |
| 2 | Small, well-understood work, 2-4 hours | Add a simple API endpoint, create basic UI component |
| 3 | Medium complexity, 1 day | Implement authentication, create Lambda with logic |
| 5 | Significant complexity, 2-3 days | Build complete feature, integrate external API |
| 8 | High complexity, ~1 week | Major architectural component, complex integration |
| 13 | Very high complexity, research needed | Spike required before estimation |

**Velocity Assumption:** 15-20 points per sprint for solo developer, 30-40 for pair.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Epics (Total) | 17 |
| Epics (Phase 1) | 6 |
| Epics (Phase 2) | 6 |
| Epics (Phase 3) | 5 |
| User Stories (Total) | 90 |
| User Stories (Phase 1 + 2) | 69 |
| User Stories (Phase 3) | 21 |
| Technical Tasks | 10 |
| Sprints (Phase 1 + 2) | 11 |
| Total Story Points (Phase 1 + 2) | ~207 |
