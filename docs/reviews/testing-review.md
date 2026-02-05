# Testing Strategy Review - Agentic PM Workbench

> **Review Date:** 5 February 2026 **Branch:**
> claude/setup-monorepo-structure-V2G3w **Reviewer Role:** QA Engineer

---

## Executive Summary

The Agentic PM Workbench has a well-documented testing strategy in
`docs/design/07-testing-strategy.md` that outlines comprehensive coverage
targets. However, the current implementation significantly lags behind the
documented strategy. Only **5 test files** exist across the entire codebase,
covering a small fraction of the ~50 source files. Critical security and
business logic modules remain untested.

**Overall Test Quality Score: 4/10**

| Aspect                 | Score | Notes                                             |
| ---------------------- | ----- | ------------------------------------------------- |
| Unit Test Coverage     | 3/10  | Only 5 of ~50 source files have tests             |
| Integration Tests      | 1/10  | No DynamoDB Local integration tests               |
| E2E Tests              | 0/10  | No E2E tests implemented                          |
| LLM Golden Scenarios   | 2/10  | Artefact tests exist, no LLM evaluation framework |
| Mock Quality           | 7/10  | Existing mocks are well-structured                |
| Test Organisation      | 6/10  | Good co-location, but missing test directories    |
| Critical Path Coverage | 3/10  | Security-critical paths largely untested          |

---

## Current Coverage Analysis

### Test Files Inventory

| Package | Test File                            | Lines | Test Cases | Coverage Area                                   |
| ------- | ------------------------------------ | ----- | ---------- | ----------------------------------------------- |
| core    | `integrations/jira.test.ts`          | 614   | ~45        | JiraClient, RateLimiter, SignalSource interface |
| core    | `integrations/outlook.test.ts`       | 596   | ~42        | OutlookClient, GraphClient, delta queries       |
| core    | `db/repositories/checkpoint.test.ts` | 359   | ~18        | CheckpointRepository CRUD operations            |
| core    | `artefacts/artefacts.test.ts`        | 1138  | ~55        | Schema validation, bootstrap, versioning, diffs |
| lambdas | `change-detection/handler.test.ts`   | 511   | ~14        | Change detection gate pattern                   |

**Total: 5 test files, ~174 test cases, ~3,218 lines of test code**

### Coverage by Module (Estimated)

Based on the testing strategy document, the expected vs actual coverage:

| Module        | Expected Unit Tests | Actual | Gap |
| ------------- | ------------------- | ------ | --- |
| signals/      | 40+                 | 0      | -40 |
| triage/       | 25+                 | 0      | -25 |
| execution/    | 30+                 | 0      | -30 |
| artefacts/    | 20+                 | ~55    | +35 |
| llm/          | 15+                 | 0      | -15 |
| db/           | 10+                 | ~18    | +8  |
| integrations/ | 20+                 | ~87    | +67 |
| Frontend      | 30+                 | 0      | -30 |

**Observations:**

- Integration clients (Jira, Outlook) are well-tested
- Artefact module exceeds expectations with golden scenario tests
- All other core modules have **zero test coverage**

---

## Missing Tests (Prioritised by Risk)

### CRITICAL (P0) - Security and Core Logic

These modules handle security-sensitive operations or core business logic that
must be tested before production:

| File                      | Risk         | Why Critical                                                  |
| ------------------------- | ------------ | ------------------------------------------------------------- |
| `triage/sanitise.ts`      | **CRITICAL** | Prompt injection defence - protects LLM from malicious input  |
| `execution/boundaries.ts` | **CRITICAL** | Decision boundaries - controls what agent can do autonomously |
| `execution/confidence.ts` | **CRITICAL** | Confidence scoring - gates auto-execution decisions           |
| `llm/budget.ts`           | **CRITICAL** | Budget tracking - prevents runaway costs                      |
| `llm/client.ts`           | **CRITICAL** | Claude API client - all LLM interactions                      |

**Risk Assessment:** The `sanitise.ts` module is Defence Layer 2 against prompt
injection attacks. It contains 86 regex patterns for threat detection, but has
**zero tests**. A bug here could allow malicious content to reach the LLM.

### HIGH (P1) - Business Logic

| File                      | Reason                                              |
| ------------------------- | --------------------------------------------------- |
| `triage/classify.ts`      | Signal classification drives all downstream actions |
| `execution/execute.ts`    | Action execution logic                              |
| `execution/hold-queue.ts` | Hold queue timing and release logic                 |
| `signals/jira.ts`         | Jira signal normalisation                           |
| `signals/outlook.ts`      | Outlook signal normalisation                        |

### MEDIUM (P2) - Repository Layer

| File                                  | Reason                       |
| ------------------------------------- | ---------------------------- |
| `db/repositories/project.ts`          | Project CRUD operations      |
| `db/repositories/artefact.ts`         | Artefact persistence         |
| `db/repositories/escalation.ts`       | Escalation management        |
| `db/repositories/held-action.ts`      | Hold queue persistence       |
| `db/repositories/event.ts`            | Event logging                |
| `db/repositories/agent-config.ts`     | Agent configuration          |
| `db/repositories/graduation-state.ts` | Autonomy graduation tracking |
| `db/client.ts`                        | Base DynamoDB client         |

