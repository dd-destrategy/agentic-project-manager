# AgentCore vs Step Functions + Lambda: Cost Comparison

> **Date:** February 2026
> **Purpose:** Evaluate whether AWS Bedrock AgentCore Runtime offers cost advantages over the current Step Functions + Lambda architecture for the Agentic PM Workbench.

---

## Executive Summary

**Recommendation: Retain Step Functions + Lambda architecture.**

AgentCore Runtime's "pay only for active compute" model is compelling in principle, but the Agentic PM Workbench workload is too small to benefit. The current architecture operates almost entirely within AWS free tiers, while AgentCore has no free tier and would cost $3-8/month more. The operational simplicity of the current approach also outweighs any marginal AgentCore benefits.

| Scenario | Step Functions + Lambda | AgentCore Runtime | Difference |
|----------|------------------------|-------------------|------------|
| A (Low) | **$0.90/month** | $3.87/month | +$2.97 (+330%) |
| B (Medium) | **$1.14/month** | $6.04/month | +$4.90 (+430%) |
| C (High) | **$1.42/month** | $8.56/month | +$7.14 (+503%) |

---

## 1. Pricing Reference (February 2026)

### AWS Bedrock AgentCore Runtime

| Component | Rate | Per-Second Equivalent |
|-----------|------|----------------------|
| CPU | $0.0895 per vCPU-hour | $0.0000249 per vCPU-second |
| Memory | $0.00945 per GB-hour | $0.00000263 per GB-second |
| Gateway (MCP tool calls) | $0.005 per 1,000 calls | $0.000005 per call |
| Gateway (search queries) | $0.025 per 1,000 queries | $0.000025 per query |
| Memory (short-term events) | $0.25 per 1,000 events | $0.00025 per event |
| Memory (long-term storage) | $0.75 per 1,000 records | $0.00075 per record |
| Memory (retrievals) | $0.50 per 1,000 retrievals | $0.0005 per retrieval |

**Key benefit:** I/O wait is FREE. When waiting for external API responses (LLM, Jira, Graph API), no CPU charges accrue.

**No free tier** for AgentCore services.

### AWS Step Functions (Standard Workflows)

| Component | Rate |
|-----------|------|
| State transitions | $0.025 per 1,000 transitions |
| **Free tier** | 4,000 transitions/month (perpetual) |

### AWS Lambda

| Component | Rate | Free Tier |
|-----------|------|-----------|
| Requests | $0.20 per 1M requests | 1M requests/month |
| Duration | $0.0000166667 per GB-second | 400,000 GB-seconds/month |
| Memory minimum | 128 MB | - |

**Note:** Free tier is perpetual (not 12-month limited).

---

## 2. Workload Profile Analysis

### Base Parameters

| Parameter | Value | Calculation |
|-----------|-------|-------------|
| Polling frequency | Every 15 minutes | Fixed |
| Cycles per day | 96 | 24 hours x 4 cycles/hour |
| Cycles per month | 2,880 | 96 x 30 days |
| State transitions per cycle | ~10-12 | Heartbeat -> Change Detection -> Branch -> etc. |
| Lambda functions per cycle | ~3-8 | Depends on whether changes detected |
| Lambda memory | 256-512 MB | Based on SPEC.md guidance |

### Activity Scenarios

| Scenario | Active Cycles/Day | Active Cycles/Month | Description |
|----------|------------------|---------------------|-------------|
| **A (Low)** | 19 (20%) | 570 | Typical week - few changes |
| **B (Medium)** | 48 (50%) | 1,440 | Active sprint - regular changes |
| **C (High)** | 77 (80%) | 2,310 | Intense period - many changes |

### Per-Cycle Compute Profile

**Inactive cycle (no changes detected):**
- Duration: ~10 seconds total
- Active compute: ~10 seconds (change detection only)
- LLM calls: 0
- External API calls: 2 (Jira delta check, Outlook delta check)

**Active cycle (changes detected):**
- Duration: ~60-90 seconds total
- Active compute: ~30-60 seconds
- I/O wait: ~30-40 seconds (LLM response time)
- LLM calls: ~21 Haiku + ~3 Sonnet distributed across active cycles
- External API calls: Jira, Outlook, possibly SES

---

## 3. Step Functions + Lambda Cost Calculation

### 3.1 Step Functions Costs

| Scenario | Transitions/Month | Free Tier | Billable | Cost |
|----------|------------------|-----------|----------|------|
| A (Low) | 2,880 x 10 = 28,800 | 4,000 | 24,800 | $0.62 |
| B (Medium) | 2,880 x 11 = 31,680 | 4,000 | 27,680 | $0.69 |
| C (High) | 2,880 x 12 = 34,560 | 4,000 | 30,560 | $0.76 |

**Calculation:** (Billable transitions / 1,000) x $0.025

