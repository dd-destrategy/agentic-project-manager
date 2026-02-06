# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-06

### Added

- **Execute Lambda Implementation** - Complete action execution with 3 executors:
  - Jira executor (JIRA_UPDATE, JIRA_COMMENT, JIRA_TRANSITION)
  - Email executor (EMAIL_SEND via SES, EMAIL_REPLY via Graph API)
  - Artefact executor (ARTEFACT_UPDATE for all artefact types)
- **Web API DynamoDB Integration** - All 11 API routes connected to real data:
  - `/api/agent/status` - Real-time agent status from DynamoDB
  - `/api/artefacts/[projectId]` - Project artefacts with real data
  - `/api/budget` - Real-time budget tracking and degradation
  - `/api/escalations` - Escalation list and detail with real queries
  - `/api/events` - Event history from DynamoDB
  - `/api/graduation` - Graduation workflow and evidence tracking
  - `/api/held-actions` - Hold queue management (list, approve, cancel)
  - `/api/stats` - 24-hour activity statistics aggregated from events
- **Frontend Test Suite** - Comprehensive testing with 130 passing tests:
  - 14 test files covering hooks, components, and pages
  - Vitest with jsdom for DOM testing
  - Testing Library for React component testing
  - renderWithProviders pattern for query client setup
- **Documentation**:
  - Environment variables guide with security best practices
  - Deployment guide with step-by-step AWS setup
  - Deployment checklist with rollback procedures
- **Core Package Exports** - Additional repository exports:
  - `@agentic-pm/core/db/repositories` (index with all repositories)
  - `@agentic-pm/core/db/repositories/agent-config`
  - `@agentic-pm/core/db/repositories/artefact`
  - `@agentic-pm/core/db/repositories/event`
  - `@agentic-pm/core/artefacts/repository`

### Fixed

- **Critical Race Conditions** - Eliminated data corruption risks:
  - Budget tracking race condition (atomic DynamoDB operations)
  - Checkpoint state race condition (optimistic locking with version field)
  - Hold queue approval race condition (conditional updates)
- **Accessibility (WCAG 2.1 AA Compliance)**:
  - Added `aria-hidden="true"` to decorative skeleton loaders
  - Proper textarea labels for screen readers
  - `aria-live="polite"` for dynamic communication preview
  - Keyboard navigation improvements
- **Mobile Responsive Design**:
  - Collapsible sidebar for 375px+ viewports
  - Touch-friendly tap targets (min 44x44px)
  - Improved horizontal scrolling on small screens
- **Serverless Anti-Patterns**:
  - Moved autonomy state from Lambda memory to DynamoDB
  - Moved graduation evidence from Lambda memory to DynamoDB
  - All state now persisted, no in-memory state in Lambda
- **TypeScript Compilation** - Resolved all type errors (0 errors):
  - Fixed repository import paths and exports
  - Added missing event types (`action_executed`, `autonomy_level_changed`)
  - Extended agent status types (`stopped`, `never_run`)
  - Fixed null vs undefined type mismatches
  - Added type assertions for nested object access
- **ESLint Configuration** - Resolved all linting errors (0 errors):
  - Fixed monorepo ESLint config inheritance
  - Added `tsconfigRootDir` for proper path resolution
  - Removed unused type imports
  - Fixed import order violations (auto-fixed 72 files)
- **Test Suite Stability**:
  - Renamed hook test files from `.test.ts` to `.test.tsx` for JSX parsing
  - Fixed progress component test selectors
  - Simplified agent status hook tests
  - Added missing `afterEach` imports

### Changed

- **Event Type Enum** - Extended with new event types:
  - `action_executed` - For completed action execution
  - `autonomy_level_changed` - For autonomy level transitions
- **Agent Status Types** - Added new status values:
  - `stopped` - Agent manually stopped
  - `never_run` - Agent never started
- **Component Updates**:
  - Activity feed now displays action_executed and autonomy_level_changed events
  - Agent status component shows stopped and never_run states
  - Event type icon mapping includes new event types

### Security

- IAM isolation between triage and execution Lambda functions
- Prompt injection defences in two-pass triage
- Decision boundary enforcement with action allowlist
- Secrets Manager for all sensitive credentials
- Input validation with Zod schemas
- Lambda execution outside VPC (no NAT Gateway exposure)

## [0.1.0] - 2026-01-15

### Added

- Complete monorepo structure with 4 packages (core, lambdas, web, cdk)
- Phase 1-3 implementation planning (Sprints 0-19)
- DynamoDB single-table design with GSI and TTL configuration
- Claude API integration architecture with budget controls
- Jira Cloud integration via REST API v3
- Outlook integration design via Microsoft Graph API
- Two-pass triage pipeline (sanitise + classify)
- Hold queue system with 30-minute approval window
- Escalation workflow with decision presentation
- Autonomy levels and graduation ceremony design
- Mission Control dashboard architecture
- Budget degradation ladder (4 tiers)
- 10 comprehensive code reviews covering:
  - Security (prompt injection defences, IAM isolation)
  - Infrastructure (CDK stacks, cost optimisation)
  - Database (single-table design, access patterns)
  - Performance (Lambda cold starts, caching)
  - Frontend (Next.js App Router, SSR patterns)
