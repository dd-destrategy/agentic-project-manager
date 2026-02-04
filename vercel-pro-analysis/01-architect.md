# Architect Analysis: Vercel Pro Upgrade Implications

**Analyst:** Architect Specialist
**Date:** February 2026
**Change Under Review:** Upgrade from Vercel Hobby (free, 10s function limit) to Vercel Pro ($20/month, 300s function limit)

---

## Executive Summary

The Vercel Pro upgrade removes the 10-second function timeout constraint but does **not** fundamentally change the optimal architecture. The VPS remains necessary and should continue to own the agent loop and all LLM calls. The primary benefits are **SSR for dashboard pages** and **simpler API routes** — quality-of-life improvements, not architectural rewrites.

**Recommendation:** Keep the VPS as the agent runtime. Use Vercel Pro to enable SSR for dashboard data and eliminate the "static shell" complexity. Do not move LLM calls or the agent loop to Vercel.

---

## 1. Decisions That Can Be Simplified or Reversed

### 1.1 Static Shell Pattern — REVERSE THIS

**Current state (SPEC.md lines 138-139, 734):**
> "Static shell pattern for frontend: The dashboard serves a static shell from CDN with client-side data fetching."
> "No SSR for dashboard data: Avoids Vercel function time limits and Neon cold start dependency on page load."

**With Vercel Pro (300s limit):**

This constraint is now obsolete. Even with a worst-case Neon cold start (2-5 seconds) plus database query time (100-500ms), SSR comfortably fits within 300 seconds.

**Recommendation: Enable SSR for dashboard data.**

Benefits:
- Simpler code — remove TanStack Query polling infrastructure from Mission Control
- Better initial load — user sees real data immediately, not a loading spinner
- SEO irrelevant (single user), but better perceived performance
- Eliminate the complexity of coordinating client-side fetch timing

Implementation:
- Mission Control, Activity Feed, Decision Interface, Project Detail can all use React Server Components with `fetch()` or Drizzle queries
- Remove TanStack Query entirely or retain only for real-time updates (escalation status changes)
- Keep 30-second polling for activity feed if desired, but initial render is SSR

### 1.2 "Vercel Reads Only" Rule — PARTIALLY RELAX

**Current state (SPEC.md line 135-136):**
> "Vercel reads from the database only. It never writes agent state, actions, or artefacts. The VPS owns all writes except user config changes."

**With Vercel Pro:**

The hard separation was partially driven by timeout constraints (writes + LLM processing could exceed 10s). With 300s available, Vercel functions can handle more complex operations.

**Recommendation: Allow Vercel to write for user-initiated actions, but keep agent writes on VPS.**

Specifically:
- **Move to Vercel:** User decisions on escalations, autonomy level changes, project configuration updates, hold queue approvals/rejections
- **Keep on VPS:** All agent-initiated writes — artefact updates, event logging, action execution, checkpoint management

Rationale: User-initiated writes are low-frequency, low-complexity, and benefit from Vercel's lower latency to the user. Agent writes are high-frequency, tied to the agent loop, and should stay co-located with the loop.

### 1.3 API Routes — SIMPLIFY

**Current state:**
API routes were constrained to fast, read-only operations.

**With Vercel Pro:**

API routes can now include:
- Aggregation queries that might take 1-2 seconds
- User decision processing with validation and multiple database writes
- Integration health checks (if triggered by user from dashboard)

**Recommendation:** Build straightforward API routes without artificial complexity. No need to offload logic to client-side or VPS just because it might take 5+ seconds.

---

## 2. LLM Calls: VPS, Vercel, or Split?

**Recommendation: All LLM calls stay on the VPS. Do not split.**

### Why not move LLM calls to Vercel?

1. **Agent loop locality.** LLM calls happen within the agent's 15-minute cycle: signal triage, artefact generation, reasoning. Moving LLM calls to Vercel means the VPS agent would need to call a Vercel function, wait for the response, then continue. This adds network latency, failure modes, and complexity for zero benefit.