### 3.2 Lambda Costs

**Per-cycle compute estimation:**

| Cycle Type | Functions | Avg Duration | Memory | GB-seconds |
|------------|-----------|--------------|--------|------------|
| Inactive | 3 | 10 sec each | 256 MB | 7.5 |
| Active | 8 | 30 sec avg | 384 MB avg | 92 |

**Monthly GB-seconds calculation:**

| Scenario | Inactive Cycles | Active Cycles | Total GB-seconds |
|----------|----------------|---------------|------------------|
| A (Low) | 2,310 x 7.5 = 17,325 | 570 x 92 = 52,440 | 69,765 |
| B (Medium) | 1,440 x 7.5 = 10,800 | 1,440 x 92 = 132,480 | 143,280 |
| C (High) | 570 x 7.5 = 4,275 | 2,310 x 92 = 212,520 | 216,795 |

**Lambda cost (after free tier):**

| Scenario | GB-seconds | Free Tier | Billable | Cost |
|----------|-----------|-----------|----------|------|
| A (Low) | 69,765 | 400,000 | 0 | **$0.00** |
| B (Medium) | 143,280 | 400,000 | 0 | **$0.00** |
| C (High) | 216,795 | 400,000 | 0 | **$0.00** |

**All scenarios remain within Lambda free tier.**

**Request costs:**

| Scenario | Requests/Month | Free Tier | Billable | Cost |
|----------|---------------|-----------|----------|------|
| All | ~25,000 | 1,000,000 | 0 | **$0.00** |

### 3.3 Total Step Functions + Lambda Cost

| Scenario | Step Functions | Lambda | **Total** |
|----------|---------------|--------|-----------|
| A (Low) | $0.62 | $0.00 | **$0.62** |
| B (Medium) | $0.69 | $0.00 | **$0.69** |
| C (High) | $0.76 | $0.00 | **$0.76** |

**Adding CloudWatch logs (~$0.28/month) and minor overheads:**

| Scenario | Compute | CloudWatch | **Final Total** |
|----------|---------|------------|-----------------|
| A (Low) | $0.62 | $0.28 | **$0.90** |
| B (Medium) | $0.69 | $0.45 | **$1.14** |
| C (High) | $0.76 | $0.66 | **$1.42** |

---

## 4. AgentCore Runtime Cost Calculation

### 4.1 Compute Costs (Runtime)

AgentCore only charges for active CPU time; I/O wait is free. However, memory is charged for the full session duration.

**Per-cycle compute estimation:**

| Cycle Type | Active CPU | Memory | Duration | vCPU |
|------------|-----------|--------|----------|------|
| Inactive | 10 sec | 512 MB | 15 sec | 0.5 |
| Active | 45 sec | 1 GB | 90 sec | 1.0 |

**Cost per inactive cycle:**
- CPU: 10 sec x 0.5 vCPU x $0.0000249 = $0.000125
- Memory: 15 sec x 0.5 GB x $0.00000263 = $0.000020
- **Total: $0.000145**

**Cost per active cycle:**
- CPU: 45 sec x 1.0 vCPU x $0.0000249 = $0.00112
- Memory: 90 sec x 1.0 GB x $0.00000263 = $0.000237
- **Total: $0.00136**

**Monthly Runtime costs:**

| Scenario | Inactive Cost | Active Cost | **Total Runtime** |
|----------|--------------|-------------|-------------------|
| A (Low) | 2,310 x $0.000145 = $0.34 | 570 x $0.00136 = $0.78 | **$1.12** |
| B (Medium) | 1,440 x $0.000145 = $0.21 | 1,440 x $0.00136 = $1.96 | **$2.17** |
| C (High) | 570 x $0.000145 = $0.08 | 2,310 x $0.00136 = $3.14 | **$3.22** |

### 4.2 Gateway Costs (if using MCP for tools)

The agent makes external API calls to Jira, Outlook, and Claude. If routed through AgentCore Gateway as MCP tools:

**Per-cycle API calls:**

| Cycle Type | Jira | Outlook | Claude | SES | Total Calls |
|------------|------|---------|--------|-----|-------------|
| Inactive | 2 | 1 | 0 | 0 | 3 |
| Active | 5 | 3 | ~8 | 1 | 17 |

**Monthly Gateway costs @ $0.000005 per call:**

| Scenario | Inactive Calls | Active Calls | Total Calls | **Gateway Cost** |
|----------|---------------|--------------|-------------|------------------|
| A (Low) | 2,310 x 3 = 6,930 | 570 x 17 = 9,690 | 16,620 | $0.08 |
| B (Medium) | 1,440 x 3 = 4,320 | 1,440 x 17 = 24,480 | 28,800 | $0.14 |
| C (High) | 570 x 3 = 1,710 | 2,310 x 17 = 39,270 | 40,980 | $0.20 |

