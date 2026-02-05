# Commercial/Budget Analysis: Vercel Pro Upgrade

> **Analyst:** Commercial/Budget Specialist
> **Change:** Vercel Hobby (free) to Vercel Pro ($20/month)
> **Date:** February 2026

---

## Executive Summary

The upgrade from Vercel Hobby to Pro represents a **20x increase** in frontend hosting costs (from $0 to $20/month), pushing total infrastructure from approximately **$4-10/month to $24-30/month**. This is a fundamental shift in the project's cost philosophy. The original $10/month ceiling was an "anti-bloat design principle" that forced elegant, minimal solutions. With the ceiling removed, there is risk of scope creep, but also opportunity to relax constraints that were genuinely limiting product quality.

**Recommendation:** Set a new ceiling of **$35/month** with clear value gates at each tier.

---

## 1. New Monthly Cost Breakdown

### Before (Original $10/month ceiling)

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Vercel Hobby | $0 | Free tier, 10-second function limit |
| Hetzner VPS CX22 | $4.00 | Persistent agent runtime |
| Neon PostgreSQL | $0 | Free tier, 0.5 GB |
| Resend | $0 | Free tier, 100 emails/day |
| Claude API | $4.22-5.84 | With/without prompt caching |
| **Total** | **$8.22-9.84** | Within $10 ceiling |

### After (With Vercel Pro)

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Vercel Pro | $20.00 | No execution time limits, 1,000 GB bandwidth |
| Hetzner VPS CX22 | $4.00 | Still required (see analysis below) |
| Neon PostgreSQL | $0 | Free tier (consider upgrade - see below) |
| Resend | $0 | Free tier remains sufficient |
| Claude API | $4.22-5.84 | Current estimate |
| **Total (minimal)** | **$28.22-29.84** | Infrastructure + current LLM usage |

### Can We Drop the Hetzner VPS?

**No.** The VPS serves purposes that Vercel Pro does not replace:

