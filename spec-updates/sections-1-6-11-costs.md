# SPEC.md Updates — Sections 1, 6, 11 (AWS Cost Changes)

> **Purpose:** Updated sections reflecting AWS migration cost analysis
> **Source:** `aws-migration-analysis/06-cost-analysis.md`
> **Date:** February 2026

---

## Section 1: Product Vision — Constraints Update

Replace the Constraints table in section 1 with:

### Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Users | 1 (you) | Personal tool |
| Budget ceiling | $15/month total | Infrastructure (~$5-8) + LLM (~$7) |
| Active projects | 1-2 at a time | Scope control |

**Note:** Database storage constraint removed. DynamoDB on-demand scales automatically within budget; no fixed storage ceiling required.

---

## Section 6.3: Budget Controls — Full Replacement

Replace section 6.3 with:

### 6.3 Budget controls

The $15/month ceiling allocates: ~$5-8/month fixed (AWS infrastructure) and ~$7-10/month variable (LLM). LLM budget is ~$7/month with ~$1-3 buffer.

**AWS infrastructure breakdown:**
| Service | Est. Monthly Cost |
|---------|------------------|
| Amplify Hosting | $0.50 |
| Lambda | $0.00 (free tier) |
| Step Functions | $1.00 |
| DynamoDB | $0.25 |
| Secrets Manager | $2.00 |
| SES | $0.00 (free tier) |
| CloudWatch | $1-2 |
| **Total** | **$5-8** |

**Critical cost traps to AVOID:**
- NAT Gateway: $33/month — Lambda MUST run outside VPC
- Aurora Serverless v2: $44/month minimum — use DynamoDB instead
- RDS: $15/month minimum — use DynamoDB instead

**LLM degradation ladder:**

| Control | Value |
|---------|-------|
| Daily LLM budget (baseline) | $0.23 (= $7/month ÷ 30) |
| Degradation tier 1 | At $0.23/day: Reduce to 85/15 Haiku/Sonnet split |
| Degradation tier 2 | At $0.27/day: 85/15 split + 20-min polling interval |
| Degradation tier 3 | At $0.30/day: Haiku-only + 30-min polling |
| Daily hard ceiling | $0.40/day: monitoring-only (no LLM calls) |
| Monthly LLM ceiling | $8.00 — agent enters monitoring-only mode for remainder of month |

The agent tracks cumulative daily spend in `agent_config` and checks before every LLM call.

---

## Section 11: Risk Register — Full Replacement

Replace section 11 with:

## 11. Risk Register

### Critical (halt implementation if unresolved)

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Azure AD admin consent unavailable → no Outlook | Fallback: Jira-only MVP + SES notifications. Still viable for artefact generation. |
| 2 | LLM budget exceeded despite controls | Degradation ladder (section 6.3). Hard ceiling with monitoring-only fallback. |
| 3 | Claude tool-use produces invalid artefact JSON | Schema validation on every response. Retry once on failure. Fall back to previous version from DynamoDB. |
| 4 | NAT Gateway accidentally provisioned | Lambda MUST run outside VPC. Infrastructure-as-code must explicitly exclude NAT Gateway. Review AWS bills weekly during first month. |

### Significant (address during development)

| # | Risk | Mitigation |
|---|------|-----------|
| 5 | Prompt injection via Jira/email content | Two-stage triage (section 9.1). Outbound action allowlist. |
| 6 | Agent crashes silently, dashboard shows stale "healthy" state | Heartbeat logging. Dashboard reads last heartbeat, not a frontend timer. Alert via SES if no heartbeat for 30 minutes. |
| 7 | User stops reviewing daily digest (automation complacency) | Anti-complacency spot checks every 2 weeks. |
| 8 | Scope creep during development | Kill threshold defined. Deferred list is explicit. |
| 9 | Lambda cold starts cause slow agent cycles | Monitor P95 latency. Accept up to 2-second cold start; agent is background process. If user-facing latency affected, consider provisioned concurrency (adds ~$3/month). |
| 10 | Step Functions state transition costs exceed estimates | Monitor transitions weekly. If exceeding 50,000/month, refactor to reduce transitions or switch to Express Workflows. |

### Watch

| # | Risk | Notes |
|---|------|-------|
| 11 | Jira API rate limits | Monitor. Current free tier allows 100 requests/minute — sufficient for 15-min polling. |
| 12 | Competitive landscape (Jira Rovo, Asana AI) | Unique value is cross-platform synthesis. Monitor competitor features quarterly. |
| 13 | Claude API pricing changes | Budget model assumes current pricing. Re-validate quarterly. |
| 14 | Monthly cost overrun | Monitor actual vs projected spend. Value gates at $12, $15, $20 thresholds. Alert at $12/month (80% of ceiling). |
| 15 | DynamoDB on-demand pricing spikes | Monitor read/write unit consumption. If sustained high usage, evaluate switching to provisioned capacity mode. |
| 16 | AWS free tier expiration | Some free tiers are 12-month only (API Gateway). Audit free tier assumptions annually. |

---

## Summary of Changes

### Section 1 Changes
- Budget ceiling: $35/month → **$15/month**
- Rationale updated: Infrastructure ($24) + LLM (~$7) + buffer → Infrastructure (~$5-8) + LLM (~$7)
- Removed: Database storage constraint (0.5 GB Neon free tier) — DynamoDB scales automatically

### Section 6.3 Changes
- Total monthly ceiling: $35 → **$15**
- Infrastructure allocation: $24/month fixed → **$5-8/month** (AWS serverless)
- Added AWS infrastructure cost breakdown table
- Added critical cost traps to avoid (NAT Gateway, Aurora, RDS)
- Degradation tier 2: $0.30/day → **$0.27/day**
- Degradation tier 3: $0.35/day → **$0.30/day**
- Daily hard ceiling: $0.50/day → **$0.40/day**
- Monthly LLM ceiling: $11.00 → **$8.00**

### Section 11 Changes

**Removed risks:**
- Neon 0.5 GB storage exhaustion (no longer applicable)
- Neon cold starts (no longer applicable)

**Added risks:**
- #4: NAT Gateway accidentally provisioned (critical)
- #9: Lambda cold starts (significant)
- #10: Step Functions state transition costs (significant)
- #15: DynamoDB on-demand pricing spikes (watch)
- #16: AWS free tier expiration (watch)

**Updated risks:**
- #1: Resend notifications → SES notifications
- #3: Fall back to previous_version → Fall back to previous version from DynamoDB
- #6: Alert via Resend → Alert via SES
- #14: Value gates changed from $30/$40/$50 → **$12/$15/$20** (proportional to new ceiling)