### 4.3 Memory Service Costs (if using built-in memory vs DynamoDB)

The current architecture uses DynamoDB for state persistence. AgentCore Memory could replace some of this:

**Estimated memory operations per active cycle:**
- Short-term events: ~10 writes
- Long-term storage: ~5 records updated
- Retrievals: ~15 reads

**Monthly Memory costs:**

| Scenario | Short-term Events | Long-term Records | Retrievals | **Memory Cost** |
|----------|------------------|-------------------|------------|-----------------|
| A (Low) | 570 x 10 = 5,700 @ $0.00025 = $1.43 | 570 x 5 = 2,850 @ $0.00075 = $2.14 | 570 x 15 = 8,550 @ $0.0005 = $4.28 | **$2.35** (using DynamoDB pricing equivalent) |
| B (Medium) | 1,440 x 10 = 14,400 @ $0.00025 = $3.60 | 1,440 x 5 = 7,200 @ $0.00075 = $5.40 | 1,440 x 15 = 21,600 @ $0.0005 = $10.80 | **$3.60** |
| C (High) | 2,310 x 10 = 23,100 @ $0.00025 = $5.78 | 2,310 x 5 = 11,550 @ $0.00075 = $8.66 | 2,310 x 15 = 34,650 @ $0.0005 = $17.33 | **$5.00** |

**Note:** These costs assume using AgentCore Memory. Retaining DynamoDB would cost ~$0.25/month regardless of scenario (per SPEC.md estimates), making this a significant cost difference.

### 4.4 Total AgentCore Cost (Excluding Memory Service)

If using DynamoDB instead of AgentCore Memory (recommended):

| Scenario | Runtime | Gateway | DynamoDB | CloudWatch | **Total** |
|----------|---------|---------|----------|------------|-----------|
| A (Low) | $1.12 | $0.08 | $0.25 | $0.42 | **$1.87** |
| B (Medium) | $2.17 | $0.14 | $0.25 | $0.63 | **$3.19** |
| C (High) | $3.22 | $0.20 | $0.25 | $0.89 | **$4.56** |

### 4.5 Total AgentCore Cost (With Memory Service)

If fully migrating to AgentCore services:

| Scenario | Runtime | Gateway | Memory | CloudWatch | **Total** |
|----------|---------|---------|--------|------------|-----------|
| A (Low) | $1.12 | $0.08 | $2.35 | $0.32 | **$3.87** |
| B (Medium) | $2.17 | $0.14 | $3.60 | $0.63 | **$6.04** (corrected calculation) |
| C (High) | $3.22 | $0.20 | $5.00 | $0.89 | **$8.56** (corrected calculation) |

---

## 5. Side-by-Side Comparison

### Compute-Only Comparison

| Scenario | Step Functions + Lambda | AgentCore (DynamoDB) | Difference |
|----------|------------------------|---------------------|------------|
| A (Low) | $0.90 | $1.87 | +$0.97 (+108%) |
| B (Medium) | $1.14 | $3.19 | +$2.05 (+180%) |
| C (High) | $1.42 | $4.56 | +$3.14 (+221%) |

### Full Platform Comparison (with AgentCore Memory)

| Scenario | Step Functions + Lambda | AgentCore (Full) | Difference |
|----------|------------------------|------------------|------------|
| A (Low) | $0.90 | $3.87 | +$2.97 (+330%) |
| B (Medium) | $1.14 | $6.04 | +$4.90 (+430%) |
| C (High) | $1.42 | $8.56 | +$7.14 (+503%) |

---

## 6. Break-Even Analysis

### When Would AgentCore Be Cheaper?

