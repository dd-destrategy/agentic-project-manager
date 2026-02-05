# API Design Review

**Project:** Agentic PM Workbench **Branch:**
claude/setup-monorepo-structure-V2G3w **Reviewer:** API Design Expert **Date:**
2026-02-05

---

## Executive Summary

The Agentic PM Workbench API demonstrates solid foundational design patterns for
a single-user personal tool. The API routes follow Next.js App Router
conventions and implement consistent authentication across all protected
endpoints. However, several areas require attention before production
deployment, particularly around request validation, response consistency, and
documentation accuracy.

**Overall Assessment:** The API is well-structured for its purpose but needs
refinement in validation, consistency, and documentation alignment.

---

## API Design Score: 6.5/10

| Category           | Score | Weight | Weighted |
| ------------------ | ----- | ------ | -------- |
| REST Conventions   | 7/10  | 20%    | 1.4      |
| Error Handling     | 7/10  | 15%    | 1.05     |
| Request Validation | 4/10  | 20%    | 0.8      |
| Response Schemas   | 6/10  | 15%    | 0.9      |
| Pagination         | 7/10  | 10%    | 0.7      |
| Authentication     | 8/10  | 15%    | 1.2      |
| Documentation      | 5/10  | 5%     | 0.25     |
| **Total**          |       |        | **6.5**  |

---

## Strengths

### 1. Consistent Authentication Pattern

All API routes correctly implement session-based authentication using
NextAuth.js. The pattern is applied uniformly:

```typescript
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
}
```

**Files:** All route handlers in `/packages/web/src/app/api/`

### 2. Well-Defined TypeScript Types

The codebase has comprehensive type definitions in
`/packages/web/src/types/index.ts`, providing clear contracts for API responses:

- `AgentStatusResponse`, `EventsResponse`, `EscalationsResponse`
- Proper union types for enums (`AutonomyLevel`, `EventType`,
  `EscalationStatus`)
- Separate types for list summaries vs. full entities

### 3. RESTful Resource Naming

Resources follow REST conventions with proper noun-based naming:

| Resource     | Endpoint                     | Methods   |
| ------------ | ---------------------------- | --------- |
| Projects     | `/api/projects`              | GET       |
| Project      | `/api/projects/[id]`         | GET       |
| Escalations  | `/api/escalations`           | GET, HEAD |
| Escalation   | `/api/escalations/[id]`      | GET, POST |
| Held Actions | `/api/held-actions`          | GET, HEAD |
| Artefacts    | `/api/artefacts/[projectId]` | GET       |

### 4. Cursor-Based Pagination

The events endpoint implements proper cursor-based pagination:

```typescript
// /packages/web/src/app/api/events/route.ts
const response: EventsResponse = {
  events: paginatedEvents,
  nextCursor: hasMore ? String(startIndex + limit) : null,
  hasMore,
};
```

### 5. Appropriate Use of HEAD Method

The escalations and held-actions endpoints use HEAD for lightweight count
retrieval:

```typescript
// /packages/web/src/app/api/escalations/route.ts
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { 'X-Pending-Count': String(pendingCount) },
  });
}
```

### 6. Comprehensive JSDoc Documentation

All route handlers include JSDoc comments explaining purpose and parameters:

```typescript
/**
 * GET /api/projects/[id]
 *
 * Returns detailed information for a specific project.
 */
```

---

## Issues

### Critical Issues

#### 1. No Request Body Validation with Zod

**Severity:** Critical **Location:** All POST/PATCH endpoints **Impact:**
Runtime errors, security vulnerabilities, data integrity issues

The project specifies "Zod for runtime schema validation" in CLAUDE.md, but no
API routes implement Zod validation. Malformed requests could cause crashes or
data corruption.

**Affected Files:**

- `/packages/web/src/app/api/agent/autonomy/route.ts`
- `/packages/web/src/app/api/escalations/[id]/route.ts`
- `/packages/web/src/app/api/held-actions/[id]/cancel/route.ts`
- `/packages/web/src/app/api/graduation/confirm/route.ts`

**Example - Current Implementation:**

```typescript
const body = await request.json();
const { autonomyLevel, dryRun } = body as {
  autonomyLevel?: AutonomyLevel;
  dryRun?: boolean;
};
```

**Recommended Fix:**

```typescript
import { z } from 'zod';

const AutonomyUpdateSchema = z.object({
  autonomyLevel: z.enum(['monitoring', 'artefact', 'tactical']).optional(),
  dryRun: z.boolean().optional(),
});

const parseResult = AutonomyUpdateSchema.safeParse(body);
if (!parseResult.success) {
  return NextResponse.json(
    { error: 'Invalid request', details: parseResult.error.format() },
    { status: 400 }
  );
}
```

