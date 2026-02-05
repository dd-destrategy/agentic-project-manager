## Contradictions & Tensions

### Direct Contradictions

**1. Process Management: PM2 vs systemd**
- **Topic:** How to supervise the Node.js agent process on the VPS
- **Position A:** Engineer says "Use PM2 on the VPS for process management. It handles automatic restarts, log rotation, memory limit enforcement, and basic monitoring out of the box." DevOps agrees: "Run the agent under pm2 with an ecosystem config file checked into the repo."
- **Position B:** SRE says "Use systemd to manage the agent process... Do not use pm2 or forever -- systemd is already on the VPS and is the correct tool for a long-running service on Linux." Backend concurs: "Run the Hetzner agent under systemd with a watchdog timer, not just PM2."
- **Resolution needed:** Pick one. PM2 offers developer-friendly CLI and log management. systemd is already present, lighter weight, and the Linux-native answer. Both work. This must be decided before the VPS provisioning script is written.

---

**2. Authentication Mechanism: Four Incompatible Recommendations**
- **Topic:** How the single user authenticates to the Vercel frontend
- **Position A:** Architect says "a shared secret (long random token) stored as an environment variable, checked via middleware on every request, set as an HTTP-only cookie after initial login."
- **Position B:** Security says "Use passkey (WebAuthn) authentication for the Vercel frontend... Add a session timeout of 8 hours and require re-authentication for sensitive actions."
- **Position C:** Frontend says "NextAuth.js with a Credentials provider and a single hardcoded user. No OAuth, no database user table."
- **Position D:** The Phase 4 Decision Points table recommends "NextAuth + Google OAuth -- verify single email, MFA for free."
- **Resolution needed:** These are mutually exclusive. The choice affects session management, middleware, library dependencies, and the frontend `/api/auth` route structure. Security's position is the strongest from a threat perspective (this system holds tokens for four organizational integrations), but Architect's is the simplest. The Phase 4 recommendation (Google OAuth) contradicts both CLAUDE.md ("no OAuth complexity") and the consolidated plan ("passkey or basic password").

---

**3. Artefact Version History: Full Table vs Single Column**
- **Topic:** How to store previous versions of artefacts
- **Position A:** Architect says "Version history can be implemented with a simple `artefact_versions` table that stores the previous `content` JSONB, a `changed_at` timestamp, and a `changed_by` enum."
- **Position B:** DBA says "I would propose a single `previous_version JSONB` column per artefact (one-deep undo)... rather than a full `artefact_versions` table that would consume storage rapidly. At 1-2 projects with ~10 artefacts each, a delivery_state JSON blob of 20-50KB updated every 15 minutes would generate ~70MB/month of version history if stored naively. That burns through 0.5GB in two months."
- **Resolution needed:** The DBA has done the math and the Architect has not. At 0.5GB total storage, a full version table is unaffordable. But one-deep undo means you lose all history beyond the previous version. The Data specialist offers a middle ground (30-day rolling window with daily aggregation), but this still requires a separate table. The storage budget forces this decision.

---

**4. Agent State Storage: JSONB Blob vs Dedicated Table**
- **Topic:** How to track per-integration polling state (watermarks, cursors, last-polled timestamps)
- **Position A:** Architect says "Use a single `agent_state` JSONB column per project rather than a separate table. Add a `state JSONB` column to the `projects` table... This avoids a proliferation of small state-tracking tables."
- **Position B:** DBA says "I would model this as a dedicated `agent_checkpoints` table with a composite key of `(project_id, integration, checkpoint_key)` rather than a single JSONB blob, because individual checkpoints need atomic updates without read-modify-write races."
- **Resolution needed:** The DBA is technically correct -- a JSONB blob requires read-modify-write, which creates a race condition if the agent crashes mid-update. The Architect's approach is simpler. For a single-user tool with one polling loop, the race condition is unlikely but the DBA's point about atomic updates is a correctness concern, not just a preference.

---

