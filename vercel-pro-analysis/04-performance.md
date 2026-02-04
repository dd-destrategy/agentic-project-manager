# Performance Analysis: Vercel Hobby to Pro Upgrade

> **Analyst:** Performance Specialist
> **Change:** Vercel Hobby (free, 10s function limit) → Vercel Pro ($20/month, 300s function limit)
> **Date:** February 2026

---

## Executive Summary

The 300-second function limit fundamentally changes the performance constraints that shaped the current architecture. The critical concern documented in SPEC.md Section 3 — "Vercel 10-second hobby tier limit combined with Neon cold starts leaves insufficient headroom" — is effectively eliminated as a timeout risk. However, cold starts remain a latency concern for user experience, and several architectural patterns remain valuable despite the relaxed constraints.

**Key findings:**
- Neon cold start timeout risk: **Eliminated** (295s headroom vs 5-8s previously)
- VPS keepalive: **Still valuable** for agent cycle performance
- Vercel function keepalive: **Not recommended** (cost vs benefit)
- SSR feasibility: **Technically viable** but static shell still preferred for UX
- Agent on Vercel Cron: **Feasible** but VPS remains more cost-effective
- Concurrency limits: **Irrelevant** for single-user tool

---

## 1. Neon Cold Start Interaction

### Current Constraint Analysis

The spec documents this concern in Section 3, Key Architectural Rule 1:

> "All LLM calls route through the VPS, never through Vercel functions. The Vercel 10-second hobby tier limit combined with Neon cold starts leaves insufficient headroom."

**Original arithmetic:**
| Component | Time | Remaining |
|-----------|------|-----------|
| Vercel function limit | 10,000ms | 10,000ms |
| Neon cold start (P95) | 2,000-5,000ms | 5,000-8,000ms |
| Available for queries | — | **5,000-8,000ms** |

This left insufficient margin for complex queries, error handling, or retry logic.

**Updated arithmetic with Vercel Pro:**
| Component | Time | Remaining |
|-----------|------|-----------|
| Vercel function limit | 300,000ms | 300,000ms |
| Neon cold start (P95) | 2,000-5,000ms | 295,000-298,000ms |
| Available for queries | — | **295,000-298,000ms** |

**Verdict:** The timeout concern disappears entirely. Even the most complex query chain with multiple retries fits comfortably within 300 seconds.

### VPS Keepalive (4-minute SELECT 1)

**Current pattern from SPEC.md Section 3:**
> "Neon keepalive: the agent sends `SELECT 1` every 4 minutes to prevent cold starts (2-5 seconds) on every 15-minute cycle."

**Is this still needed with 300s limits?**

Yes, but for a different reason. The keepalive prevents cold starts not to avoid timeouts, but to optimise agent cycle latency:

| Scenario | Cold start overhead | Impact |
|----------|-------------------|--------|
| Without keepalive | 2-5s every 15-min cycle | +2-5s per cycle = 96-320 extra seconds/day |
| With keepalive | ~0ms (database stays warm) | Cycles complete faster |

The VPS runs continuously anyway, so the keepalive has zero marginal cost. **Recommendation: Keep the 4-minute keepalive.**

### Vercel Function Keepalive

Should Vercel functions implement their own keepalive to prevent cold starts on dashboard access?

**Cost-benefit analysis:**

A Vercel cron job running every 4 minutes:
- 15 invocations/hour × 24 hours = 360 invocations/day
- Each invocation: ~100ms execution time
- Monthly execution: ~10,800 invocations × 100ms = 18 minutes of function time
- Pro tier includes 1000 GB-hours; this is negligible
- **But:** Vercel Cron minimum interval is 1 minute, not 4 minutes

**Alternative: Rely on VPS keepalive:**
- The VPS already queries Neon every 4 minutes
- This keeps the database warm for Vercel functions too
- No additional cost or complexity

**Recommendation:** Do not implement Vercel-specific keepalive. The VPS keepalive already maintains database warmth. For edge cases where a user accesses the dashboard during a prolonged VPS outage, the 2-5s cold start is acceptable given the 300s budget.

---

## 2. Dashboard Performance

### Current Pattern

From SPEC.md Section 8.2:
> "Static shell pattern: Layout and navigation render instantly from CDN; data fetches client-side"
> "No SSR for dashboard data: Avoids Vercel function time limits and Neon cold start dependency on page load"

### SSR Feasibility with 300s Limit

With 300 seconds available, SSR is technically feasible. The question becomes: should we use it?

**Worst-case SSR page load calculation:**

| Component | Typical | Worst Case |
|-----------|---------|------------|
| Neon cold start | 0ms (warm) | 5,000ms |
| Database queries (dashboard data) | 50ms | 200ms |
| React Server Component render | 100ms | 500ms |
| Network latency (Vercel edge → user) | 50ms | 200ms |
| **Total** | **200ms** | **5,900ms** |

**Static shell pattern comparison:**

