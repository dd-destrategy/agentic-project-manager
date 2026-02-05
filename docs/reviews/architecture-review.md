# Architecture Review: Agentic PM Workbench

**Review Date:** 2026-02-05
**Branch:** claude/setup-monorepo-structure-V2G3w
**Reviewer:** Senior Software Architect

---

## Executive Summary

The Agentic PM Workbench demonstrates a well-designed monorepo architecture that effectively separates concerns between core business logic, serverless compute, infrastructure-as-code, and frontend presentation. The codebase exhibits mature patterns including repository pattern for data access, factory functions for client instantiation, and a security-conscious two-stage triage architecture with IAM-enforced isolation. The architecture is appropriate for a personal-scale application with a clear budget ceiling ($15/month). Minor concerns exist around code duplication in decision boundaries and incomplete dependency injection patterns in some modules, but overall the architecture is sound, maintainable, and well-documented.

---

## Strengths

### Monorepo Structure

- **Logical package separation**: Four packages (`core`, `lambdas`, `cdk`, `web`) with clear responsibilities and minimal overlap
- **Turbo build orchestration**: Properly configured task dependencies (`^build` for lint/typecheck, `build` for test) enabling efficient parallel builds
- **TypeScript project references**: Root `tsconfig.json` uses path aliases and project references for excellent IDE support and type checking across packages
- **Workspace protocol**: Consistent use of `workspace:*` for inter-package dependencies ensuring version coherence
- **Granular exports**: Core package exposes subpath exports (e.g., `@agentic-pm/core/signals`, `@agentic-pm/core/db`) for tree-shaking and explicit API boundaries

### Dependency Management

- **Unidirectional dependency graph**: Clean hierarchy where `lambdas -> core`, `web -> core`, `cdk` standalone
- **No circular dependencies detected**: Each package has a clear purpose with no back-references
- **Shared devDependencies at root**: TypeScript, ESLint, Prettier, Husky hoisted to reduce duplication
- **Modern tooling**: pnpm 9.x, Turbo 2.x, TypeScript 5.3, Node 20

### Security Architecture

- **IAM isolation between triage and agent roles**: Critical security boundary preventing prompt injection attacks from accessing integration credentials
- **Explicit deny policies**: `TriageLambdaRole` explicitly denies access to Jira/Graph secrets and SES actions, not just omitting grants
- **Two-stage triage pipeline**: Sanitise and classify stages run with restricted permissions before any external actions
- **Decision boundaries**: Well-defined allowlist of auto-executable, hold-queue, approval-required, and prohibited actions
- **Autonomy levels**: Three-tier autonomy model (monitoring, artefact, tactical) with clear permission boundaries

### Separation of Concerns

- **Repository pattern**: `ProjectRepository`, `ArtefactRepository`, `EventRepository`, `EscalationRepository` cleanly encapsulate DynamoDB access patterns
- **DynamoDB client wrapper**: Custom `DynamoDBClient` class with exponential backoff, retry logic, and consistent error handling
- **LLM abstraction**: `ClaudeClient` with tool-use enforcement, cost tracking, and caching support
- **Signal processing pipeline**: Clear progression from `RawSignal` to `NormalisedSignal` to `SanitisedSignal` to `ClassifiedSignal`
- **Artefact types**: Union type `ArtefactContent` with discriminated subtypes for type-safe content handling

### Design Patterns

- **Factory functions**: `createHaikuClient()`, `createSonnetClient()`, `createJiraClient()` provide consistent instantiation
- **Dependency injection (partial)**: `performReasoningWithClient()` accepts injected client for testability
- **Strategy pattern (implicit)**: Decision boundaries and autonomy levels act as configurable strategies for execution behaviour
- **Versioned artefacts**: One-deep undo via `previousVersion` attribute on artefacts
- **Single-table design**: DynamoDB with PK/SK and GSI1 for efficient access patterns

### Infrastructure as Code

- **CDK best practices**: Separate stacks for foundation (DynamoDB, Secrets, IAM) and agent (Lambdas, Step Functions, EventBridge)
- **Environment configuration**: Typed `EnvironmentConfig` with per-environment settings
- **Step Functions orchestration**: Well-structured state machine with proper retry configuration and timeout handling
- **Dual scheduling**: 15-minute main cycle via Step Functions, 1-minute hold queue check via direct Lambda invocation

### Code Quality

- **Comprehensive type definitions**: 530+ lines of domain types covering all entities, signals, and artefacts
- **British English consistency**: Spelling adheres to project conventions (sanitise, colour, etc.)
- **JSDoc documentation**: Key modules have descriptive comments with references to spec sections
- **Test infrastructure**: Vitest configured per-package with coverage output directories

---

## Concerns

### Critical (0 Issues)

No critical architectural issues identified.

### Warning Level

- **DECISION_BOUNDARIES duplication**: Defined in both `/packages/core/src/constants.ts` and `/packages/core/src/execution/boundaries.ts` with slight differences (e.g., `notification_sent` vs `notification_internal`). Risk of drift.

- **Incomplete dependency injection**: Several modules read `process.env.ANTHROPIC_API_KEY` directly (e.g., `reasoning.ts`, `budget.ts`) rather than receiving configuration via constructor. Reduces testability without mocking `process.env`.

