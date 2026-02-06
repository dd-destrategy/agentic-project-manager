# Swarm Codebase Review — Comprehensive Report

**Project:** Agentic PM Workbench **Date:** 2026-02-06 **Branch:**
`claude/add-ingestion-interface-cgChI` **Review Method:** 11-team parallel swarm
(50+ specialist agents) **Codebase:** 193 source files, 32.6K LOC, 4 packages,
21 API endpoints, 12 Lambda handlers

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Health Dashboard](#2-health-dashboard)
3. [Cross-Team Critical Issues](#3-cross-team-critical-issues)
4. [Team Reports](#4-team-reports)
5. [Strategy Assessment](#5-strategy-assessment)
6. [Issue Register](#6-issue-register)
7. [Prioritised Roadmap](#7-prioritised-roadmap)
8. [Risk Register](#8-risk-register)
9. [Cost Analysis](#9-cost-analysis)
10. [Top 10 Strengths](#10-top-10-strengths)

---

## 1. Executive Summary

**Overall Health Score: 7.5 / 10**

The Agentic PM Workbench is an **architecturally sound project with unusually
strong foundations** for its stage of development. The core library is
well-structured, the DynamoDB design is solid, the security model (two-stage
triage with IAM boundary isolation) is sophisticated, and the budget degradation
ladder is a rare example of cost-awareness baked into the architecture from day
one.

The ingestion interface — identified as a **product differentiator** by the
Product Owner team — demonstrates the highest-quality implementation with
conversational AI, image paste/drag-drop, and structured item extraction.

However, the project sits at a critical inflection point between "excellent
prototype" and "production-ready product." **With 2-3 focused sprints, this
moves from prototype to daily driver.**

### Top 5 Strengths

| #   | Strength                         | Evidence                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Clean architecture               | Zero circular dependencies, proper package boundaries, 28 named export paths     |
| 2   | TypeScript strict 100%           | All packages enforce strict mode, Zod for runtime validation                     |
| 3   | Production-grade DynamoDB client | Exponential backoff with jitter, batch operations, transactional writes          |
| 4   | Budget-aware design              | 4-tier degradation ladder, daily/monthly cost tracking, automatic fallback       |
| 5   | Ingestion interface              | Conversational AI with vision, structured extraction, product-differentiating UX |

### Top 10 Issues

| #   | Issue                                                  | Severity    | Teams                 |
| --- | ------------------------------------------------------ | ----------- | --------------------- |
| 1   | Ingestion LLM calls bypass BudgetTracker               | P0 Critical | Strategy, Cost        |
| 2   | Unvalidated PATCH /api/projects/[id] — field injection | P0 Critical | Security, Backend     |
| 3   | N+1 query pattern in /api/projects (20+ DDB calls)     | P0 Critical | Architecture, Backend |
| 4   | Zero API route test coverage (15+ routes)              | P1 High     | Quality               |
| 5   | Secrets Manager called every invocation ($2/month)     | P1 High     | Infrastructure, Cost  |
| 6   | Missing Zod validation on 5 API endpoints              | P1 High     | Security              |
| 7   | Unbounded message array in IngestionSession            | P1 High     | Data                  |
| 8   | Artefacts displayed as raw JSON (UX blocker)           | P1 High     | Product Owner         |
| 9   | No page-level error boundaries                         | P2 Medium   | Frontend              |
| 10  | Missing ARIA labels and WCAG colour contrast           | P2 Medium   | UX                    |

---

## 2. Health Dashboard

| Team           | Score             | Rating                                      |
| -------------- | ----------------- | ------------------------------------------- |
| Architecture   | 4/5 stars         | Strong foundations, 6 issues to address     |
| Security       | 77/100            | Solid base, 3 critical validation gaps      |
| Quality        | B+ (80/100)       | Excellent unit tests, zero API/E2E coverage |
| Infrastructure | 7/10              | Well-designed, dev environment friction     |
| Frontend       | Production-ready  | Clean App Router, 5 improvement areas       |
| Backend        | Strong            | Consistent patterns, validation gaps        |
| Data           | Well-architected  | Sound single-table design, scaling risks    |
| UX             | Solid foundation  | Good hierarchy, accessibility gaps          |
| Content        | 7.5/10            | Professional tone, minor convention issues  |
| Product Owner  | 85% product-ready | Feature-complete, UX polish needed          |
| Strategy       | Viable            | Budget tight, clear path forward            |

---

## 3. Cross-Team Critical Issues

### P0 — Fix Immediately

| ID  | Issue                                                                                                                                                                                      | Raised By                       | Impact                                                                      | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- | ------ |
| C01 | **Ingestion LLM calls bypass BudgetTracker** — Anthropic client instantiated directly in `/api/ingest/[id]/messages/route.ts`, completely bypassing the 4-tier degradation ladder          | Strategy, Cost                  | Uncontrolled cost overrun; 5 ingestion sessions could blow daily LLM budget | 2h     |
| C02 | **Unvalidated PATCH /api/projects/[id]** — `request.json()` passed directly to `projectRepo.update(id, body)`; allows arbitrary field injection including PK/SK/GSI keys                   | Security, Backend               | Data corruption vector                                                      | 1h     |
| C03 | **DynamoDBClient instantiated per request** — Web API routes create `new DynamoDBClient()` on every request unlike Lambda handlers which use singleton pattern                             | Architecture, Backend           | Memory overhead, defeats connection pooling                                 | 1h     |
| C04 | **N+1 query pattern in /api/projects** — For each project, 2 additional queries fire (escalation count + latest event); dashboard load = 2 + (2 × N) DDB calls                             | Architecture, Backend           | Linear scaling; unusable above 5 projects                                   | 3h     |
| C05 | **Missing request validation on 5 endpoints** — POST /api/projects, POST /api/graduation, PATCH /api/projects/[id], POST /api/artefacts/[id], and ingest routes lack Zod schema validation | Security                        | Field injection, type coercion attacks                                      | 4h     |
| C06 | **Generic 500 error responses** — Every route returns `{ error: 'Failed to ...' }` with status 500; no error codes or client/server distinction                                            | Architecture, Backend, Frontend | Impossible to debug production issues                                       | 3h     |

### P1 — Fix Before Production

| ID  | Issue                                                       | Raised By                    | Impact                                           | Effort |
| --- | ----------------------------------------------------------- | ---------------------------- | ------------------------------------------------ | ------ |
| C07 | Zero API route test coverage (15+ routes)                   | Quality                      | No contract verification; refactoring blocked    | 2-3d   |
| C08 | No E2E tests                                                | Quality                      | Critical user flows never tested                 | 6h     |
| C09 | Secrets Manager called every Lambda invocation (~2,880/day) | Architecture, Infrastructure | $2/month + 100ms latency per call                | 3h     |
| C10 | Missing pagination cursors in API responses                 | Architecture, Backend        | Repos support cursors but API discards them      | 3h     |
| C11 | No circuit breaker on Jira/Outlook integrations             | Architecture, Infrastructure | Slow external APIs cascade into Lambda timeouts  | 4h     |
| C12 | Missing tool-use validation in ingest message route         | Backend                      | Silent data loss if Claude skips extraction tool | 1h     |
| C13 | Base64 images stored in DynamoDB                            | Data                         | 400KB item limit risk; inefficient               | 3d     |
| C14 | Unbounded message array in IngestionSession                 | Data                         | Could exceed DynamoDB item size limit            | 2h     |
| C15 | Client-side filtering in repositories                       | Architecture, Data           | Wastes read capacity; breaks hasMore flag        | 4h     |
| C16 | Artefacts displayed as raw JSON                             | Product Owner                | Blocks real user adoption                        | 5-10d  |
| C17 | LocalStack/DynamoDB port mismatch                           | Infrastructure               | Developer friction                               | 30min  |
| C18 | Amplify pnpm version mismatch (v8 vs v9)                    | Infrastructure               | Build may fail on deploy                         | 15min  |
| C19 | SES domain not verified                                     | Infrastructure               | Email features fail in production                | 30min  |

### P2 — Important Improvements

| ID  | Issue                                              | Raised By                    | Impact                                              | Effort |
| --- | -------------------------------------------------- | ---------------------------- | --------------------------------------------------- | ------ |
| C20 | No page-level error boundaries (error.tsx)         | Frontend                     | Broken component crashes entire page                | 2h     |
| C21 | No custom CloudWatch metrics                       | Architecture, Infrastructure | Cannot monitor cost/performance trends              | 4h     |
| C22 | Incomplete Lambda handler tests (8 of 10 untested) | Quality                      | Lambda-specific concerns unverified                 | 2-3d   |
| C23 | CDK infrastructure tests missing                   | Quality                      | IAM policies, table config unverified               | 2d     |
| C24 | Missing ARIA labels and WCAG colour contrast       | UX                           | Accessibility compliance gaps                       | 2-3d   |
| C25 | Mobile ingest layout overflow                      | UX, Frontend                 | 3-column layout breaks on phones                    | 4h     |
| C26 | Graduation evidence dashboard missing              | Product Owner                | Users hesitate to promote autonomy without evidence | 3-5d   |
| C27 | Dead-letter queue not consumed or monitored        | Infrastructure               | Failed executions silently queued                   | 2h     |
| C28 | No rate limiting on API endpoints                  | Security                     | Brute force risk on auth endpoint                   | 4h     |
| C29 | Large monolithic components (>500 LOC)             | Frontend                     | Hard to maintain and test                           | 2d     |
| C30 | Em-dash convention violations                      | Content                      | Minor inconsistency                                 | 15min  |

---

## 4. Team Reports

### 4.1 Architecture Team (4/5 Stars)

**Assessment:** Clean package boundaries, zero circular dependencies, robust
DynamoDB client with retry logic. The monorepo structure with 28 named export
paths from `@agentic-pm/core` is well-designed.

**Critical findings:**

- DynamoDB singleton missing in web routes (Lambda handlers do it correctly)
- N+1 queries on project dashboard
- Missing validation middleware pattern
- Secrets Manager not cached
- Generic error handling everywhere
- Client-side filtering wastes read capacity

**Recommendation:** Establish middleware patterns for validation and error
handling; implement singleton DDB client factory; add BatchGetItem for
project-related queries.

### 4.2 Security Team (77/100)

**Assessment:** Strong security foundations — all routes auth-protected,
DynamoDB injection-safe (parameterised expressions), timing-safe password
comparison, separate IAM roles with least privilege.

**Critical findings:**

- 5 API endpoints lack Zod validation (stated project requirement)
- PATCH /api/projects/[id] allows arbitrary field injection
- No rate limiting on auth endpoint

**Recommendation:** Add Zod validation middleware to all mutation endpoints;
implement rate limiting; add CSP headers.

### 4.3 Quality Team (B+ / 80 out of 100)

**Assessment:** Excellent unit test quality in core package (15 test files,
strong coverage). TypeScript strict 100% across all packages. ESLint, Prettier,
Husky pre-commit hooks enforced.

**Critical findings:**

- Zero API route test coverage (15+ routes)
- No DynamoDB integration tests
- No E2E tests
- Incomplete Lambda handler tests (8/10 untested)
- Minimal component tests
- No CDK infrastructure tests

**Recommendation:** Prioritise API route testing (highest risk/reward ratio);
add msw for API mocking; set up Playwright for E2E; add CDK assertions.

### 4.4 Infrastructure Team (7/10)

**Assessment:** Excellent IAM security, comprehensive retry logic in DynamoDB
client, budget ceiling enforcement. CDK stacks well-structured with proper
dependency ordering.

**Critical findings:**

- LocalStack port mismatch between docker-compose and scripts
- X-Ray not configured despite CDK support
- SES domain not verified
- No cold start mitigation (SnapStart or provisioned concurrency)
- Dead-letter queue not consumed or monitored
- Amplify pnpm version mismatch

**Cost breakdown:** $7.85/month AWS + $7.00 Claude API = $14.85/month ($0.15
buffer).

### 4.5 Frontend Team

**Assessment:** Well-structured, production-ready Next.js 15 App Router
application. Clean routing, consistent TanStack Query patterns, responsive
design with mobile navigation.

**Critical findings:**

- Large monolithic components (artefact-viewer.tsx at 673 LOC, ingest page at
  500+ LOC)
- No page-level error boundaries (error.tsx files)
- Inconsistent polling intervals across hooks
- Missing Suspense/loading.tsx for server components
- Test gaps on critical UI flows

**Recommendation:** Split large components; add error.tsx boundaries; normalise
polling intervals; add loading.tsx for each route segment.

### 4.6 Backend Team

**Assessment:** Strong foundations with consistent repository pattern, robust
DynamoDB client, LLM tool-use enforcement, structured logging.

**Critical findings:**

- Missing tool-use validation in ingestion message route
- N+1 query pattern (shared with Architecture)
- Count methods limited to 100 items
- Missing project creation validation
- Generic 500 error responses

**Recommendation:** Add tool-use fallback extraction; batch project-related
queries; remove hardcoded count limits; validate all creation inputs.

### 4.7 Data Team

**Assessment:** Well-architected single-table DynamoDB design with 12 key
prefixes, GSI1 for cross-project queries, TTL for auto-expiry, optimistic
locking for race conditions. Atomic operations throughout.

**Critical findings:**

- No ULID uniqueness enforcement
- Inefficient cross-project escalation queries
- No escalation audit trail
- Unbounded message array growth in ingestion sessions
- Base64 images stored in DynamoDB items

**Recommendation:** Add message array bounds (50 cap); move images to S3 with
presigned URLs; add escalation audit trail; implement server-side filtering.

### 4.8 UX Team

**Assessment:** Solid visual hierarchy, optimistic UI updates, responsive layout
with mobile navigation. Good use of loading states and empty states.

**Critical findings:**

- Missing ARIA labels on interactive elements
- Mobile 3-column layout overflow on ingest page
- Focus trap issues in modals/drawers
- Colour contrast WCAG 2.1 AA failures
- Missing live regions for dynamic content

**Recommendation:** Audit all interactive elements for ARIA labels; fix colour
contrast ratios; add aria-live regions; test with screen readers.

### 4.9 Content Team (7.5/10)

**Assessment:** Excellent British English consistency, professional tone,
well-structured empty states with clear calls to action.

**Critical findings:**

- Em-dash convention violations (inconsistent use of — vs --)
- Minor terminology inconsistencies

**Recommendation:** Quick find-and-replace for em-dash standardisation.

### 4.10 Product Owner Team (85% Product-Ready)

**Assessment:** 95% feature-complete for MVP scope. Ingestion interface
identified as "product differentiator." Escalation workflow is well-designed
with structured decision-making (options, pros/cons, agent rationale).

**Blocking gaps:**

- Artefacts shown as raw JSON (PMs cannot read JSON)
- Graduation evidence dashboard missing
- No global escalation summary across projects
- Decision log not user-friendly

**Recommendation:** Structured artefact UIs are the single biggest investment
for user adoption. The ArtefactViewer already has 670+ lines of type-specific
rendering — ensure content flows through it correctly.

---

## 5. Strategy Assessment

### Tech Strategy: Architecture Is Sustainable

The locked architecture decisions (Step Functions, DynamoDB, Lambda, Amplify)
are correct for the scale and will not require rearchitecting. No changes
recommended to the architecture itself.

**Key technical debt that compounds:**

1. Zero API route tests (every new feature adds untested surface area)
2. N+1 query pattern (performance degrades linearly with projects)
3. Unvalidated PATCH endpoint (data corruption accumulates silently)
4. Unbounded message arrays (item size limit is a time bomb)
5. Generic error responses (debugging becomes impossible at scale)

### Cost Strategy: Budget Achievable With Optimisations

| Optimisation                                   | Savings          | Effort |
| ---------------------------------------------- | ---------------- | ------ |
| Migrate Secrets Manager to SSM Parameter Store | $2.00/month      | 3h     |
| Cache remaining secrets calls                  | $0.40/month      | 2h     |
| Reduce CloudWatch to WARN in prod              | $0.50/month      | 30min  |
| Route ingestion LLM through BudgetTracker      | Prevents overrun | 2h     |

**Optimised total:** $11.25/month ($3.75 buffer vs current $0.15).

### Growth Strategy: Make It Work, Then Make It Right

**Critical insight:** A tool that works imperfectly every day is infinitely more
valuable than a perfectly tested tool that nobody uses because it doesn't
process real data yet.

**Three gaps to daily-use readiness:**

1. Agent cycle not operational (Jira polling → change detection → artefact
   generation pipeline not wired)
2. Artefacts have no real data (beautiful renderers await content)
3. Ingestion-to-artefact pipeline incomplete (extracted items sit in review
   queue with no path to artefacts)

---

## 6. Issue Register

Total issues identified: **30**

| Severity    | Count | Percentage |
| ----------- | ----- | ---------- |
| P0 Critical | 6     | 20%        |
| P1 High     | 13    | 43%        |
| P2 Medium   | 11    | 37%        |

| Category              | Count |
| --------------------- | ----- |
| Security / Validation | 7     |
| Performance / Query   | 4     |
| Testing               | 5     |
| Data / Storage        | 4     |
| UX / Accessibility    | 4     |
| Infrastructure / Ops  | 4     |
| Content               | 1     |
| Cost                  | 1     |

---

## 7. Prioritised Roadmap

### Immediate (48 Hours)

| Action                                          | Effort | Issue ID |
| ----------------------------------------------- | ------ | -------- |
| Route ingestion LLM calls through BudgetTracker | 2h     | C01      |
| Fix unvalidated PATCH /api/projects/[id]        | 1h     | C02      |
| Fix LocalStack port mismatch                    | 30min  | C17      |
| Fix Amplify pnpm version                        | 15min  | C18      |
| Fix em-dash conventions                         | 15min  | C30      |

### Sprint 1 (Weeks 1-2): Safety Net

| Action                                          | Effort | Issue IDs |
| ----------------------------------------------- | ------ | --------- |
| DynamoDBClient singleton factory for web routes | 1h     | C03       |
| Fix N+1 query in /api/projects                  | 3h     | C04       |
| Add Zod validation to 5 unvalidated endpoints   | 4h     | C05       |
| Add structured error typing to API responses    | 3h     | C06       |
| Cache Secrets Manager (or migrate to SSM)       | 3h     | C09       |
| Add tool-use validation in ingest message route | 1h     | C12       |
| Bound ingestion session message array (50 cap)  | 2h     | C14       |
| Add page-level error.tsx boundaries             | 2h     | C20       |

### Sprint 2 (Weeks 3-4): Reliability

| Action                                      | Effort | Issue IDs |
| ------------------------------------------- | ------ | --------- |
| Add API route tests for critical paths      | 2-3d   | C07       |
| Wire Jira polling through Step Functions    | 5d     | —         |
| Add circuit breaker for integrations        | 4h     | C11       |
| Add pagination cursors to API responses     | 3h     | C10       |
| Verify SES domain                           | 30min  | C19       |
| Connect extracted items to artefact updates | 3d     | —         |

### Sprint 3 (Weeks 5-8): Quality & Polish

| Action                                     | Effort | Issue IDs |
| ------------------------------------------ | ------ | --------- |
| Structured artefact UIs (replace raw JSON) | 5-10d  | C16       |
| Move base64 images to S3                   | 3d     | C13       |
| WCAG colour contrast and ARIA labels       | 2-3d   | C24       |
| Lambda handler tests (8 remaining)         | 2-3d   | C22       |
| E2E test skeleton                          | 6h     | C08       |
| Custom CloudWatch metrics                  | 4h     | C21       |
| Graduation evidence dashboard              | 3-5d   | C26       |

---

## 8. Risk Register

| #   | Risk                                                                                                  | Likelihood | Impact   | Mitigation                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------- |
| R1  | **Ingestion LLM calls blow through budget** — Anthropic client bypasses BudgetTracker entirely        | High       | High     | Route all LLM calls through BudgetTracker; add per-session cost cap                 |
| R2  | **Project stalls before daily-use threshold** — Quality work prioritised over functional completeness | Medium     | Critical | Focus Month 1 on Jira integration + ingestion-to-artefact pipeline                  |
| R3  | **DynamoDB 400KB item limit on ingestion sessions** — Unbounded message arrays grow indefinitely      | Medium     | High     | Cap at 50 messages; archive older messages to separate items                        |
| R4  | **Azure AD admin consent denied** — Outlook/Graph API integration blocked                             | High       | Medium   | Already mitigated: Jira-only MVP; ingestion interface as manual workaround          |
| R5  | **Budget buffer too thin ($0.15)** — Any operational variance causes overrun                          | High       | Medium   | Migrate to SSM Parameter Store ($2.00 savings); reduce CloudWatch log level ($0.50) |
| R6  | **Data corruption via unvalidated PATCH** — Arbitrary fields written to DynamoDB items                | Medium     | High     | Add Zod validation immediately (1 hour fix)                                         |
| R7  | **Integration cascade failure** — Jira/Outlook API slowness cascades into Lambda timeouts             | Medium     | Medium   | Implement circuit breaker pattern with fallback to cached data                      |

---

## 9. Cost Analysis

### Current Monthly Cost

| Service                             | Cost             |
| ----------------------------------- | ---------------- |
| DynamoDB (on-demand)                | $0.25            |
| Lambda (10 functions, ARM64)        | $2.50            |
| Step Functions                      | $0.50            |
| Secrets Manager (4 secrets)         | $2.00            |
| CloudWatch Logs                     | $1.50            |
| KMS                                 | $0.30            |
| SES                                 | $0.10            |
| Amplify                             | $0.50            |
| EventBridge                         | $0.15            |
| SQS (DLQ)                           | $0.05            |
| **AWS Total**                       | **$7.85**        |
| Claude API (Haiku 70% + Sonnet 30%) | $7.00            |
| **Grand Total**                     | **$14.85/month** |

### Optimised Monthly Cost

| Change                                        | Savings          |
| --------------------------------------------- | ---------------- |
| Migrate Secrets Manager → SSM Parameter Store | -$2.00           |
| Reduce CloudWatch to WARN in prod             | -$0.50           |
| Route ingestion through BudgetTracker         | Prevents overrun |
| **Optimised Total**                           | **$12.35/month** |
| **Budget Buffer**                             | **$2.65**        |

### Cost at Scale

| Scenario                     | Total   | Within Budget? |
| ---------------------------- | ------- | -------------- |
| 1 project, low activity      | $9.75   | Yes            |
| 2 projects, normal activity  | $14.85  | Barely         |
| 2 projects + daily ingestion | $18.50+ | No             |
| 3 projects (future)          | $19.50+ | No             |

---

## 10. Top 10 Strengths

1. **Clean Architecture** — Zero circular dependencies, proper package
   boundaries (core → web/lambdas/cdk), granular exports with 28 named paths
2. **Type Safety** — TypeScript strict 100%, Zod schemas for runtime validation,
   types derived from schemas
3. **DynamoDB Client Quality** — Exponential backoff with jitter, retryable
   error classification, batch operations, transactional writes
4. **Budget-Aware Design** — 4-tier degradation ladder ($0.23/day, $8/month),
   graceful fallback to heuristics, cost tracking integrated into LLM client
5. **Security Foundations** — All routes auth-protected, timing-safe password
   comparison, DynamoDB injection-safe, separate IAM roles with least privilege
6. **Ingestion Interface** — "Product differentiator"; conversational AI with
   vision, structured extraction, extracted items review
7. **Escalation Workflow** — Structured decision-making (options with pros/cons,
   agent rationale, triggering signals)
8. **Documentation** — 1.9MB across 55 markdown files, SPEC.md as source of
   truth, comprehensive sprint breakdown
9. **Build Pipeline** — Turbo caching, esbuild for Lambda cold start reduction,
   ESLint import enforcement, Husky pre-commit hooks
10. **Single-Table DynamoDB** — Sound key design with 12 prefixes, GSI1 for
    cross-project queries, TTL for auto-expiry, optimistic locking

---

## Appendix: Review Methodology

This review was conducted using a parallel swarm of 11 specialist teams:

| Team           | Agents | Focus                                              |
| -------------- | ------ | -------------------------------------------------- |
| Reconnaissance | 1      | Codebase mapping, file inventory, dependency graph |
| Architecture   | 5      | System design, patterns, coupling, scalability     |
| Security       | 5      | Auth, validation, injection, secrets, OWASP        |
| Quality        | 5      | Test coverage, code quality, linting, CI/CD        |
| Infrastructure | 5      | CDK, IAM, networking, costs, deployment            |
| Frontend       | 5      | Components, routing, state, performance, a11y      |
| Backend        | 5      | API routes, repos, error handling, integrations    |
| Data           | 5      | DynamoDB schema, access patterns, consistency      |
| UX             | 5      | Interaction design, information architecture, a11y |
| Content        | 3      | Copy, terminology, tone, localisation              |
| Product Owner  | 5      | User stories, feature completeness, adoption       |
| Strategy       | 3      | Tech debt, cost modelling, growth trajectory       |

Total review coverage: 193 source files, 32.6K lines of code, 4 packages, 21 API
endpoints, 12 Lambda handlers, 55 documentation files.
