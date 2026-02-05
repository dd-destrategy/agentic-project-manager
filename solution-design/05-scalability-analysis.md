# Scalability Analysis: Agentic PM Workbench

**Document Type:** Strategic Analysis
**Date:** February 2026
**Status:** Reference document for strategic planning
**Baseline:** Single-user architecture, $15/month budget, 1-2 active projects

---

## Executive Summary

The Agentic PM Workbench's current architecture is intentionally constrained for a single-user, low-cost personal tool. This analysis examines what it would take to scale across three scenarios: power user (10 projects), small team (5 users), and productised SaaS (100+ users).

**Key findings:**

1. **Current design handles 5-10 projects** with minimal changes, primarily driven by LLM costs
2. **Multi-user requires significant rearchitecture** (auth, data isolation, billing) - estimated 3-4 months development
3. **SaaS viability is questionable** due to crowded market, compliance overhead, and narrow TAM
4. **Recommendation: Stay personal** - optimise for the original use case; extract learnings for future projects

---

## 1. Current Architecture Scalability

### 1.1 Project Capacity Analysis

**What the current design supports:**

| Dimension | Current Spec | Practical Ceiling | Bottleneck |
|-----------|-------------|-------------------|------------|
| Active projects | 1-2 | 5-8 | LLM cost per project |
| Agent cycles/day | 96 (15-min interval) | 96 (no change) | EventBridge schedule |
| Signals per cycle | ~20 estimated | ~100 | Lambda timeout (5 min) |
| Artefacts | 4 per project | 32-64 total | DynamoDB partition throughput |
| Events (30-day window) | ~2,000/month | ~20,000/month | TTL handles cleanup |

**DynamoDB limits (not the bottleneck):**
- Partition throughput: 3,000 RCU / 1,000 WCU per partition
- Current usage: <10 RCU / <5 WCU on average
- Maximum item size: 400 KB (artefacts are ~12 KB)
- Table size: Effectively unlimited (practical limit is 10 TB)

**Step Functions limits (not the bottleneck):**
- Standard workflow: 25,000 state transitions per execution
- Current usage: ~15-20 transitions per cycle
- Concurrent executions: 1 million (account default)
- Execution history: 90 days retention

**Lambda limits (not the bottleneck):**
- Concurrent executions: 1,000 (account default)
- Current usage: Sequential, single invocation per step
- Memory: 128 MB - 10 GB (currently targeting 256-512 MB)
- Timeout: Up to 15 minutes (current spec uses 30s-300s)

### 1.2 The Real Bottleneck: LLM Costs

The architecture is bottlenecked by LLM costs, not infrastructure limits.

**Current cost model (from SPEC.md section 6.2):**

| Component | Per Project/Day | Notes |
|-----------|----------------|-------|
| Triage calls (Haiku) | ~6-7 | Per active project |
| Action calls (Haiku) | ~4 | Per active project |
| Reasoning calls (Sonnet) | ~1.5 | For complex signals |
| **Daily cost** | **~$0.20** | With change detection gate |

**Cost scaling:**

| Projects | Daily LLM Cost | Monthly Total | Within Budget? |
|----------|---------------|---------------|----------------|
| 1-2 | $0.20-0.30 | $6-9 | Yes |
| 3-4 | $0.40-0.60 | $12-18 | Borderline |
| 5-6 | $0.60-0.80 | $18-24 | No |
| 10 | $1.00-1.20 | $30-36 | Significantly over |

### 1.3 Architecture Change Triggers

**No change needed until:**
- 5+ active projects (LLM costs exceed budget)
- Multiple concurrent users (auth/isolation requirements)
- Real-time requirements <5 second latency (current is 15-minute cycles)
- External webhook inbound volume >100/minute (polling is simpler for low volume)

**Infrastructure holds to:**
- ~50 projects with current DynamoDB design
- ~10,000 agent cycles/day (Lambda free tier covers 1M requests/month)
- ~500 MB data (DynamoDB ~$0.25/GB/month)

---

## 2. Scaling Scenarios

### 2.1 Scenario A: Power User (1 user, 10 projects)

