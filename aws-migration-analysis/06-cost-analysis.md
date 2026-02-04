# AWS Migration Cost Analysis

> **Document:** Commercial/Cost Analysis for AWS Migration
> **Date:** February 2026
> **Status:** Analysis Complete

---

## Executive Summary

**Verdict: AWS migration is NOT cost-effective for this project at current scale.**

The current infrastructure costs $35/month. AWS alternatives range from $11/month (optimistic serverless) to $55+/month (Aurora Serverless v2), with significant hidden costs that could push the bill well above the current budget.

| Scenario | Monthly Cost | vs Current |
|----------|-------------|------------|
| Current (Vercel + Hetzner + Neon) | $35 | baseline |
| AWS Option A: Serverless (no NAT) | ~$14 | -60% |
| AWS Option A: Serverless (with NAT) | ~$47 | +34% |
| AWS Option B: Fargate + Aurora | ~$67 | +91% |
| AWS Option C: Fargate + DynamoDB | ~$22 | -37% |

**Key Finding:** AWS can be cheaper than $35/month ONLY if you avoid NAT Gateway and Aurora Serverless v2. These two services alone cost $33-44/month minimum.

---

## 1. Current Infrastructure Costs

| Component | Service | Cost/Month |
|-----------|---------|------------|
| Frontend hosting | Vercel Pro | $20.00 |
| Agent runtime | Hetzner VPS CX22 | $4.00 |
| Database | Neon PostgreSQL (free tier) | $0.00 |
| LLM | Claude API | ~$7.00 |
| Notifications | Resend (free tier) | $0.00 |
| **Total** | | **$31.00** |
| Buffer | | $4.00 |
| **Budget ceiling** | | **$35.00** |

### Usage Patterns (from SPEC.md)

| Metric | Value |
|--------|-------|
| Polling frequency | Every 15 minutes (96 cycles/day) |
| LLM calls/day | ~21 (with change detection gate) |
| Active projects | 1-2 |
| Database storage | 0.5 GB |
| Event retention | 30 days |
| Action retention | 90 days |
| Users | 1 (personal tool) |

---

## 2. AWS Pricing Research (February 2026)

### 2.1 Compute Services

#### AWS Lambda
| Component | Price |
|-----------|-------|
| Requests | $0.20 per 1M requests |
| Duration (x86) | $0.0000166667 per GB-second |
| Duration (ARM/Graviton2) | $0.0000133334 per GB-second (20% cheaper) |
| **Free Tier** | 1M requests + 400,000 GB-seconds/month (always free) |

Source: [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)

#### AWS Fargate
| Component | Price (us-east-1) |
|-----------|-------------------|
| vCPU | $0.04048 per vCPU-hour |
| Memory | $0.004445 per GB-hour |
| Savings Plans | Up to 52% with 3-year commitment |

Source: [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)

#### AWS App Runner
| Component | Price |
|-----------|-------|
| Active vCPU | $0.064 per vCPU-hour |
| Memory (active/provisioned) | $0.007 per GB-hour |
| Build | $0.005 per build minute |