| Phase | Time | User sees |
|-------|------|-----------|
| CDN delivers static shell | 50-100ms | Navigation, layout, loading skeletons |
| JavaScript hydration | 200-500ms | Interactive shell |
| Client-side data fetch (parallel) | 50ms-5,500ms | Loading states → data |
| **Time to interactive** | **250-600ms** | Usable UI immediately |
| **Time to complete** | **300-6,000ms** | Same total, but progressive |

**Perceived performance comparison:**

| Metric | SSR | Static Shell | Winner |
|--------|-----|--------------|--------|
| First Contentful Paint (cold) | ~5,900ms | ~100ms | Static Shell |
| First Contentful Paint (warm) | ~200ms | ~100ms | Static Shell |
| Time to Interactive (cold) | ~5,900ms | ~500ms | Static Shell |
| Time to Interactive (warm) | ~200ms | ~500ms | SSR (marginal) |
| Time to Full Data (cold) | ~5,900ms | ~5,600ms | Similar |
| Time to Full Data (warm) | ~200ms | ~350ms | SSR |

**Recommendation:** Retain the static shell pattern. The 300s limit removes the risk of timeout, but cold starts still cause 5+ second delays. The static shell provides dramatically better perceived performance during cold starts (100ms vs 5,900ms to first paint). The warm-state advantage of SSR (~150ms) doesn't justify the cold-state penalty.

**Optional enhancement:** With 300s available, API routes could perform more complex aggregations server-side, reducing client-side computation. This is a modest optimisation, not a pattern change.

---

## 3. Agent Cycle Timing on Vercel

### Hypothetical: Agent on Vercel Cron + Pro Functions

If the agent loop moved from VPS to Vercel Cron, what would the performance profile look like?

**Agent cycle breakdown (from SPEC.md Section 5.1):**

| Step | Operation | Typical Time | Worst Case |
|------|-----------|--------------|------------|
| 1 | Keepalive SELECT 1 | 10ms | 5,010ms (cold) |
| 2 | Jira API poll | 500ms | 2,000ms |
| 2 | Outlook delta query | 500ms | 2,000ms |
| 3 | Signal normalisation | 50ms | 100ms |
| 4a | Sanitise pass (Haiku) | 1,500ms | 3,000ms |
| 4b | Classify pass (Haiku) | 1,500ms | 3,000ms |
| 5 | Reasoning (Sonnet, 15% of cycles) | 0ms / 5,000ms | 0ms / 10,000ms |
| 6 | Execution (5 actions) | 500ms | 2,000ms |
| 7 | Artefact maintenance | 1,000ms | 2,000ms |
| 8 | Hold queue check | 200ms | 500ms |
| 9 | Housekeeping (daily only) | 0ms / 500ms | 0ms / 2,000ms |

**Cycle timing summary:**

| Scenario | Total Time | Fits in 300s? |
|----------|------------|---------------|
| No changes detected | ~1,500ms | Yes |
| Typical cycle (changes, Haiku only) | ~8,000ms | Yes |
| Complex cycle (Sonnet reasoning) | ~15,000ms | Yes |
| Worst case (cold start, Sonnet, housekeeping) | ~31,000ms | Yes |
| Extreme worst case (all retries, all features) | ~60,000ms | Yes |

**Verdict:** The agent cycle fits comfortably within 300 seconds even in extreme scenarios.

### Vercel Cron Constraints

However, Vercel Cron has limitations that affect this use case:

| Constraint | Vercel Cron | VPS (current) |
|------------|-------------|---------------|
| Minimum interval | 1 minute | Arbitrary |
| Maximum interval | 1 day | Arbitrary |
| Cold start each invocation | Yes | No (persistent process) |
| Connection pooling | No (stateless) | Yes |
| Keepalive granularity | 1 minute minimum | 4 minutes (current) |
| Cost model | Per-execution | Fixed monthly |

**Key issues:**

1. **No 4-minute keepalive:** Vercel Cron minimum is 1 minute. To maintain Neon warmth, you'd need 1-minute invocations (15× more than necessary).

2. **Cold function start overhead:** Each cron invocation is a fresh function instance. Add ~500ms cold start overhead per cycle.

3. **No persistent connection:** The VPS maintains a persistent `node-postgres` connection (lower latency, supports transactions). Vercel functions use `@neondatabase/serverless` (HTTP-based, higher latency per query).

4. **Cost:** VPS is ~$4/month fixed. Vercel Pro function execution for 96 daily cycles (15-min intervals) × 30 days × ~15s average = ~12 hours/month. This is within Pro limits but adds to the execution budget.

**Recommendation:** Keep the agent on VPS. The 300s limit makes Vercel technically feasible, but VPS remains more cost-effective and architecturally simpler (persistent connections, flexible scheduling, fixed costs).

---

## 4. Concurrency

### Vercel Pro Concurrency Limits

| Tier | Concurrent Executions |
|------|----------------------|
| Hobby | 10 |
| Pro | 1,000 |

### Single-User Access Patterns

| Scenario | Concurrent Requests |
|----------|---------------------|
| Single page load | 1-3 (parallel data fetches) |
| Rapid navigation | 3-5 |
| Dashboard with 30s polling | 1 per 30s |
| Multiple tabs open | 2-6 |
| **Realistic maximum** | **~10** |

