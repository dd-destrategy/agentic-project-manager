# Gap Analysis: SPEC.md Pre-Implementation Review

> **Document:** Solution Design Gap Analysis **Date:** February 2026 **Status:**
> Pre-code validation **Reviewer:** Technical Program Manager

---

## Executive Summary

The SPEC.md is comprehensive and implementation-ready for most areas. However,
this analysis identifies **47 gaps** across six categories that should be
addressed before or during Phase 1 development.

| Category        | Critical | High | Medium | Low | Total |
| --------------- | -------- | ---- | ------ | --- | ----- |
| Open Questions  | 0        | 2    | 3      | 1   | 6     |
| Assumptions     | 2        | 4    | 5      | 2   | 13    |
| Technical Risks | 1        | 5    | 4      | 2   | 12    |
| Missing Details | 0        | 3    | 6      | 2   | 11    |
| Dependencies    | 2        | 2    | 1      | 0   | 5     |
| Spike Status    | 0        | 0    | 0      | 0   | 0     |

**Blocking Items:** 4 critical issues must be resolved before Phase 1 begins.

---

## 1. Open Questions

Items explicitly requiring decisions or marked as pending in the specification.

### High Severity

- [ ] **OQ-01: Jira Auth Method Selection** [High]
  - **Location:** SPEC.md Section 7.1
  - **Issue:** Spec states "API token (Basic auth) or OAuth 2.0 (3LO) — start
    with API token for simplicity" but does not definitively lock the decision
  - **Impact:** OAuth 2.0 (3LO) requires different token refresh logic, user
    consent flow, and Atlassian app registration
  - **Resolution:** Confirm API token approach is acceptable for user's Jira
    Cloud instance; document OAuth as Phase 2 upgrade path if needed

- [ ] **OQ-02: Bedrock vs Direct Claude API** [High]
  - **Location:** SPEC.md Section 2 (Locked Decisions) vs aws-migration-analysis
    docs
  - **Issue:** SPEC.md explicitly excludes Amazon Bedrock, but
    aws-migration-analysis documents assume Bedrock. The SPEC.md decision is
    correct per the rationale, but should be validated with a spike
  - **Impact:** Code structure, IAM policies, and error handling differ between
    direct API and Bedrock
  - **Resolution:** S2 spike should explicitly test direct Claude API (not
    Bedrock) to validate cost model

### Medium Severity

- [ ] **OQ-03: Amplify SSR Implementation Pattern** [Medium]
  - **Location:** SPEC.md Section 3 (Architecture)
  - **Issue:** Spec mentions "Server Actions" but Next.js App Router also
    supports Route Handlers. No explicit choice documented
  - **Impact:** Affects how user decisions, approvals, and config changes flow
    from frontend to backend
  - **Resolution:** Document decision: use API Routes (not Server Actions) for
    mutation operations to keep clear separation from DynamoDB; Server
    Components for read operations

- [ ] **OQ-04: DynamoDB Point-in-Time Recovery** [Medium]
  - **Location:** SPEC.md Section 4.3 mentions PITR in cost table but no
    explicit enablement decision
  - **Issue:** Cost estimate includes $0.02/month for PITR but spec does not
    confirm it should be enabled
  - **Impact:** Without PITR, no backup/restore capability for operational
    errors
  - **Resolution:** Explicitly enable PITR in CDK stack; document in locked
    decisions

- [ ] **OQ-05: CloudWatch Alarm Thresholds** [Medium]
  - **Location:** SPEC.md Section 11 (Risk Register) mentions alarms but no
    specific thresholds
  - **Issue:** Need concrete values for: missed heartbeat duration, budget alert
    percentage, error rate threshold
  - **Impact:** Monitoring will be incomplete or misconfigured without specific
    values
  - **Resolution:** Define during Phase 1 (F11): heartbeat missed > 30 min,
    budget > 80% of daily ceiling, error rate > 5%

### Low Severity

- [ ] **OQ-06: Local Development Docker Compose Structure** [Low]
  - **Location:** SPEC.md Section 12 shows `docker-compose up` but no compose
    file specified
  - **Issue:** No docker-compose.yml defined in spec
  - **Impact:** Minor; developers will need to create this during Phase 1
  - **Resolution:** Create during F1; include DynamoDB Local, LocalStack,
    optional mock SMTP

