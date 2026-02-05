# TypeScript Review: Agentic PM Workbench

**Branch:** `claude/setup-monorepo-structure-V2G3w`
**Reviewer:** Claude (Opus 4.5)
**Date:** 2026-02-05

---

## Executive Summary

The Agentic PM Workbench demonstrates **strong TypeScript practices** with comprehensive type definitions, strict mode enforcement, and proper Zod schema validation. The codebase avoids `any` types entirely and uses `unknown` appropriately for dynamic data boundaries. However, there are opportunities to improve type safety through Zod inference, better discriminated unions, and consistent compiler settings across packages.

**Type Safety Score: 8/10**

---

## Strengths

### 1. Zero `any` Types

The codebase contains **no explicit `any` types** in application code. This is an exemplary practice that ensures all data flows are type-checked. The team has consistently used `unknown` for truly dynamic data (e.g., `rawPayload: unknown`) and `Record<string, unknown>` for flexible objects.

### 2. Strict Mode Configuration

The base TypeScript configuration (`tsconfig.base.json`) enables all strict mode options:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictBindCallApply": true,
  "strictPropertyInitialization": true,
  "noImplicitThis": true,
  "alwaysStrict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true
}
```

The inclusion of `noUncheckedIndexedAccess` is particularly commendable, as it catches potential `undefined` access in arrays and records.

### 3. Comprehensive Type Definitions

Core types in `/packages/core/src/types/index.ts` (530+ lines) provide thorough coverage:

- **Primitive types:** Well-defined string literal unions (`ProjectStatus`, `EventType`, etc.)
- **Entity interfaces:** Complete definitions for all domain objects
- **Generic types:** Proper use of generics (`Artefact<T extends ArtefactContent>`)
- **JSDoc comments:** Good documentation on public interfaces

### 4. Zod Schema Validation

Runtime validation with Zod in `/packages/core/src/schemas/index.ts` provides:

- Comprehensive schemas matching all TypeScript types
- Appropriate constraints (min/max lengths, regex patterns, number ranges)
- Use of `z.literal(true)` for branded types (`SanitisedSignal`)
- Proper ISO date validation with `z.string().datetime()`

### 5. Type-Safe API Patterns

- Claude tool-use responses properly typed with generics
- Repository methods return `T | null` for optional finds
- `QueryResult<T>` generic for paginated results
- Type guards used correctly:
  ```typescript
  (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  ```

---

## Issues

### Critical Issues

#### 1. No Zod Type Inference (Duplication Risk)

**File:** `packages/core/src/types/index.ts`, `packages/core/src/schemas/index.ts`

TypeScript types and Zod schemas are manually maintained separately. No `z.infer<typeof Schema>` usage found, creating risk of type/schema drift.

**Current (problematic):**
```typescript
// types/index.ts
export interface Project {
  id: string;
  name: string;
  // ...
}

// schemas/index.ts
export const ProjectSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  // ...
});
```

**Recommended:**
```typescript
// schemas/index.ts
export const ProjectSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(200),
  // ...
});
export type Project = z.infer<typeof ProjectSchema>;
```

---

### Warnings

#### 2. CDK Package Has Relaxed Compiler Settings

**File:** `packages/cdk/tsconfig.json`

The CDK package disables several strict checks:

```json
{
  "noUnusedLocals": false,
  "noUnusedParameters": false,
  "noFallthroughCasesInSwitch": false,
  "strictPropertyInitialization": false
}
```

This creates inconsistent type safety across the monorepo. CDK code should follow the same standards.

#### 3. Type Duplication Between Core and Web Packages

**Files:** `packages/core/src/types/index.ts`, `packages/web/src/types/index.ts`

The web package duplicates 408 lines of type definitions instead of importing from `@agentic-pm/core`. This creates maintenance burden and drift risk.

**Current:**
```typescript
// packages/web/src/types/index.ts
export type ProjectStatus = 'active' | 'paused' | 'archived'; // Duplicated
```

**Recommended:**
```typescript
// packages/web/src/types/index.ts
export type { Project, ProjectStatus, Event, Escalation } from '@agentic-pm/core';
// Add web-specific types only
```

#### 4. Discriminated Unions Missing Discriminator

**File:** `packages/core/src/types/index.ts`

`ArtefactContent` is a union but lacks a literal discriminator property, making narrowing unreliable:

```typescript
export type ArtefactContent =
  | DeliveryStateContent    // Has 'overallStatus'
  | RaidLogContent          // Has 'items'
  | BacklogSummaryContent   // Has 'source'
  | DecisionLogContent;     // Has 'decisions'
