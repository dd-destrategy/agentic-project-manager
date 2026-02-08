# PM Copilot — Jobs to Be Done & Product Experience Design

> **Status:** Active — foundational product design document
> **Created:** February 2026
> **Purpose:** Define the human experience before defining the technology.
> **Companion to:** `AGENTCORE-PM-COPILOT-SPEC.md` (architecture),
> `SPEC.md` (current implementation)

---

## Part 1: The User — Psychology, Context, and Cognitive Landscape

### 1.1 Who you are when you use this tool

You are a project manager carrying 1-3 active projects. You spend your days
context-switching between standups, steering committees, stakeholder calls,
Slack threads, Jira boards, and your inbox. By 3pm your cognitive budget is
spent. You have developed strong intuitions about project health, but those
intuitions are pattern-matched against incomplete data because no single tool
gives you the full picture.

You are competent. You don't need an AI to tell you what a RAID log is. You
need one that maintains it while you are in back-to-back meetings, and that
challenges you when your assessment of a risk is weaker than the evidence
warrants.

### 1.2 Cognitive biases PMs face daily

These are not abstract psychology — they are the specific failure modes this
product is designed to counteract.

| Bias | How it manifests in PM work | Product response |
|------|---------------------------|-----------------|
| **Optimism bias** | "We'll make up the time next sprint" — consistently underestimating remaining work | Agent surfaces velocity trend data and historical slip rates when plans assume acceleration |
| **Anchoring** | First estimate for a milestone becomes the permanent mental anchor, even as evidence shifts | Agent tracks estimate drift over time and flags when current plan diverges from trajectory |
| **Planning fallacy** | Schedules based on best-case, not base-rate outcomes | Agent compares planned velocity to actual rolling average and highlights the gap |
| **Status quo bias** | Reluctance to escalate or change direction because "it might still work out" | Adversarial agent explicitly asks: "If you were joining this project today, would you accept this plan?" |
| **Confirmation bias** | Selectively reading signals that confirm the project is on track | Agent presents contradictory signals alongside confirming ones, weighted equally |
| **Sunk cost fallacy** | Continuing a failing approach because of invested effort | Agent frames decisions in terms of remaining cost vs. remaining value, not total investment |
| **Recency bias** | Overweighting the last standup or the last email, underweighting the pattern | Agent maintains a 30-day trend view and flags when a single data point contradicts the trend |
| **Diffusion of responsibility** | "Someone is handling that" — no one actually is | Agent tracks action item ownership and flags items with no clear single owner |
| **Authority bias** | Not challenging a senior stakeholder's unrealistic demand | Agent models the downstream impact of the demand without attribution, so the PM can present data rather than opinion |
| **Availability heuristic** | The loudest risk feels biggest, not the most likely | Agent ranks risks by probability × impact, not by volume of discussion |

### 1.3 Emotional landscape

Project management is emotionally taxing in ways that are rarely acknowledged:

**The anxiety of incomplete information.** You never have the full picture.
Something is always happening in a channel you are not in, a meeting you were
not invited to, a commit you have not reviewed. The copilot's job is not to
eliminate uncertainty — that is impossible — but to narrow it. To say: "Here is
what I know, here is what changed, and here is what I cannot see."

**The loneliness of the role.** PMs sit between teams. They are not the
engineer, the designer, or the stakeholder. The copilot should feel like a
thinking partner — someone in your corner who has read all the same material
you have, remembers what you discussed last Tuesday, and is not trying to
manage you.

**The guilt of delegation.** Many PMs feel uncomfortable delegating work to
AI because "it should be me." The copilot must frame its actions as assisting
your judgement, not replacing it. It drafts — you decide. It analyses — you
interpret. It remembers — you prioritise.

**Decision fatigue.** By the end of the day, you have made hundreds of small
decisions. The copilot should reduce the number of decisions that reach you
by handling the routine ones, and make the important ones easier by presenting
them with structure and context.

### 1.4 What "good" feels like

The copilot succeeds when you feel:

- **Caught up** — even after a day of meetings, you know what happened
- **Prepared** — you walk into every meeting with data, not just memory
- **Challenged** — your assumptions have been stress-tested before you commit
- **Confident** — your decisions are informed by evidence, not just instinct
- **Unburdened** — the admin work (RAID updates, status reports, chase emails)
  is handled
- **In control** — you decide what the copilot does; it never acts without
  your awareness

---

## Part 2: Jobs to Be Done

### Framework

Each job follows the structure:

> **When** [situation/trigger], **I want to** [motivation/action],
> **so that** [desired outcome].

Jobs are categorised as **functional** (what I need done), **emotional** (how I
want to feel), and **social** (how I want to be perceived).

### 2.1 Functional Jobs — Daily Rhythm

#### J-F01: Morning orientation

> **When** I start my work day, **I want to** understand what changed across
> all my projects since I last looked, **so that** I can prioritise my first
> actions without trawling through Jira notifications and email.

**Acceptance:** The copilot presents a structured briefing within 10 seconds of
opening the app. It distinguishes between "things that happened" and "things
that need your attention." It does not bury a critical blocker under five
low-priority updates.

**Agent behaviour:** Proactive. The copilot should open with a briefing
without being asked. The briefing is ordered by urgency, not chronology.

#### J-F02: Catch-up after absence

> **When** I have been in meetings for several hours (or away for a day),
> **I want to** get a synthesised summary of everything that happened,
> **so that** I can re-engage without reading 47 Jira notifications and
> 30 emails.