---

## 2. Assumptions

Implicit assumptions that have not been explicitly validated.

### Critical Severity

- [ ] **AS-01: Azure AD Admin Consent Obtainable** [Critical]
  - **Location:** SPEC.md Section 7.2, Phase 0 Item 1
  - **Issue:** Outlook integration requires Azure AD application permissions
    (Mail.Read, Mail.Send) with admin consent. This is listed as "Pending (user
    action)" but has no fallback timeline
  - **Impact:** If admin consent cannot be obtained, Outlook integration is
    blocked indefinitely. S3 spike depends on this
  - **Validated:** No
  - **Resolution:** User must attempt admin consent before S3 spike. If denied,
    document and proceed with Jira-only MVP per spec fallback

- [ ] **AS-02: Claude Tool-Use Reliability at Scale** [Critical]
  - **Location:** SPEC.md Sections 4.2, 6.4
  - **Issue:** Spec assumes Claude will reliably generate valid JSON matching
    artefact schemas via tool-use. No fallback for persistent schema violations
    beyond retry + previous version
  - **Impact:** If tool-use produces invalid/unusable output >5% of calls,
    artefact quality degrades
  - **Validated:** No (pending S1 spike)
  - **Resolution:** S1 spike must measure schema validation pass rate. Establish
    kill threshold: <95% valid outputs = revisit approach

### High Severity

- [ ] **AS-03: DynamoDB Single-Table Design Fits All Access Patterns** [High]
  - **Location:** SPEC.md Section 4.1
  - **Issue:** GSI1 design assumes all cross-project queries fit the defined
    patterns. No analysis of query latency or hot partition risk
  - **Impact:** Discovery of new access patterns post-implementation may require
    GSI changes (can be added but disruptive)
  - **Validated:** No (pending S4 spike)
  - **Resolution:** S4 spike must test ALL access patterns from Section 4.1 plus
    frontend dashboard queries

- [ ] **AS-04: 15-Minute Polling Sufficient for PM Workflows** [High]
  - **Location:** SPEC.md Sections 2, 5.1
  - **Issue:** Assumes 15-minute granularity is acceptable. No user validation
    that near-real-time (sub-5-min) is not needed
  - **Impact:** If user expects faster response, architecture may need webhook
    support (currently deferred)
  - **Validated:** No
  - **Resolution:** User should confirm 15-min latency is acceptable during
    Phase 0 baseline tracking

- [ ] **AS-05: LLM Budget Model Accuracy** [High]
  - **Location:** SPEC.md Section 6.2
  - **Issue:** Cost model assumes specific token counts per operation. No
    measurement with real prompts yet
  - **Impact:** If actual token usage exceeds estimates by >50%, monthly budget
    blown
  - **Validated:** No (pending S2 spike)
  - **Resolution:** S2 spike critical; must include actual prompt sizes with
    real Jira data

- [ ] **AS-06: Step Functions Standard Workflow Cost Estimate** [High]
  - **Location:** SPEC.md Section 3, aws-migration-analysis
  - **Issue:** Estimates ~2,900 executions/month but does not account for state
    transitions per execution. At 15 transitions/execution, that's 43,500
    transitions/month vs 4,000 free tier
  - **Impact:** Actual Step Functions cost may be ~$1/month higher than spec
    estimates
  - **Validated:** Partially (cost analysis doc shows ~$0.98/month which aligns)
  - **Resolution:** Accept as known variance; monitor actual costs in first
    month

### Medium Severity

- [ ] **AS-07: Graph API Delta Tokens Do Not Expire Unexpectedly** [Medium]
  - **Location:** SPEC.md Section 7.2
  - **Issue:** Delta tokens can become invalid if >30 days pass between syncs.
    Spec does not address token expiry handling
  - **Impact:** After extended downtime, agent would fail to sync Outlook;
    requires full re-sync logic
  - **Resolution:** Add checkpoint validation logic; if delta token fails, fall
    back to timestamp-based sync for that cycle, then resume delta