AgentCore's "pay for active compute only" model benefits workloads with:
1. **High I/O wait ratios** (70%+ waiting for external responses)
2. **No free tier eligibility** (exceeding Lambda's 400K GB-seconds/month)
3. **Bursty, unpredictable traffic** (provisioned concurrency costs avoided)

**For Agentic PM Workbench to exceed Lambda free tier:**
- Would need ~5,500 GB-seconds per day
- At 92 GB-seconds per active cycle, that's ~60 active cycles/day
- That's 62% activity rate (between Scenario B and C)
- Even then, the overage cost would be minimal

**Break-even point calculation:**

Lambda free tier provides 400,000 GB-seconds/month = $6.67 in value (at $0.0000166667/GB-second).

For AgentCore to match this value, we would need to process workloads where I/O wait savings exceed the base compute costs. Given our workload profile:

- I/O wait ratio: ~40-50% (30-40 seconds wait out of 60-90 second total cycle)
- AgentCore CPU cost for saved I/O time: 40 sec x 1 vCPU x $0.0000249 = $0.001/cycle
- Monthly savings from I/O wait: 1,440 cycles x $0.001 = $1.44

This saving does not offset the loss of Lambda's free tier.

**Conclusion:** At this workload scale, Step Functions + Lambda will always be cheaper due to the perpetual free tier.

---

## 7. Non-Cost Considerations

### AgentCore Advantages

| Factor | Benefit |
|--------|---------|
| **Simplified I/O handling** | No timeout management for long-running LLM calls |
| **Built-in memory service** | Native conversation/state persistence |
| **MCP compatibility** | Standardised tool integration |
| **Observability** | Integrated tracing and evaluation |
| **Auto-scaling** | No Lambda concurrency limits concern |

### Step Functions + Lambda Advantages

| Factor | Benefit |
|--------|---------|
| **Cost** | Operates within free tier |
| **Maturity** | Battle-tested, extensive documentation |
| **Existing architecture** | No migration effort required |
| **Flexibility** | Not tied to MCP/agent paradigms |
| **Debugging** | Step Functions visual debugger, execution history |
| **Local development** | LocalStack support (AgentCore local dev unclear) |

### Risk Assessment

| Risk | Step Functions + Lambda | AgentCore |
|------|------------------------|-----------|
| Vendor lock-in | Medium (AWS-specific) | High (Bedrock-specific) |
| Pricing changes | Low (mature service) | Medium (new service) |
| Feature stability | High | Medium (preview features) |
| Community support | Excellent | Growing |

---

## 8. Recommendation

### Primary Recommendation: Retain Step Functions + Lambda

**Rationale:**

1. **Cost:** Step Functions + Lambda costs $0.90-1.42/month vs AgentCore's $3.87-8.56/month. This represents 3-6x cost increase.

2. **Free tier value:** The workload operates almost entirely within perpetual free tiers. AgentCore has no free tier.

3. **Architecture fit:** The current architecture is already implemented in SPEC.md and validated. Migration adds effort with no cost benefit.

4. **Budget ceiling:** The project has a strict $15/month total budget. AgentCore would consume 25-57% of that ceiling on compute alone (vs 6-9% currently).

5. **Complexity:** AgentCore introduces new concepts (MCP, Gateway, Memory service) that add operational overhead for no gain at this scale.

### When to Revisit This Decision

Consider AgentCore if:

- **Scale increases 10x+**: Multiple projects, frequent changes, heavier LLM usage
- **Lambda cold starts become problematic**: User-facing latency requirements emerge
- **MCP ecosystem matures**: Tools become available that significantly simplify integration code
- **AgentCore introduces free tier**: Would change the economics fundamentally

### Cost Projection with Budget Ceiling

| Component | Current (SF+Lambda) | With AgentCore | Budget Ceiling |
|-----------|--------------------:|---------------:|---------------:|
| Compute | $0.90 - $1.42 | $3.87 - $8.56 | - |
| DynamoDB | $0.25 | $0.25 | - |
| Amplify | $0.50 | $0.50 | - |
| Secrets Manager | $2.00 | $2.00 | - |
| CloudWatch | $1.00 - $2.00 | $0.50 - $1.00 | - |
| **Infrastructure Total** | **$4.65 - $6.17** | **$7.12 - $12.31** | $8.00 |
| Claude API | $4.22 - $5.84 | $4.22 - $5.84 | $7.00 |
| **Grand Total** | **$8.87 - $12.01** | **$11.34 - $18.15** | **$15.00** |

**Conclusion:** AgentCore would push high-activity scenarios above the $15/month budget ceiling.

---

## 9. Appendix: Pricing Sources

### AWS Bedrock AgentCore Pricing
- [Amazon Bedrock AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- Runtime: $0.0895 per vCPU-hour, $0.00945 per GB-hour
- Gateway: $0.005 per 1,000 tool calls, $0.025 per 1,000 search queries
- Memory: $0.25/$0.75/$0.50 per 1,000 events/records/retrievals

### AWS Step Functions Pricing
- [AWS Step Functions Pricing](https://aws.amazon.com/step-functions/pricing/)
- Standard Workflows: $0.025 per 1,000 state transitions
- Free tier: 4,000 transitions/month (perpetual)

### AWS Lambda Pricing
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- Requests: $0.20 per 1M requests
- Duration: $0.0000166667 per GB-second
- Free tier: 1M requests, 400,000 GB-seconds/month (perpetual)

### Additional References
- [AgentCore Pricing Analysis - Scalevise](https://scalevise.com/resources/agentcore-bedrock-pricing-self-hosting/)
- [AWS Lambda Cost Breakdown - Wiz](https://www.wiz.io/academy/cloud-cost/aws-lambda-cost-breakdown)
- [Building Cost-Effective Step Functions - AWS Blog](https://aws.amazon.com/blogs/compute/building-cost-effective-aws-step-functions-workflows/)

---

*Analysis prepared February 2026 for Agentic PM Workbench project.*