2. **Cost.** Vercel Pro includes 1,000 GB-hours of function execution per month. A single 60-second Sonnet call consuming 1GB of memory uses 0.017 GB-hours. At 3 Sonnet calls/day × 30 days = 90 calls/month × ~30 seconds average = 45 minutes = 0.75 GB-hours. Haiku is lighter but more frequent. The budget fits, but why spend it when the VPS already handles this reliably?

3. **Timeout still matters.** 300 seconds is generous but not infinite. A complex Sonnet reasoning call with retries could approach 60-90 seconds. Neon cold start adds 2-5 seconds. Stacking multiple operations in one function risks timeout. The VPS has no timeout.

4. **Serverless anti-pattern.** LLM calls are long-running, stateful (require context assembly), and tied to a loop — exactly the workload serverless is bad at.

### What about user-initiated LLM calls?

The current architecture has no user-initiated LLM calls — the agent operates autonomously and the user views results. If we added a "regenerate artefact" button or chat interface, those calls could reasonably route through Vercel.

**Recommendation:** If user-initiated LLM features are added later, those specific calls can use Vercel functions. But this is a new feature, not a change to existing architecture.

---

## 3. Does the VPS Remain Necessary?

**Yes. The VPS is still essential.**

### Minimum viable VPS role

Even with Vercel Pro, the VPS must handle:

1. **The agent loop.** A persistent process that wakes every 15 minutes, polls APIs, runs change detection, invokes Claude, executes actions. Serverless cannot run a persistent loop.

2. **Neon keepalive.** `SELECT 1` every 4 minutes to prevent cold starts. Vercel Cron's minimum interval is 1 minute, but triggering a function every 4 minutes just to send a keepalive query is wasteful and adds latency compared to a persistent connection.

3. **Hold queue processing.** The agent must check `held_until` timestamps and execute actions when they mature. This requires a persistent process.

4. **Persistent database connection.** The VPS uses `node-postgres` with a persistent connection. Serverless functions reconnect on every invocation, even with Neon's serverless driver.

### Can any VPS responsibilities move to Vercel?

| Responsibility | Move to Vercel? | Rationale |
|----------------|-----------------|-----------|
| Agent loop (15-min cycle) | **No** | Serverless cannot run persistent loops |
| Neon keepalive | **No** | Cron + function invocation is more complex than a simple `setInterval` |
| LLM calls | **No** | See section 2 |
| Hold queue processing | **No** | Requires continuous clock, not event-triggered |
| Integration API polling | **No** | Part of agent loop |
| Heartbeat logging | **No** | Part of agent loop |
| Daily housekeeping | **Maybe** | Could use Vercel Cron, but simpler to keep in agent loop |

**Conclusion:** The VPS role is essentially unchanged. It remains the agent runtime.

---

## 4. Can the Agent Loop Move to Vercel Cron + Pro Functions?

**No. This would be a significant regression.**

### Technical analysis

Vercel Cron can trigger a function every 15 minutes. A Vercel Pro function can run for up to 300 seconds. In theory, the agent cycle could execute within one function invocation.

### Why this is a bad idea

1. **No persistent state.** Each invocation starts cold. The agent would need to reload all context from the database — project state, artefact content, recent events. The VPS keeps this in memory.

2. **No persistent connection.** Every invocation reconnects to Neon. Even with the serverless driver, this adds 50-200ms latency per cycle. The VPS connection is always warm.

3. **Cold start latency.** Vercel functions cold-start in 100-500ms. The VPS is always running.

4. **Keepalive incompatibility.** The 4-minute Neon keepalive cannot run within a function that only executes every 15 minutes. You'd need a separate Cron job every 4 minutes just for keepalive, which defeats the purpose of consolidating onto Vercel.

5. **Hold queue timing.** The hold queue relies on checking `held_until` timestamps. If a message is held for 30 minutes and the Cron runs every 15 minutes, processing could be delayed by up to 15 minutes beyond the intended release time. The VPS can check every 60 seconds without cost.