**5. Webhook Strategy: Three Incompatible Recommendations**
- **Topic:** Whether to use webhooks or polling for each integration
- **Position A:** Cloud says "Adopt webhook-first for Jira and Outlook, polling-only for Teams. This reduces unnecessary API calls and Claude invocations by 60-80%."
- **Position B:** Architect says "Start with polling, design for webhooks. Deploy the VPS behind Caddy from day one with a domain name and TLS."
- **Position C:** Backend says "webhook-first for Jira... polling-first for Teams... and delta-query polling for Outlook (simpler than webhook subscription management for a single user)." This directly contradicts Cloud on Outlook.
- **Resolution needed:** Cloud and Backend disagree specifically on Outlook -- Cloud says webhook, Backend says delta-query polling. Backend's reasoning (webhook subscriptions expire and require renewal management) is pragmatic. Cloud's reasoning (reduce API calls) is cost-motivated. The Phase 4 decision table says "Polling first" across the board, which contradicts all three specialists.

---

**6. SaaS Optionality: Keep user_id vs Strip All Multi-User Patterns**
- **Topic:** Whether to preserve a `user_id` column for future SaaS conversion
- **Position A:** Commercial says "In the database schema, keep a `user_id` column on key tables even if it is always the same value... The consolidated plan explicitly strips `owner_id` -- I would push back on that specific decision."
- **Position B:** DBA says "Drop `users`, `project_collaborators`, `trigger_conditions` entirely. Remove all `owner_id` and `user_id` foreign keys."
- **Position C:** CLAUDE.md (project instructions) explicitly states: "do not introduce SaaS or multi-tenant patterns."
- **Resolution needed:** Commercial is directly contradicting both the DBA and the project's own instructions. The consolidated plan explicitly removed multi-user patterns. This is a strategic disagreement about whether optionality is worth 5% schema complexity.

---

**7. Agent Architecture: Custom Code vs n8n**
- **Topic:** Whether to build a custom Node.js agent or use n8n as the orchestration layer
- **Position A:** Architect, Engineer, Backend, DevOps, and QA all assume a custom Node.js agent process with custom integration adapters, a custom state machine, and custom polling logic.
- **Position B:** Researcher says "The n8n 'Ghost PM' pattern is a serious alternative architecture worth evaluating... could deliver 70-80% of the spec's value with significantly less custom code, running on the same Hetzner VPS. This could compress the development timeline from 12 weeks to 4-6 weeks." Strategist agrees: "Evaluate n8n or similar for the integration/polling layer. Self-hosting n8n on the Hetzner VPS costs nothing extra."
- **Resolution needed:** This is a fundamental architecture question that the review's own Phase 4 decision table does not address. If n8n is viable, it invalidates weeks of custom integration work that five specialists have planned in detail. This needs a spike before any agent code is written.

---

**8. LLM Budget: Hard Ceiling vs Soft Target**
- **Topic:** Whether $10/month is a strict cutoff or an aspirational target
- **Position A:** Visionary says "The $10/month budget ceiling, while admirable for discipline, may become a constraint that compromises the core thesis... The budget should be treated as a target, not a hard ceiling -- with monitoring and alerts rather than hard cutoffs that degrade agent intelligence at the worst possible moment."
- **Position B:** Cloud says "Implement a hard Claude API spend cap from day one... If daily spend exceeds $0.25, the agent should drop to monitoring-only mode." Commercial agrees: "Implement cost controls as a Phase 0 task... An automatic circuit breaker that drops the agent to monitoring-only mode."
- **Position C:** Researcher says the budget is already broken: "Using current Haiku 4.5 pricing ($1.00/$5.00), the Haiku portion alone would cost approximately... $14.18/month -- already exceeding the budget before Sonnet costs."
- **Resolution needed:** If Researcher's pricing analysis is correct, the entire budget model is invalid and this becomes the single most important decision in the project. The Visionary wants flexibility; Cloud and Commercial want hard guardrails. But Researcher says even the guardrails won't help because the base cost exceeds the ceiling.

---

