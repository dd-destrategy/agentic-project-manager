## Gap Frequency Analysis

### Critical Gaps (flagged by 4+ specialists)
| Gap | Flagged By | Impact if Unresolved |
|-----|-----------|---------------------|
| **Artefact JSON schemas undefined** -- No structured definition for RAID log, delivery state, backlog, decision log, or any artefact type | PM, Architect, Engineer, QA, DBA, AI/ML, Backend, Writer, Content Strategist, Data, Designer, Visionary (12 specialists) | Blocks agent development, prompt design, frontend rendering, and database schema. Single largest blocker for moving from spec to code. |
| **Error/degradation/failure states unspecified** -- No defined UI or agent behavior when integrations fail, Claude API errors, VPS down, DB unreachable, credentials expire | PM, Engineer, SRE, Frontend, Designer, Motion, Backend, Writer, Content Strategist, Journey Designer, UX Psychologist (11 specialists) | Agent fails silently; user sees happy-path UI while system is broken. Trust destroyed on first failure encounter. |
| **Agent heartbeat / health monitoring / liveness absent** -- No mechanism to detect if agent is alive, distinguish "idle" from "crashed," or alert on downtime | Architect, DevOps, SRE, Cloud, Backend, Frontend, Perf, Journey Designer (8 specialists) | Agent could be dead for days with no one noticing. Dashboard shows stale data with no warning. Dead man's switch mentioned but never specified. |
| **Empty state / first-run / onboarding experience missing** -- No designs for zero-project dashboard, first-run wizard, bootstrap review flow, or "nothing to show" states | PM, Frontend, Designer, Motion, Journey Designer, Storyteller, UX Psychologist (7 specialists) | First impression is a blank page. User dropout at the highest-risk adoption moment. No guidance through integration setup. |
| **Neon cold start / connection pooling unaddressed** -- 15-min polling guarantees cold DB on every cycle; no pooling strategy for Vercel serverless | Architect, Engineer, Cloud, DBA, SRE, Perf (6 specialists) | 2-5 second latency penalty on every agent cycle and every dashboard load. Combined with Vercel 10s limit, API routes may timeout. |
| **Vercel 10-second function limit impact unaddressed** -- Frontend API routes face cold Neon + query time that could exhaust the 10s budget | Architect, Engineer, Cloud, Frontend, Backend, Perf (6 specialists) | Dashboard API calls timeout on cold days. No LLM calls possible from frontend. Complex queries fail silently. |
| **Budget monitoring / LLM cost controls missing** -- No daily/monthly spend tracking, circuit breakers, or degradation ladder when approaching $10/month | PM, Cloud, AI/ML, Data, Commercial, Researcher (6 specialists) | A single bad week or buggy loop burns through entire monthly budget in hours. No visibility into spend until invoice arrives. |
| **VPS provisioning / hardening / operations unspecified** -- No script, runbook, firewall rules, SSH config, process supervision, or security measures for the most privileged component | DevOps, Security, Cloud, Engineer, SRE (5 specialists) | VPS compromise exposes all OAuth tokens, API keys, and DB credentials. No recovery if VPS needs rebuilding. |
| **Agent state / checkpoints / deduplication / idempotency undefined** -- No watermark/cursor tracking, no crash recovery, no duplicate-processing prevention | Architect, Engineer, DBA, Backend, SRE (5 specialists) | Agent re-processes old data after restart, sends duplicate emails, creates duplicate RAID entries. Data corruption over time. |
| **Autonomy level graduation criteria undefined** -- No measurable conditions for Level 1->2->3 transitions | PM, QA, Strategist, UX Psychologist, Journey Designer (5 specialists) | User either promotes agent too early (mistakes with real consequences) or too late (agent provides no value). Transitions feel arbitrary. |
| **Prompt engineering / structured output schemas missing** -- Placeholder prompts only; no tool-use schemas, no context window budget, no output validation | Engineer, QA, AI/ML, Backend, Writer (5 specialists) | Agent crashes on malformed JSON from Claude. Output quality is unpredictable. Core product IP is unspecified. |
| **Credential / token lifecycle management absent** -- No refresh flow, expiry detection, re-auth UX, or revocation handling for OAuth tokens across 4 integrations | PM, Security, Engineer, Backend, Journey Designer (5 specialists) | Integrations silently stop working when tokens expire. User has no path to reconnect. Agent operates on stale data. |
| **LLM API pricing estimates outdated** -- Budget model uses Haiku 3 pricing ($0.25/$1.25); current Haiku 4.5 is $1.00/$5.00 (4x more expensive) | PM, Engineer, Cloud, Commercial, Researcher (5 specialists) | $10/month budget is unachievable at current pricing without prompt caching, batch API, or model version pinning. Entire financial model invalidated. |
| **Data retention / cleanup policy missing** -- No archival strategy for agent_actions, artefact versions, or escalation history against 0.5GB Neon ceiling | PM, Cloud, DBA, Data (4 specialists) | Database fills within months. System stops accepting writes. No mechanism to reclaim storage. |
| **Database migration strategy undefined** -- Two deployment targets (Vercel + VPS) share one DB; unclear which runs migrations, in what order, with what backward compatibility | Architect, Engineer, DevOps, DBA (4 specialists) | Schema changes break running agent or frontend. Race conditions on deploy. Cannot evolve the data model safely. |
| **Integration adapter contracts / API details missing** -- No defined interface, auth flows, data normalization, rate limit budgets, or pagination handling per integration | Architect, Engineer, Backend, Writer (4 specialists) | Each integration implemented differently. Testing impossible. No consistency in error handling or data shapes. |
| **Notification strategy / delivery channels unspecified** -- No definition of how user learns about escalations, digests, health issues (email? push? in-app only?) | PM, Content Strategist, Mobile, Journey Designer (4 specialists) | User never learns about pending escalations unless they remember to open the dashboard. Agent's work goes unseen. |
| **Confidence scoring mechanism unreliable** -- 80% auto-execute threshold uses uncalibrated LLM self-reported confidence with no ground truth | QA, AI/ML, Data, UX Psychologist (4 specialists) | Agent confidently takes wrong actions. No way to test calibration. Most dangerous quality risk in the system. |
| **Escalation lifecycle incomplete** -- No spec for what happens after user decides, re-escalation, timeout, aging, or the full data model | PM, DBA, Content Strategist, Journey Designer (4 specialists) | Decisions disappear into a void. Agent cannot confirm it understood. Stale escalations pile up with no resolution path. |
| **Log management / structured logging absent** -- No log format, rotation, retention, or shipping strategy for persistent VPS process | DevOps, SRE, Cloud, Backend (4 specialists) | Disk fills with unrotated logs. Debugging requires SSH and guessing. No observability into agent behavior. |