6. **Complexity for no savings.** The VPS costs ~$4/month. Moving to Vercel Cron doesn't eliminate this cost — it trades it for function execution costs and added complexity. Vercel Pro's base cost is $20/month; you're not saving money.

7. **Reliability.** Vercel Cron is designed for lightweight triggers, not primary workloads. A pm2-managed Node.js process with restart policies is more reliable for always-on operation.

**Verdict:** The agent loop stays on the VPS. This is not a constraint; it's the correct architecture.

---

## 5. New Architectural Patterns Now Viable

### 5.1 Server-Side Rendering (SSR) for Dashboard

**Now viable.** All dashboard views can render with real data on the server:

```tsx
// Before (static shell + client fetch)
export default function MissionControl() {
  const { data, isLoading } = useQuery('dashboard', fetchDashboard);
  if (isLoading) return <DashboardSkeleton />;
  return <Dashboard data={data} />;
}

// After (SSR)
export default async function MissionControl() {
  const data = await db.query.projects.findMany({ ... });
  return <Dashboard data={data} />;
}
```

Benefits: Faster perceived load, simpler code, no loading states for initial render.

### 5.2 Server Actions for User Operations

**Now viable.** User decisions, configuration changes, and approvals can use Server Actions:

```tsx
// escalation decision
async function decideEscalation(formData: FormData) {
  'use server';
  const decision = formData.get('decision');
  await db.update(escalations)
    .set({ status: 'decided', user_decision: decision, decided_at: new Date() })
    .where(eq(escalations.id, escalationId));
  revalidatePath('/escalations');
}
```

Benefits: No separate API route needed, automatic revalidation, type-safe.

### 5.3 API Routes with Complex Operations

**Now viable.** API routes can perform multi-step operations:

- Fetching and aggregating data from multiple tables
- Validating and processing user input with database lookups
- Triggering integration health checks on demand

### 5.4 Streaming for Activity Feed

**Now viable (optional).** React Server Components with streaming could provide real-time activity feed updates:

```tsx
export default async function ActivityFeed() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <EventStream />
    </Suspense>
  );
}
```

This is optional — polling still works — but streaming is now architecturally possible.

---

## 6. What Should NOT Change

### 6.1 VPS as Agent Runtime — KEEP

The VPS is not a workaround for Vercel limitations. It's the correct place for a persistent, stateful, always-on agent process. Vercel Pro doesn't change this calculus.

### 6.2 LLM Calls on VPS — KEEP

All Claude API calls should remain on the VPS. They're part of the agent loop, not user-initiated, and benefit from persistent connections and no timeout constraints.

### 6.3 Agent Owns Writes for Agent Operations — KEEP

The agent writes artefacts, events, actions, and checkpoints. Vercel writes user configuration and decisions. This separation is about data ownership, not timeout constraints.

### 6.4 Budget Controls and Degradation Ladder — KEEP

The $10/month LLM budget ceiling and degradation ladder (section 6.3 of SPEC.md) are unchanged. Vercel Pro adds $20/month to infrastructure costs, but the LLM budget is separate.

### 6.5 Neon Keepalive from VPS — KEEP

The 4-minute `SELECT 1` keepalive should stay on the VPS. It requires a persistent process.

### 6.6 Drizzle ORM and Schema — KEEP

No reason to change. Drizzle works with both `pg` (VPS) and `@neondatabase/serverless` (Vercel).

### 6.7 NextAuth with Credentials Provider — KEEP

Single-user auth is unchanged.

### 6.8 Two-Stage Triage for Security — KEEP

Prompt injection defence has nothing to do with Vercel tier.

### 6.9 Database Connection Strategy — KEEP (with nuance)

The VPS still uses `pg` (persistent connection). Vercel still uses `@neondatabase/serverless` (HTTP-based). SSR functions will use the serverless driver. This is correct.

---

## 7. Updated Architecture Diagram