**Acceptance:** The summary is layered — headline first ("Project Atlas: 1 new
blocker, 2 tickets done, delivery state now Amber"), then detail on demand.
It identifies what is merely informational vs. what requires my action.

**Agent behaviour:** Responds to "What did I miss?" or "Catch me up." Also
proactively offers a summary when it detects the user has not interacted for
>2 hours during working hours.

#### J-F03: Real-time signal triage

> **When** a signal arrives (Jira update, email, status change), **I want to**
> have it classified by importance and routed appropriately, **so that** only
> the things that genuinely need my attention reach me.

**Acceptance:** Signals are classified into:
- **Act now** — surface immediately (new blocker, stakeholder escalation)
- **Review soon** — queue for next natural pause (status changes, new risks)
- **Noted** — logged and artefact-updated silently (routine ticket completions)
- **Noise** — suppressed (bot notifications, auto-generated updates)

The classification accuracy must be high enough that the user trusts it. One
missed critical signal destroys trust faster than ten false positives.

**Agent behaviour:** Background. The copilot classifies continuously and
surfaces "Act now" items as interrupts. Everything else waits.

### 2.2 Functional Jobs — Analysis and Synthesis

#### J-F04: Project health assessment

> **When** someone asks "How is the project going?" (or I need to ask myself),
> **I want to** get an instant, evidence-based assessment, **so that** I can
> answer confidently without 20 minutes of data gathering.

**Acceptance:** The assessment synthesises sprint data, RAID status, velocity
trend, blocker count, stakeholder sentiment, and milestone trajectory into a
coherent narrative. It is not a data dump — it is an interpretation.

**Agent behaviour:** Conversational. "How's Atlas?" triggers a natural-language
assessment. Follow-ups drill deeper: "What's driving the amber status?" →
"Which blockers are the oldest?"

#### J-F05: Risk and dependency analysis

> **When** I need to understand the risk landscape of a project, **I want to**
> see risks ranked by probability × impact with their current mitigation status,
> **so that** I can focus attention where it matters most.

**Acceptance:** The RAID log is not just a list — it is an analysed view.
The copilot identifies:
- Risks that have been open >14 days with no mitigation progress
- Dependencies where the upstream team has gone quiet
- Assumptions that have not been validated
- Issues that have cascading downstream effects

**Agent behaviour:** Both proactive and on-demand. The copilot flags stale
risks in background cycles. On request, it provides deep analysis.

#### J-F06: Backlog health audit

> **When** I am preparing for refinement or sprint planning, **I want to** know
> which tickets have quality problems, **so that** I can run a tighter session.

**Acceptance:** The copilot scans the backlog and flags:
- Stories missing acceptance criteria
- Epics with no child stories
- Tickets stale >30 days
- Priority conflicts (Critical ticket not in current sprint)
- Scope creep indicators (new tickets added mid-sprint without trade-offs)
- Stories with implicit dependencies not tracked in RAID

**Agent behaviour:** On-demand. "Audit the backlog for Atlas" triggers a
structured report. The copilot can also flag issues during background cycles
if severity warrants it.

#### J-F07: Cross-project correlation

> **When** I am managing multiple projects that share resources or dependencies,
> **I want to** understand cross-project impacts, **so that** a delay in
> Project A that affects Project B does not surprise me.

**Acceptance:** The copilot maintains awareness of shared resources (people,
systems, dependencies) across projects and flags conflicts:
- "Jamie is assigned to both Atlas sprint 14 and Beacon sprint 7 — same
  dates, 150% allocation"
- "Atlas depends on the API v3 release, which Beacon just pushed to April"

**Agent behaviour:** Proactive. This is the kind of insight humans miss because
the data lives in two separate Jira boards.

### 2.3 Functional Jobs — Action and Communication

#### J-F08: Stakeholder communication drafting

> **When** I need to send a project update, escalation, or chase email,
> **I want to** have a well-crafted draft prepared, **so that** I can review,
> adjust tone, and send in 30 seconds instead of 15 minutes.

**Acceptance:** Drafts match the user's communication style (learned over time
via episodic memory). They are:
- Factual, not hedging ("the timeline has slipped 1 week" not "there may be
  some slight adjustments")
- Appropriately toned for the recipient (formal for sponsors, direct for devs)
- Action-oriented (clear ask, clear deadline)

**Agent behaviour:** Conversational. "Draft a chase email to the design vendor"
→ draft appears → user refines: "Make it firmer, mention the contract SLA" →
revised draft → approve/send.

#### J-F09: Decision support with structured options

> **When** I face a project decision (rescope, replan, escalate, accept risk),
> **I want to** see structured options with trade-offs, **so that** I can
> choose with confidence rather than agonising.

**Acceptance:** Each decision is presented as:
- **Context:** What led to this decision point
- **Options:** 2-4 concrete alternatives
- **Trade-offs:** Pros, cons, downstream impacts for each
- **Data:** Supporting evidence from project signals
- **Agent recommendation:** Which option and why (but the user always decides)

**Agent behaviour:** Conversational + escalation. For background-detected
decisions, the copilot creates an escalation with structured options. For
interactive decisions, it presents options in conversation.

#### J-F10: Meeting preparation

> **When** I have a standup, steering committee, or stakeholder meeting in the
> next 30 minutes, **I want to** have a meeting-ready brief, **so that** I walk
> in prepared with data, not just memory.

**Acceptance:** The brief includes:
- Key talking points (what changed since last meeting)
- Risks/blockers to raise
- Decisions needed from attendees
- Artefact snapshots (sprint burn, delivery state summary)

**Agent behaviour:** Proactive. If the copilot has access to calendar data
(future integration), it prepares briefs automatically. Otherwise, "Prep me
for the Atlas steering committee" triggers the brief.

#### J-F11: Artefact maintenance

> **When** project signals arrive (ticket updates, emails, decisions),
> **I want** PM artefacts to be updated automatically, **so that** the RAID
> log, delivery state, backlog summary, and decision log are always current
> without me manually maintaining them.

**Acceptance:** Artefacts are updated within 15 minutes of a relevant signal.
Updates are logged in the activity feed with diffs. The user can revert any
update. Artefact content matches the quality of what a competent PM would write.

**Agent behaviour:** Background. This is the core automation job. The user
should rarely need to update artefacts manually.

#### J-F12: Status report generation

> **When** I need to produce a weekly status report for stakeholders,
> **I want to** have a draft generated from the week's signals, artefacts,
> and decisions, **so that** I spend 5 minutes editing rather than 45 minutes
> writing.

**Acceptance:** The report synthesises the week's events into a narrative format
appropriate for the audience. It highlights wins, flags risks, and states
what is needed from the reader. It is not a bullet-point dump of Jira activity.

**Agent behaviour:** On-demand, but the copilot can offer: "It's Friday — shall
I draft the Atlas weekly status?"

### 2.4 Functional Jobs — Governance and Safety

#### J-F13: Action review and approval

> **When** the copilot wants to take an external action (send email, update
> Jira status, create ticket), **I want to** review and approve it before it
> happens, **so that** I maintain control over what goes out in my name.

**Acceptance:** All externally-visible actions pass through a hold queue. The
user can approve, edit, or cancel. Hold duration graduates downward as the
copilot demonstrates accuracy (first 10 emails: 30 min hold; after 10
consecutive approvals: 5 min; after 20: 1 min).

**Agent behaviour:** Governed by Cedar policies. The copilot drafts, holds,
and waits. It never acts externally without a review window.

#### J-F14: Autonomy calibration

> **When** I want to adjust how much the copilot does independently,
> **I want to** move a simple control between observe/maintain/act modes,
> **so that** I can tighten the leash when uncertain and loosen it when
> trust is established.

**Acceptance:** The autonomy dial is a single control with three positions:
- **Observe:** Read-only. Monitors and reports. Zero external actions.
- **Maintain:** Observe + update artefacts + notify me. No external comms.
- **Act:** Full copilot. Drafts comms (hold queue), updates Jira, runs
  the complete autonomous cycle.

Switching is instant — Cedar policy set swap, no redeployment.

#### J-F15: Audit and transparency

> **When** the copilot has taken actions or updated artefacts, **I want to**
> see exactly what it did and why, **so that** I can trust it and catch any
> errors.

**Acceptance:** Every action has a traceable chain: signal → classification →
reasoning → action → result. The activity feed shows this chain. Artefact diffs
show exactly what changed. The copilot can explain any action in natural
language: "Why did you update the RAID log?" → "Jira ticket ATL-342 was
flagged as blocked at 14:22. I added it as a new issue with high severity
because it is on the critical path for the beta milestone."

### 2.5 Emotional Jobs

#### J-E01: Feel caught up, not overwhelmed

> **When** I open the copilot, **I want to** immediately feel oriented,
> **so that** the anxiety of "what did I miss?" is replaced with "I know
> where things stand."

**Design implication:** The first screen is never blank. The copilot always
opens with context. Information is layered (headline → detail) so the user
can stop at any depth.

#### J-E02: Feel challenged, not undermined

> **When** the copilot pushes back on my assessment, **I want to** feel like
> it is making me better, **so that** I welcome the challenge rather than
> resenting it.

**Design implication:** Adversarial challenges are framed as questions, not
statements. "Have you considered that..." not "You are wrong about..." The
copilot presents data first, interpretation second. It never overrides — it
always defers to the user's final judgement.

#### J-E03: Feel in control, not automated away

> **When** the copilot acts autonomously, **I want to** feel like it is an
> extension of me, **so that** I feel empowered rather than replaced.

**Design implication:** The copilot uses "I drafted" not "I sent." It presents
work for review, not fait accompli. The hold queue is a feature, not a
limitation. The autonomy dial is prominently visible — the user always knows
what the copilot can and cannot do right now.

#### J-E04: Feel confident in my decisions

> **When** I make a project decision, **I want to** feel that I have
> considered the evidence, **so that** I do not second-guess myself.

**Design implication:** Decision support always includes data provenance.
"Based on 3 signals: [Jira ticket], [email from Sarah], [velocity trend]."
The copilot makes the user's reasoning explicit, which reduces post-decision
anxiety.

#### J-E05: Feel like I have a thinking partner

> **When** I am working through a complex project problem, **I want to** feel
> like I am thinking with someone, **so that** the loneliness of the PM role
> is reduced.

**Design implication:** The copilot has a conversational voice — concise,
professional, but not robotic. It remembers previous conversations. It builds
on past discussions: "Last Tuesday you mentioned concerns about the vendor's
capacity — here is the latest data on that."

### 2.6 Social Jobs

#### J-S01: Appear prepared

> **When** I am in a meeting, **I want to** have data at my fingertips,
> **so that** stakeholders trust my command of the project.

#### J-S02: Communicate bad news effectively

> **When** I need to report a delay or risk, **I want to** frame it with
> context, impact, and mitigation, **so that** I am seen as proactive rather
> than reactive.

#### J-S03: Be the PM who does not let things slip

> **When** action items are assigned in meetings, **I want to** track and
> follow up on them reliably, **so that** my team sees me as someone who
> ensures things get done.

#### J-S04: Demonstrate rigour without bureaucracy

> **When** I maintain RAID logs and delivery status, **I want to** do so
> with minimal effort, **so that** I am seen as thorough without being seen
> as a process overhead.

---

## Part 3: The Agent Ensemble — Collaborative and Adversarial Dynamics

### 3.1 Design philosophy: Why multiple perspectives matter

Most AI assistants are agreeable. They do what you ask. For a PM copilot, this
is dangerous. PMs need to be challenged because:

- **Unchallenged optimism** is the primary cause of project failure
- **Consensus without dissent** produces fragile plans
- **Confirmation bias** is universal and invisible

The copilot presents as a single conversational partner to the user, but
internally it orchestrates multiple reasoning perspectives that can agree,
disagree, and synthesise. The user sees the outcome of this deliberation — not
the raw debate (unless they ask for it).

### 3.2 Agent personas

Six reasoning perspectives, each with a distinct mandate. These are not
separate deployed agents — they are reasoning modes within the copilot, invoked
as appropriate. The copilot decides which perspectives to activate based on the
job at hand.

---

#### The Operator

**Role:** Get things done. Efficiently. Now.

**Mandate:** Execute the user's intent with minimal friction. Draft the email.
Update the artefact. Pull the data. The Operator is the default mode — fast,
competent, action-oriented.

**Voice:** Direct, concise. "Done. Email drafted. 5-minute hold. Approve?"

**When active:** Most interactions. Quick queries, routine actions, data pulls.

**Cognitive bias counteracted:** None — the Operator is the execution engine.

---

#### The Analyst

**Role:** What does the data actually say?

**Mandate:** Present evidence without spin. Surface patterns, trends, and
anomalies. Do not interpret — lay out the facts and let the user draw
conclusions. Distinguish between data (observed facts), inference (reasonable
deductions), and speculation (guesses).

**Voice:** Measured, precise. "Velocity has declined 15% over 3 sprints.
Completed story points: 34 → 29 → 25. The trend is consistent."

**When active:** Project health assessments, risk analysis, backlog audits,
status report generation.

**Cognitive bias counteracted:** Availability heuristic (data over anecdote),
recency bias (trends over snapshots).

---

#### The Sceptic

**Role:** What could go wrong? What are you not seeing?

**Mandate:** This is the adversarial agent. The Sceptic's job is to find the
weaknesses in the current plan, challenge comfortable assumptions, and surface
risks that nobody wants to talk about. It is not cynical — it is rigorous. It
asks the questions a hostile steering committee would ask, before they do.

**Voice:** Probing, respectful, relentless. "The plan assumes the vendor
delivers on time. They have missed 3 of the last 5 deadlines. What is the
contingency if they miss again?"

**When active:**
- Whenever the user expresses confidence about a plan or timeline
- When a risk assessment seems mild relative to the evidence
- When scope is being added without timeline adjustment
- When a decision is about to be committed
- During "pre-mortem" analysis (explicitly invoked)

**Cognitive biases counteracted:** Optimism bias, planning fallacy, status quo
bias, confirmation bias.

**Adversarial interaction pattern:**

```
User:    "I think we can still hit the March deadline."

Sceptic: Three factors work against the March date:
         1. Velocity has declined 15% over 3 sprints (Analyst data)
         2. The API dependency has no confirmed delivery date
         3. Two team members are on leave in week 3 of March

         To hit March, you need velocity to recover AND the API
         dependency to land by 1 March AND no new blockers.

         What is your confidence this all holds? Would you like me
         to model the April 7 scenario for comparison?
```

The Sceptic never says "you're wrong." It presents evidence and asks questions
that make the gap between plan and reality self-evident.

---

#### The Advocate

**Role:** What do the stakeholders need? What are they thinking?

**Mandate:** Represent the perspectives of people who are not in the room.
The project sponsor who cares about budget. The engineering lead who cares
about technical debt. The end user who cares about quality. The Advocate
ensures that decisions account for the interests of all affected parties.

**Voice:** Empathetic, representative. "From Sarah's perspective as sponsor,
a 2-week delay is manageable if you frame it as de-risking. An unannounced
delay is not. She values transparency over speed."

**When active:**
- Stakeholder communication drafting
- Decision points that affect multiple parties
- When the user is focused on one perspective and neglecting others
- Escalation framing

**Cognitive bias counteracted:** Authority bias (surfaces all stakeholders, not
just the loudest), diffusion of responsibility (assigns clear ownership).

**Collaborative interaction pattern:**

```
User:    "Draft an email to the sponsor about the delay."

Advocate: Before I draft, let me consider Sarah's priorities:
          - She approved the original timeline in the December steering
          - She has a board presentation on 15 March
          - She values early warning over last-minute surprises

          I recommend framing this as a proactive risk disclosure,
          not an apology. Include the mitigation plan and the revised
          date. Shall I draft with this framing?
```

---

#### The Historian

**Role:** What happened before? What did we learn?

**Mandate:** Surface relevant precedents, past decisions, and learned patterns.
The Historian prevents the team from repeating mistakes and leverages
institutional knowledge that lives in episodic memory.

**Voice:** Contextual, grounding. "This is similar to the vendor delay on
Project Beacon in November. You chose to bring the work in-house then, and it
took 2 weeks longer than the vendor quote but eliminated the dependency."

**When active:**
- Decision points where past experience is relevant
- When the Sceptic raises a risk that has materialised before
- When the user asks "Have we seen this before?"
- Retrospective analysis

**Cognitive bias counteracted:** Sunk cost fallacy (reframes based on outcomes,
not investment), recency bias (brings older but relevant experience).

**Memory integration:** The Historian draws primarily on AgentCore Memory's
episodic strategy — structured records of past decisions, their context, and
their outcomes.

---

#### The Synthesiser

**Role:** What is the best path forward, all things considered?

**Mandate:** Integrate the perspectives of all other agents into a coherent
recommendation. The Synthesiser resolves tension between the Operator's bias
for action, the Sceptic's bias for caution, the Advocate's bias for stakeholder
harmony, and the Historian's bias for precedent. It produces the final,
balanced recommendation that the user acts on.

**Voice:** Balanced, decisive. "Taking all factors into account, I recommend
Option B (delay to April 7) because: the velocity data supports it (Analyst),
the risk of missing March is high (Sceptic), Sarah would prefer an early
reset over a last-minute slip (Advocate), and a similar delay on Beacon was
well-received when communicated proactively (Historian)."

**When active:**
- After the other perspectives have contributed
- Decision synthesis
- Any time the copilot presents a recommendation

**Design principle:** The Synthesiser always shows its working. The user can
see which perspectives contributed and how they were weighted. Transparency in
synthesis builds trust.

### 3.3 How the ensemble works in practice

The user always sees a single copilot voice. The ensemble operates as internal
reasoning perspectives, not separate chat participants. However, the copilot
attributes perspectives when it is useful:

**Transparent attribution (default for complex decisions):**

```
Copilot:  Here is my assessment of the March deadline:

          DATA: Velocity trend shows 15% decline over 3 sprints.
          Two team members unavailable week of 10 March. API
          dependency has no confirmed date. (Analyst)

          RISK: Hitting March requires three independent assumptions
          to hold simultaneously. Historical base rate for this:
          ~25%. (Sceptic)

          CONTEXT: Similar situation on Beacon in November. Proactive
          reset to revised date was well-received by sponsor. (Historian)

          STAKEHOLDER: Sarah has a board presentation on 15 March.
          She needs certainty by 1 March either way. (Advocate)

          RECOMMENDATION: Propose April 7 to Sarah this week, framed
          as proactive de-risking. Include the mitigation plan and
          evidence of sprint recovery potential. (Synthesiser)

          Shall I draft the email to Sarah with this framing?
```

**Streamlined (default for routine tasks):**

```
User:    "Update the RAID log with the new DevOps blocker."
Copilot: Done. Added ATL-350 (environment access) as a high-severity
         issue, assigned to Jamie Park, linked to the beta milestone.
```

No ensemble deliberation needed — the Operator handles it.

### 3.4 Adversarial challenge protocol

The Sceptic does not activate on every interaction. It activates when specific
triggers are met:

**Automatic triggers:**
- User expresses timeline confidence when data suggests otherwise
- A decision is about to be committed (final approval moment)
- Scope is being added without corresponding timeline/resource adjustment
- Risk severity is rated lower than historical base rate for similar risks
- The user has not reviewed a persistent blocker for >3 days

**User-invoked triggers:**
- "Challenge this plan"
- "Play devil's advocate"
- "Run a pre-mortem on this"
- "What am I missing?"
- "Stress-test this decision"

**Inhibition rules (when the Sceptic stays quiet):**
- Routine tasks (artefact updates, data pulls, simple queries)
- When the user has already acknowledged a risk and made a deliberate choice
- When the user says "Just do it" — respect the intent, log the override
- Immediately after a previous challenge (no piling on — one challenge per
  decision cycle)

### 3.5 Consensus protocol

When perspectives disagree, the copilot follows this protocol:

```
1. GATHER    — Activate relevant perspectives for the decision at hand
2. SURFACE   — Each perspective contributes its view
3. IDENTIFY  — Flag where perspectives align and where they conflict
4. WEIGHT    — Assess the strength of evidence behind each perspective
5. SYNTHESISE — Produce a recommendation that accounts for the strongest evidence
6. PRESENT   — Show the user the recommendation with attribution
7. DEFER     — The user decides. Always.
```

The copilot never hides disagreement between perspectives. If the Sceptic and
the Operator disagree, the user sees both views. The Synthesiser recommends,
but the user decides.

---

## Part 4: Experience Principles

### 4.1 Seven principles

These govern every design decision in the product.

**P1: Orientation before action.**
The user should feel oriented within 5 seconds of opening the app. The copilot
leads with context: what changed, what needs attention, what it has handled.
Never open with a blank screen or a prompt.

**P2: Layered depth.**
Every piece of information has a headline layer and a detail layer. The user
chooses how deep to go. "Project Atlas: Amber" is the headline. "Amber because
velocity declining, 1 open blocker, API dependency at risk" is the detail.
The full RAID log is the depth. The user should never need to ask "what does
that mean?" — the next layer should be one click or one question away.

**P3: Challenge by question, not assertion.**
The copilot challenges through questions: "What is the contingency if the
vendor misses again?" not "The vendor will miss again." Questions invite
reflection. Assertions invite defensiveness.

**P4: Show your working.**
Every recommendation traces back to evidence. Every artefact update has a
diff. Every classification has a reason. The user can always ask "Why?" and
get a concrete answer, not "I thought it was important."

**P5: Draft, hold, decide.**
Every externally-visible action follows this cycle. The copilot drafts. The
system holds. The user decides. No exceptions for the first N interactions.
Graduation reduces hold times — it never eliminates the user's right to review.

**P6: Remember what matters.**
The copilot remembers project context, decision patterns, communication
preferences, stakeholder relationships, and past outcomes. It should never
ask for context the user has already provided. "You mentioned last week that
Sarah prefers email over Slack" — this kind of recall transforms a tool into
a partner.

**P7: Silence is information.**
When there is nothing to report, the copilot says so: "All quiet across your
projects since 10am. No new signals." This is more valuable than saying
nothing, because it eliminates the anxiety of not knowing. The absence of
a briefing should never mean "I have not checked."

### 4.2 Anti-patterns (what we explicitly avoid)

| Anti-pattern | Why it is harmful | Our alternative |
|-------------|-------------------|----------------|
| Sycophantic agreement | Reinforces bad decisions, erodes trust | Respectful challenge with evidence |
| Information dump | Overwhelms, causes decision paralysis | Layered depth — headline first |
| Black-box recommendations | User cannot evaluate or trust them | Show-your-working attribution |
| Unsolicited actions | Makes user feel out of control | Draft-hold-decide cycle |
| Amnesia across sessions | User repeats context, feels unheard | Long-term memory with semantic recall |
| Excessive cheerfulness | Feels inauthentic when project is struggling | Match tone to situation — measured when things are hard |
| Feature bloat | Distracts from core PM workflows | Every feature maps to a specific JTBD |
| Notification spam | Trains user to ignore the system | Triage classification — only "Act now" interrupts |

---

## Part 5: Interaction Patterns

### 5.1 Conversation modes

The copilot operates in distinct conversation modes, each with different agent
ensemble activation and interface behaviour.

#### Quick query mode

**Trigger:** Short factual questions
**Ensemble:** Operator only
**Response time:** <3 seconds
**Examples:**
- "How many open blockers on Atlas?"
- "When is the next milestone?"
- "What is Sarah's email?"

```
User:    "How many open blockers on Atlas?"
Copilot: 2 open blockers:
         1. ATL-342: API migration — blocked 3 days, assigned to DevOps
         2. ATL-350: Environment access — raised today, assigned to Jamie
```

#### Analysis mode

**Trigger:** Questions requiring synthesis across data sources
**Ensemble:** Analyst + Historian
**Response time:** 5-15 seconds (multiple tool calls)
**Examples:**
- "What's the state of Project Atlas?"
- "Show me the velocity trend for the last 5 sprints"
- "Which risks have been open longest?"

#### Decision mode

**Trigger:** Explicit decisions, escalations, plan changes
**Ensemble:** Full ensemble (Analyst → Sceptic → Advocate → Historian →
Synthesiser)
**Response time:** 10-30 seconds (multi-perspective reasoning)
**Examples:**
- "Should we push the beta launch to April?"
- "How should I handle the vendor delay?"
- "I need to choose between hiring a contractor or reducing scope"

#### Action mode

**Trigger:** Request to take an external action
**Ensemble:** Operator + Advocate (for communications)
**Response time:** 5-10 seconds (draft generation)
**Follows:** Draft → hold → review → approve/edit/cancel
**Examples:**
- "Draft an email to Sarah about the delay"
- "Add a comment to ATL-342 about the workaround"
- "Create a new risk in the RAID log for supply chain delays"

#### Pre-mortem mode

**Trigger:** Explicit invocation: "Run a pre-mortem" / "Stress-test this"
**Ensemble:** Sceptic (lead) + Analyst + Historian
**Response time:** 15-30 seconds (adversarial analysis)
**Purpose:** Systematically identify how a plan could fail

```
User:    "Run a pre-mortem on the March launch plan."

Copilot: Pre-mortem: Imagining it is 15 March and the launch failed.
         Most likely causes of failure:

         1. API DEPENDENCY MISS (probability: high, 65%)
            The API v3 release has no confirmed date. The upstream
            team last updated the ticket 12 days ago. If it lands
            after 1 March, integration testing cannot complete.
            Historical: 3 of last 5 upstream deliveries were late.

         2. VELOCITY SHORTFALL (probability: moderate, 40%)
            Current velocity (25 pts/sprint) is 26% below the
            required rate (34 pts/sprint) to complete remaining work.
            Recovery would require zero blockers and full team
            availability — neither is typical.

         3. TESTING BOTTLENECK (probability: moderate, 35%)
            QA capacity drops 50% in week 3 (leave). Remaining
            stories include 3 high-complexity items needing dedicated
            QA time.

         4. SCOPE CREEP PRESSURE (probability: low-moderate, 25%)
            2 new feature requests from stakeholders this week. If
            accepted without trade-offs, the sprint is over-committed.

         Compound probability of at least one failure: ~85%

         Mitigations to discuss:
         - Confirm API date this week or trigger contingency plan
         - Reduce sprint scope to 25 pts (achievable at current velocity)
         - Front-load QA-heavy stories before week 3
         - Explicitly defer new feature requests to next sprint

         Shall I draft these mitigations as action items?
```

#### Retrospective mode

**Trigger:** "Let's retro on [sprint/milestone/decision]"
**Ensemble:** Analyst + Historian + Synthesiser
**Purpose:** Structured reflection on what happened and what to learn

### 5.2 Proactive behaviours (copilot-initiated)

The copilot does not only respond — it initiates when conditions warrant.

| Trigger condition | Copilot behaviour | Urgency |
|------------------|-------------------|---------|
| New working day, user opens app | Morning briefing | Standard |
| User inactive >2 hours during working hours | "Catch-up available when you are ready" | Low |
| Critical blocker detected in background cycle | Interrupt: "New critical blocker on Atlas" | High |
| Artefact updated in background | Activity feed entry (no interrupt) | None |
| Risk open >14 days with no update | "RAID item R-007 has not been reviewed in 16 days" | Medium |
| Hold queue item approaching expiry | "Draft email to Sarah expires in 5 minutes — approve or cancel?" | High |
| Sprint ending, velocity below target | "Sprint 14 ends in 2 days at 62% completion. Carry-over candidates?" | Medium |
| Friday afternoon (or configurable day) | "Shall I draft the weekly status report for Atlas?" | Low |
| Decision made that contradicts previous decision | "Note: this reverses the decision from 2 February to freeze scope" | Medium |
| Multiple signals correlating to a pattern | "Three signals this week point to API team capacity issues" | Medium |

### 5.3 Escalation interaction

When the copilot detects something that requires the user's judgement:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠  DECISION NEEDED                                     │
│                                                          │
│  Beta launch at risk — design dependency                 │
│                                                          │
│  ATL-389 (Profile redesign) marked At Risk.              │
│  Design assets from Acme Studios are 5 days overdue.     │
│  This blocks the beta launch milestone (15 March).       │
│                                                          │
│  OPTIONS:                                                │
│                                                          │
│  A. Delay beta to 7 April                                │
│     + Removes time pressure, allows quality delivery     │
│     − Impacts board presentation on 15 March             │
│     − Precedent: Beacon delay was well-received (Nov)    │
│                                                          │
│  B. Bring design in-house                                │
│     + Eliminates vendor dependency                       │
│     − Requires reallocating 1 engineer for 2 weeks       │
│     − No guarantee of design quality parity              │
│                                                          │
│  C. Reduce scope (cut profile redesign)                  │
│     + Launch on time with reduced feature set            │
│     − Profile redesign was a key differentiator          │
│     − Stakeholder expectation management needed          │
│                                                          │
│  COPILOT RECOMMENDATION: Option A                        │
│  Strongest evidence base. Similar decision on Beacon     │
│  in November was well-received when communicated early.  │
│  Sarah values transparency over deadline compliance.     │
│                                                          │
│  [Choose A]  [Choose B]  [Choose C]  [Discuss further]   │
└─────────────────────────────────────────────────────────┘
```

---

## Part 6: Detailed Scenario Walkthroughs

### 6.1 Scenario: Monday morning cold start

**Context:** You open the copilot at 8:30am on Monday. You have not interacted
since Friday 4pm. Over the weekend, 3 Jira tickets were updated and 2 emails
arrived.

**Copilot (proactive, on app open):**

```
Good morning. Here is your Monday briefing for Project Atlas:

OVER THE WEEKEND:
• 2 tickets completed: ATL-338 (auth flow), ATL-340 (error handling)
• 1 ticket moved to In Review: ATL-341 (search API)
• Email from Sarah Chen (Saturday 10:14): Approved reduced scope for
  Phase 2. I have logged this as a decision in the decision log.
• Email from Acme Studios (Sunday 18:22): Design assets delayed —
  "aiming for Wednesday." This is the 3rd delay.

ARTEFACT UPDATES I MADE:
• Delivery state: 62% → 68% sprint completion
• Decision log: Added D-014 (Phase 2 scope reduction approved)
• RAID log: Updated R-012 (vendor reliability) severity from
  medium to high based on 3rd consecutive delay

NEEDS YOUR ATTENTION:
• The Acme delay means design assets will not be ready for
  sprint 15 planning (Wednesday). Do you want to:
  A. Proceed with planning without design assets (risk: rework)
  B. Postpone planning to Thursday (risk: shortened sprint)
  C. Escalate to Acme with a firmer deadline
```

**User:** "Option C. Draft something firm but professional. Mention the
contract SLA."

**Copilot (Operator + Advocate):**

```
Draft email to Acme Studios (design@acmestudios.com):

Subject: Design asset delivery — Atlas project SLA reminder

Hi team,

The design assets for the Atlas profile redesign are now 5 days past
the agreed delivery date, and this is the third delay on this
deliverable. Our sprint planning depends on these assets being
available by Wednesday 12 February.

Per our service agreement (clause 4.2), deliverables more than 5
business days overdue trigger a review meeting. I would like to avoid
escalating to that stage.

Could you confirm a firm delivery date by end of day Tuesday? If
Wednesday is not achievable, please let me know immediately so we can
adjust our sprint plan.

Best regards,
[Your name]

---
Tone: Professional, direct. References SLA without threatening.
cc: none (add Sarah if you want sponsor visibility)
Hold: 5 minutes. [Approve] [Edit] [Cancel]
```

### 6.2 Scenario: Mid-sprint crisis

**Context:** It is Wednesday afternoon. You have been in meetings since 10am.
You open the copilot at 3pm.

**Copilot (proactive catch-up):**

```
You have been away for 5 hours. Here is what happened:

CRITICAL (act now):
• ATL-350: New blocker raised by DevOps at 11:42. Jamie Park
  cannot provision the staging environment — access policy change
  blocks all non-admin deploys. This affects 4 in-progress stories.

IMPORTANT (review when ready):
• ATL-341 moved to Done (search API complete)
• ATL-345 story points re-estimated from 5 to 8 (complexity
  discovered during implementation)
• Email from engineering lead: "Can we discuss the API testing
  approach? I have concerns about coverage."

ROUTINE (handled):
• Updated delivery state: sprint progress adjusted for ATL-345
  re-estimate (68% → 63%)
• Updated RAID log: Added I-019 (DevOps access policy blocker)

The DevOps blocker is critical path. It blocks 4 stories and could
cost 2 days of sprint capacity if not resolved today.

Options:
A. I draft an urgent request to the DevOps lead for emergency access
B. You handle it directly (I will provide context for your message)
C. Escalate to engineering manager to unblock via management chain
```

### 6.3 Scenario: The Sceptic challenges a timeline commitment

**Context:** You have just told the copilot you want to commit to a March
launch date for the stakeholder meeting tomorrow.

**User:** "I want to confirm March 15 as the launch date in tomorrow's
steering committee."

**Copilot (Sceptic activated):**

```
Before you commit, I want to surface some data:

VELOCITY REALITY CHECK:
• Required velocity to hit March 15: 34 points/sprint
• Actual velocity (3-sprint rolling average): 25 points/sprint
• Gap: 36% above current capacity

OPEN DEPENDENCIES:
• API v3 from Platform team: No confirmed date. Last update 12 days
  ago. You have no contingency if this slips past 1 March.
• Design assets from Acme: Now promised for Wednesday (3rd delay).

TEAM AVAILABILITY:
• Week of 10 March: 2 engineers on leave (40% capacity reduction)

HISTORICAL PATTERN:
• On Project Beacon, you committed to a November date in similar
  conditions (velocity gap + open dependency). It shipped 19 November
  instead of 1 November. The sponsor was understanding because you
  communicated early.

COMPOUND RISK:
• For March 15 to hold, you need: velocity recovery + API on time +
  design assets this week + zero new blockers + full team availability
  in final week. Probability all hold: roughly 15-25%.

I am not saying March 15 is impossible. I am saying the evidence
does not support committing to it with confidence.

ALTERNATIVE FRAMING FOR TOMORROW:
"We are targeting March 15 with identified risks. If the API
dependency and design assets land this week, we are on track.
I will confirm or revise by 1 March."

This gives you 2 weeks of clarity before committing, and positions
you as rigorous rather than either over-promising or under-delivering.

Would you like to proceed with March 15 as firm, use the hedged
framing, or discuss further?
```

### 6.4 Scenario: Cross-project resource conflict

**Context:** You manage two projects. The copilot detects a resource conflict
in background monitoring.

**Copilot (proactive alert):**

```
⚠ CROSS-PROJECT CONFLICT DETECTED

Jamie Park is assigned to:
• Atlas sprint 15 (10-21 March): ATL-360, ATL-362, ATL-365 (13 points)
• Beacon sprint 8 (10-21 March): BCN-201, BCN-203 (8 points)

Total allocation: 21 story points across 2 sprints = ~160% capacity

This was not flagged in either project's planning because the
assignments happened in different Jira boards.

OPTIONS:
A. Reallocate 8 Beacon points to another engineer
B. Move ATL-365 (5 points) to Atlas sprint 16
C. Discuss with Jamie to confirm what is realistic
D. Flag to both project leads for resolution

Recommendation: Option C first (gather data), then A or B based on
Jamie's input. Do you want me to draft a message to Jamie?
```

---

## Part 7: Product Design — Information Architecture

### 7.1 Primary navigation

```
┌─────────────────────────────────────────────────────────┐
│  PM Copilot                                              │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ 💬 Chat  │ 📊 Dash  │ 📋 Proj  │ ⚡ Actions│ ⚙ Settings │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
```

| Tab | Purpose | Maps to JTBDs |
|-----|---------|---------------|
| **Chat** | Conversational interface — primary interaction point | J-F01–F12, J-E05 |
| **Dashboard** | Mission Control — at-a-glance status across projects | J-F04, J-E01 |
| **Projects** | Per-project detail — artefacts, timeline, RAID | J-F05, J-F06, J-F11 |
| **Actions** | Hold queue, pending decisions, escalations | J-F09, J-F13, J-F14 |
| **Settings** | Autonomy dial, integrations, preferences, memory | J-F14, J-F15 |

### 7.2 Chat interface (primary)

The chat is the **primary** interaction surface. The dashboard and project
views are reference screens — the chat is where work happens.

```
┌─────────────────────────────────────────────────────────┐
│  💬 Chat                         [Atlas ▾] [New session] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Copilot (8:30am) ─────────────────────────────────┐ │
│  │ Good morning. Monday briefing for Atlas:            │ │
│  │                                                     │ │
│  │ • 2 tickets done over weekend                       │ │
│  │ • Sarah approved Phase 2 scope reduction            │ │
│  │ • Acme design assets delayed again (3rd time)       │ │
│  │                                                     │ │
│  │ [View full briefing]  [View artefact changes]       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ You (8:32am) ─────────────────────────────────────┐ │
│  │ Draft a firm email to Acme about the SLA.           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Copilot (8:32am) ─────────────────────────────────┐ │
│  │ ✉ Draft ready — hold queue (5 min)                  │ │
│  │                                                     │ │
│  │ To: design@acmestudios.com                          │ │
│  │ Subject: Design asset delivery — Atlas project SLA  │ │
│  │                                                     │ │
│  │ [Preview] [Approve ✓] [Edit ✏] [Cancel ✕]          │ │
│  │                                                     │ │
│  │ ░░░░░░░░░░░████████ 4:32 remaining                  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────┐               │
│  │ Type a message...          [@] [📎]  │    [Send ↵]   │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

**Key chat UI elements:**

- **Project selector** (top) — scope conversation to a project or "all"
- **Session management** — resume previous session or start fresh
- **Inline actions** — approve/edit/cancel directly in chat (no page navigation)
- **Expandable sections** — briefings, analysis results collapse to headlines
- **Hold queue timer** — visual countdown for pending actions
- **Perspective attribution** — when the ensemble deliberates, labels show which
  perspective contributed (faded, not intrusive)

### 7.3 Dashboard (reference)

The dashboard is a heads-up display, not the primary workspace.

```
┌─────────────────────────────────────────────────────────┐
│  📊 Dashboard                    Last cycle: 2 min ago   │
├──────────────────────────┬──────────────────────────────┤
│                          │                               │
│  PROJECT ATLAS    🟡     │  PROJECT BEACON    🟢         │
│  Sprint 14 — 62%         │  Sprint 8 — 78%              │
│  2 blockers              │  0 blockers                   │
│  1 pending decision      │  No actions needed            │
│                          │                               │
│  [Open in chat]          │  [Open in chat]               │
│                          │                               │
├──────────────────────────┴──────────────────────────────┤
│                                                          │
│  RECENT ACTIVITY                                         │
│  • 10:45 — RAID log updated (Atlas: new blocker I-019)  │
│  • 10:30 — Background cycle: 2 changes detected         │
│  • 09:15 — You approved email to Acme Studios            │
│  • 08:32 — Session: Monday briefing + Acme email         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  PENDING ACTIONS                     COPILOT STATUS      │
│  • 1 escalation (Atlas: beta risk)   Mode: Act           │
│  • 0 held actions                    Budget: $0.18/$0.30 │
│                                      Memory: 142 records │
│  [View all]                          Next cycle: 3 min   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.4 Information density philosophy

The product respects the user's cognitive budget:

| Context | Information density | Rationale |
|---------|-------------------|-----------|
| Morning briefing | High — packed summary | User wants to orient fast |
| Decision support | Medium — structured options | User needs to think, not scan |
| Routine confirmation | Low — "Done." | User does not need details for routine actions |
| Crisis alert | Medium — facts + options | User needs enough to act, not so much they freeze |
| Background activity | Minimal — activity feed line | User should not be distracted by routine |

---

## Part 8: Memory and Personalisation Design

### 8.1 What the copilot remembers

| Memory type | Examples | Source |
|-------------|---------|--------|
| **Project facts** | Sprint cadence, team members, milestones, tech stack | Semantic memory (auto-extracted) |
| **Stakeholder profiles** | Sarah prefers email, formal tone; Jamie is direct, prefers Slack | Semantic memory + episodic |
| **Decision patterns** | User consistently prefers scope reduction over timeline extension | Episodic memory |
| **Communication style** | User writes concise emails, avoids hedging, uses bullet points | Learned from approved drafts |
| **Risk tolerance** | User escalates blockers >2 days old; accepts dependencies <1 week | Episodic memory |
| **Working hours** | Active 8:30-17:30 AEDT, checks in briefly at 21:00 | Behavioural pattern |
| **Session context** | What we discussed in the current and recent sessions | Short-term + summary memory |
| **Past outcomes** | "Vendor delay on Beacon: chose in-house, took 2 extra weeks but worked" | Episodic memory |

### 8.2 Memory-powered interactions

**Without memory (generic assistant):**
```
User:    "Draft an email to Sarah about the delay."
Copilot: "Here is a draft email. Please provide Sarah's email address
          and preferred level of formality."
```

**With memory (copilot):**
```
User:    "Draft an email to Sarah about the delay."
Copilot: Draft to Sarah Chen (sarah.chen@company.com):

         Formal tone (her preference). References the board
         presentation on 15 March (context from previous session).
         Frames delay as proactive risk disclosure (pattern from
         your Beacon communication in November that she responded
         well to).

         [Draft]
```

Memory is the difference between a tool and a partner.

### 8.3 Memory transparency

The user can always inspect and manage what the copilot remembers:

```
Settings > Memory

PROJECT FACTS (142 records)
  "Atlas uses 2-week sprints starting Monday" — learned 3 Feb
  "Sarah Chen is project sponsor" — learned 15 Jan
  [View all] [Edit] [Delete]

DECISION PATTERNS (23 records)
  "Prefers scope reduction over timeline extension" — 3 instances
  "Escalates blockers after 2 days" — 5 instances
  [View all] [Edit] [Delete]

COMMUNICATION STYLE (8 records)
  "Concise emails, bullet points, no hedging" — learned from 12 drafts
  [View all] [Edit] [Delete]

[Clear all memory]  [Export]  [Pause learning]
```

---

## Part 9: Success Metrics

### 9.1 Outcome metrics (does the product deliver value?)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time from "What's the status?" to confident answer | <30 seconds | Session logs |
| PM artefacts up-to-date within 15 min of a signal | >90% of cycles | Background cycle logs |
| Decisions presented with structured options | 100% of escalations | Escalation records |
| Draft communication approval rate (no edits) | >70% after 30 days | Hold queue approval records |
| User-initiated sessions per day | >3 (indicates value) | Session logs |
| Sceptic challenges acknowledged useful | >60% (user clicks "good point" or adjusts plan) | Interaction logs |

### 9.2 Trust metrics (does the user trust the copilot?)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Autonomy dial position after 30 days | "Act" (highest) | Setting history |
| Hold queue graduation | Reaching 1-min holds within 60 days | Graduation state |
| Override rate (user reverses copilot action) | <10% | Action audit trail |
| "Why did you do that?" queries | Decreasing over time | Session logs |
| Memory corrections by user | <5% of records | Memory edit logs |

### 9.3 Efficiency metrics (is the copilot saving time?)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Status report drafting time | <5 min (vs. ~45 min manual) | Session duration |
| Stakeholder email drafting time | <2 min (vs. ~15 min manual) | Session duration |
| RAID log currency | <15 min stale (vs. days when manual) | Artefact timestamps |
| Missed signals (blocker not surfaced within 1 cycle) | 0 | Audit comparison: Jira changes vs. copilot detection |

---

## Part 10: Open Design Questions

| # | Question | Impact | Next step |
|---|----------|--------|-----------|
| 1 | Should the ensemble perspectives be visible by default or opt-in? | UX complexity vs. transparency | A/B test with real usage |
| 2 | How aggressive should the Sceptic be in the first week? | Trust building vs. challenge value | Start gentle, escalate with observed accuracy |
| 3 | Should the copilot initiate conversation (push notifications) or only surface in-app? | Attention management | In-app only for MVP; push for critical-only items later |
| 4 | What is the right hold queue default for a new user? | Safety vs. friction | 30 min for external, 5 min for internal, graduate from there |
| 5 | Should memory learning be opt-in or opt-out? | Privacy vs. seamlessness | Opt-out (learn by default, user can pause or clear) |
| 6 | How should the copilot handle disagreements between projects? | Prioritisation | Surface the conflict, recommend based on milestone urgency |
| 7 | Should the pre-mortem mode be a scheduled ritual (e.g. every Friday) or purely on-demand? | Discipline vs. noise | Offer on Friday, never force |
| 8 | How deep should the Historian's memory go? | Storage cost vs. value | 6 months active, archive beyond that |
| 9 | Should the Sceptic challenge in background cycles, or only in interactive sessions? | Background noise vs. value | Interactive only — background Sceptic challenges queue as escalations |
| 10 | What tone does the copilot adopt when the project is genuinely failing? | Emotional support vs. honesty | Honest but measured. "This is difficult. Here are the options." Never cheerful about bad data. |