### Important Gaps (flagged by 2-3 specialists)
| Gap | Flagged By | Impact if Unresolved |
|-----|-----------|---------------------|
| **Testing strategy / sandbox / mocking undefined** -- No test framework, mock APIs, golden scenarios, or evaluation methodology | QA, Engineer, DevOps | Cannot validate agent behavior safely. Non-deterministic system goes untested. Regressions invisible. |
| **Authentication mechanism unspecified** -- "Passkey or basic password" never committed; no session management, CSRF, or timeout defined | Architect, Security, Frontend | Frontend development blocked. Weak auth on a tool holding 4 organization integrations creates security risk. |
| **Deployment pipeline for VPS agent missing** -- No CI/CD, no blue-green strategy, no health check post-deploy | DevOps, Engineer, Cloud | Every deploy is manual SSH + git pull. Forgot-to-deploy bugs. No rollback procedure. |
| **Agent voice / tone / communication style unspecified** -- No style guide for internal dashboard text or external stakeholder communications | Storyteller, Content Strategist, UX Psychologist | Agent-generated emails sound like a chatbot, not the PM. Stakeholder trust damaged. Inconsistent tone across outputs. |
| **Conflicting signals from multiple integrations unresolved** -- No conflict resolution hierarchy when Jira says "Done" but Teams says "not finished" | PM, QA, Content Strategist | Agent takes actions based on wrong source of truth. Incorrect artefact updates propagate. |
| **Project lifecycle (create/bootstrap/archive) unspecified** -- No archival, reactivation, or dormancy handling | PM, Writer, Journey Designer | Dead projects waste API calls and LLM tokens. No way to reactivate. No cleanup on completion. |
| **Rollback / undo for agent actions undefined** -- Claim of "reversible" actions not validated per action type; email recall unreliable | QA, Journey Designer, Visionary | User discovers "undo" does not work for emails already read. Trust collapse on first irreversible mistake. |
| **Secret management on VPS ad-hoc** -- No defined storage, rotation, or protection for API keys and tokens on bare VPS | DevOps, Security | Credentials in .env files, visible in process listings or shell history. Single compromise exposes everything. |
| **Local development environment missing** -- No way to run agent locally, mock APIs, or test prompts without burning tokens | Engineer, DevOps | Slow iteration. Every test costs real API credits. Cannot develop offline. |
| **Network security between VPS and Neon unspecified** -- No IP allowlisting, SSL pinning, or connection authentication | Security, Cloud | Anyone with the connection string can access all data. Database exposed on public internet. |
| **Accessibility (color-only indicators, keyboard nav)** -- Status communicated solely via color; no keyboard alternatives for key interactions | A11y, Designer | Fails WCAG 1.4.1. 8% of male users cannot distinguish status colors. Keyboard-only users locked out of decisions. |
| **Mobile responsive design missing** -- No breakpoints, no mobile layouts, no touch target enforcement | Mobile, Designer | Tool unusable on phone during meetings -- the exact scenario where quick triage is most valuable. |
| **Backup strategy for VPS and/or Neon free tier** -- No backup for VPS local state; Neon free tier has only 7-day branch history | DevOps, Cloud | VPS disk failure loses all configuration. Neon data loss has no point-in-time recovery. |
| **Prompt injection defense missing** -- External content from Jira/Teams/Outlook interpolated directly into LLM prompts | Security, Researcher | Malicious Jira ticket or email can instruct agent to exfiltrate data or send unauthorized communications at Level 3. |
| **Document contradictions / superseded decisions still live in repo** -- Original specs recommend Slack, Pusher, Redis, S3, multi-tenancy; no deprecation banners | Writer, Copy Editor, Engineer | Developer reads wrong spec, builds wrong integration. Confusion about authoritative source persists. |
| **Agent explainability / reasoning transparency missing from UI** -- Activity feed shows actions but not why agent made choices | UX Psychologist, Visionary | User cannot build trust without seeing reasoning. "Black box" agent undermines the entire autonomy graduation model. |
| **Webhook vs polling decision deferred** -- 15-minute polling may miss time-sensitive signals; webhook infrastructure not designed | Cloud, Visionary | Agent consistently 14 minutes late to crises. Trust erodes for risk detection use case. |
| **Agent loop overlapping / timing undefined** -- No spec for what happens when a cycle exceeds 15 minutes | QA, Perf | Cycles stack, duplicate processing, resource exhaustion on VPS. |