**9. Local Development Database: SQLite vs Neon Branch**
- **Topic:** What database to use for local development
- **Position A:** Engineer says "Set up a local development environment that uses SQLite (via Drizzle's multi-driver support) and file-based mocks for integrations."
- **Position B:** QA says "A staging/test Neon database instance must be provisioned for testing. Tests must not run against the production database. The Neon free tier allows branching."
- **Resolution needed:** SQLite has different JSON handling, different type system, and different behaviour from PostgreSQL. Tests passing on SQLite may fail on Neon. The QA specialist is right that tests need to run against the same database engine, but the Engineer is right that local development without network is valuable. These can coexist (SQLite for fast iteration, Neon branch for CI), but the spec needs to say so explicitly.

---

**10. Agent Communication Style: First Person vs Impersonal**
- **Topic:** How the agent refers to itself
- **Position A:** Content Strategist says "the agent should use impersonal active voice in internal content ('Detected sprint closure. Updated delivery state.') and... Never use 'I' in external communications -- stakeholders should not know an AI wrote it."
- **Position B:** Storyteller says the agent should have a name, a personality, and communicate in a way that "reinforces the single-user intimacy." The UX Psychologist wants "reasoning transparency" where the agent explains "Why I did this."
- **Position C:** Journey Designer wants the agent to say things like "While you were away, I updated the delivery state for Sprint 13."
- **Resolution needed:** The Content Strategist and Storyteller/UX Psychologist have fundamentally different views on agent identity. The Content Strategist wants the agent to be invisible; the Storyteller wants it to be a named character. This affects every prompt template, every UI string, and every outbound email.

---

### Productive Tensions

**1. Transparency vs Token Cost**
- **Tension:** Reasoning transparency (showing why the agent made each decision) requires storing and displaying chain-of-thought reasoning, which costs additional tokens.
- **Specialists involved:** UX Psychologist (wants "reasoning transparency as a first-class UI feature"), QA (wants "decision replay capability"), AI/ML (wants "context assembly as a distinct layer") vs. Cloud (every token matters at $10/month), Commercial (cost controls are Phase 0), Data (token economics as a "survival constraint").
- **Why both are right:** Trust requires transparency -- the UX Psychologist's research on automation complacency is well-grounded. But the budget is real and potentially already broken per the Researcher's pricing analysis. Every additional LLM call for explainability eats into the reasoning budget.
- **Recommended resolution:** The UX Psychologist suggests reserving "10-15% of total LLM spend" for trust-building features. Accept this as a fixed tax on the token budget and design around it. Log the raw LLM response (which already contains reasoning) rather than making a separate "explain yourself" call.

**2. Safety Gates vs Responsiveness**
- **Tension:** Multiple specialists want delay mechanisms for outbound actions (Visionary: "30-minute communication hold"; AI/ML: "5-minute configurable delay"; Content Strategist: "communication preview mode"; Strategist: "draft, don't send"), but these slow down the very automation the product promises.
- **Specialists involved:** Visionary, AI/ML, Content Strategist, Strategist (want delays) vs. PM (wants "5-10 minute daily review"), Storyteller (wants the "Silent Save" hero scenario where the agent handles things before the user notices).
- **Why both are right:** The Storyteller's hero scenario ("the agent detected and handled it before Damien even saw the Teams message") is the product's emotional peak. But the AI/ML specialist is correct that an LLM-drafted email sent to the wrong stakeholder is a real professional risk. These are genuinely in tension -- maximum automation requires maximum trust, which requires time to build.
- **Recommended resolution:** Use the Visionary's "communication hold" pattern but make the hold duration decrease as the agent proves itself: start at 30 minutes, reduce to 5 minutes after 10 consecutive approvals, reduce to zero after 25. This is the "trust dial" the UX Psychologist proposes, applied specifically to outbound communications.