---

#### 2. HEAD Method Missing Authentication Check

**Severity:** Critical **Location:**
`/packages/web/src/app/api/escalations/route.ts` (lines 203-218) **Impact:**
Information disclosure to unauthenticated users

The HEAD method for escalation count does not verify the session:

```typescript
export async function HEAD() {
  try {
    // No authentication check!
    const pendingCount = 2;
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Pending-Count': String(pendingCount) },
    });
  }
}
```

**Affected Files:**

- `/packages/web/src/app/api/escalations/route.ts`
- `/packages/web/src/app/api/held-actions/route.ts`

---

### Warnings

#### 3. Documentation and Implementation Mismatch

**Severity:** Warning **Location:** `/docs/API.md` vs. actual routes **Impact:**
Developer confusion, integration errors

| Documented Endpoint                 | Actual Implementation        | Issue                    |
| ----------------------------------- | ---------------------------- | ------------------------ |
| `POST /api/agent/autonomy`          | `PATCH /api/agent/autonomy`  | Wrong HTTP method        |
| `POST /api/escalations/[id]/decide` | `POST /api/escalations/[id]` | Missing `/decide` suffix |

**API.md Line 76:**

```
POST /api/agent/autonomy
```

**Actual Implementation:**

```typescript
export async function PATCH(request: NextRequest) { ... }
```

---

#### 4. Inconsistent Response Envelope Patterns

**Severity:** Warning **Location:** Multiple endpoints **Impact:** Unpredictable
client-side parsing

Some endpoints wrap responses in an object, others return entities directly:

| Endpoint                    | Response Structure              |
| --------------------------- | ------------------------------- |
| `GET /api/projects`         | `{ projects: [...], count: n }` |
| `GET /api/projects/[id]`    | `{ project: {...} }`            |
| `GET /api/escalations/[id]` | `{...}` (unwrapped entity)      |
| `GET /api/agent/autonomy`   | `{...}` (unwrapped settings)    |

**Recommendation:** Establish a consistent envelope pattern:

```typescript
// For collections
{ data: [...], meta: { count, cursor, hasMore } }

// For single resources
{ data: {...} }
```

---

#### 5. Missing Pagination on List Endpoints

**Severity:** Warning **Location:** `/api/projects`, `/api/escalations`,
`/api/held-actions` **Impact:** Performance issues with growing datasets

While the events endpoint has cursor-based pagination, other list endpoints only
support `limit` without a cursor for fetching subsequent pages:

**Affected Endpoints:**

- `GET /api/projects` - No pagination at all
- `GET /api/escalations` - Limit only, no cursor
- `GET /api/held-actions` - Limit only, no cursor

---

#### 6. Incorrect HTTP Methods for State-Changing Actions

**Severity:** Warning **Location:** `/api/held-actions/[id]/approve`,
`/api/held-actions/[id]/cancel` **Impact:** Non-RESTful semantics

The approve and cancel endpoints use POST but represent state transitions on an
existing resource. Consider:

- Using `PATCH /api/held-actions/[id]` with `{ status: 'approved' }`
- Or keeping separate endpoints but acknowledging the RPC-style deviation

---

#### 7. No API Versioning Strategy

**Severity:** Warning **Impact:** Breaking changes cannot be managed gracefully

The API has no versioning mechanism. Options to consider:

- URL path versioning: `/api/v1/projects`
- Header versioning: `Accept: application/vnd.agentic-pm.v1+json`
- Query parameter: `/api/projects?version=1`

For a single-user tool, this is acceptable initially but should be planned for.

---

### Minor Issues

#### 8. Query Parameter Type Coercion Not Validated

**Severity:** Minor **Location:** Event filtering, escalation filtering

Query parameters are parsed with `parseInt()` but edge cases are not handled:

```typescript
const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
```

If `limit=abc` is passed, `parseInt` returns `NaN`, and `Math.min(NaN, 100)`
returns `NaN`, potentially causing downstream issues.

---

#### 9. Error Response Structure Inconsistency

**Severity:** Minor **Location:** Various error handlers

Most errors return `{ error: string }`, but some include additional fields while
others do not. The documented structure includes optional `details`:

```typescript
interface ErrorResponse {
  error: string;
  details?: string;
}
```

But the `details` field is never populated in actual error responses.

---

#### 10. In-Memory State for Development

**Severity:** Minor (acceptable for development) **Location:**
`/api/agent/autonomy/route.ts`, `/api/graduation/route.ts`

The use of module-level variables for state storage works for development but
will not persist across serverless function invocations:

```typescript
let autonomySettings: AutonomySettingsResponse = {
  autonomyLevel: 'monitoring',
  dryRun: false,
  // ...
};
```