### Single-Specialist Gaps (but high impact)
| Gap | Flagged By | Why It Matters |
|-----|-----------|---------------|
| **Timezone model absent** -- No specification for how timestamps are stored, displayed, or converted; VPS in Europe, user in Australia | i18n | Every timestamp in reports, artefacts, and the dashboard could be wrong. DST transitions break polling. "Tomorrow" is ambiguous across timezones. |
| **Performance budgets undefined** -- No targets for dashboard load time, agent cycle duration, or signal-to-action latency | Perf | No way to measure or prevent performance degradation. "Slow" is subjective until it is too late. |
| **Context decay / provenance tracking absent** -- Artefact entries lose connection to source signals over time | Visionary | RAID log entries become assertions without evidence. Cannot trace back to original Jira ticket or Teams message. |
| **Jira Cloud vs Server/Data Center never specified** -- Different APIs, auth, data models | Backend | Building against wrong API variant. Jira Server uses different endpoints and auth flow entirely. |
| **Automation complacency at Level 3** -- User vigilance degrades over time; no anti-complacency countermeasures | UX Psychologist | After months of correct operation, user stops reviewing. First significant error goes unnoticed for days. |
| **Decision fatigue in escalation flow** -- No triage assistance when 5-8 escalations arrive simultaneously | Journey Designer | User overwhelmed by flat list of urgent decisions. No "snooze" or "defer" mechanism. |
| **n8n as alternative orchestration layer not evaluated** -- Could replace custom agent code with visual workflow builder + 400 pre-built integrations | Researcher | Potential 50-70% reduction in development effort not considered. |
| **"Time Saved" metric has no data source** -- Dashboard displays "8.5 hours saved" with no calculation methodology | Data | Metric is fiction. User resentment if number does not match felt experience. |
| **Neon free tier storage is 0.5GB, not 10GB** -- Original spec claims 10GB; actual limit is 20x smaller | Cloud, DBA, Data | Storage projections and architecture decisions based on incorrect data. 0.5GB requires active management. |
| **Build vs buy not analyzed** -- No comparison against Zapier/Make + Jira Rovo + existing AI PM tools | Strategist, Researcher | 200-400 hours of development may replicate what existing tools provide at lower cost and zero dev time. |
| **Success/failure criteria for the project itself** -- No exit criteria to prevent sunk-cost-driven overinvestment | Strategist | No rational stopping point. Feature creep consumes months of effort with no payback evaluation. |
| **Activity feed performance at scale** -- Thousands of entries accumulate; no pagination or virtualization | Frontend | Dashboard becomes unusable after months of operation. Query performance degrades. |
| **VPS backup strategy absent** -- pm2 config, .env files, logs all live only on VPS disk | DevOps | Disk failure means rebuilding from memory. No documented recovery procedure. |
| **Content summarization rules for daily digest** -- No spec for what is included, rolled up, or highlighted | Content Strategist | Digest is either a raw log dump (noise) or misses critical items. 2-minute scan target unachievable. |
| **Microsoft Graph delta queries not mentioned** -- Polling by timestamp instead of deltaLink is fragile and inefficient | Backend | Clock skew, pagination issues, missed messages. Correct Graph API pattern not specified. |
| **Agent-generated content quality gates absent** -- No review-before-send for content quality (only for action authorization) | Content Strategist | Poorly-worded email sent to executive under user's identity. Reputational damage. |
| **Non-English input signals unhandled** -- Prompts assume English; team members may post in other languages | i18n | Agent misinterprets or ignores non-English Jira comments and Teams messages from offshore team members. |
| **"Kill switch" framing psychologically wrong** -- Naming implies danger, undermines trust; should be "mode selector" or "trust dial" | UX Psychologist | User subconsciously perceives agent as dangerous. Adversarial framing instead of collaborative. |