Source: [AWS App Runner Pricing](https://aws.amazon.com/apprunner/pricing/)

### 2.2 Database Services

#### DynamoDB (On-Demand)
| Component | Price |
|-----------|-------|
| Write requests | $1.25 per million WRUs |
| Read requests | $0.25 per million RRUs |
| Storage | $0.25 per GB-month |
| **Free Tier** | 25 GB storage (always free); On-demand has NO free request tier |

Source: [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)

#### Aurora Serverless v2
| Component | Price (us-east-1) |
|-----------|-------------------|
| Compute | $0.12 per ACU-hour |
| Minimum capacity | 0.5 ACU |
| Storage (Standard) | $0.10 per GB-month |
| I/O | $0.20 per 1M requests |
| **Minimum monthly cost** | ~$44/month (0.5 ACU always-on) |

Source: [Amazon Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)

### 2.3 Integration/Orchestration Services

#### AWS Step Functions
| Type | Price |
|------|-------|
| Standard Workflows | $0.000025 per state transition |
| Express Workflows | $1.00 per 1M executions + duration |
| **Free Tier** | 4,000 state transitions/month (always free) |

Source: [AWS Step Functions Pricing](https://aws.amazon.com/step-functions/pricing/)

#### Amazon EventBridge
| Component | Price |
|-----------|-------|
| AWS service events | Free |
| Custom events | $1.00 per million |
| Scheduler | 14M invocations/month free (always free) |

Source: [Amazon EventBridge Pricing](https://aws.amazon.com/eventbridge/pricing/)

#### API Gateway
| Type | Price |
|------|-------|
| HTTP APIs | $1.00 per million requests |
| REST APIs | $3.50 per million requests |
| **Free Tier** | 1M requests/month (12 months) |

Source: [Amazon API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)

### 2.4 Supporting Services

#### AWS Secrets Manager
| Component | Price |
|-----------|-------|
| Per secret | $0.40 per secret/month |
| API calls | $0.05 per 10,000 calls |

Source: [AWS Secrets Manager Pricing](https://aws.amazon.com/secrets-manager/pricing/)

#### CloudWatch
| Component | Price |
|-----------|-------|
| Logs ingestion | $0.50 per GB |
| Logs storage | $0.03 per GB-month |
| Custom metrics | $0.30 per metric/month |
| **Free Tier** | 5 GB logs ingestion, 10 custom metrics (always free) |

Source: [Amazon CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)

#### AWS Amplify Hosting
| Component | Price |
|-----------|-------|
| Build & Deploy | $0.01 per build minute |
| Hosting storage | $0.023 per GB-month |
| Data transfer | $0.15 per GB served |
| **Free Tier** | 5 GB storage, 1,000 build minutes (new customers, 6 months) |

Source: [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/)

### 2.5 Networking (Critical Hidden Costs)

#### NAT Gateway
| Component | Price |
|-----------|-------|
| Hourly charge | $0.045 per hour |
| Data processing | $0.045 per GB |
| **Monthly minimum** | **~$32.85** (just for existing) |

Source: [Amazon VPC Pricing](https://aws.amazon.com/vpc/pricing/)

#### Data Transfer
| Type | Price |
|------|-------|
| Inbound (Internet to AWS) | Free |
| Outbound to Internet | $0.09 per GB (first 10 TB) |
| Cross-AZ | $0.01 per GB each direction |
| Cross-region | $0.01-0.02 per GB |
| **Free Tier** | 100 GB/month outbound (always free) |

Source: [AWS Data Transfer Overview](https://aws.amazon.com/blogs/architecture/overview-of-data-transfer-costs-for-common-architectures/)

---

## 3. Detailed Cost Calculations

### Option A: Fully Serverless (Lambda + Step Functions + DynamoDB)

Architecture:
```
EventBridge Scheduler (15-min trigger)
  -> Lambda (agent cycle)
     -> DynamoDB (state, artefacts)
     -> External APIs (Jira, Outlook, Claude)
Amplify (Next.js frontend)
  -> DynamoDB (reads)
```

#### EventBridge Scheduler
- 96 invocations/day = 2,880/month
- Free tier: 14M/month
- **Cost: $0.00**

#### Lambda
- Invocations: 96 cycles/day × 30 = 2,880/month
- Plus helper functions: ~10,000 total invocations/month
- Free tier: 1M requests/month
- **Requests: $0.00**

- Compute: 512MB memory, 30 seconds avg per cycle
- GB-seconds: 0.5 GB × 30s × 2,880 = 43,200 GB-seconds/month
- Free tier: 400,000 GB-seconds/month
- **Compute: $0.00**

#### Step Functions (Standard)
- State transitions per cycle: ~15 (poll, check, triage, reason, execute, etc.)
- Monthly: 15 × 96 × 30 = 43,200 transitions
- Free tier: 4,000/month
- Excess: 39,200 × $0.000025 = **$0.98**

#### DynamoDB (On-Demand)
- Writes: ~200/day (events, actions, artefacts, checkpoints)
- Monthly writes: 6,000 × $1.25/M = **$0.008**
- Reads: ~1,000/day (dashboard, agent reads)
- Monthly reads: 30,000 × $0.25/M = **$0.008**
- Storage: 0.5 GB × $0.25 = **$0.125**
- **Total: $0.14**

#### Secrets Manager
- Secrets: 5 (Jira, Outlook, Resend, DB encryption, NextAuth)
- Cost: 5 × $0.40 = **$2.00**
- API calls: ~1,000/month = **$0.005**

#### CloudWatch
- Logs: ~100 MB/month (well under 5 GB free tier)
- Metrics: Basic (free)
- **Cost: $0.00**

#### Amplify Hosting (Frontend)
- Storage: 0.5 GB × $0.023 = $0.012
- Data transfer: ~1 GB/month × $0.15 = $0.15
- Build minutes: ~30/month × $0.01 = $0.30
- **Total: ~$0.50**

#### NAT Gateway (If Required)
If Lambda functions need to access external APIs (Jira, Outlook, Claude) and reside in a VPC:
- Hourly: $0.045 × 730 = $32.85
- Data: ~2 GB × $0.045 = $0.09
- **Total: $32.94**

**CRITICAL:** This is avoidable by:
1. Running Lambda outside VPC (most common for API integrations)
2. Using VPC endpoints for AWS services only

#### Option A Summary

| Component | Without NAT | With NAT |
|-----------|-------------|----------|
| EventBridge | $0.00 | $0.00 |
| Lambda | $0.00 | $0.00 |
| Step Functions | $0.98 | $0.98 |
| DynamoDB | $0.14 | $0.14 |
| Secrets Manager | $2.00 | $2.00 |
| CloudWatch | $0.00 | $0.00 |
| Amplify | $0.50 | $0.50 |
| NAT Gateway | $0.00 | $32.94 |
| Claude API | $7.00 | $7.00 |
| **Infrastructure** | **$3.62** | **$36.56** |
| **Total with LLM** | **$10.62** | **$43.56** |

---

### Option B: Container-Based (Fargate + Aurora Serverless v2)

Architecture:
```
Fargate (persistent agent process)
  -> Aurora Serverless v2 (PostgreSQL)
  -> External APIs
Amplify (Next.js frontend)
  -> Aurora Serverless v2
```

#### Fargate (Always-On Agent)
Minimum configuration: 0.25 vCPU, 0.5 GB memory
- vCPU: 0.25 × $0.04048 × 730 = $7.39
- Memory: 0.5 × $0.004445 × 730 = $1.62
- **Total: $9.01**

#### Aurora Serverless v2
Minimum: 0.5 ACU continuously
- Compute: 0.5 × $0.12 × 730 = $43.80
- Storage: 0.5 GB × $0.10 = $0.05
- I/O: ~50,000/month × $0.20/M = $0.01
- **Total: $43.86**

#### Other Services
- Secrets Manager: $2.00
- CloudWatch: $0.00
- Amplify: $0.50
- Claude API: $7.00

#### Option B Summary

| Component | Cost |
|-----------|------|
| Fargate | $9.01 |
| Aurora Serverless v2 | $43.86 |
| Secrets Manager | $2.00 |
| CloudWatch | $0.00 |
| Amplify | $0.50 |
| **Infrastructure** | **$55.37** |
| **Total with LLM** | **$62.37** |

**Verdict:** Nearly double the current budget. Aurora Serverless v2's minimum capacity destroys the economics.

---

### Option C: Hybrid (Fargate + DynamoDB)

Architecture:
```
Fargate (persistent agent)
  -> DynamoDB (state, artefacts)
  -> External APIs
Amplify (Next.js frontend)
  -> DynamoDB (reads)
```

#### Costs
| Component | Cost |
|-----------|------|
| Fargate | $9.01 |
| DynamoDB | $0.14 |
| Secrets Manager | $2.00 |
| CloudWatch | $0.00 |
| Amplify | $0.50 |
| **Infrastructure** | **$11.65** |
| **Total with LLM** | **$18.65** |

**Trade-off:** Requires rewriting data layer for DynamoDB (NoSQL) instead of PostgreSQL. Significant development effort.

---

## 4. Comparison Summary

| Component | Current | Option A (no NAT) | Option A (with NAT) | Option B | Option C |
|-----------|---------|-------------------|---------------------|----------|----------|
| Compute | $24 | $0.98 | $33.92 | $52.87 | $9.01 |
| Database | $0 | $0.14 | $0.14 | $43.86 | $0.14 |
| Supporting | $0 | $2.50 | $2.50 | $2.50 | $2.50 |
| LLM | $7 | $7.00 | $7.00 | $7.00 | $7.00 |
| **Total** | **$31** | **$10.62** | **$43.56** | **$106.23** | **$18.65** |

---

## 5. Hidden Costs to Watch

### 5.1 NAT Gateway (~$33/month)
**The single biggest cost trap.** Required if:
- Lambda functions are in a VPC and need internet access
- You need VPC for security compliance

**Avoidance strategies:**
- Run Lambda outside VPC (fine for API integrations)
- Use VPC endpoints for AWS services ($0.01/hour each)
- Use public subnets with security groups

### 5.2 Aurora Serverless v2 Minimum (~$44/month)
Cannot scale to zero. The 0.5 ACU minimum runs 24/7 even with no queries.

**Alternative:** DynamoDB (near-zero cost at this scale)

### 5.3 Step Functions State Transitions
At 15 transitions/cycle, costs add up:
- 43,200 transitions/month = ~$1/month
- Express Workflows are cheaper for high-volume, short-duration workflows

### 5.4 Data Transfer Between AZs
- $0.02/GB round-trip between AZs
- Multi-AZ deployments double this cost
- For single-user tool: use single AZ

### 5.5 CloudWatch Logs Retention
- Default: indefinite retention
- Set retention policies (30 days) to avoid accumulating storage costs

### 5.6 Secrets Manager Per-Secret Pricing
- Each secret: $0.40/month
- Consolidate related credentials into single secrets (JSON objects)

---

## 6. AWS Free Tier Summary

| Service | Always Free Allowance | Sufficient for Project? |
|---------|----------------------|------------------------|
| Lambda | 1M requests, 400K GB-sec | Yes |
| DynamoDB | 25 GB storage | Yes |
| Step Functions | 4,000 transitions | No (need ~43K) |
| EventBridge Scheduler | 14M invocations | Yes |
| CloudWatch | 5 GB logs, 10 metrics | Yes |
| Data Transfer | 100 GB outbound | Yes |

**Key Insight:** AWS free tiers cover most of this project's needs. The costs come from services without adequate free tiers (Step Functions, Secrets Manager) or services with high minimums (Aurora, NAT Gateway).

---

## 7. Cost Optimisation Strategies

### 7.1 Avoid NAT Gateway
- Deploy Lambda outside VPC for external API access
- Use VPC endpoints for AWS service access
- Savings: **$33/month**

### 7.2 Skip Aurora Serverless v2
- Use DynamoDB instead (requires schema redesign)
- Or use RDS on smallest instance (~$15/month) if PostgreSQL required
- Savings: **$29-44/month**

### 7.3 Optimise Step Functions
- Use Express Workflows for short executions
- Combine steps to reduce transitions
- Consider Lambda-only orchestration for simple flows
- Savings: ~$0.50/month

### 7.4 Consolidate Secrets
- Store multiple credentials in single JSON secret
- Reduce from 5 secrets to 2
- Savings: **$1.20/month**

### 7.5 Compute Savings Plans
- 1-year Savings Plan: 17% off Lambda
- 3-year Savings Plan: 52% off Fargate
- Not recommended for this scale (commitment outweighs savings)

---

## 8. Break-Even Analysis

### Current vs AWS Serverless (Option A, no NAT)

| Metric | Current | AWS Option A |
|--------|---------|--------------|
| Monthly cost | $31 | $10.62 |
| Savings | - | $20.38/month |
| Annual savings | - | $244.56 |

**Migration effort estimate:** 40-80 hours (infrastructure setup, DynamoDB schema, Lambda functions, Step Functions workflow)

**Break-even point:**
- At $20/month savings: 2-4 months of savings to recoup migration effort
- If migration takes 60 hours at notional $50/hour = $3,000 value
- Break-even: 12+ years (not economically justified)

### Migration Justification Threshold

AWS migration becomes worthwhile if:
1. Scale increases significantly (>10x current usage)
2. Compliance requires AWS (enterprise client mandate)
3. Team already has AWS expertise (reduces migration effort)
4. Project duration exceeds 10+ years

**For a personal project with 1-2 year horizon:** Stay with current stack.

---

## 9. Recommendations

### 9.1 Primary Recommendation: Do Not Migrate

The current infrastructure ($35/month) is:
- Already optimised for this workload
- Simpler to operate (no AWS complexity)
- More predictable (no usage-based surprises)
- Sufficient for 1-2 projects at single-user scale

AWS offers lower theoretical costs but introduces:
- Higher operational complexity
- NAT Gateway trap (~$33/month if misconfigured)
- Aurora minimum (~$44/month if chosen)
- DynamoDB migration effort if avoiding Aurora

### 9.2 If AWS Migration Is Required

**Recommended architecture:** Option A (Serverless) without NAT Gateway

| Component | Service | Est. Cost |
|-----------|---------|-----------|
| Agent trigger | EventBridge Scheduler | $0 |
| Agent logic | Lambda (outside VPC) | $0 |
| Orchestration | Step Functions (minimal) | $1 |
| Database | DynamoDB | $0.15 |
| Secrets | Secrets Manager (consolidated) | $1.20 |
| Frontend | Amplify Hosting | $0.50 |
| Monitoring | CloudWatch | $0 |
| LLM | Claude API | $7 |
| **Total** | | **~$10/month** |

**Critical requirements:**
- Lambda MUST run outside VPC (no NAT Gateway)
- PostgreSQL schema MUST be redesigned for DynamoDB
- Step Functions usage MUST be minimised

### 9.3 Budget Ceiling Adjustment

If migrating to AWS:
- **Option A (optimised):** Keep $35/month ceiling (provides buffer)
- **Option B/C (Fargate):** Increase to $25/month infrastructure + $10 LLM = $35 minimum
- **With NAT Gateway:** Increase to $55/month minimum

**Recommendation:** Do not change budget ceiling. If AWS costs exceed $35/month, the migration defeats its purpose.

### 9.4 When to Reconsider

Revisit AWS migration if:
1. Vercel Pro pricing increases significantly
2. Hetzner VPS becomes unavailable
3. Project scales to enterprise use (multi-tenant)
4. Compliance requirements mandate AWS

---

## 10. Conclusion

| Question | Answer |
|----------|--------|
| Is AWS migration cost-effective? | **No** at current scale |
| Cheapest AWS option | Option A (serverless): ~$11/month |
| Biggest cost traps | NAT Gateway ($33), Aurora ($44) |
| Break-even point | 12+ years (not justified) |
| Should budget ceiling change? | No, keep at $35/month |
| Recommended action | **Stay with current stack** |

The current Vercel + Hetzner + Neon stack is already well-optimised for a personal project management tool. AWS migration would add complexity without meaningful cost savings, and introduces significant risk of accidentally exceeding the budget through NAT Gateway or Aurora Serverless v2 minimum charges.

---

## Sources

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS Step Functions Pricing](https://aws.amazon.com/step-functions/pricing/)
- [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [Amazon Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [AWS App Runner Pricing](https://aws.amazon.com/apprunner/pricing/)
- [Amazon EventBridge Pricing](https://aws.amazon.com/eventbridge/pricing/)
- [Amazon API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Secrets Manager Pricing](https://aws.amazon.com/secrets-manager/pricing/)
- [Amazon CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/)
- [Amazon VPC Pricing (NAT Gateway)](https://aws.amazon.com/vpc/pricing/)
- [AWS Data Transfer Overview](https://aws.amazon.com/blogs/architecture/overview-of-data-transfer-costs-for-common-architectures/)
- [AWS Free Tier](https://aws.amazon.com/free/)
- [CloudZero AWS Lambda Pricing Guide](https://www.cloudzero.com/blog/aws-lambda-pricing/)
- [CloudZero AWS Fargate Pricing](https://www.cloudzero.com/blog/aws-fargate-pricing/)
- [CostGoat AWS NAT Gateway Pricing](https://costgoat.com/pricing/aws-nat-gateway)
- [Wiz AWS CloudWatch Costs](https://www.wiz.io/academy/cloud-cost/cloudwatch-costs)
