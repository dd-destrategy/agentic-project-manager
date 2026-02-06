# Product Owner Team Analysis

**Date:** 2026-02-06 **Team:** Product Owner (5 agents: PM Specialist, User
Persona, Requirements Analyst, Voice of Customer, Journey Mapper) **Status:**
85% product-ready, 95% feature-complete

---

## Product Vision Assessment

**Problem Statement:** A busy project manager needs to synthesise information
from multiple sources (Jira, Outlook) and maintain PM artefacts (RAID log,
delivery state, backlog summary, decision log) without spending hours manually
consolidating data. Existing tools like Jira Rovo or Asana AI only work within
their own silos.

**Solution Overview:** This is a fully-featured autonomous agent that monitors
Jira and Outlook, automatically generates and updates PM artefacts, escalates
decisions to the user via a structured interface, and handles routine
communications through a hold queue for approval.

**MVP Coherence:** HIGHLY COHERENT. The built product covers Phases 1-3 from the
SPEC, including foundation, core product, and enhancements.

---

## Feature Completeness Audit (vs SPEC.md)

| Feature                               | Spec'd      | Built       | Gap                        | Notes                                                                             |
| ------------------------------------- | ----------- | ----------- | -------------------------- | --------------------------------------------------------------------------------- |
| Mission Control Dashboard             | Yes         | Full        | None                       | Agent status, project cards, escalation summary, activity feed                    |
| Activity Feed (30-sec polling)        | Yes         | Full        | None                       | Real-time events with heartbeat distinction                                       |
| Ingest Interface (conversational AI)  | Yes Phase 3 | Full        | None                       | Screenshot/paste, Claude Sonnet analysis, extracted items. **Bonus beyond spec.** |
| Extracted Items Review                | Yes Phase 3 | Full        | None                       | Approve/dismiss/edit before applying to artefacts                                 |
| Escalation Workflow                   | Yes Phase 2 | Full        | None                       | Triggering signals, agent rationale, options with pros/cons                       |
| Hold Queue (Pending Communications)   | Yes Phase 3 | Full        | None                       | Draft-then-send with 30-min window                                                |
| Artefact Viewer + Diff                | Yes Phase 3 | Full        | None                       | View all 4 artefact types, compare versions                                       |
| Autonomy Dial (Observer/Maintain/Act) | Yes Phase 3 | Full        | None                       | Visual slider with clear level descriptions                                       |
| Dry-Run Mode                          | Yes Phase 2 | Full        | None                       | Toggle switch with status indication                                              |
| Integration Config                    | Yes Phase 3 | Partial     | Setup form needed          | Settings page shown but credentials form not visible                              |
| Agent Status Indicator                | Yes Phase 1 | Full        | None                       | Active/Paused/Error/Starting states, 30s polling                                  |
| Budget Status                         | Yes Phase 2 | Full        | None                       | Daily LLM spend/limit, degradation tier visibility                                |
| Jira Integration                      | Yes Phase 2 | Full        | None                       | Polling via change detection gate                                                 |
| Outlook Integration                   | Yes Phase 3 | Full        | None                       | Graph API delta queries, SES notifications                                        |
| Graduation System                     | Yes Phase 3 | Partial     | Evidence dashboard missing | Autonomy dial shows levels but no "graduation ceremony"                           |
| Anti-Complacency Spot Checks          | Yes Phase 3 | Not visible | Deferred                   | Not in current build                                                              |

---

## User Journey Map: "Monday Morning at 9 AM"

**User Context:** Senior PM with 2 active projects (Jira). Reports daily to
director.

```
Login (1 min)
  | NextAuth credentials
Open Dashboard (30s)
  |-- Agent Status: "Active -- next check in 3m"
  |-- Project Cards: "Project A (on track), Project B (at risk)"
  |-- Escalations: "1 pending" -- sprint delay vs scope trim decision
  |-- 24h Stats: "8 changes detected, 2 escalations, 1 risk added"
  +-- Activity Feed: "Last 10 heartbeats, 3 signal detections"

Decision Point: Review Escalation (2 min) -- FRICTION
  -> Click "1 pending" -> Full-screen escalation detail
  -> See: triggering signals, agent rationale, 2 options with pros/cons
  -> Select "scope trim" -> Add notes -> Submit

Project Check: Click "Project B (at risk)" (3 min)
  -> Delivery state tab: sprint, blockers, metrics
  -> "Show Changes" button reveals diffs vs previous version
  -> RAID log tab: 3 open risks, 1 dependency flagged

Optional: Ingest New Info (5 min)
  -> Click Ingest in sidebar (or use global drawer)
  -> Paste screenshot from Teams chat
  -> Wait 2-3s for Claude to analyse
  -> See extracted items: "Action: contact design team by Friday"
  -> Edit/approve item -> "Applied to RAID log"

Check Pending Actions (1 min) -- FRICTION
  -> Click Pending Communications
  -> "Email to stakeholder: sprint delay notice" (held for 30 min)
  -> "Approve" -> executes immediately
```

**Total workflow: ~15-20 minutes**

**Key Friction Points:**

1. No quick escalation from dashboard (must navigate to detail page)
2. Artefact types listed as tabs, not summarised at a glance
3. No breadcrumb on escalation detail for project context
4. Graduation evidence missing — no confidence indicator for autonomy promotion

---

## Persona: "Sarah, Director of Engineering"

**Sarah's mental model (after 1 week):**

