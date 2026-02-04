# Cloud Infrastructure Analysis: Vercel Pro Upgrade

**Reviewer:** Cloud Infrastructure Specialist
**Date:** February 2026
**Change under review:** Upgrade from Vercel Hobby (free) to Vercel Pro ($20/month)

---

## 1. New Budget Model

### Current Spec Costs (from SPEC.md)

| Component | Current Cost |
|-----------|-------------|
| Vercel (Hobby) | $0/month |
| Hetzner VPS CX22 | ~$4/month |
| Neon PostgreSQL (free tier) | $0/month |
| Resend (free tier, 100 emails/day) | $0/month |
| Claude API (with change detection gate) | ~$4.22/month |
| **Total** | **~$8.22/month** |

### Revised Costs with Vercel Pro

| Component | New Cost | Notes |
|-----------|----------|-------|
| Vercel Pro | $20/month | Per-user pricing; single user = $20 flat |
| Hetzner VPS CX22 | $4/month | Unchanged if kept (see section 4) |
| Neon PostgreSQL | $0/month | Free tier unchanged |
| Resend | $0/month | Free tier unchanged |
| Claude API | ~$4.22/month | Unchanged (agent logic stays the same) |
| **Total (with VPS)** | **~$28.22/month** |
| **Total (VPS eliminated)** | **~$24.22/month** |

### Vercel Pro Included Usage (significant value)

The Pro plan includes substantial bundled resources:
- **1 TB Fast Data Transfer** (~$350 value) vs 100 GB on Hobby
- **10 million Edge Requests** (~$32 value) vs 1 million on Hobby
- **Usage-based compute billing** rather than hard limits
- **$20 monthly credit** that can be applied across all services

For a single-user personal tool with modest traffic, you will not exceed these included limits. The $20/month is effectively a flat rate with no overages expected.

---

## 2. What Vercel Pro Gives Us

### Function Execution Limits (critical change)

| Plan | Without Fluid Compute | With Fluid Compute (default) |
|------|----------------------|------------------------------|
| **Hobby** | Max 60s (default 10s) | Max 300s (default 300s) |
| **Pro** | Max 300s (default 15s) | Max 800s (default 300s) |
| **Enterprise** | Max 900s (default 15s) | Max 800s (default 300s) |

**Key insight:** With Fluid Compute enabled (now the default), Hobby already gets 300s max duration. Pro extends this to 800s (13 minutes). This is more generous than previously understood.

### Cron Jobs (significant upgrade)

| Feature | Hobby | Pro |
|---------|-------|-----|
| Max cron jobs | 100 per project | 100 per project |
| Minimum interval | **Once per day** | **Once per minute** |
| Timing precision | Hourly (up to 59 min variance) | Per-minute precision |

This is a major difference. Hobby cron jobs can only run **once per day** with imprecise timing. Pro allows per-minute scheduling with precise execution. For a 15-minute polling cycle, Hobby is completely unsuitable; Pro is fully capable.

### Other Pro Benefits

| Feature | Hobby | Pro |
|---------|-------|-----|
| Bandwidth | 100 GB | 1 TB |
| Concurrent builds | 1 | 12 |
| Runtime logs retention | 1 hour | 1 day |
| Static file upload limit | 100 MB | 1 GB |
| Deployments per day | 100 | 6,000 |

### Features Not Materially Changed

- **ISR (Incremental Static Regeneration):** Available on both tiers
- **Image Optimisation:** Available on both (Pro has pay-as-you-go for higher volume)
- **Analytics:** Basic analytics available on both; Pro adds more detail
- **Edge functions:** Same 300s limit on both tiers

---

## 3. Can We Eliminate the VPS Entirely?

### The Question

If the agent loop ran as Vercel Cron + Pro functions (with 800s max duration), could it replace the Hetzner VPS for a 15-minute polling cycle that calls 2 APIs + Claude?

### Analysis

**What the agent loop does per cycle (from SPEC.md section 5.1):**

1. Keepalive (SELECT 1 to Neon) - ~100ms
2. Poll Jira API for changes - ~500ms-2s
3. Poll Outlook Graph API (delta query) - ~500ms-2s
4. If changes found: Signal normalisation, Two-pass Haiku triage, Optional Sonnet reasoning - 5-30s
5. Action execution (Jira writes, Resend emails) - 1-5s
6. Artefact maintenance (DB writes) - ~500ms
7. Hold queue processing - ~500ms
8. Daily housekeeping (pruning) - ~2s