### Questions Requiring Answers
| Question | Asked By | Blocks |
|----------|---------|--------|
| How does the user authenticate to the Vercel frontend? (Passkey vs password vs OAuth) | Architect, Security, Frontend | Frontend development, session management, middleware design |
| How does the agent handle conflicting signals from different integrations? (e.g., Jira says "Done", Teams says "not finished") | PM, QA, Content Strategist | Artefact update logic, conflict resolution hierarchy, trust in agent output |
| What is the agent's behavior during non-working hours? (Poll at 3am? Queue for Monday?) | PM | Polling architecture, cost model, notification strategy, quiet-hours config |
| How does the agent send emails via Outlook? (Mail.Send permission, org restrictions) | Engineer, Backend | Outlook integration feasibility, Azure AD permission scoping |
| What happens when the agent loop takes longer than the polling interval? | QA, Perf | Agent loop design, overlap prevention, resource management |
| How are database migrations handled across two deployment targets (Vercel + VPS)? | DevOps | Schema evolution workflow, deployment pipeline, backward compatibility |
| What happens when the Hetzner VPS goes down? (Detection, alerting, recovery) | Cloud, SRE, Perf | Monitoring infrastructure, recovery runbook, downtime notification |
| What happens to in-flight work when the agent crashes mid-cycle? | SRE | Crash recovery semantics, idempotency requirements, data integrity |
| What organizational data flows through Claude API? (Confidentiality, compliance) | Security | Legal/compliance approval, data classification, API usage policies |
| How large will the prompt context be for a typical reasoning call? | AI/ML | Token budget, cost model validation, context assembly design |
| What is the expected size of a single artefact's JSONB content? | DBA | Storage budget validation, version history feasibility, 0.5GB planning |
| How does the `trigger_conditions` table map to the simplified single-user model? | DBA | Schema design, agent configuration model |
| What counts as a "signal" and how granular is the log? | Data | Storage consumption, query complexity, signal definition |
| Who is the audience for these documents? | Writer | Document tone, content decisions, SaaS vs personal framing |
| Is "artefact" the final spelling? (British vs American) | Copy Editor | Database columns, API fields, UI labels -- cascades into all code |
| Who are the stakeholders in the narrative, and do they know they are interacting with an agent? | Storyteller | Ethics, transparency, email signatures, stakeholder trust |
| How does the agent handle conflicting information across sources? | Content Strategist | Content reconciliation logic, user-facing conflict presentation |
| What is the content model for the "Custom" decision option in escalations? | Content Strategist | Decision interface implementation, freeform input handling |
| What happens when the agent is wrong and acts autonomously? (Communication quarantine concept) | Visionary | Safety net design, outbound message hold period, trust recovery |
| Is Outlook send capability actually needed in MVP? (Draft-only alternative) | Strategist | Integration scope, risk reduction, MVP feature prioritization |
| What is the opportunity cost of building vs. doing PM work? | Commercial | Go/no-go decision, ROI validation |
| Has the user evaluated cheaper/faster alternatives? (RAIDLOG.com, Stepsize, n8n) | Researcher | Build-vs-buy validation, MVP scope justification |
| What happens emotionally when the agent makes its first significant mistake? | UX Psychologist | Trust recovery UX design, error presentation, agent apology patterns |
| What is the responsive breakpoint strategy? | Designer, Mobile | Frontend implementation, design system, CSS architecture |
| What is the target frame rate and device profile? | Motion | Animation performance, GPU compositing strategy |
| Will the "Live" indicator be announced to screen readers? | A11y | ARIA live region design, accessibility compliance |
| How are "quick actions" (Approve/Reject) distinguished from full review actions accessibly? | A11y | Accessible button naming, screen reader experience |
| Will the implementation enforce minimum touch target sizing (44px)? | Mobile | Component library configuration, mobile usability |
| How does the agent handle Outlook send permissions at different autonomy levels? | Backend | Action authorization flow, data model for pending actions |
| What does the dashboard look like before any projects are connected? | Journey Designer | Empty state design, first-run UX |
| How does the user know the agent is actually working between polls? | Journey Designer | Heartbeat logging, "nothing to report" UX, trust building |
| What currency does the agent use when reporting budget figures? | i18n | Report formatting, locale configuration |
| What happens when the Hetzner VPS reboots? (Process restart, missed cycles) | Perf | Process supervision (systemd/pm2), auto-start configuration |