```
YOU (browser)
  │
  ▼
┌─────────────────────────────┐
│  Vercel Pro ($20/month)     │
│  Next.js App Router (SSR)   │
│  - Mission Control (SSR)    │
│  - Activity Feed (SSR)      │
│  - Decision Interface (SSR) │
│  - Project Detail (SSR)     │
│  - Settings (SSR)           │
│  - Server Actions (writes)  │
│  - API routes (if needed)   │
└─────────────┬───────────────┘
              │ reads + user writes
              │ (@neondatabase/serverless)
              ▼
┌─────────────────────────────┐
│  Neon PostgreSQL (free)     │
│  0.5 GB storage             │
│  - (unchanged)              │
└─────────────┬───────────────┘
              │ reads/writes (node-postgres)
              │ persistent connection
              ▼
┌─────────────────────────────┐
│  Hetzner VPS CX22 (~$4/mo)  │
│  Ubuntu, Caddy, pm2         │
│  Node.js agent process      │
│  - (unchanged)              │
│  - All LLM calls            │
│  - All agent writes         │
└─────────────────────────────┘
```

**Changes highlighted:**
- Vercel now does SSR (not static shell)
- Vercel can write user decisions via Server Actions
- Everything else is structurally identical

---

## 8. SPEC.md Updates Required

If this analysis is accepted, the following SPEC.md sections need revision:

| Section | Current Text | Proposed Change |
|---------|-------------|-----------------|
| 2. Locked Decisions, Architecture table | "Vercel (free hobby tier)" | "Vercel Pro ($20/month)" |
| 2. Locked Decisions, Constraints table | "$10/month total" | Update budget ceiling (TBD) |
| 3. Architecture, Rule 1 | "All LLM calls route through the VPS, never through Vercel functions. The Vercel 10-second hobby tier limit..." | Remove timeout justification, keep the rule on its own merits |
| 3. Architecture, Rule 5 | "Static shell pattern for frontend..." | Remove or reframe as optional optimisation |
| 8.2 Frontend architecture | "Static shell pattern... No SSR for dashboard data..." | "SSR for all dashboard views. Initial data renders server-side." |
| 11. Risk Register, #7 | "Neon cold starts cause Vercel function timeouts" | Lower severity or remove — 300s limit eliminates this risk |

---

## 9. Summary of Recommendations

| Category | Recommendation |
|----------|----------------|
| SSR | **Enable.** Reverse the static shell decision. Use RSC for all dashboard views. |
| LLM calls | **Keep on VPS.** Do not move to Vercel. |
| Agent loop | **Keep on VPS.** Do not move to Vercel Cron. |
| VPS | **Keep.** Minimum viable role is unchanged. |
| Vercel writes | **Allow for user actions.** Server Actions for decisions, config, approvals. |
| TanStack Query | **Remove or reduce.** SSR eliminates need for initial data fetching; keep only for real-time updates if desired. |
| Budget | **Acknowledge $20/month increase.** Total infrastructure now ~$24/month + LLM costs. |

---

## 10. Cost Impact

| Component | Before | After | Delta |
|-----------|--------|-------|-------|
| Vercel | $0 (Hobby) | $20 (Pro) | +$20 |
| Hetzner VPS | ~$4 | ~$4 | $0 |
| Neon | $0 (Free) | $0 (Free) | $0 |
| Resend | $0 (Free) | $0 (Free) | $0 |
| LLM (Claude) | ~$4-6 | ~$4-6 | $0 |
| **Total** | **~$8-10** | **~$28-30** | **+$20** |

The $10/month constraint in SPEC.md section 1 must be revisited. The new budget ceiling should be explicitly stated, likely $30-35/month.

---

## Conclusion

Vercel Pro is a quality-of-life upgrade, not an architectural revolution. The primary benefit is enabling SSR and simplifying frontend code. The VPS remains essential and should continue to own the agent loop and all LLM operations. Do not over-engineer in response to the lifted constraint — the current architecture is sound; we're just removing unnecessary complexity that was driven by the 10-second limit.