**3. Information Density vs Calm Design**
- **Tension:** Designer and Motion specialist want a "calm technology" aesthetic with generous whitespace and subtle animations, while the PM and Strategist want high information density for the "5-10 minute daily review."
- **Specialists involved:** Designer ("closer to Linear's density than Notion's"), PM ("distinct UI treatments" for different states) vs. Motion ("calm technology motion philosophy"), Designer (also: "the wireframes waste vertical space with decorative separators and emoji-heavy headings").
- **Why both are right:** A PM tool needs to be scannable -- you cannot afford to scroll through screens to find what matters. But a calm design reduces cognitive load, which is the product's stated goal. The tension is between density (more information per viewport) and calm (less visual noise per viewport).
- **Recommended resolution:** Use the Designer's own recommendation: "Agent status + up to 3 project health cards + up to 5 pending escalations + 24-hour summary stats all visible above the fold." Prioritize density for the Mission Control view and calm for the Decision Interface. Different views serve different cognitive purposes and should have different density targets.

**4. Comprehensive Testing vs Solo Developer Reality**
- **Tension:** QA wants golden scenario suites, regression baselines, chaos testing, and evaluation-style testing with N iterations. The Strategist and Commercial specialist focus on "ruthless scoping" and avoiding burnout.
- **Specialists involved:** QA (wants 20-30 golden scenarios, evaluation-style testing, chaos testing, LLM regression baselines) vs. Strategist (wants "walking skeleton" and exit criteria), Commercial ("solo developer burnout" is a critical risk), PM ("10-15 user stories" is sufficient).
- **Why both are right:** QA is correct that non-deterministic LLM systems need evaluation testing, not just unit tests. A traditional test suite cannot catch prompt regressions. But the testing infrastructure QA describes would take weeks to build, and the Strategist's "kill threshold" reminds us that the project has finite developer hours.
- **Recommended resolution:** Build 10 golden scenarios (not 30) covering the highest-risk paths (artefact corruption, incorrect escalation, wrong email recipient). Run them manually during development. Automate only after the MVP is delivering value. QA's "false positive/negative budgets" are the right framework for defining what "correct" means, even if the testing infrastructure is manual at first.

**5. Artefact Bootstrap Quality vs Time-to-First-Value**
- **Tension:** Multiple specialists flag that bootstrap quality is critical for trust, but the bootstrap is also the longest delay before the user sees value.
- **Specialists involved:** Visionary ("the bootstrap is the hardest unsolved design challenge"), Journey Designer ("the 15-minute polling interval creates a 'dead dashboard' problem during setup"), PM ("the 'first five minutes' experience is unspecified") vs. Strategist ("Time-to-First-Value as a North Star Metric"), UX Psychologist ("the 'empty restaurant' problem at launch").
- **Why both are right:** If the bootstrap produces garbage artefacts, trust is permanently damaged. But if the bootstrap takes too long or has too many review steps, the user never reaches the "aha moment." The Visionary wants a "Project Intelligence Brief" (review before committing), while the Journey Designer wants a quick setup wizard.
- **Recommended resolution:** Use the Visionary's "Project Intelligence Brief" approach but make the review lightweight: show the generated artefacts with highlighted key items ("I identified 3 risks -- do these look right?") rather than requiring the user to review every field. Accept 80% accuracy on bootstrap and let the agent self-correct over subsequent cycles.

**6. Single-Source Simplicity vs Cross-Source Intelligence**
- **Tension:** The product's unique value is cross-tool synthesis (Jira + Teams + Outlook), but the MVP recommendations strip this down to Jira-only.
- **Specialists involved:** Researcher ("the cross-platform synthesis for a solo practitioner is the genuine gap in the market"), Visionary ("the 'compound knowledge' advantage" requires multiple sources) vs. Strategist ("Set a hard scope ceiling for MVP: 4 artefact types, 2 integrations"), the Phase 4 MVP definition (starts with Jira only).
- **Why both are right:** The Researcher is correct that single-tool AI features are already free in Jira Rovo and Asana AI. The product only has a reason to exist if it synthesizes across tools. But the Strategist is correct that building four integrations simultaneously is scope suicide for a solo developer.
- **Recommended resolution:** MVP must include at least two data sources to demonstrate cross-source value. Jira + Outlook is the recommended pair (the Phase 5 build sequence already has this). Defer Asana and Teams but ensure the adapter pattern makes adding them straightforward.