This is documented with TODO comments but should be tracked for Phase 1
completion.

---

## Recommendations

### Immediate Actions (Before Next Sprint)

1. **Add Zod Validation to All Mutation Endpoints**
   - Create shared schemas in `/packages/web/src/schemas/`
   - Validate all POST/PATCH request bodies
   - Return structured validation errors

2. **Add Authentication to HEAD Methods**
   - Apply the same session check pattern to HEAD handlers
   - Alternative: Remove HEAD endpoints if not needed

3. **Align Documentation with Implementation**
   - Update `/docs/API.md` to reflect actual HTTP methods
   - Add missing endpoint documentation for `/api/agent/autonomy`
     acknowledgement

### Short-Term Improvements (Phase 1)

4. **Standardise Response Envelopes**
   - Adopt a consistent pattern for all responses
   - Consider adding a shared response helper function

5. **Add Pagination to All List Endpoints**
   - Implement cursor-based pagination for projects, escalations, held-actions
   - Use consistent pagination parameters across endpoints

6. **Improve Query Parameter Validation**
   - Validate and sanitise all query parameters
   - Return 400 for malformed parameters

### Long-Term Considerations

7. **Plan API Versioning**
   - Document versioning strategy in DEVELOPMENT.md
   - Consider URL path versioning for simplicity

8. **Add OpenAPI/Swagger Specification**
   - Generate from TypeScript types using `ts-to-zod` and `zod-to-openapi`
   - Enable API documentation auto-generation

9. **Consider Rate Limiting Infrastructure**
   - While not needed for single-user, the pattern should be in place
   - Use request counting in DynamoDB or AWS WAF

---

## Endpoint Summary

| Endpoint                         | Method | Auth | Validation | Pagination | Status         |
| -------------------------------- | ------ | ---- | ---------- | ---------- | -------------- |
| `/api/agent/status`              | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/agent/autonomy`            | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/agent/autonomy`            | PATCH  | Yes  | Partial    | N/A        | Needs Zod      |
| `/api/agent/autonomy`            | POST   | Yes  | Partial    | N/A        | Needs Zod      |
| `/api/projects`                  | GET    | Yes  | N/A        | None       | Add Pagination |
| `/api/projects/[id]`             | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/artefacts/[projectId]`     | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/events`                    | GET    | Yes  | Partial    | Cursor     | OK             |
| `/api/escalations`               | GET    | Yes  | N/A        | Limit only | Add Cursor     |
| `/api/escalations`               | HEAD   | No   | N/A        | N/A        | Add Auth       |
| `/api/escalations/[id]`          | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/escalations/[id]`          | POST   | Yes  | Minimal    | N/A        | Needs Zod      |
| `/api/held-actions`              | GET    | Yes  | N/A        | Limit only | Add Cursor     |
| `/api/held-actions`              | HEAD   | No   | N/A        | N/A        | Add Auth       |
| `/api/held-actions/[id]/approve` | POST   | Yes  | N/A        | N/A        | Consider PATCH |
| `/api/held-actions/[id]/cancel`  | POST   | Yes  | Minimal    | N/A        | Needs Zod      |
| `/api/budget`                    | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/graduation`                | GET    | Yes  | N/A        | N/A        | OK             |
| `/api/graduation/confirm`        | POST   | Yes  | None       | N/A        | Needs Zod      |
| `/api/stats`                     | GET    | Yes  | N/A        | N/A        | OK             |

---

## Files Reviewed

- `/packages/web/src/app/api/auth/[...nextauth]/route.ts`
- `/packages/web/src/app/api/auth/[...nextauth]/auth-options.ts`
- `/packages/web/src/app/api/agent/status/route.ts`
- `/packages/web/src/app/api/agent/autonomy/route.ts`
- `/packages/web/src/app/api/projects/route.ts`
- `/packages/web/src/app/api/projects/[id]/route.ts`
- `/packages/web/src/app/api/artefacts/[projectId]/route.ts`
- `/packages/web/src/app/api/events/route.ts`
- `/packages/web/src/app/api/escalations/route.ts`
- `/packages/web/src/app/api/escalations/[id]/route.ts`
- `/packages/web/src/app/api/held-actions/route.ts`
- `/packages/web/src/app/api/held-actions/[id]/approve/route.ts`
- `/packages/web/src/app/api/held-actions/[id]/cancel/route.ts`
- `/packages/web/src/app/api/budget/route.ts`
- `/packages/web/src/app/api/graduation/route.ts`
- `/packages/web/src/app/api/graduation/confirm/route.ts`
- `/packages/web/src/app/api/stats/route.ts`
- `/packages/web/src/types/index.ts`
- `/docs/API.md`

---

_Review generated by API Design Expert_