```

**Recommended:** Add explicit `type` discriminator:
```typescript
export interface DeliveryStateContent {
  type: 'delivery_state';
  overallStatus: 'green' | 'amber' | 'red';
  // ...
}
```

Similarly for `HeldActionPayload` in web types.

#### 5. Multiple Type Assertions (`as`)

**Files:** Various throughout codebase

Found 80+ type assertions using `as`. While some are necessary (e.g., API boundaries), others could be replaced with safer patterns:

**Problematic patterns found:**
```typescript
// packages/core/src/signals/jira.ts
const payload = raw.rawPayload as Record<string, unknown>;
raw: event as unknown as Record<string, unknown>,

// packages/lambdas/src/artefact-update/handler.ts
content = convertDeliveryStateOutput(output, currentArtefact?.content as DeliveryStateContent | undefined);

// packages/core/src/artefacts/updater.ts
diffRaidLog(oldContent as RaidLogContent, newContent as RaidLogContent, changes);
```

**Recommended:** Use type guards or Zod parsing instead:
```typescript
function isDeliveryStateContent(content: ArtefactContent): content is DeliveryStateContent {
  return 'overallStatus' in content;
}
```

#### 6. Index Signature with `unknown` in DynamoDB Types

**File:** `packages/core/src/db/types.ts`

```typescript
export interface DynamoDBItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  TTL?: number;
  [key: string]: unknown;  // Weakens type safety
}
```

This allows any property on DynamoDB items, bypassing TypeScript checks.

---

### Minor Issues

#### 7. Missing Return Type Annotations

Some functions rely on type inference instead of explicit return types:

```typescript
// packages/core/src/llm/client.ts
private calculateUsage(usage: Anthropic.Usage) {  // Should specify : TokenUsage
```

#### 8. Inconsistent Optional vs Undefined

Mix of optional properties and explicit `undefined`:

```typescript
// Inconsistent patterns
nextCursor?: string;        // Optional property
lastCheck: string | null;   // Nullable
errorMessage?: string;      // Optional property
```

Consider standardising on one pattern for nullable/optional fields.

#### 9. JSON.parse Without Validation

**Files:** `packages/core/src/integrations/outlook.ts`, `packages/lambdas/src/change-detection/handler.ts`

```typescript
const credentials = JSON.parse(secretValue) as JiraConfig;  // No runtime validation
```

Should use Zod parsing for runtime safety:
```typescript
const credentials = JiraConfigSchema.parse(JSON.parse(secretValue));
```

---

## Recommendations

### High Priority

1. **Derive Types from Zod Schemas**
   - Use `z.infer<>` throughout to ensure type/schema alignment
   - Single source of truth eliminates drift risk
   - Estimated effort: 2-4 hours

2. **Enforce Strict Mode in CDK Package**
   - Align CDK tsconfig with base configuration
   - Fix any resulting type errors
   - Estimated effort: 1-2 hours

3. **Add Discriminator to Union Types**
   - Add `type` literal property to `ArtefactContent` variants
   - Add `actionType` discriminator to `HeldActionPayload`
   - Enables safe narrowing without type assertions
   - Estimated effort: 2-3 hours

### Medium Priority

4. **Eliminate Type Duplication**
   - Web package should import types from `@agentic-pm/core`
   - Add only web-specific types locally
   - Estimated effort: 1 hour

5. **Replace Type Assertions with Type Guards**
   - Create type guard functions for common patterns
   - Use Zod `.safeParse()` at boundaries
   - Estimated effort: 4-6 hours

6. **Validate JSON.parse Results**
   - Replace `as Type` assertions with Zod parsing
   - Add error handling for malformed data
   - Estimated effort: 2 hours

### Low Priority

7. **Add Explicit Return Types**
   - Annotate all public function return types
   - Improves documentation and IDE support
   - Can be enforced with ESLint rule

8. **Standardise Nullable Patterns**
   - Document team convention for optional vs nullable
   - Apply consistently across codebase

---

## Package-by-Package Summary

| Package | Strict Mode | Type Coverage | Zod Usage | Notes |
|---------|-------------|---------------|-----------|-------|
| `@agentic-pm/core` | Full | Excellent | Comprehensive | Source of truth for types |
| `@agentic-pm/lambdas` | Full (inherited) | Good | Limited | Some type assertions |
| `@agentic-pm/web` | Standard Next.js | Good | Not used | Duplicates core types |
| `@agentic-pm/cdk` | Relaxed | Adequate | Not applicable | Needs strict mode |

---

## Conclusion

The Agentic PM Workbench has a **solid TypeScript foundation** with no `any` types, comprehensive strict mode settings, and well-structured type definitions. The main areas for improvement are:

1. Linking Zod schemas to TypeScript types via inference
2. Consistent compiler settings across all packages
3. Better discriminated unions for type narrowing
4. Reducing type assertions in favour of type guards

Implementing these recommendations would raise the Type Safety Score from **8/10 to 9+/10**.

---

*Review completed using static analysis of TypeScript files, configuration inspection, and pattern matching.*