1. **Persistent 15-minute polling loop** - Vercel has no native cron/scheduling. Vercel Cron is limited to the Pro tier but has constraints (max 1 invocation per minute, can't guarantee persistent state across invocations).

2. **Long-running LLM calls** - Even with Vercel Pro's extended limits (60-second edge, 300-second serverless), complex Sonnet reasoning chains could timeout. The VPS has no execution time limits.

3. **Architectural simplicity** - The spec locks in "all LLM calls route through the VPS, never through Vercel functions." Changing this would require architectural re-work.

4. **Cost efficiency** - $4/month for a dedicated 2-vCPU, 4GB RAM server is excellent value compared to Vercel's function-based pricing model for compute-intensive workloads.

**Verdict:** Keep the VPS. It's $4/month well spent.

### Should We Upgrade Neon to Pro?

| Neon Tier | Cost | Storage | Compute | Value for this project |
|-----------|------|---------|---------|----------------------|
| Free | $0 | 0.5 GB | 191.9 hours | Sufficient for MVP with aggressive retention |
| Launch | $19/month | 10 GB | 300 hours | 20x storage, eliminates retention pressure |
| Scale | $69/month | 50 GB | 750 hours | Overkill |

**Analysis:**
- Current spec estimates 0.5 GB is tight but workable with 30-day event retention and 90-day action retention
- Neon Launch would eliminate storage anxiety completely
- The 10 GB limit allows full version history on artefacts (currently limited to one-deep undo)
- 300 compute hours vs 191.9 hours gives more headroom for cold starts and branching

**Recommendation:** Upgrade to Neon Launch ($19/month) is justified if:
- Storage monitoring shows >70% usage within first 3 months
- User wants full artefact version history (not just previous_version)
- Otherwise, stay on free tier initially

### Full Budget Range

| Scenario | Monthly Total | Components |
|----------|--------------|------------|
| **Minimal** | $28.22 | Vercel Pro + VPS + Neon Free + Resend Free + Claude (cached) |
| **Comfortable** | $29.84 | Above with Claude (uncached) |
| **Premium** | $47-49 | Above + Neon Launch ($19) |

---

## 2. What the Extra Budget Buys

The original $10/month constraint drove these design decisions. With headroom, each can be reconsidered:

### 2.1 Constraints That Can Be Relaxed

| Original Constraint | Driven By | With Higher Budget |
|--------------------|-----------|-------------------|
| 85/15 Haiku/Sonnet split | LLM cost | Can increase Sonnet to 30-40% for better quality |
| 15-minute polling interval | LLM call frequency | Can reduce to 10 or even 5 minutes |
| Aggressive retention (30/90 days) | 0.5 GB Neon limit | Can extend to 90/180 days or add Neon Launch |
| One-deep artefact versioning | Storage limits | Can implement full version history |
| Prompt caching requirement | Cost minimisation | Less critical (but still good practice) |
| No Vercel Cron | Hobby tier limitation | Vercel Pro includes cron (backup to VPS) |

### 2.2 Constraints That Should NOT Be Relaxed

| Constraint | Reason to Keep |
|------------|---------------|
| Change detection gate | Architecture is better with it, not just cheaper |
| Single user / no multi-tenancy | Scope control, not budget |
| No Redis/Pinecone/S3 | Complexity, not cost |
| Tool-use for LLM outputs | Reliability, not cost |
| Decision boundaries | Safety, not cost |

### 2.3 Specific Improvements Now Possible

1. **More Sonnet usage** - Better quality for risk assessment, stakeholder comms
2. **Faster polling** - 10-minute intervals catch issues sooner
3. **Richer artefact history** - Full version tracking for audit trails
4. **Longer data retention** - 90-day events, 180-day actions for trend analysis
5. **Vercel Cron as backup** - Redundant heartbeat check independent of VPS
6. **More generous LLM context** - Larger context windows without budget anxiety

---

## 3. Budget Ceiling Recommendation

### The Philosophy Question

The original $10/month ceiling was explicitly an "anti-bloat design principle" (CLAUDE.md). It forced:
- Haiku-first model selection
- Change detection gate (now a core architectural strength)
- Minimal infrastructure
- Aggressive retention policies

**Removing the ceiling entirely risks:**
- Feature creep ("while we're at it, let's add...")
- Infrastructure bloat (services added "just in case")
- Reduced engineering discipline

### Recommended New Ceiling: $35/month

| Tier | Monthly Budget | What It Covers |
|------|---------------|----------------|
| **Baseline** | $28-30 | Vercel Pro + VPS + Neon Free + current LLM usage |
| **Ceiling** | $35 | Above + increased Sonnet usage OR Neon upgrade |
| **Absolute Max** | $50 | Only if Neon Launch + higher LLM usage both prove necessary |

### Rationale for $35

1. **Covers baseline with buffer** - $30 baseline + $5 for LLM spikes or Neon upgrade
2. **Still requires trade-off decisions** - Can't have both Neon Launch AND 50% Sonnet usage
3. **3.5x original ceiling** - Meaningful increase that signals a shift in priorities
4. **Break-even maths still work** - See ROI section below
5. **Monthly not annual** - Easy to adjust based on actual usage data

### Value Gates (Decision Points)

| Spend Level | Requires |
|-------------|----------|
| >$30/month | Evidence that increased LLM quality or Neon storage is providing measurable value |
| >$40/month | Explicit decision to add Neon Launch based on storage metrics |
| >$50/month | Re-evaluation of whether the tool is providing commensurate value |

---

## 4. LLM Budget Specifically

### Current Split: 85% Haiku / 15% Sonnet

| Model | Current Use | Monthly Cost |
|-------|-------------|-------------|
| Haiku 4.5 | Triage, classification, routine updates | $3.68 (no cache) / $2.60 (cached) |
| Sonnet 4.5 | Complex reasoning, stakeholder comms | $2.16 (no cache) / $1.62 (cached) |

### Recommended Split: 70% Haiku / 30% Sonnet

With budget headroom, increase Sonnet usage for:

1. **All stakeholder communication drafts** - Higher quality = fewer manual edits
2. **All risk assessments** - Critical decisions deserve better reasoning
3. **RAID log synthesis** - Multi-source correlation benefits from Sonnet
4. **Milestone impact analysis** - Strategic implications warrant better model

### Revised LLM Cost Estimate (70/30 Split)

| Model | Calls/day | Input tokens | Output tokens | Monthly Input | Monthly Output |
|-------|----------|-------------|--------------|---------------|----------------|
| Haiku | ~14 | 28,000 | 7,000 | 0.84 MTok | 0.21 MTok |
| Sonnet | ~7 | 21,000 | 7,000 | 0.63 MTok | 0.21 MTok |

| Model | Input Cost | Output Cost | Total |
|-------|-----------|-------------|-------|
| Haiku | $0.84 | $1.05 | $1.89 |
| Sonnet | $1.89 | $3.15 | $5.04 |
| **Total (no cache)** | | | **$6.93** |
| **Total (with cache)** | | | **~$5.20** |

### LLM Budget Summary

| Split | Monthly Cost (cached) | Monthly Cost (uncached) |
|-------|----------------------|------------------------|
| 85/15 (current) | $4.22 | $5.84 |
| 70/30 (recommended) | $5.20 | $6.93 |
| 60/40 (aggressive) | $5.90 | $7.80 |

**Recommendation:** Adopt 70/30 split. The ~$1/month increase buys meaningfully better quality for stakeholder-facing outputs.

---

## 5. Degradation Ladder Update

### Current Degradation Ladder (Based on $0.33/day)

| Tier | Trigger | Action |
|------|---------|--------|
| 1 | $0.25/day | Haiku-only |
| 2 | $0.30/day | 30-min polling |
| 3 | $0.33/day | Monitoring-only |
| Hard ceiling | $10/month | Agent stops LLM calls |

### Proposed New Degradation Ladder (Based on $1.00/day = $30/month LLM budget)

The $35/month ceiling allocates:
- $24/month fixed (Vercel Pro + VPS)
- $11/month variable (LLM + potential Neon upgrade)

For LLM specifically, budget ~$7/month with $4 buffer.

**New daily LLM budget:** $7/month ÷ 30 = **$0.23/day** baseline, with **$0.37/day** ceiling

| Tier | Daily LLM Spend | Action | Rationale |
|------|-----------------|--------|-----------|
| Normal | <$0.23 | Full operation (70/30 split) | Baseline budget |
| Elevated | $0.23-0.30 | Reduce to 85/15 split | Preserve Haiku capacity |
| High | $0.30-0.35 | 85/15 + 20-min polling | Reduce call frequency |
| Critical | >$0.35 | Haiku-only + 30-min polling | Minimum viable operation |
| Hard ceiling | $0.50/day | Monitoring-only | Emergency brake |
| **Monthly ceiling** | **$11** | Monitoring-only for remainder of month | Absolute limit |

### Why Not Just Remove the Ladder?

The degradation ladder is good engineering regardless of budget. It:
- Provides graceful degradation during API outages or price spikes
- Gives early warning of unusual usage patterns (possible bug or misuse)
- Maintains predictable costs even with variable input volume
- Documents expected behaviour for debugging

**Recommendation:** Keep the ladder structure, update the thresholds.

---

## 6. ROI Recalculation

### Original Break-Even Analysis

| Metric | Value |
|--------|-------|
| Development investment | 100 hours |
| Required time savings | 3 hours/week |
| Monthly cost | $10 |
| Implied hourly value | $10 ÷ (3 × 4.33) = $0.77/hour saved |

At $0.77/hour, even modest time savings justify the cost.

### Updated Break-Even Analysis (at $35/month)

| Metric | Value |
|--------|-------|
| Development investment | 100 hours (unchanged) |
| Monthly cost | $35 |
| Implied hourly value | $35 ÷ (3 × 4.33) = $2.69/hour saved |

**Question:** Is $2.69/hour saved still a good deal?

**Answer:** Yes, by a wide margin. Consider:

| Benchmark | Value |
|-----------|-------|
| PM hourly rate (Australia, mid-level) | $60-100/hour |
| 3 hours/week saved at $60/hour | $780/month value |
| 3 hours/week saved at $100/hour | $1,300/month value |
| Tool cost | $35/month |
| **ROI** | **22-37x** |

### Revised Kill Threshold

The original kill threshold was:
> "If after 100 hours of development the tool is not saving at least 3 hours/week of PM work, stop building."

**This should remain unchanged.** The 3 hours/week threshold is about whether the tool works, not whether the budget is justified. At $35/month, even 1 hour/week of savings is a positive ROI ($35 vs ~$260 in time).

However, a new threshold should be added:

**New Cost-Benefit Checkpoint (Month 3):**
> If monthly costs exceed $35 for two consecutive months without demonstrated increase in value, reduce to baseline configuration (Neon Free, 85/15 split).

### Total Cost of Ownership (Year 1)

| Scenario | Monthly | Annual | Notes |
|----------|---------|--------|-------|
| Minimal operation | $28 | $336 | Vercel Pro + VPS + Neon Free + cached LLM |
| Recommended operation | $32 | $384 | Above + 70/30 split |
| Maximum ceiling | $35 | $420 | Full headroom |
| With Neon Launch | $51 | $612 | If storage upgrade needed |

**Add development investment:**
- 100 hours × $60-100/hour = $6,000-10,000 opportunity cost

**Year 1 total cost:** $6,400-10,600 (dev time + $400 infrastructure)

**Year 1 value delivered (at 3 hrs/week):**
- 52 weeks × 3 hours × $60-100 = $9,360-15,600

**Net Year 1 ROI:** Still positive even at upper cost bounds and lower time savings.

---

## 7. Summary Recommendations

### Immediate Changes

| Item | Current | Recommended | Rationale |
|------|---------|-------------|-----------|
| Budget ceiling | $10/month | $35/month | Accommodate Vercel Pro, provide headroom |
| LLM split | 85/15 | 70/30 | Better quality for stakeholder outputs |
| Daily LLM budget | $0.33 | $0.23 (soft) / $0.50 (hard) | Match new ceiling |

### Deferred Decisions

| Item | Decision Point | Criteria |
|------|---------------|----------|
| Neon Launch upgrade | Month 3 | Storage >70% of 0.5 GB |
| Polling interval (10-min) | Month 2 | If 15-min feels too slow in practice |
| Further Sonnet increase | Month 3 | Quality review of 70/30 outputs |

### Spec Updates Required

1. **Section 1 (Constraints):** Update budget ceiling from $10 to $35
2. **Section 2 (Locked Decisions):** Update Vercel from "free hobby tier" to "Pro tier"
3. **Section 6.3 (Budget controls):** Update degradation ladder thresholds
4. **Section 6.1 (Model selection):** Consider updating split from 85/15 to 70/30
5. **Risk Register:** Add "Monthly cost overrun" as a watch item

---

## Appendix: Cost Comparison Table

| Configuration | Vercel | VPS | Neon | LLM | Resend | **Total** |
|--------------|--------|-----|------|-----|--------|-----------|
| Original spec | $0 | $4 | $0 | $4-6 | $0 | **$8-10** |
| Minimal Vercel Pro | $20 | $4 | $0 | $4-6 | $0 | **$28-30** |
| Recommended | $20 | $4 | $0 | $5-7 | $0 | **$29-31** |
| Premium | $20 | $4 | $19 | $5-7 | $0 | **$48-50** |