**Profile:** Same user managing 10 active projects across multiple roles (contract PM, side projects, volunteer work)

#### Cost Projection

| Cost Category | Current (2 projects) | 10 Projects | Delta |
|---------------|---------------------|-------------|-------|
| DynamoDB | $0.25 | $0.75 | +$0.50 |
| Step Functions | $1.00 | $1.00 | +$0.00 |
| Lambda | $0.00 (free tier) | $0.00 | +$0.00 |
| Secrets Manager | $2.00 | $2.00 | +$0.00 |
| CloudWatch | $1.50 | $2.50 | +$1.00 |
| Amplify | $0.50 | $0.50 | +$0.00 |
| **AWS Subtotal** | **$5.25** | **$6.75** | **+$1.50** |
| Claude API (Haiku/Sonnet) | $5.84 | $29.20 | +$23.36 |
| **Total** | **$11.09** | **$35.95** | **+$24.86** |

**Budget impact:** Monthly cost rises from ~$11 to ~$36 - a 3x increase driven almost entirely by LLM costs.

#### Architecture Changes Required

| Component | Change | Effort |
|-----------|--------|--------|
| Agent cycle | Add project batching to reduce per-project overhead | Low (1-2 days) |
| LLM calls | Batch similar signals across projects in single prompt | Medium (3-5 days) |
| Dashboard | Add project selector, cross-project views | Low (2-3 days) |
| Budget controls | Project-level budget allocation | Low (1-2 days) |
| DynamoDB | No change - single-table design handles this | None |

**Technical feasibility:** High. The architecture handles this cleanly. The question is cost tolerance.

#### Mitigation Strategies

1. **Aggressive change detection:** Only invoke LLM when signal delta is material
2. **Project prioritisation:** More frequent cycles for active projects, daily-only for dormant
3. **Haiku-only mode:** Reduce Sonnet usage to critical decisions only (saves ~40%)
4. **Prompt caching optimisation:** Share system prompt across project batches
5. **Tiered polling:** High-priority projects every 15 min, others hourly

**Optimised 10-project cost:** ~$18-22/month with aggressive optimisation

### 2.2 Scenario B: Small Team (5 users, shared projects)

**Profile:** Small PM consulting team sharing visibility across client projects

#### Multi-Tenancy Requirements

| Requirement | Current State | Required Change | Complexity |
|-------------|--------------|-----------------|------------|
| User authentication | Single user (NextAuth Credentials) | OAuth providers (Google, Microsoft) | Medium |
| User identity | Hardcoded | User table in DynamoDB | Low |
| Project ownership | Implicit | Explicit owner field, sharing model | Medium |
| Data isolation | None needed | Row-level filtering by user/team | High |
| Audit logging | Single user | Per-user action attribution | Medium |
| Session management | Single session | Multi-session with device tracking | Medium |

#### Auth Changes (RBAC Assessment)

**Question: Is RBAC required?**

For 5 users sharing projects, full RBAC is overkill. A simpler model suffices:

| Model | Description | Complexity | Recommendation |
|-------|-------------|------------|----------------|
| **Owner-only** | Each user sees only their projects | Low | Too restrictive |
| **Team-flat** | All team members see all projects | Low | Viable for small team |
| **Owner+viewer** | Owner has full control, others can view | Medium | **Recommended** |
| **Full RBAC** | Roles, permissions, groups | High | Overkill |

**Recommended auth model:**
```
User
  - id, email, name, passwordHash
  - role: 'admin' | 'member'

ProjectAccess
  - projectId, userId
  - permission: 'owner' | 'viewer'
```

This requires ~5 new DynamoDB access patterns but no complex permission engine.

#### Cost Per User

| Cost Category | 5 Users | Per User |
|---------------|---------|----------|
| AWS Infrastructure | $10 | $2.00 |
| LLM (assuming 3 projects/user avg) | $45 | $9.00 |
| Auth provider (if using Auth0) | $0 (free tier) | $0.00 |
| **Total** | **$55** | **$11.00** |