- **Lambda handlers using mock data**: Multiple web API routes (e.g., `/api/projects/route.ts`) return hardcoded mock data rather than connecting to DynamoDB. Expected for early development but should be tracked.

- **Shared AWS SDK versions**: Both `core` and `lambdas` packages declare `@aws-sdk/client-dynamodb` as direct dependencies. While pnpm deduplicates, this could lead to version drift if not carefully managed.

- **Missing unit tests for critical paths**: While test files exist (`artefacts.test.ts`, `jira.test.ts`, `outlook.test.ts`, `checkpoint.test.ts`, `change-detection/handler.test.ts`), coverage appears limited for security-critical sanitisation and boundary validation logic.

### Minor

- **Type assertions in client**: `DynamoDBClient.get<T>()` uses unsafe cast `(result.Item as T)` without runtime validation. Zod schemas exist but are not consistently applied on retrieval.

- **Logger singleton**: `packages/lambdas/src/shared/context.ts` exports a mutable singleton `logger` which could cause issues if context is not properly reset between Lambda invocations in warm containers.

- **Incomplete integration exports**: `integrations/index.ts` has commented-out `OutlookClient` export marked "Phase 3", leaving inconsistent module surface.

- **Web package lacks type: module**: Unlike other packages, `@agentic-pm/web` does not declare `"type": "module"` in package.json (Next.js handles this internally, but inconsistency noted).

- **Constants file size**: `/packages/core/src/constants.ts` mixes configuration constants with decision boundaries logic that arguably belongs in a separate module.

---

## Recommendations

### Priority 1: Immediate Attention

1. **Consolidate DECISION_BOUNDARIES**: Remove the duplicate definition in `constants.ts` and import from `execution/boundaries.ts` for all consumers. Update any code relying on the `constants.ts` version.

2. **Add Zod validation on DynamoDB reads**: Wrap repository `get()` calls with schema validation to ensure runtime type safety:
   ```typescript
   const result = await this.db.get<unknown>(pk, sk);
   return result ? ProjectSchema.parse(result) : null;
   ```

3. **Create factory for LLM clients with config injection**: Replace direct `process.env` access with a configuration object passed to module functions:
   ```typescript
   export function createReasoningService(config: { apiKey: string }): ReasoningService
   ```

### Priority 2: Near-Term Improvements

4. **Implement DynamoDB connection in web API routes**: Replace mock data with actual DynamoDB calls using the existing repository pattern from `@agentic-pm/core/db`.

5. **Add unit tests for sanitisation and boundary validation**: These are security-critical paths that warrant 100% coverage. Test cases should include:
   - Injection pattern detection
   - Boundary category classification
   - Autonomy level permission checks

6. **Extract logger to `@agentic-pm/core`**: Move structured logging to shared package to ensure consistency and avoid the singleton pattern in Lambda handlers.

7. **Lock AWS SDK versions at root**: Add `@aws-sdk/client-dynamodb` to root package.json `peerDependencies` or use pnpm `overrides` to enforce single version.

### Priority 3: Future Considerations

8. **Consider event sourcing for artefact history**: The current one-deep undo via `previousVersion` is limited. For full audit trail, consider storing artefact changes as events.

9. **Add OpenTelemetry instrumentation**: While X-Ray tracing is enabled, custom spans for LLM calls and integration operations would improve observability.

10. **Document data model formally**: Create a `docs/design/data-model.md` with DynamoDB access patterns, key structures, and GSI usage.

11. **Evaluate monorepo tool migration**: Turbo is solid, but consider Nx for larger-scale features like affected-based testing and distributed caching if the project grows.

---

## Dependency Graph

```
                    +-------------+
                    |   turbo     |
                    +------+------+
                           |
      +--------------------+--------------------+
      |                    |                    |
      v                    v                    v
+----------+         +----------+         +----------+
|   web    |         | lambdas  |         |   cdk    |
+----+-----+         +----+-----+         +----------+
     |                    |
     +--------+-----------+
              |
              v
         +--------+
         |  core  |
         +--------+
```

---

## Scoring

| Category               | Score | Notes                                                |
|------------------------|-------|------------------------------------------------------|
| Package Separation     | 9/10  | Excellent separation, minor export inconsistencies   |
| Dependency Management  | 8/10  | Clean graph, some SDK version duplication            |
| Security Architecture  | 9/10  | IAM isolation exemplary, sanitisation needs tests    |
| Separation of Concerns | 8/10  | Repository pattern solid, some DI gaps               |
| Design Patterns        | 8/10  | Good use of factories, room for more consistency     |
| Infrastructure         | 9/10  | CDK stacks well-organised, proper retry config       |
| Code Quality           | 8/10  | Strong typing, needs more test coverage              |
| Documentation          | 7/10  | Good inline docs, formal data model doc missing      |

**Overall Score: 8.3/10**

---

## Conclusion

The Agentic PM Workbench architecture is well-suited for its stated purpose as a personal project management assistant. The monorepo structure is clean and maintainable, the security model is thoughtfully designed with defence-in-depth principles, and the codebase follows established patterns that will facilitate future development. The primary areas for improvement are consolidating duplicated constants, strengthening runtime type validation, and expanding test coverage for security-critical code paths. With these refinements, the architecture would be production-ready.

---

*Review conducted using static analysis of source code, configuration files, and directory structure. No runtime testing was performed.*