### MEDIUM (P2) - Lambda Handlers

Only 1 of 11 Lambda handlers has tests:

| Handler                       | Status         | Notes                         |
| ----------------------------- | -------------- | ----------------------------- |
| `change-detection/handler.ts` | Tested         | Change detection gate pattern |
| `heartbeat/handler.ts`        | **NOT TESTED** | Agent lifecycle               |
| `normalise/handler.ts`        | **NOT TESTED** | Signal normalisation entry    |
| `triage-sanitise/handler.ts`  | **NOT TESTED** | Sanitisation entry            |
| `triage-classify/handler.ts`  | **NOT TESTED** | Classification entry          |
| `artefact-update/handler.ts`  | **NOT TESTED** | Artefact updates              |
| `execute/handler.ts`          | **NOT TESTED** | Action execution              |
| `housekeeping/handler.ts`     | **NOT TESTED** | Maintenance tasks             |
| `hold-queue/handler.ts`       | **NOT TESTED** | Hold queue processing         |
| `reasoning/handler.ts`        | **NOT TESTED** | Complex reasoning             |

### LOW (P3) - Supporting Modules

| File                       | Reason                   |
| -------------------------- | ------------------------ |
| `context/assembly.ts`      | Context building for LLM |
| `compliance/spot-check.ts` | Compliance checking      |
| `reasoning/reasoning.ts`   | Reasoning module         |
| `integrations/ses.ts`      | SES email sending        |

---

## Integration Tests

### Current State

**No integration tests exist.** The testing strategy specifies:

- DynamoDB Local for database integration tests
- MSW (Mock Service Worker) for API integration tests
- 50-80 integration tests expected

### Missing Integration Test Suites

1. **DynamoDB Operations** (`TC-INT-001` to `TC-INT-017`)
   - Create/read/update/delete for all entity types
   - GSI queries
   - TTL expiration
   - Conditional writes
   - Transaction semantics

2. **Jira API Integration** (`TC-INT-020` to `TC-INT-030`)
   - Health checks with real-like responses
   - Rate limiting (429 handling)
   - Pagination
   - Error scenarios

3. **Microsoft Graph API** (`TC-INT-040` to `TC-INT-049`)
   - Delta query chains
   - Token refresh
   - Consent error handling

4. **Claude API Integration** (`TC-INT-080` to `TC-INT-088`)
   - Tool-use responses
   - Prompt caching
   - Budget cap enforcement

---

## E2E Tests

### Current State

**No E2E tests exist.** The testing strategy specifies:

- 5-10 critical paths using Playwright
- Run nightly and pre-release

### Missing E2E Scenarios

1. Agent cycle execution (heartbeat through action)
2. Escalation workflow (create, review, resolve)
3. Artefact bootstrap and update
4. Hold queue workflow
5. Dashboard interaction

---

## LLM Testing and Golden Scenarios

### Current State

The `artefacts/artefacts.test.ts` file contains golden scenario tests for
artefact generation, but these use **mocked LLM responses**, not real Claude API
calls.

**No LLM evaluation framework exists** as specified in the testing strategy
(Section 6).

### Missing LLM Test Infrastructure

1. **LLM Evaluation Framework** - Not implemented
   - No test harness for running against real Claude API
   - No budget cap enforcement for test runs
   - No statistical validation (5x runs for consistency)

2. **Golden Scenarios** - Partially defined in docs but not implemented
   - GS-001: Routine Sprint Progress - Not implemented
   - GS-002: Blocker Detected - Not implemented
   - GS-003: Scope Change Detection - Not implemented
   - GS-004: Stakeholder Email Response - Not implemented
   - GS-005: Risk Detection from Multiple Sources - Not implemented

3. **Classification Accuracy Tests** - Not implemented
   - Target: 90% accuracy on classification tasks
   - No test infrastructure to measure this

---

## Mock Quality Assessment

### Strengths

The existing test files demonstrate **good mock practices**:

1. **Jira Tests (`jira.test.ts`)**
   - Comprehensive mock responses for all Jira API endpoints
   - Realistic issue, sprint, and board structures
   - Proper mock for rate limiting behaviour
   - Helper functions for creating mock responses

2. **Outlook Tests (`outlook.test.ts`)**
   - Realistic Graph API message structure
   - Proper delta response with nextLink/deltaLink
   - OAuth token flow mocking

3. **Change Detection Tests (`handler.test.ts`)**
   - Well-structured module mocks using `vi.mock()`
   - Proper mock reset between tests
   - Good coverage of dependency injection patterns

### Weaknesses

1. **No shared mock fixtures** - Each test file defines its own mocks
2. **No mock factories** - Missing `createTestProject()`, `createTestSignal()`
   helpers
3. **No MSW setup** - Integration tests should use MSW for API mocking
4. **Missing DynamoDB Local** - No local database for integration tests

---

## Test Organisation Assessment

### Current Structure