---

### Scope Tensions (Vision vs Pragmatism)

- **Learning Layer:** The Visionary wants "decision memory as a simple, prompt-injectable log from the start" and the Storyteller wants "correction stories" in the daily digest. The Data specialist counters: "Defer automated learning; design for manual prompt tuning informed by data. Automated prompt refinement based on 20-50 feedback signals per month is statistically meaningless." The AI/ML specialist takes a middle position: build the override log but do not pretend it is "learning." **The pragmatists are right for MVP** -- the data volume is too low for meaningful automated learning, and calling it "learning" sets false expectations.

- **Agent Naming and Personality:** The Storyteller insists: "Give the agent a working name immediately... 'the agent' is dehumanizing for a tool built on a trust relationship." The Content Strategist counters with: "the agent should use impersonal active voice... Never use 'I' in external communications." The UX Psychologist adds nuance: naming affects trust calibration. **This costs nothing to decide** and should be resolved before UI strings are written, but the engineering specialists uniformly ignore it, treating it as non-essential.

- **Mobile Design:** The Mobile specialist provides seven detailed recommendations including a bottom tab bar, sticky decision footer, and mobile-specific Mission Control layout. The Designer and Frontend specialist both say: "Defer mobile responsive design to post-MVP." **The pragmatists are right** -- this is a daily-use desktop tool. But the Mobile specialist's point about the Decision Interface on a phone ("receiving a push notification about a pending escalation, opening it on the phone, tapping 'Approve Option 1' -- this is a real workflow") is the one mobile scenario worth considering.

- **Anti-Complacency Reviews:** The UX Psychologist wants the agent to surface periodic "spot checks" -- random past decisions for the user to validate. The Strategist wants to "instrument build time and operational time from day one" with ROI tracking. The PM just wants "measurable graduation criteria." **All three want accountability mechanisms, but at different levels of sophistication.** The pragmatic path: start with the PM's graduation criteria, add the Strategist's ROI tracking, and defer the UX Psychologist's spot-check system to post-MVP.

- **Content Quality Scoring:** The Content Strategist wants a "lightweight Haiku pass" to check tone, facts, and length on every external communication before sending. The Cloud specialist has already said the $10/month budget has "essentially zero margin." The Researcher's pricing analysis makes this even more untenable. **Vision is right that content quality matters, but the budget cannot absorb additional LLM calls.** Use the tool-use schema constraints (AI/ML's recommendation) as a zero-cost quality gate instead.

- **Disaster Recovery and Runbooks:** DevOps wants a disaster recovery runbook, provisioning scripts, and a rollback procedure. SRE wants informal SLOs. The Strategist wants a "kill threshold" for the project itself. **All are right in principle, but a solo developer writing runbooks for a $10/month personal tool is gold-plating.** The pragmatic path: a single `provision.sh` script (DevOps recommendation 1) that doubles as documentation and disaster recovery. Skip formal SLOs and runbooks.

- **Performance Budgets and Monitoring:** The Perf specialist wants defined targets (dashboard TTI under 3 seconds, agent cycle under 30 seconds) and cycle-level metrics. DevOps wants structured JSON logging with pino. The Strategist just wants to know "is it saving me time or not?" **The Perf specialist's recommendations are technically sound but the Strategist's framing is more honest** -- for a personal tool, the only performance metric that matters is "does it feel fast enough that I keep using it?" Add basic cycle timing (Perf recommendation 6) but skip formal performance budgets.

- **Prompt Injection Defence:** Security wants a two-stage triage architecture ("never pass raw external content directly into agent reasoning prompts") with a separate, tool-less Haiku call for sanitization. AI/ML already recommends a two-pass triage architecture for cost reasons (Haiku triages, Sonnet reasons). **These two recommendations are architecturally identical but motivated by different concerns** (security vs cost). They reinforce each other and should be implemented as one system that serves both purposes. The tension is whether the extra Haiku call for sanitization is affordable within the budget -- the Researcher's pricing analysis suggests it may not be.