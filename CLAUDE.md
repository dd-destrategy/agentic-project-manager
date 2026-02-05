# Agentic PM Workbench — Project Instructions

## What This Project Is

A fully autonomous personal project management assistant. The agent monitors Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog summary, decision log), and handles routine PM work with minimal human intervention.

**Key constraints:**
- Personal tool only — single user, no multi-tenancy
- Budget ceiling: $15/month total (AWS ~$5-8 + LLM ~$7)
- Scale: 1-2 active projects at a time
- MS Teams: deferred indefinitely (Azure AD admin consent barrier)

## Project Status

**Specification complete.** `SPEC.md` is the single source of truth. The repo also contains a 29-specialist product review and synthesised analysis that informed the spec.

Next steps: pre-code validation (spikes S1-S5), then Phase 1 Foundation implementation.

## Architecture Decisions (Locked)

- **Frontend:** Next.js App Router on AWS Amplify (~$0.50/month), hybrid SSR pattern
- **Agent runtime:** AWS Step Functions + Lambda (outside VPC), serverless orchestration
- **Database:** DynamoDB (on-demand, ~$0.25/month), single-table design
- **Scheduling:** EventBridge Scheduler (15-min main cycle, 1-min hold queue)
- **Secrets:** AWS Secrets Manager (~$2/month)
- **Auth:** NextAuth.js + Credentials provider (single user)
- **LLM:** Claude API — Haiku 4.5 for triage (70%), Sonnet 4.5 for complex reasoning (30%)
- **Integrations (MVP):** Jira Cloud, Outlook (Graph API), Amazon SES (notifications)
- **No:** VPS, Vercel, Neon PostgreSQL, NAT Gateway, Aurora Serverless, RDS, EC2, Redis, Pinecone, Pusher, S3, Vercel Blob, LangGraph, multi-user auth, RBAC, Slack, Teams, GitHub integration

## Working Conventions

### Documentation
- `SPEC.md` is the source of truth for all implementation decisions
- Do not introduce SaaS or multi-tenant patterns
- British English spelling

### Code (when we reach implementation)
- TypeScript (strict mode) for all application code
- Next.js App Router for frontend
- AWS Lambda for agent runtime (shared `@agentic-pm/core` library)
- DynamoDB with AWS SDK v3 (no ORM)
- Claude tool-use (function calling) for all LLM structured outputs — no raw JSON.parse
- AWS CDK for infrastructure-as-code

### Git
- Commit messages: conventional style, concise
- Do not push to remote without explicit permission
- Do not force push or reset --hard

## Key Files

| File | Status | Purpose |
|------|--------|---------|
| `SPEC.md` | **Active — source of truth** | Implementation-ready specification |
| `CLAUDE.md` | Active | Project instructions (this file) |
| `REVIEW-product-ideation.md` | Reference | 29-specialist product review |
| `ANALYSIS-review-synthesis.md` | Reference | Synthesised analysis of the review |
| `analysis-outputs/*.md` | Reference | Raw analysis outputs (7 files) |
| `aws-migration-analysis/*.md` | Reference | AWS architecture analysis (6 files) |
| `# Fully Agentic PM Workbench - Complete .md` | Superseded | Original spec |
| `Original-Cloud-Hosting-Spec.md` | Superseded | Original cloud/UI spec |
| `PLAN-consolidated-spec.md` | Superseded | Consolidation plan (now complete) |