**Note:** LLM costs scale with project count, not user count. Users viewing the same project don't multiply LLM costs.

#### Data Isolation Concerns

| Concern | Mitigation | Residual Risk |
|---------|-----------|---------------|
| User A sees User B's data | Partition key includes user ID + query filters | Low (if implemented correctly) |
| Shared project data leakage | Project-level access control in application layer | Medium |
| Credential separation | Separate Jira/Outlook tokens per user | Requires credential management redesign |
| LLM context contamination | User-scoped prompts, no cross-user context | Low |

**Critical change:** Each user needs their own Jira/Outlook integration credentials. The current design stores one set of credentials. Multi-user requires:
1. Per-user credential storage in Secrets Manager
2. Integration config per user in DynamoDB
3. Token refresh per user
4. Health monitoring per integration per user

**Development effort:** 3-4 weeks to implement robust multi-user data isolation.

### 2.3 Scenario C: Productised SaaS (100+ users)

**Profile:** Commercial offering targeting freelance PMs and small consultancies

#### Full Multi-Tenant Architecture

**Current vs SaaS architecture:**

| Component | Current | SaaS Requirement |
|-----------|---------|------------------|
| Database | Single DynamoDB table | Tenant-isolated partitions or separate tables |
| Auth | NextAuth Credentials | Auth0/Cognito with SSO, MFA |
| Billing | None | Stripe integration, usage metering |
| API | Internal only | Public API with rate limiting |
| Monitoring | CloudWatch (personal) | Multi-tenant observability, per-customer dashboards |
| Support | Self-serve | Help desk, SLA commitments |
| Deployment | Single region | Multi-region for latency, DR |

**Required new components:**

1. **Tenant management service** - Onboarding, offboarding, subscription status
2. **Usage metering** - Track LLM tokens, API calls, storage per tenant
3. **Billing integration** - Stripe subscription management, invoicing
4. **Admin portal** - Tenant management, usage dashboards, support tools
5. **API gateway** - Rate limiting, authentication, versioning
6. **Audit logging** - Compliance-grade logging for SOC2
7. **Backup/restore** - Per-tenant data export, restoration

#### Pricing Model Options

**Option 1: Per-seat subscription**

| Tier | Price/user/month | Included | LLM margin |
|------|-----------------|----------|------------|
| Starter | $15 | 2 projects, basic integrations | ~40% |
| Professional | $29 | 10 projects, all integrations | ~45% |
| Team | $49 | Unlimited projects, priority support | ~50% |

*Challenge:* LLM costs scale with project count, not user count. Per-seat pricing may not align with cost structure.

**Option 2: Per-project pricing**

| Tier | Price/project/month | Included |
|------|-------------------|----------|
| Active project | $8 | Full monitoring, artefacts, actions |
| Dormant project | $3 | Weekly sync, read-only |

*Advantage:* Aligns pricing with cost structure.

**Option 3: Usage-based (tokens)**

| Component | Price |
|-----------|-------|
| Base fee | $10/month |
| LLM tokens (Haiku) | $0.50 per 100K |
| LLM tokens (Sonnet) | $2.00 per 100K |

*Challenge:* Unpredictable bills frustrate users. Good for enterprise, bad for SMB.

**Recommended:** Option 2 (per-project) with Option 1 as a simplified tier for marketing.

#### Infrastructure Changes

| Change | Effort | Monthly Cost Impact |
|--------|--------|---------------------|
| Multi-region deployment | 2-3 weeks | +$50-100 (cross-region replication) |
| Cognito (managed auth) | 1-2 weeks | +$25-50 (at 100 users) |
| API Gateway (public API) | 1-2 weeks | +$3.50 per million requests |
| WAF (security) | 1 week | +$5 + $1/million requests |
| CloudFront (CDN) | 1 week | +$10-20 |
| RDS for billing/analytics | 2 weeks | +$15-30 |
| **Total infrastructure delta** | 8-12 weeks | **+$110-235/month** |

#### Compliance Requirements

**SOC2 Type II:**