> "I open the dashboard. I see three cards: Project A green, Project B amber,
> Project C paused. Below that, one red escalation. I click it, read the agent's
> recommendation, choose scope bloat, and move on. The RAID log auto-updated
> based on Jira signals. No manual consolidation."

**What delights Sarah:**

- Artefacts update themselves — no "Friday PM consolidation ritual"
- Escalations are structured — options with pros/cons, not vague alerts
- Hold queue gives safety — email won't go out without her seeing it
- Agent transparency — she sees why it classified something as a risk
- Activity feed shows "idle" heartbeats — she knows the system is watching

**What frustrates Sarah:**

- No quick overview of all escalations across projects
- RAID log is a raw JSON view in a tab
- No native Teams integration (relies on ingest interface for screenshots)
- Graduation system feels nebulous — no progress indicator

---

## Voice of Customer Assessment

**Would a PM actually use this daily? YES, but with caveats.**

| Scenario                        | Likelihood  | Why                                                   |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| Day 1-7: Monitoring mode        | High        | Dashboard shows real data, escalations useful         |
| Week 2-4: Artefact updates      | High        | Auto-update from Jira. PM saves 2-3h/week             |
| Week 4-8: Hold queue approvals  | Medium-High | Feels safe but some PMs may disable entirely          |
| Month 2+: Autonomy dial changes | Medium      | Requires trust. First wrong decision drops trust fast |
| Month 3+: Sustained usage       | Medium-Low  | Risk of automation complacency                        |

**What would make them LOVE it:**

1. Structured artefact UIs (RAID as cards, not JSON)
2. Graduation evidence dashboard
3. Quick escalation modal from dashboard
4. Activity insights breakdown (3 from Jira, 2 from Outlook)
5. Morning digest email

**What would make them STOP using it:**

1. High false escalation rate (>50% noise)
2. Stale artefacts (no update in 3 days)
3. Missed critical changes
4. Unauthorised actions at higher autonomy levels
5. Poor escalation UX (>5 minutes per decision)

---

## What's Working Exceptionally Well

1. **Ingest Interface** — "Product differentiator." No other PM tool has this.
2. **Escalation Workflow** — Right way to ask a human for a decision
3. **Agent Status Indicator** — Visual, transparent, unobtrusive
4. **Hold Queue** — Safety mechanism that builds trust
5. **Autonomy Dial** — Clear levels with explicit can/cannot lists
6. **Real-Time Activity Feed** — Shows agent is alive and working
7. **Project Artefacts + Diff** — Version tracking with one-deep undo

---

## Critical Gaps (Blocking Real Usage)

### 1. Artefacts Are Raw JSON, Not Structured UI

PM artefacts (RAID log, delivery state, backlog summary, decision log) shown as
JSON blobs in tabs. **Impact:** High — artefacts are the core value.

**Fix:** 5-10 days of UI work for card-based, structured displays.

### 2. Graduation System Not Visible

No evidence dashboard, no "days monitored: 3/7" counter, no ceremony.
**Impact:** Medium — user hesitates to promote autonomy.

**Fix:** 3-5 days for `/graduation` page with progress tracking.

### 3. No Global Escalation Summary

Unclear how many escalations are pending across all projects. **Impact:** Medium
— user might miss critical decisions.

**Fix:** Escalation banner on dashboard with count and quick-approve modal.

### 4. Decision Log Not User-Friendly

Only viewable through artefact viewer tab as JSON. **Impact:** Low-Medium —
users need to look up past decisions.

---

## Prioritised Product Backlog

| Priority    | User Story                                   | Value                | Effort |
| ----------- | -------------------------------------------- | -------------------- | ------ |
| 1 (Block)   | RAID log as structured cards (not JSON)      | Artefact UX unusable | 5d     |
| 2 (Block)   | Delivery state as sprint progress cards      | Same                 | 5d     |
| 3 (Block)   | Decision log with context and rationale      | Same                 | 3d     |
| 4 (Block)   | Graduation evidence dashboard                | Removes hesitation   | 4d     |
| 5 (Block)   | Escalation modal from dashboard              | Reduces friction 50% | 2d     |
| 6 (High)    | Pending communications badge in sidebar      | Visibility           | 1d     |
| 7 (High)    | Artefact change summaries in activity feed   | Visibility           | 2d     |
| 8 (High)    | Projects list page                           | IA improvement       | 2d     |
| 9 (Medium)  | Escalation breadcrumbs with project context  | UX polish            | 1d     |
| 10 (Medium) | Diff preview after approving extracted items | Trust                | 3d     |

---

## Key Metrics to Track (Post-Launch)

| Metric                    | Target              | Why                                     |
| ------------------------- | ------------------- | --------------------------------------- |
| Artefact trust score      | >80%                | Core value — if <60%, user stops        |
| Escalation accuracy       | >90%                | If <80%, user disables agent            |
| Time saved per week       | >2-3 hours          | Kill threshold: <3h/week, stop building |
| Autonomy level 2 adoption | >50% within 4 weeks | Measures trust curve                    |
| False escalation rate     | <5%                 | If >20%, user disables agent            |
| Hold queue approval rate  | >90%                | If <70%, user disables hold queue       |

---

## Summary

**Status: 85% product-ready, 95% feature-complete.**

With 2 weeks of focused UX work (structured artefact displays + graduation
dashboard), this becomes a genuinely delightful tool that a PM would use daily.

**Current state:** Excellent prototype. **Future state (2 weeks):**
Production-ready product.
