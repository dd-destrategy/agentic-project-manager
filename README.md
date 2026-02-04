# Agentic PM Workbench

A fully autonomous personal project management assistant. Monitors Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog summary, decision log), and handles routine PM work with minimal human intervention.

## Status

**Pre-implementation.** Specification complete. Next steps: validation spikes, then Phase 1 build.

## Architecture

```
Browser → Vercel Pro (Next.js, SSR) → Neon PostgreSQL (free tier) ← Hetzner VPS (~$4/mo, agent process)
                                                                      ├── Jira Cloud API
                                                                      ├── MS Graph API (Outlook)
                                                                      ├── Claude API (Haiku/Sonnet)
                                                                      └── Resend (notifications)
```

- **Budget ceiling:** $35/month total (Vercel Pro $20 + VPS $4 + LLM ~$7 + buffer)
- **Single user** — no multi-tenancy, no RBAC
- **LLM strategy:** Haiku 4.5 for triage (70%), Sonnet 4.5 for complex reasoning (30%)

## Key Documents

| Document | Purpose |
|----------|---------|
| [`SPEC.md`](SPEC.md) | **Source of truth** — implementation-ready specification |
| [`CLAUDE.md`](CLAUDE.md) | Project instructions for Claude Code |
| [`REVIEW-product-ideation.md`](REVIEW-product-ideation.md) | 29-specialist product review |
| [`ANALYSIS-review-synthesis.md`](ANALYSIS-review-synthesis.md) | Synthesised analysis of the review |
| [`analysis-outputs/`](analysis-outputs/) | Raw analysis outputs (7 files) |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js (App Router), shadcn/ui, TanStack Query |
| Agent runtime | Node.js, pm2, Caddy |
| Database | Neon PostgreSQL, Drizzle ORM |
| LLM | Claude API (tool-use for structured outputs) |
| Auth | NextAuth.js + Credentials |
| Notifications | Resend |
| Hosting | Vercel Pro (frontend), Hetzner VPS (agent) |