| Control Area | Effort | Ongoing Cost |
|--------------|--------|--------------|
| Security policies | 4-6 weeks to document | Internal time |
| Access controls | 2-3 weeks implementation | None |
| Encryption (at rest, in transit) | Already compliant | None |
| Audit logging | 2-3 weeks implementation | +$20-50/month (log storage) |
| Penetration testing | 1-2 weeks coordination | $5-15K/year |
| SOC2 audit | 2-3 months | $20-50K/year |
| Continuous monitoring | Ongoing | +$100-300/month (tools) |

**GDPR:**

| Requirement | Effort | Notes |
|-------------|--------|-------|
| Data processing agreements | 2-3 weeks legal | Required for EU customers |
| Right to deletion | 1-2 weeks implementation | Already possible with DynamoDB |
| Data export | 1 week implementation | JSON export per tenant |
| Consent management | 1-2 weeks | For optional features |
| Privacy policy | 1 week legal | Required before launch |
| DPO appointment | N/A for small company | Optional under GDPR |

**Compliance timeline:** 6-9 months to SOC2 readiness for a small team.

#### Support and Operations Overhead

| Function | Headcount | Annual Cost |
|----------|-----------|-------------|
| Customer success/support | 0.5 FTE | $40-60K |
| DevOps/SRE | 0.25 FTE | $30-45K |
| Product management | 0.25 FTE | $25-40K |
| **Total** | **1 FTE** | **$95-145K** |

**Break-even users (at $29 ARPU, 50% margin):** ~550 paying users

---

## 3. Path to Productization

### 3.1 What Would Need to Change

**Phase 1: Technical Foundation (3-4 months)**

| Work Item | Effort | Dependencies |
|-----------|--------|--------------|
| Multi-tenant auth (Cognito/Auth0) | 3-4 weeks | None |
| Tenant isolation (DB, secrets) | 3-4 weeks | Auth |
| Per-user integration onboarding | 2-3 weeks | Tenant isolation |
| Usage metering infrastructure | 2-3 weeks | Tenant isolation |
| Billing integration (Stripe) | 2-3 weeks | Usage metering |
| Admin portal (basic) | 2-3 weeks | Auth, tenant isolation |
| Public API with rate limiting | 2 weeks | Auth |

**Phase 2: Product Polish (2-3 months)**

| Work Item | Effort | Dependencies |
|-----------|--------|--------------|
| Onboarding flow | 2-3 weeks | Phase 1 |
| Documentation (user-facing) | 2-3 weeks | Stable product |
| Help centre / knowledge base | 1-2 weeks | Documentation |
| Email templates (transactional) | 1 week | None |
| Landing page / marketing site | 2-3 weeks | None |
| Analytics dashboards | 2 weeks | Usage metering |

**Phase 3: Compliance and Operations (3-6 months)**

| Work Item | Effort | Dependencies |
|-----------|--------|--------------|
| SOC2 controls implementation | 6-8 weeks | Phase 1 |
| SOC2 audit preparation | 4-6 weeks | Controls |
| GDPR compliance | 3-4 weeks | Phase 1 |
| Support tooling (Intercom, etc.) | 2 weeks | Phase 2 |
| Runbooks and incident response | 2-3 weeks | Phase 1 |

**Total estimated effort:** 8-13 months for one developer, or 4-6 months with a small team (2-3).

### 3.2 Minimum Viable SaaS Features

**Must have:**
- Multi-user auth with SSO option
- Tenant data isolation
- Self-service onboarding
- Billing (subscription management)
- Basic usage dashboards
- Email notifications
- API documentation

**Should have:**
- Multiple integration configs per user
- Usage alerts ("80% of quota used")
- Basic admin portal
- Help documentation

**Can defer:**
- SOC2 certification (start with self-attestation)
- Multi-region deployment
- Public API (start with UI-only)
- Mobile app
- Custom integrations

### 3.3 Go-to-Market Considerations

**Target market:**