- [ ] **AS-08: Jira API Rate Limits Sufficient** [Medium]
  - **Location:** SPEC.md Section 11 (Risk Register, item 11)
  - **Issue:** Assumes 100 requests/minute is sufficient. No calculation of
    actual requests per cycle
  - **Impact:** If agent cycle uses >100 requests, rate limiting causes failures
  - **Resolution:** Calculate worst-case requests per cycle during S1 (estimate:
    10-20 requests/cycle, well under limit)

- [ ] **AS-09: Lambda Memory Allocations Correct** [Medium]
  - **Location:** SPEC.md Section 5.2
  - **Issue:** Memory allocations (128MB-512MB) are estimates. No profiling data
  - **Impact:** Undersized Lambda = OOM failures; oversized = unnecessary cost
  - **Validated:** No (pending S5 spike)
  - **Resolution:** S5 spike should measure actual memory usage; adjust in Phase
    1

- [ ] **AS-10: SES Production Access Granted** [Medium]
  - **Location:** SPEC.md Section 7.3
  - **Issue:** SES sandbox exit requires AWS approval. Typically granted but not
    guaranteed
  - **Impact:** Without production access, limited to verified email addresses
    only
  - **Resolution:** Request production access in Phase 0; if denied, document
    workaround (verify user's email address)

- [ ] **AS-11: Prompt Caching Savings Achievable** [Medium]
  - **Location:** SPEC.md Section 6.2
  - **Issue:** Assumes 28% cost reduction via prompt caching. Requires specific
    prompt structure and cache-friendly patterns
  - **Impact:** If caching ineffective, LLM costs ~40% higher than projected
  - **Resolution:** Design prompts cache-first during C4 (context assembly
    module); measure cache hit rate

### Low Severity

- [ ] **AS-12: shadcn/ui Component Coverage** [Low]
  - **Location:** SPEC.md Section 8.2
  - **Issue:** Assumes shadcn/ui provides all needed components. May need custom
    components for Activity Feed timeline, Autonomy dial
  - **Impact:** Minor additional development time
  - **Resolution:** Accept; custom components are straightforward

- [ ] **AS-13: Australian Working Hours Sufficient** [Low]
  - **Location:** SPEC.md Section 4.1 (Agent Config)
  - **Issue:** Working hours default to Australia/Sydney 08:00-18:00. No weekend
    handling specified
  - **Impact:** Agent may send notifications on weekends
  - **Resolution:** Add `working_days` config during Phase 1; default to
    Monday-Friday

---

## 3. Technical Risks

Areas where implementation complexity may exceed specification detail.

### Critical Severity

- [ ] **TR-01: Two-Stage Triage IAM Isolation** [Critical]
  - **Location:** SPEC.md Sections 5.1, 9.1-9.3
  - **Issue:** Security model depends on Triage Lambda having NO access to
    integration credentials. This requires:
    1. Separate IAM roles per Lambda
    2. Explicit deny policies on Secrets Manager resources
    3. Validation that Step Functions cannot leak credentials between steps
  - **Impact:** If misconfigured, prompt injection defence is bypassed.
    Security-critical
  - **Resolution:** Create explicit IAM policy documents during F1. Add
    penetration test to Phase 3 (E10) as specified. Consider adding automated
    IAM policy validation test

### High Severity

- [ ] **TR-02: Amplify + DynamoDB Direct Access Pattern** [High]
  - **Location:** SPEC.md Section 3 (Architecture), Section 3 (Database access
    strategy)
  - **Issue:** Amplify (frontend) accessing DynamoDB directly via AWS SDK v3
    requires:
    1. Amplify IAM role with DynamoDB permissions
    2. Credential handling in browser vs server context
    3. Understanding of which operations are SSR (server) vs client
  - **Impact:** Could expose DynamoDB access patterns to client if
    misconfigured; could cause CORS/credential issues
  - **Resolution:** Spike needed: Validate Amplify SSR + DynamoDB access pattern
    before Phase 1. Document clearly whether frontend uses SSR-only DB access or
    exposes IAM role to client

- [ ] **TR-03: Step Functions State Payload Size Limits** [High]
  - **Location:** SPEC.md Section 5.1
  - **Issue:** Step Functions has 256KB payload limit between states. Large
    signal batches or artefact content could exceed this
  - **Impact:** Large Jira sprints with many issues could cause state machine
    failures
  - **Resolution:** Design signal batching to stay under 200KB. Consider using
    DynamoDB for intermediate state if needed. Add payload size monitoring

- [ ] **TR-04: TanStack Query + Server Components Hydration** [High]
  - **Location:** SPEC.md Section 8.2
  - **Issue:** Mixing Server Components (initial render) with TanStack Query
    (client polling) requires careful hydration to avoid flicker and duplicate
    requests
  - **Impact:** Poor UX if initial SSR data doesn't hydrate correctly into
    TanStack Query cache
  - **Resolution:** Follow TanStack Query v5 SSR patterns. Use
    `HydrationBoundary` and `dehydrate()`. Test thoroughly during F8

- [ ] **TR-05: Claude Tool-Use Error Recovery** [High]
  - **Location:** SPEC.md Sections 5.2, 6.4
  - **Issue:** Spec mentions "Retry once on failure" but does not specify:
    1. What constitutes a retryable vs non-retryable error
    2. How to handle partial tool-use responses
    3. Timeout handling for slow Claude responses
  - **Impact:** Unclear error handling leads to inconsistent agent behaviour
  - **Resolution:** Document error classification during C3/C4:
    - Retryable: timeout, rate limit, malformed JSON
    - Non-retryable: schema violation after retry, API key invalid
    - Partial: treat as failure, log for analysis

- [ ] **TR-06: Hold Queue Timing Precision** [High]
  - **Location:** SPEC.md Section 5.1
  - **Issue:** 1-minute EventBridge schedule for hold queue means actions could
    release up to 1 minute late. For 5-minute holds, this is 20% variance
  - **Impact:** Timing expectations may not match user mental model
  - **Resolution:** Accept as known limitation. Document that hold times are
    "minimum X minutes" not exact. Consider 30-second schedule if precision
    needed (doubles Lambda invocations)

### Medium Severity

- [ ] **TR-07: Artefact Concurrent Update Race Condition** [Medium]
  - **Location:** SPEC.md Section 3 (Key architectural rules)
  - **Issue:** Both agent (Step Functions) and user (Amplify API routes) can
    update artefacts. Spec mentions "conditional writes prevent race conditions"
    but no detail on conflict resolution
  - **Impact:** User edits could be lost if agent updates at same time
  - **Resolution:** Implement optimistic locking with version number. Return
    conflict error to frontend; let user resolve. Add `version` check to all
    UpdateItem operations

- [ ] **TR-08: Signal Normalisation Edge Cases** [Medium]
  - **Location:** SPEC.md Section 5.3
  - **Issue:** `NormalisedSignal` schema is defined but edge cases not
    specified:
    - What if Jira ticket has no project key?
    - What if email has no subject/body?
    - What if timestamps are in unexpected formats?
  - **Impact:** Edge cases cause normalisation failures
  - **Resolution:** Add defensive coding in signal sources. Log and skip
    malformed signals rather than failing cycle

- [ ] **TR-09: Large Artefact Content Storage** [Medium]
  - **Location:** SPEC.md Section 4.2
  - **Issue:** RAID log and Decision log can grow indefinitely. DynamoDB item
    limit is 400KB. Large artefacts could hit this limit
  - **Impact:** Agent cannot update artefacts if they exceed 400KB
  - **Resolution:** Add artefact size monitoring. For RAID log, archive resolved
    items after 90 days to separate partition. Design for eventual pagination if
    needed

- [ ] **TR-10: Secrets Manager Cold Start Caching** [Medium]
  - **Location:** SPEC.md Section 9.2
  - **Issue:** Spec mentions "Lambda retrieves secrets at cold start, caches in
    memory for warm invocations." No detail on cache invalidation for rotated
    secrets
  - **Impact:** After secret rotation, warm Lambdas use stale credentials until
    cold start
  - **Resolution:** Use AWS Secrets Manager Lambda Extension with configurable
    TTL (5-10 minutes). Accept brief window of stale credentials as acceptable

### Low Severity

- [ ] **TR-11: EventBridge Scheduler Drift** [Low]
  - **Location:** SPEC.md Section 5.1
  - **Issue:** EventBridge cron expressions can drift slightly. Not guaranteed
    exact 15-minute intervals
  - **Impact:** Negligible for this use case
  - **Resolution:** Accept; no action needed

- [ ] **TR-12: ULID Generation Consistency** [Low]
  - **Location:** SPEC.md Section 4.1
  - **Issue:** ULIDs mentioned for Events and Actions but no library specified.
    Multiple ULID libraries exist with slight differences
  - **Impact:** Minor; any ULID library works
  - **Resolution:** Use `ulid` package from npm. Document in coding standards

---

## 4. Missing Details

Sections requiring additional specificity before development.

### High Severity

- [ ] **MD-01: Error Handling Strategy** [High]
  - **Location:** Throughout SPEC.md
  - **Issue:** No unified error handling strategy documented:
    - What happens when Claude API is down?
    - What happens when Jira/Graph APIs return 5xx?
    - How are partial failures in Step Functions handled?
    - What is logged vs alerted?
  - **Resolution:** Create error handling design document before Phase 1.
    Define:
    - Error categories (transient, permanent, partial)
    - Retry policies per category
    - Escalation to user (SES alert) thresholds
    - Circuit breaker patterns for external APIs

- [ ] **MD-02: Daily Digest Email Format** [High]
  - **Location:** SPEC.md Section 7.3, Phase 2 Task C12
  - **Issue:** Daily digest mentioned but no content specification:
    - What sections does it include?
    - What time is it sent?
    - What triggers it (time-based or event-based)?
  - **Resolution:** Design digest template during C12:
    - Sections: Project health summary, actions taken (24h), pending
      escalations, budget status
    - Trigger: 08:00 user's timezone (from working_hours config)
    - Template: Plain text with HTML fallback

- [ ] **MD-03: Escalation Expiry/Cleanup** [High]
  - **Location:** SPEC.md Section 4.1 (Escalation entity)
  - **Issue:** Escalations have `status: expired | superseded` but no mechanism
    to transition to these states
  - **Impact:** Pending escalations accumulate indefinitely
  - **Resolution:** Add to housekeeping Lambda:
    - Expire escalations pending >7 days (configurable)
    - Supersede escalations when underlying signal becomes stale
    - Send SES notification on expiry

### Medium Severity

- [ ] **MD-04: Deployment Pipeline Details** [Medium]
  - **Location:** SPEC.md Section 10 (Phase 1, F11)
  - **Issue:** "CI/CD: Amplify auto-deploy for frontend, GitHub Actions for
    Lambda deployment via CDK" — no detail on:
    - Environment management (dev/staging/prod?)
    - Deployment approval gates
    - Rollback procedures
  - **Resolution:** Document during F11:
    - Single environment (personal tool)
    - No approval gates (single user)
    - CDK rollback via CloudFormation stack rollback

- [ ] **MD-05: Content Sanitisation Specifics** [Medium]
  - **Location:** SPEC.md Section 5.1, 9.1
  - **Issue:** "Strip/neutralise untrusted content" — no specification of what
    exactly is stripped:
    - HTML tags? Markdown? URLs?
    - How are code blocks handled?
    - What about Unicode edge cases?
  - **Resolution:** Design sanitisation rules during C3:
    - Strip HTML tags (allow markdown)
    - URL extraction and classification (internal vs external)
    - Escape potential prompt injection markers (`<`, `>`, `/system`,
      `IMPORTANT:`)

- [ ] **MD-06: Precedent Match Algorithm** [Medium]
  - **Location:** SPEC.md Section 5.5
  - **Issue:** Confidence scoring includes "Precedent match" — "Query
    agent_actions for similar past actions" — but no similarity definition
  - **Impact:** Inconsistent confidence scoring
  - **Resolution:** Define during E4:
    - Match by: actionType + projectId + similar signal types
    - Lookback: 30 days
    - Threshold: >=3 successful precedents = pass

- [ ] **MD-07: Frontend Authentication Session Details** [Medium]
  - **Location:** SPEC.md Section 9.6
  - **Issue:** NextAuth.js session management mentioned but no detail on:
    - Session duration
    - Refresh strategy
    - Remember-me functionality
  - **Resolution:** Define during F3:
    - Session: 7 days
    - Refresh: sliding window (reset on activity)
    - No remember-me (single user, personal device)

- [ ] **MD-08: Artefact Bootstrap Initial Content** [Medium]
  - **Location:** SPEC.md Phase 2 Task C5
  - **Issue:** "Generate initial delivery state, RAID log, backlog summary,
    decision log from Jira data" — no specification of initial content when data
    is sparse
  - **Impact:** Empty or minimal artefacts may confuse user
  - **Resolution:** Design bootstrap prompts during C5:
    - If <5 tickets: generate placeholder artefact with "Insufficient data"
      message
    - If no sprint: skip sprint-related sections
    - Always generate with explanatory notes for first-time use

- [ ] **MD-09: Activity Feed Pagination** [Medium]
  - **Location:** SPEC.md Section 8.1
  - **Issue:** "Scrolling feed of agent events" — no pagination strategy for
    potentially large event sets
  - **Impact:** Performance issues with 30 days of events (~2000+ items)
  - **Resolution:** Implement during F8:
    - Initial load: 50 most recent
    - Infinite scroll: load 50 more on scroll
    - DynamoDB Query with `Limit` and `LastEvaluatedKey`

### Low Severity

- [ ] **MD-10: Working Hours Timezone Handling** [Low]
  - **Location:** SPEC.md Section 4.1
  - **Issue:** Working hours stored as "Australia/Sydney" — how does agent
    handle DST transitions?
  - **Impact:** Notifications could arrive at unexpected times during DST change
  - **Resolution:** Use proper timezone library (date-fns-tz or luxon). DST
    handling is automatic

- [ ] **MD-11: Agent Acknowledgement Messages** [Low]
  - **Location:** SPEC.md Section 8.3
  - **Issue:** "The agent acknowledges changes: 'Understood. I'll hold all
    actions for your review.'" — no full message catalog
  - **Impact:** Inconsistent agent voice
  - **Resolution:** Create message template file during Phase 2. Low priority;
    can iterate

---

## 5. Dependencies

External dependencies that could block progress.

### Critical Severity

- [ ] **DP-01: Azure AD Admin Consent** [Critical]
  - **Owner:** User (requires workplace IT approval)
  - **Blocks:** S3 spike, Phase 3 Outlook integration (E1, E2)
  - **Fallback:** Jira-only MVP per SPEC.md Section 7.2
  - **Timeline:** Must attempt before S3 spike
  - **Status:** Pending (user action)

- [ ] **DP-02: AWS Account Setup** [Critical]
  - **Owner:** User
  - **Blocks:** All implementation phases
  - **Requirements:**
    - AWS account with billing
    - IAM user with admin access (not root)
    - MFA enabled
  - **Timeline:** Must complete before Phase 1
  - **Status:** Pending (user action)

### High Severity

- [ ] **DP-03: Jira Cloud API Access** [High]
  - **Owner:** User
  - **Blocks:** S1 spike, Phase 2 Jira integration (C1)
  - **Requirements:**
    - Jira Cloud instance (not Server/Data Center)
    - API token generated
    - User email with API token access
  - **Timeline:** Must complete before S1 spike
  - **Status:** Pending (user action)

- [ ] **DP-04: Claude API Key** [High]
  - **Owner:** User
  - **Blocks:** S1, S2 spikes, all LLM-dependent features
  - **Requirements:**
    - Anthropic account
    - API key with Haiku 4.5 and Sonnet 4.5 access
    - Billing set up
  - **Timeline:** Must complete before S1 spike
  - **Status:** Pending (user action)

### Medium Severity

- [ ] **DP-05: SES Domain Verification** [Medium]
  - **Owner:** User + AWS
  - **Blocks:** Phase 1 SES integration (F9), daily digest
  - **Requirements:**
    - Domain with DNS access
    - DKIM records configured
    - Production access approved
  - **Timeline:** Start during Phase 0, complete by F9
  - **Status:** Pending (user action)

---

## 6. Spike Status

All five spikes are defined in SPEC.md Appendix B. Current status and readiness
assessment.

### S1: Artefact Generation Quality

| Attribute          | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Status**         | Pending                                                  |
| **Dependencies**   | Jira Cloud access (DP-03), Claude API key (DP-04)        |
| **Effort**         | 1-2 days                                                 |
| **Pass Criteria**  | 100% schema-valid outputs, subjective quality acceptable |
| **Readiness**      | Ready to execute once dependencies met                   |
| **Gap Identified** | None — well-defined spike                                |

### S2: Token Usage Measurement

| Attribute          | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| **Status**         | Pending                                                  |
| **Dependencies**   | Claude API key (DP-04), representative prompts (from S1) |
| **Effort**         | 1 day                                                    |
| **Pass Criteria**  | Estimated monthly cost <= $8 with change detection gate  |
| **Readiness**      | Should execute after S1 (needs realistic prompt data)    |
| **Gap Identified** | Should explicitly measure with prompt caching enabled    |

### S3: Microsoft Graph API Access

| Attribute          | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| **Status**         | Pending                                                                  |
| **Dependencies**   | Azure AD admin consent (DP-01)                                           |
| **Effort**         | 1-2 days                                                                 |
| **Pass Criteria**  | Successfully read email via delta query and send test email              |
| **Readiness**      | Blocked by DP-01                                                         |
| **Gap Identified** | Add secondary pass criteria: measure delta token behaviour over 48 hours |

### S4: DynamoDB Access Patterns

| Attribute          | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Status**         | Pending                                                              |
| **Dependencies**   | AWS account (DP-02)                                                  |
| **Effort**         | 1 day                                                                |
| **Pass Criteria**  | All access patterns work as designed, TTL deletes items correctly    |
| **Readiness**      | Ready to execute once AWS account available                          |
| **Gap Identified** | Add test for GSI1 hot partition scenario (many events in single day) |

### S5: Step Functions Cold Start

| Attribute          | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Status**         | Pending                                                        |
| **Dependencies**   | AWS account (DP-02), basic Lambda functions deployed           |
| **Effort**         | 1 day                                                          |
| **Pass Criteria**  | Total cycle time < 5 minutes, cold start overhead < 30 seconds |
| **Readiness**      | Should execute after S4 (needs DynamoDB for realistic test)    |
| **Gap Identified** | Add measurement of Lambda memory usage during spike            |

---

## 7. Recommended Actions

### Before Phase 0 Begins (User Actions)

1. **Attempt Azure AD admin consent** (DP-01) — determines S3 viability
2. **Set up AWS account with MFA** (DP-02) — unblocks all spikes
3. **Generate Jira API token** (DP-03) — unblocks S1
4. **Obtain Claude API key** (DP-04) — unblocks S1, S2
5. **Begin SES domain verification** (DP-05) — can proceed in parallel

### During Phase 0 (Spikes)

1. Execute S1 with explicit schema validation metrics (AS-02 resolution)
2. Execute S2 with prompt caching measurement (AS-05 resolution)
3. Execute S3 if DP-01 resolved; skip if blocked
4. Execute S4 with hot partition testing (AS-03 resolution)
5. Execute S5 with memory profiling (AS-09 resolution)

### Before Phase 1 Begins

1. Create error handling design document (MD-01)
2. Validate Amplify + DynamoDB pattern (TR-02, may need mini-spike)
3. Document IAM policy templates for two-stage triage (TR-01)
4. Confirm API token auth for Jira (OQ-01)

### During Phase 1

1. Add to F1: Docker-compose.yml for local development (OQ-06)
2. Add to F1: Explicit PITR enablement (OQ-04)
3. Add to F7: CloudWatch alarm thresholds (OQ-05)
4. Track payload sizes in Step Functions (TR-03)
5. Implement optimistic locking for artefacts (TR-07)

---

## 8. Summary: Blocking Items

These **4 items** must be resolved before Phase 1 can begin:

| ID    | Description                 | Owner     | Resolution                                         |
| ----- | --------------------------- | --------- | -------------------------------------------------- |
| DP-01 | Azure AD admin consent      | User      | Attempt consent; proceed with Jira-only if blocked |
| DP-02 | AWS account setup           | User      | Create account with IAM user and MFA               |
| AS-02 | Claude tool-use reliability | S1 spike  | Must achieve >=95% schema-valid outputs            |
| TR-01 | Two-stage triage IAM design | Tech lead | Document IAM policies before F1                    |

---

## Document History

| Date       | Version | Author | Changes              |
| ---------- | ------- | ------ | -------------------- |
| 2026-02-05 | 1.0     | TPM    | Initial gap analysis |
