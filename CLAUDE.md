# Agentic PM Workbench — Project Instructions

## What This Project Is

A fully autonomous personal project management assistant. The agent monitors Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog summary, decision log), and handles routine PM work with minimal human intervention.

**Key constraints:**
- Personal tool only — single user, no multi-tenancy
- Budget ceiling: $10/month total (infrastructure + LLM)
- Scale: 1-2 active projects at a time
- MS Teams: deferred indefinitely (Azure AD admin consent barrier)

## Project Status

**Specification complete.** `SPEC.md` is the single source of truth. The repo also contains a 29-specialist product review and synthesised analysis that informed the spec.

Next steps: pre-code validation (spikes S1-S4), then Phase 1 Foundation implementation.

## Architecture Decisions (Locked)

- **Frontend:** Next.js App Router on Vercel (free hobby tier)
- **Agent runtime:** Hetzner VPS CX22 (~$4/month), persistent Node.js process, pm2, Caddy
- **Database:** Neon PostgreSQL (free tier, 0.5 GB), artefacts stored as structured JSONB
- **ORM:** Drizzle ORM
- **Auth:** NextAuth.js + Credentials provider (single user)
- **LLM:** Claude API — Haiku 4.5 for triage (85%), Sonnet 4.5 for complex reasoning (15%)
- **Integrations (MVP):** Jira Cloud, Outlook (Graph API), Resend (notifications)
- **No:** Redis, Pinecone, Pusher, S3, Vercel Blob, Vercel Cron, LangGraph, multi-user auth, RBAC, Slack, Teams, GitHub integration, SQLite for local dev

## Working Conventions

### Documentation
- `SPEC.md` is the source of truth for all implementation decisions
- Do not introduce SaaS or multi-tenant patterns
- British English spelling

### Code (when we reach implementation)
- TypeScript (strict mode) for all application code
- Next.js App Router for frontend
- Node.js for agent runtime
- PostgreSQL with Drizzle ORM
- Structured JSONB for artefact storage
- Claude tool-use (function calling) for all LLM structured outputs — no raw JSON.parse

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
| `# Fully Agentic PM Workbench - Complete .md` | Superseded | Original spec |
| `Original-Cloud-Hosting-Spec.md` | Superseded | Original cloud/UI spec |
| `PLAN-consolidated-spec.md` | Superseded | Consolidation plan (now complete) |