**Analysis:** Even Vercel Hobby's 10 concurrent executions is sufficient for a single-user tool. The 1,000 limit on Pro provides headroom that will never be used.

**Verdict:** Concurrency limits are irrelevant to this project. This is not a factor in the Hobby → Pro decision.

---

## 5. Updated Performance Calculations

### Spike S4 (Neon Free Tier Performance)

**Original pass criteria (SPEC.md Appendix B):**
> "P95 query latency < 500ms with keepalive. Understand cold start behaviour without keepalive."

**Updated interpretation:**

| Metric | Original Relevance | With 300s Limit |
|--------|-------------------|-----------------|
| P95 query latency (warm) | Critical for timeout safety | Still important for UX |
| Cold start latency | Critical for timeout safety | Important for UX, not timeout |
| Pass criteria | < 500ms with keepalive | **Unchanged** |

The pass criteria remain valid. The difference is that exceeding 500ms no longer risks timeout — it only impacts user experience.

### Section 3 Architecture Rules

**Rule 1 (original):**
> "All LLM calls route through the VPS, never through Vercel functions."

**Updated assessment:**

| Factor | Vercel Pro | VPS | Recommendation |
|--------|------------|-----|----------------|
| Time budget | 300s (sufficient) | Unlimited | Either works |
| Cold start | +500ms per invocation | None (persistent) | VPS preferred |
| Connection type | HTTP-based serverless | Persistent TCP | VPS preferred |
| Cost | Per-execution | Fixed $4/month | VPS preferred |
| Complexity | Stateless, context rebuild | Stateful, natural | VPS preferred |

**Recommendation:** Retain VPS for LLM calls. The 300s limit removes the hard constraint, but VPS remains the better choice for performance and cost.

**Rule 5 (original):**
> "Static shell pattern for frontend: The dashboard serves a static shell from CDN with client-side data fetching."

**Updated assessment:** Pattern remains optimal. See Section 2 analysis.

### Section 11 Risk Register

**Risk 7 (original):**
> "Neon cold starts cause Vercel function timeouts"
> "Mitigation: Static shell pattern. Keepalive from agent. No SSR for dashboard data."

**Updated risk assessment:**

| Aspect | Original Risk | With 300s Limit |
|--------|--------------|-----------------|
| Timeout probability | Medium (5-8s leaves little margin) | **Negligible** (295s margin) |
| User experience impact | High (function failure = error page) | Medium (slow page load) |
| Severity | **Significant** | **Watch** |

**Revised risk statement:**
> "Neon cold starts cause slow page loads (2-5s latency spike)"
> "Mitigation: VPS keepalive keeps database warm. Static shell provides immediate visual feedback. Accept occasional slow loads for edge cases."

**Recommended action:** Downgrade from "Significant" to "Watch" category in the risk register.

---

## Summary of Recommendations

| Area | Recommendation | Rationale |
|------|----------------|-----------|
| VPS 4-minute keepalive | **Keep** | Reduces agent cycle latency, zero marginal cost |
| Vercel keepalive | **Don't implement** | VPS keepalive sufficient, added complexity |
| Static shell pattern | **Keep** | Better perceived performance during cold starts |
| SSR for dashboard | **Don't adopt** | Cold start penalty (5.9s) outweighs warm benefit (150ms) |
| Agent on Vercel Cron | **Don't migrate** | VPS is cheaper, simpler, faster |
| Risk 7 severity | **Downgrade to Watch** | Timeout risk eliminated |

### Performance Budget Summary

| Scenario | Time Budget | Typical Use | Margin |
|----------|-------------|-------------|--------|
| Dashboard API route | 300,000ms | 200-5,500ms | 98%+ |
| Complex aggregation | 300,000ms | 2,000-8,000ms | 97%+ |
| Agent cycle (if on Vercel) | 300,000ms | 8,000-31,000ms | 90%+ |

The 300-second limit provides enormous headroom. The original architecture decisions remain sound for reasons beyond timeout avoidance (cost, latency, simplicity), but the upgrade removes a significant operational risk.

---

## Appendix: Latency Calculation Details

### Neon Cold Start Distribution (estimated)

| Percentile | Latency |
|------------|---------|
| P50 | 2,000ms |
| P75 | 3,000ms |
| P90 | 4,000ms |
| P95 | 5,000ms |
| P99 | 7,000ms |

*Note: These estimates should be validated by Spike S4.*

### Dashboard Query Complexity

| Query Type | Typical Latency (warm) |
|------------|----------------------|
| Single table SELECT | 5-20ms |
| JOIN across 2-3 tables | 20-50ms |
| Aggregation (events stats) | 50-150ms |
| Full dashboard data | 100-200ms |

### LLM Call Latency (Claude API)

| Model | Typical | P95 |
|-------|---------|-----|
| Haiku 4.5 (~2K input, ~500 output) | 1,500ms | 3,000ms |
| Sonnet 4.5 (~3K input, ~1K output) | 5,000ms | 10,000ms |

*Source: Anthropic API performance benchmarks, February 2026.*