**Worst-case cycle duration:** ~45 seconds (with complex reasoning)
**Typical cycle duration:** ~10 seconds (no changes or simple triage)

### Verdict: Yes, technically feasible, but with trade-offs

**What works:**
- 800s (13 min) Pro function duration easily accommodates a 45s worst-case cycle
- Cron jobs can run every minute on Pro (we want every 15 minutes)
- Node.js runtime is supported with full SDK access

**Trade-offs and risks:**

| Concern | VPS Approach | Vercel Cron Approach |
|---------|------------|---------------------|
| **Cold starts** | None (persistent process) | Every 15-min cycle starts cold (100-500ms overhead) |
| **Neon cold starts** | Prevented by 4-min keepalive | Cannot run keepalive between cron jobs; Neon will cold-start every cycle |
| **State persistence** | In-memory caching possible | Stateless; all state must be in DB |
| **Debugging/monitoring** | SSH access, pm2 logs | Vercel dashboard only, 1-day log retention |
| **Cost predictability** | Fixed $4/month | Usage-based; could spike on heavy days |
| **Execution guarantee** | pm2 auto-restarts on crash | Vercel retries on failure, but no visibility into intermediate state |
| **Hold queue timing** | Can process at exact held_until time | Cron granularity is 1 minute; slight timing variance |

### The Neon Cold Start Problem

The current architecture relies on a 4-minute keepalive (SELECT 1) from the VPS to keep Neon warm. If we move to Vercel Cron:

- **No continuous process** to send keepalives
- **Every 15-minute cycle** hits Neon cold (300-800ms latency per query)
- **Mitigation options:**
  1. Accept the latency (adds ~2-3s per cycle from multiple cold queries)
  2. Add a secondary 5-minute cron job just for keepalive (wastes compute)
  3. Upgrade Neon to paid tier with longer suspend timeout (defeats cost savings)

**Recommendation:** The Neon cold start issue makes VPS elimination non-trivial. The latency is acceptable but complicates the architecture for marginal savings ($4/month).

---

## 4. If We Keep the VPS: What Changes?

### Does Vercel Pro change VPS requirements?

**No change to VPS duties.** The architecture in SPEC.md intentionally routes all LLM calls through the VPS. Vercel Pro's longer function duration doesn't affect this because:

1. The VPS still handles all Claude API calls (policy decision, not limitation)
2. The VPS still handles all integration polling (Jira, Outlook)
3. The VPS still writes to the database (Vercel only reads)
4. The VPS still runs the hold queue processor

**What Vercel Pro does improve for the frontend:**

- Dashboard API routes can now take up to 800s (irrelevant for read-only DB queries)
- If we later wanted to add any server-side processing to the frontend, we have headroom
- Better monitoring and debugging through extended log retention (1 day vs 1 hour)

### Can we downgrade the VPS?

The Hetzner CX22 (~$4/month) provides:
- 2 vCPUs
- 4 GB RAM
- 40 GB SSD

For the agent workload (Node.js process, minimal concurrent connections), this is already the smallest sensible choice. The CX11 ($3.29/month) has only 2 GB RAM, which is tight for Node.js with LLM response buffering.

**Recommendation:** Keep CX22. The $0.71/month savings for CX11 is not worth the memory constraint risk.

---

## 5. Neon Interaction with 300s/800s Functions

### Original Concern (from SPEC.md)

> "The Vercel 10-second hobby tier limit combined with Neon cold starts leaves insufficient headroom."

This concern was based on:
- Hobby default timeout: 10 seconds
- Neon cold start: 300-800ms
- Leaving only ~9s for actual work

### Updated Reality with Fluid Compute

Vercel now enables Fluid Compute by default, giving:
- Hobby: 300s max duration (not 10s)
- Pro: 800s max duration

**This dramatically changes the calculus.** The original concern about Neon cold starts eating into function time is now largely moot. Even with a 1-second cold start, 299 seconds remain on Hobby.

### Is the keepalive pattern still needed?

