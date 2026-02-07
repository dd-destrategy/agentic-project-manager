# Agentic PM Workbench — Project Instructions

## What This Project Is

A fully autonomous personal project management assistant. The agent monitors
Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog
summary, decision log), and handles routine PM work with minimal human
intervention.

**Key constraints:**

- Personal tool only — single user, no multi-tenancy
- Budget ceiling: $15/month total (AWS ~$5-8 + LLM ~$7)
- Scale: 1-2 active projects at a time
- MS Teams: deferred indefinitely (Azure AD admin consent barrier)

## Project Status

**Phase 1 complete. Phase 2/3 in progress.**

| Phase                  | Status            | Notes                                         |
| ---------------------- | ----------------- | --------------------------------------------- |
| Phase 0 (Pre-code)     | Complete          | Spikes validated                              |
| Phase 1 (Foundation)   | **Complete**      | All 11 tasks done                             |
| Phase 2 (Core Product) | **~85% complete** | Integration health and daily digest remaining |
| Phase 3 (Enhancements) | **~75% complete** | Outlook deferred, most features done          |
| Ingestion Interface    | **Complete**      | Added Feb 2026, not in original spec          |

## Architecture Decisions (Locked)

- **Frontend:** Next.js App Router on AWS Amplify (~$0.50/month), hybrid SSR
  pattern
- **Agent runtime:** AWS Step Functions + Lambda (outside VPC), serverless
  orchestration
- **Database:** DynamoDB (on-demand, ~$0.25/month), single-table design
- **Scheduling:** EventBridge Scheduler (15-min main cycle, 1-min hold queue)
- **Secrets:** AWS Secrets Manager (~$2/month)
- **Auth:** NextAuth.js + Credentials provider (single user)
- **LLM:** Claude API — Haiku 4.5 for triage (70%), Sonnet 4.5 for complex
  reasoning (30%)
- **Integrations (MVP):** Jira Cloud, Outlook (Graph API), Amazon SES
  (notifications)
- **No:** VPS, Vercel, Neon PostgreSQL, NAT Gateway, Aurora Serverless, RDS,
  EC2, Redis, Pinecone, Pusher, Amazon Bedrock AgentCore, S3, Vercel Blob,
  LangGraph, multi-user auth, RBAC, Slack, Teams, GitHub integration

## Working Conventions

### Documentation

- `SPEC.md` is the source of truth for all implementation decisions
- `DEVELOPMENT.md` is the engineering guide with sprint tasks
- Do not introduce SaaS or multi-tenant patterns
- British English spelling

### Code (when we reach implementation)

- TypeScript (strict mode) for all application code
- Next.js App Router for frontend
- AWS Lambda for agent runtime (shared `@agentic-pm/core` library)
- DynamoDB with AWS SDK v3 (no ORM)
- Claude tool-use (function calling) for all LLM structured outputs — no raw
  JSON.parse
- AWS CDK for infrastructure-as-code
- Zod for runtime schema validation
- TanStack Query for frontend data fetching with 30-second polling
- shadcn/ui component library (no runtime cost)
- Vitest for unit tests, Playwright for E2E tests

### Git

- Commit messages: conventional style, concise
- Development branch: `feature/phase-1-foundation`
- Do not push to remote without explicit permission
- Do not force push or reset --hard

## Key Files

| File                   | Status                         | Purpose                                  |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| `SPEC.md`              | **Active — source of truth**   | Implementation-ready specification       |
| `DEVELOPMENT.md`       | **Active — engineering guide** | Sprint breakdown, tasks, standards       |
| `CLAUDE.md`            | Active                         | Project instructions (this file)         |
| `docs/README.md`       | Active                         | Documentation index                      |
| `docs/design/`         | Reference                      | Solution design package (9 documents)    |
| `docs/archive/`        | Archive                        | Historical analysis and review documents |
| `docs/swarm-review.md` | Active                         | 11-team codebase review findings         |