### Total Gap Count by Specialist
| Specialist | Gaps Raised | Questions Raised | Missing Specs |
|-----------|------------|-----------------|---------------|
| PM | 3 | 2 | 7 |
| Architect | 3 | 1 | 6 |
| Engineer | 2 | 1 | 8 |
| QA | 2 | 2 | 8 |
| DevOps | 4 | 1 | 10 |
| Cloud | 2 | 1 | 8 |
| DBA | 2 | 2 | 7 |
| Security | 4 | 1 | 8 |
| SRE | 3 | 1 | 7 |
| Frontend | 2 | 1 | 6 |
| Designer | 3 | 1 | 8 |
| Motion | 2 | 1 | 6 |
| A11y | 4 | 2 | 8 |
| Mobile | 2 | 1 | 5 |
| Backend | 2 | 1 | 8 |
| AI/ML | 2 | 1 | 8 |
| Data | 2 | 1 | 7 |
| Writer | 3 | 1 | 7 |
| Copy Editor | 0 | 1 | 4 |
| Storyteller | 2 | 1 | 5 |
| Content Strategist | 3 | 2 | 7 |
| Visionary | 2 | 1 | 0 |
| Strategist | 2 | 1 | 4 |
| UX Psychologist | 1 | 1 | 6 |
| Commercial | 2 | 1 | 6 |
| Researcher | 2 | 1 | 6 |
| Perf | 2 | 1 | 6 |
| i18n | 3 | 1 | 6 |
| Journey Designer | 3 | 2 | 9 |
| **TOTALS** | **69** | **33** | **191** |

---

**Summary statistics:**
- **69 explicit [GAP] tags** across all 29 specialists
- **33 explicit [QUESTION] tags** across all 29 specialists
- **191 Missing Specification bullet points** across all 29 specialists
- **293 total gaps/questions/missing specs** catalogued
- The single most frequently flagged gap (artefact JSON schemas) was raised by **12 specialists** independently
- The top 5 gaps by frequency were each flagged by **6-12 specialists**
- **DevOps** raised the most individual items (15 total: 4 gaps + 1 question + 10 missing specs)
- **Journey Designer** was close behind (14 total: 3 gaps + 2 questions + 9 missing specs)
- **Copy Editor** raised the fewest (5 total: 0 gaps + 1 question + 4 missing specs), though contributed heavily through CONCERNs not counted here
- **Visionary** raised no Missing Specifications (contributed through recommendations and vision framing instead)
