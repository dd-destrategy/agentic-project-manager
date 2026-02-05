# Agentic PM Workbench

A fully autonomous personal project management assistant. Monitors Jira and Outlook, maintains PM artefacts (RAID log, delivery state, backlog summary, decision log), and handles routine PM work with minimal human intervention.

## Status

**Pre-implementation.** Specification complete. Next steps: validation spikes (S1-S5), then Phase 1 build.

## Architecture

```
Browser → AWS Amplify (Next.js, SSR) → DynamoDB (single-table) ← Step Functions + Lambda
                                                                    ├── Jira Cloud API
                                                                    ├── MS Graph API (Outlook)
                                                                    ├── Claude API (Haiku/Sonnet)
                                                                    └── Amazon SES (notifications)
```

- **Budget ceiling:** $15/month total (AWS ~$5-8 + LLM ~$7)
- **Single user** — no multi-tenancy, no RBAC
- **LLM strategy:** Haiku 4.5 for triage (70%), Sonnet 4.5 for complex reasoning (30%)
- **Critical:** Lambda runs OUTSIDE VPC to avoid NAT Gateway costs ($33/month)

## Key Documents

| Document | Purpose |
|----------|---------|
| [`SPEC.md`](SPEC.md) | **Source of truth** — implementation-ready specification |
| [`CLAUDE.md`](CLAUDE.md) | Project instructions for Claude Code |
| [`REVIEW-product-ideation.md`](REVIEW-product-ideation.md) | 29-specialist product review |
| [`ANALYSIS-review-synthesis.md`](ANALYSIS-review-synthesis.md) | Synthesised analysis of the review |
| [`analysis-outputs/`](analysis-outputs/) | Raw analysis outputs (7 files) |
| [`aws-migration-analysis/`](aws-migration-analysis/) | AWS architecture analysis (6 files) |

## Tech Stack

| Component | Technology | Monthly Cost |
|-----------|-----------|--------------|
| Frontend | AWS Amplify, Next.js (App Router), shadcn/ui | ~$0.50 |
| Agent runtime | AWS Step Functions + Lambda | ~$1 |
| Database | DynamoDB (on-demand, single-table) | ~$0.25 |
| Scheduling | EventBridge Scheduler | ~$0 |
| Secrets | AWS Secrets Manager | ~$2 |
| Notifications | Amazon SES | ~$0 |
| Monitoring | CloudWatch | ~$1-2 |
| LLM | Claude API (tool-use) | ~$7 |
| Auth | NextAuth.js + Credentials | — |
| **Total** | | **~$11-13** |