| Segment | Size | Fit | Notes |
|---------|------|-----|-------|
| Freelance PMs | ~50K globally | Medium | Price sensitive, tech-savvy |
| PM consultancies (<10 people) | ~10K | High | Cross-client visibility is valuable |
| In-house PM teams | ~100K | Low | Prefer enterprise tools (Jira, Asana AI) |
| Accidental PMs (tech leads, etc.) | ~500K | Medium | May not self-identify as market |

**Competitive landscape:**

| Competitor | Positioning | Threat Level |
|------------|-------------|--------------|
| Jira Rovo | Native Jira AI | High |
| Asana AI Teammates | Native Asana AI | High |
| Monday AI | Native Monday AI | Medium |
| Linear AI | Developer-focused | Low |
| Motion | Personal productivity | Low |
| Generic AI (ChatGPT, Claude) | Manual prompting | Low |

**Differentiation:**
- Cross-platform synthesis (Jira + Outlook in one view)
- Structured PM artefacts (RAID log, delivery state)
- Autonomous operation (not just chat-based)

**Go-to-market challenges:**
1. **Discovery:** How do freelance PMs find the tool?
2. **Trust:** Autonomous agents touching Jira/email is scary
3. **Integration friction:** Each user needs Jira + Outlook setup
4. **Competition:** Native AI features are "free" with existing subscriptions

### 3.4 Development Effort Summary

| Phase | Duration | Investment (1 dev @ $150K) |
|-------|----------|---------------------------|
| Technical foundation | 3-4 months | $37-50K |
| Product polish | 2-3 months | $25-37K |
| Compliance/operations | 3-6 months | $37-75K |
| **Total to MVP SaaS** | **8-13 months** | **$100-162K** |

---

## 4. Should It Scale?

### 4.1 Market Assessment

**TAM (Total Addressable Market):**

| Segment | Population | % Who'd Pay $20/mo | TAM |
|---------|-----------|-------------------|-----|
| Freelance PMs | 50,000 | 5% | $600K/year |
| PM consultancies | 10,000 (x 3 seats avg) | 15% | $1.1M/year |
| Accidental PMs | 500,000 | 0.5% | $600K/year |
| **Total** | | | **$2.3M/year** |

**SAM (Serviceable Available Market):** ~$500K-1M/year (English-speaking markets, tech-savvy users)

**SOM (Serviceable Obtainable Market):** ~$50-100K/year (realistic capture with limited marketing)

**Assessment:** Small market. Not venture-scale. Viable as a lifestyle business or side project, not as a primary business.

### 4.2 Build vs Stay Personal Trade-offs

**Arguments for scaling:**

| Pro | Weight |
|-----|--------|
| Recurring revenue from validated need | Medium |
| Skill development (SaaS operations, compliance) | Medium |
| Portfolio piece for consulting/employment | Medium |
| Help other PMs with genuine pain point | Low |

**Arguments against scaling:**

| Con | Weight |
|-----|--------|
| Small TAM limits upside | High |
| 8-13 months to SaaS MVP | High |
| Ongoing operational burden | High |
| Incumbent competition (Jira Rovo, etc.) | High |
| Compliance costs eat margin | Medium |
| Support burden for 100+ users | Medium |
| Personal tool already delivers value | Medium |

### 4.3 Opportunity Cost Analysis

**What else could be done with 8-13 months of effort?**

| Alternative | Potential Value | Risk |
|-------------|----------------|------|
| Use the tool personally, reclaim 3-5 hrs/week | ~$15-25K/year (time value) | Low |
| Consult on agentic PM implementations | $50-100K/year | Medium |
| Build a different product with larger TAM | Variable | High |
| Contribute to OSS, build reputation | Career value | Low |
| Write about the learnings (blog, book) | $5-20K + reputation | Low |

**Analysis:** The personal productivity gain (~3-5 hours/week) is nearly certain and immediate. SaaS revenue is uncertain and delayed by 8-13 months.

### 4.4 Verdict: Market Viability

**Score: 3/10 for SaaS potential**

| Factor | Score | Notes |
|--------|-------|-------|
| Market size | 2/10 | Small TAM, niche use case |
| Competition | 3/10 | Native AI features are strong |
| Differentiation | 5/10 | Cross-platform is unique, but hard to explain |
| Development effort | 4/10 | Manageable but significant |
| Margin potential | 4/10 | LLM costs compress margin |
| Operational burden | 3/10 | High for solo/small team |

