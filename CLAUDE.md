# Agentic PM Workbench — Project Instructions

## What This Project Is

A fully autonomous personal project management assistant. The agent monitors Jira, Asana, MS Teams, and Outlook, maintains PM artefacts (RAID log, delivery state, backlog, decisions), and handles routine PM work with minimal human intervention.

**Key constraints:**
- Personal tool only — single user, no multi-tenancy
- Budget ceiling: $10/month total (infrastructure + LLM)
- Scale: 1-2 active projects at a time
- MS Teams: read/monitor only, no posting

## Project Status

Currently in **specification and design phase**. No application code yet. The repo contains:
- Product vision and spec documents
- Consolidated plan for iterating toward an implementation-ready spec

## Architecture Decisions (Locked)

- **Frontend:** Next.js on Vercel (free hobby tier)
- **Agent runtime:** Hetzner VPS (~$4/month), persistent Node.js process
- **Database:** Neon PostgreSQL (free tier), artefacts stored as structured JSON
- **LLM:** Claude API — Haiku for routine triage (85%), Sonnet for complex reasoning (15%)
- **Integrations:** Jira, Asana, MS Teams (read-only via Graph API), Outlook
- **No:** Redis, Pinecone, Pusher, S3, multi-user auth, RBAC

## Working Conventions

### Documentation
- Spec documents use Markdown
- Architecture decisions should reference the consolidated plan in `PLAN-consolidated-spec.md`
- When modifying specs, keep the single-user/personal-tool framing — do not introduce SaaS or multi-tenant patterns

### Code (when we reach implementation)
- TypeScript for all application code
- Next.js App Router for frontend
- Node.js for agent runtime
- PostgreSQL with Drizzle ORM (or Prisma — TBD)
- Structured JSON for artefact storage in DB

### Git
- Commit messages: conventional style, concise
- Do not push to remote without explicit permission
- Do not force push or reset --hard

## Key Files

| File | Purpose |
|------|---------|
| `# Fully Agentic PM Workbench - Complete .md` | Original product vision and full spec |
| `Orgiinal and Cloud Hosting Specif.ini` | Original cloud hosting and UI spec |
| `PLAN-consolidated-spec.md` | Analysis resolving contradictions, MVP scope, architecture decisions |

## Integration Notes

### Jira / Asana
- Both are used across different projects
- MVP: support whichever the active project uses, then add the other
- Each integration is ~2-3 weeks of work

### MS Teams (Microsoft Graph API)
- Read-only: monitor channel messages for signals
- Requires Azure AD app registration with application permissions
- No bot registration or Adaptive Cards needed

### Outlook
- Used for stakeholder communication
- Agent reads incoming email, sends status reports and escalations
- Uses Microsoft Graph API (same Azure AD app as Teams)

## Agent Autonomy Levels

| Level | Name | What agent does autonomously |
|-------|------|------------------------------|
| 1 | Monitoring | Observe and log only, no actions |
| 2 | Artefact | Maintain artefacts (RAID, delivery state), send routine internal updates |
| 3 | Tactical | Handle routine PM work, send reports, respond to routine questions |
| 4 | Strategic | Most decisions autonomous (future — not in MVP) |

MVP starts at Level 1 and graduates to Level 2, then Level 3.