**For the VPS:** Yes, still valuable. The 4-minute keepalive ensures sub-100ms query latency on every 15-minute cycle. This improves user experience when viewing dashboard data.

**For Vercel frontend API routes:** Less critical now. With 300s+ available, a 1-second Neon cold start is tolerable. The static shell pattern (client-side fetching) remains a good UX choice regardless.

### Updated Recommendation

The architectural rule "All LLM calls route through the VPS, never through Vercel functions" was partially motivated by timeout concerns. With Fluid Compute, this is no longer a hard constraint. However, keeping LLM calls on the VPS remains sensible for:

1. **Cost tracking:** Centralised budget control in one place
2. **Debugging:** Easier to inspect agent behaviour from VPS logs
3. **Simplicity:** One process manages all agent logic

---

## 6. New Cost Ceiling Recommendation

### Current Ceiling: $10/month

The SPEC.md sets a strict $10/month total budget:
- Infrastructure: ~$4 (VPS)
- LLM: ~$4-6 (Claude API with change detection)
- Margin: ~$0-2

### With Vercel Pro: $28-30/month

| Component | Monthly Cost |
|-----------|-------------|
| Vercel Pro | $20.00 |
| Hetzner VPS CX22 | $4.00 |
| Neon (free tier) | $0.00 |
| Resend (free tier) | $0.00 |
| Claude API (typical) | $4.22 |
| Claude API (buffer for spikes) | +$1.78 |
| **Recommended ceiling** | **$30/month** |

### What the extra $20/month buys

| Capability | Before (Hobby) | After (Pro) |
|------------|---------------|-------------|
| Cron frequency | Unusable for this project | Fully capable (per-minute) |
| Function timeout | 300s (with Fluid Compute) | 800s |
| Bandwidth | 100 GB | 1 TB |
| Concurrent builds | 1 | 12 |
| Log retention | 1 hour | 24 hours |
| Future flexibility | Limited | Substantial headroom |

### Is it worth it?

**For the current architecture (VPS-based agent):** The Pro upgrade provides marginal benefit. The VPS already handles everything that Pro improves. The main value is:
- Extended log retention (debugging)
- Future optionality (could move agent to Vercel if desired)
- Cron availability if architecture changes

**For a potential Vercel-native architecture (no VPS):** Pro is essential. Hobby cron jobs cannot support 15-minute polling.

### My Recommendation

**Set the new budget ceiling at $30/month**, broken down as:

| Category | Allocation |
|----------|------------|
| Vercel Pro | $20 |
| VPS | $4 |
| Claude API | $6 (with headroom for spikes) |

This provides:
1. **Current architecture viability** with better tooling
2. **Future flexibility** to consolidate onto Vercel if desired
3. **LLM budget headroom** for days with higher activity
4. **Round number** for easy mental accounting

### Alternative: Conservative Hybrid

If the user wants to test Vercel-only before committing:

1. **Keep Hobby tier** for now ($0)
2. **Keep VPS** for agent runtime ($4)
3. **Set ceiling at $12/month** (current + small buffer)
4. **Defer Pro upgrade** until a specific need arises (e.g., wanting to eliminate VPS, needing better monitoring)

This saves $20/month but forecloses the Vercel-native option without a future upgrade decision.

---

## Summary Recommendations

| Question | Recommendation |
|----------|----------------|
| New budget model | $30/month ceiling ($20 Vercel Pro + $4 VPS + $6 LLM) |
| Can we eliminate VPS? | Technically yes, but Neon cold starts complicate it. Marginal $4/month savings for increased complexity. Not recommended. |
| Should we keep VPS? | Yes. Architecture remains cleaner with VPS for agent, Vercel for frontend. |
| Can we downgrade VPS? | No. CX22 is already minimal for Node.js + LLM buffering. |
| Is keepalive still needed? | Yes for VPS (performance). Less critical for Vercel frontend (acceptable latency with Fluid Compute). |
| Is the upgrade worth $20/month? | Moderate value for current architecture (debugging, optionality). Essential value if you later want to eliminate VPS. |

---

## References

- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Limits Documentation](https://vercel.com/docs/limits)
- [Vercel Function Duration Configuration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel Cron Jobs Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Neon Connection Latency](https://neon.com/docs/connect/connection-latency)
- [Neon Plans and Pricing](https://neon.com/pricing)