```
packages/
  core/
    src/
      integrations/
        jira.test.ts          # Co-located
        outlook.test.ts       # Co-located
      db/repositories/
        checkpoint.test.ts    # Co-located
      artefacts/
        artefacts.test.ts     # Co-located
    vitest.config.ts
  lambdas/
    src/
      change-detection/
        handler.test.ts       # Co-located
    vitest.config.ts
```

### Observations

**Positive:**

- Tests are co-located with source files
- Both packages have Vitest configuration
- Coverage reporting configured (v8 provider)

**Missing:**

- No `__tests__` directories as specified in testing strategy
- No shared test utilities (`packages/core/src/test-utils/`)
- No mock fixtures directory
- No integration test directory structure
- No E2E test setup (`tests/e2e/`)

### Recommended Structure (from testing strategy)

```
packages/
  core/
    src/
      signals/__tests__/
        jira.test.ts
        outlook.test.ts
      triage/__tests__/
        sanitise.test.ts
        classify.test.ts
      execution/__tests__/
        boundaries.test.ts
        confidence.test.ts
      test-utils/
        fixtures/
        mocks/
        helpers/
tests/
  integration/
    dynamodb.integration.test.ts
    jira.integration.test.ts
  e2e/
    agent-cycle.e2e.test.ts
  llm-evaluation/
    golden-scenarios/
```

---

## Recommendations

### Immediate Actions (Sprint 0)

1. **Add tests for `triage/sanitise.ts`** (CRITICAL)
   - All 86 injection patterns need test cases
   - Edge cases: Unicode obfuscation, nested injection, code blocks
   - Test cases TC-TRI-001 through TC-TRI-010 from strategy doc

2. **Add tests for `execution/boundaries.ts`** (CRITICAL)
   - All boundary categories: autoExecute, requireHoldQueue, requireApproval,
     neverDo
   - All autonomy levels: monitoring, artefact, tactical
   - Test cases TC-EXE-001 through TC-EXE-013 from strategy doc

3. **Add tests for `llm/budget.ts`** (CRITICAL)
   - Degradation ladder transitions
   - Daily/monthly rollover
   - Hard ceiling behaviour
   - Test cases TC-LLM-001 through TC-LLM-014 from strategy doc

### Short-term Actions (Phase 1)

4. **Create shared test utilities**
   - Mock factories for common entities
   - Test fixtures for Jira/Outlook payloads
   - DynamoDB Local setup scripts

5. **Add Lambda handler tests**
   - Heartbeat handler
   - Triage handlers (sanitise, classify)
   - Execute handler

6. **Set up integration test infrastructure**
   - Docker Compose for DynamoDB Local
   - MSW handlers for external APIs
   - CI pipeline integration

### Medium-term Actions (Phase 2)

7. **Implement LLM evaluation framework**
   - Test harness for golden scenarios
   - Budget cap for test runs ($0.10 per suite)
   - Statistical validation (5x runs)

8. **Add E2E tests**
   - Playwright setup
   - Critical path coverage
   - Nightly CI job

### Coverage Targets

| Metric               | Current | Target | Gap  |
| -------------------- | ------- | ------ | ---- |
| Unit Tests           | ~174    | 200+   | -26  |
| Line Coverage (core) | Unknown | 90%    | TBD  |
| Integration Tests    | 0       | 50-80  | -50+ |
| E2E Tests            | 0       | 5-10   | -5+  |
| LLM Golden Scenarios | 0       | 10-30  | -10+ |

---

## Vitest Configuration Review

Both packages have basic Vitest configuration:

```typescript
// packages/core/vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
});
```

**Missing configuration:**

- Coverage thresholds not enforced
- No setup files for common mocks
- No global test timeout
- No test reporter for CI

**Recommended additions:**

```typescript
coverage: {
  // ...existing
  thresholds: {
    lines: 90,
    branches: 85,
    functions: 90,
    statements: 90,
  },
},
setupFiles: ['./src/test-utils/setup.ts'],
testTimeout: 10000,
reporters: ['default', 'junit'],
```

---

## Quality Gates (Not Implemented)

The testing strategy defines quality gates that are not currently enforced:

1. **Pre-commit** - Unit tests must pass (not configured)
2. **PR merge** - Coverage thresholds (not configured)
3. **Pre-release** - E2E tests must pass (not implemented)
4. **Weekly** - LLM evaluation must pass (not implemented)

---

## Conclusion

The testing strategy documentation is comprehensive and well-thought-out, but
implementation has not kept pace. The current test suite covers integration
clients well but leaves critical security and business logic modules completely
untested. The most urgent gaps are:

1. **Security-critical modules** (sanitise, boundaries) have zero tests
2. **LLM budget controls** are untested
3. **10 of 11 Lambda handlers** lack tests
4. **No integration or E2E tests** exist

Addressing P0 (Critical) items should be the immediate priority before any
production deployment. The project should not proceed beyond Phase 1 without
tests for the sanitisation and decision boundary modules.

---

**Test Quality Score: 4/10**

_Score breakdown:_

- Existing tests are well-written: +2
- Integration clients covered: +1
- Artefact module well-tested: +1
- Critical security modules untested: -3
- No integration tests: -2
- No E2E tests: -1
- No LLM evaluation: -1
- Missing 80% of expected test coverage: -3