---

## 5. Recommended Growth Path

### 5.1 Recommendation: Stay Personal

**Rationale:**
1. The personal tool delivers immediate, certain value
2. SaaS market is small and competitive
3. Development and operational costs exceed likely returns
4. Personal use provides learning without operational burden

### 5.2 If Staying Personal: Optimisations to Prioritise

**Phase 1: Core Value (0-3 months)**

| Priority | Optimisation | Benefit |
|----------|-------------|---------|
| 1 | Complete MVP as specified | Baseline functionality |
| 2 | Change detection gate | Reduces LLM costs by ~60% |
| 3 | Prompt caching | Reduces LLM costs by additional ~20-30% |
| 4 | Aggressive Haiku routing | Keep Sonnet <20% of calls |

**Phase 2: Efficiency (3-6 months)**

| Priority | Optimisation | Benefit |
|----------|-------------|---------|
| 5 | Project prioritisation (variable polling) | Handle 5-10 projects efficiently |
| 6 | Batch similar signals across projects | Reduce per-call overhead |
| 7 | Artefact diff-only updates | Reduce token count |
| 8 | Dead letter queue for failed cycles | Reliability |

**Phase 3: Quality of Life (6+ months)**

| Priority | Optimisation | Benefit |
|----------|-------------|---------|
| 9 | Mobile-responsive dashboard | Access on the go |
| 10 | Improved visualisations | Better insight at a glance |
| 11 | Custom artefact templates | Fit specific project types |
| 12 | Local-first backup | Personal data ownership |

### 5.3 If Scaling: Roadmap (Not Recommended)

For completeness, if a decision is made to pursue SaaS:

**Quarter 1: Foundation**
- Multi-user auth with Cognito
- Tenant isolation architecture
- Basic admin portal
- Landing page

**Quarter 2: Product**
- Self-service onboarding
- Stripe billing integration
- Usage metering
- Documentation

**Quarter 3: Growth**
- Public beta launch
- SOC2 controls implementation
- Help desk setup
- Initial marketing push

**Quarter 4: Sustainability**
- SOC2 audit
- Multi-region deployment
- Enterprise features (SSO, SLA)
- Evaluate PMF and decide continue/sunset

### 5.4 Alternative: Open Source

A middle path worth considering:

| Approach | Effort | Benefit |
|----------|--------|---------|
| Open source the core | 2-4 weeks (cleanup, docs) | Community contributions, reputation |
| Offer hosted version | 4-6 weeks | Recurring revenue without full SaaS burden |
| Consulting on deployment | 0 extra effort | High-margin, low-volume revenue |

This captures some upside without the full operational burden of SaaS.

---

## 6. Summary

| Scenario | Feasible? | Recommended? | Notes |
|----------|-----------|--------------|-------|
| Power user (10 projects) | Yes | Yes with budget | $35/mo, minor architecture changes |
| Small team (5 users) | Yes | No | 3-4 months work, limited upside |
| SaaS (100+ users) | Yes | No | 8-13 months, small market, high competition |
| Open source | Yes | Maybe | Middle path worth exploring |
| Stay personal | Yes | **Yes** | Immediate value, lowest risk |

**Bottom line:** The Agentic PM Workbench is a powerful personal productivity tool. Its value proposition (cross-platform synthesis) is real but niche. The effort to productise exceeds the likely market opportunity. Stay personal, optimise aggressively, and extract maximum value from the original vision.

---

## Appendix: Key Assumptions

| Assumption | If Wrong, Impact |
|------------|------------------|
| LLM prices remain stable | Higher prices = tighter margins; lower = more headroom |
| Jira/Asana don't build cross-platform | If they do, differentiation narrows |
| Azure AD consent remains difficult | If easier, Outlook integration friction drops |
| User values time at $50-100/hr | Lower valuation = less willingness to pay |
| Compliance costs ~$50K/year | Higher = worse margins for SaaS |
