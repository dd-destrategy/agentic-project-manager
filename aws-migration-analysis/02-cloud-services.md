# AWS Cloud Services Analysis

> **Document:** 02-cloud-services.md
> **Purpose:** AWS service selection for Agentic PM Workbench migration
> **Date:** February 2026
> **Current Infrastructure:** Vercel Pro ($20/mo) + Hetzner VPS ($4/mo) + Neon PostgreSQL (free)
> **Budget Constraint:** $35/month total (including ~$7 LLM costs)

---

## Executive Summary

This analysis evaluates AWS services to replace the current Vercel Pro + Hetzner VPS + Neon PostgreSQL stack. The key architectural requirements are:

1. **15-minute agent loop** - persistent process with database keepalive every 4 minutes
2. **Next.js SSR frontend** - Server Components with TanStack Query polling
3. **PostgreSQL with heavy JSONB usage** - structured artefact storage
4. **Single user** - no multi-tenancy or complex auth requirements

**Recommendation:** The current $24/month infrastructure is extremely cost-efficient. AWS migration would likely cost $45-80/month for equivalent functionality, exceeding the $35 budget ceiling. If migration is required, the most cost-effective path is **EC2 t4g.small (free tier through Dec 2026) + RDS PostgreSQL db.t4g.micro (free tier 750h/month)**, but this requires careful management to stay within free tier limits.

---

## 1. Compute Options Analysis

### 1.1 Requirements Recap

| Workload | Current Solution | Key Requirements |
|----------|-----------------|------------------|
| Agent loop (15-min) | Hetzner VPS, pm2, persistent Node.js | Long-running, database keepalive every 4 min, no timeout limits |
| Next.js frontend | Vercel Pro (SSR) | 300s function limit, Server Components, API routes |

### 1.2 Option Comparison

#### AWS Lambda

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.20/million requests + $0.0000166667/GB-second (x86) |
| **Free tier** | 1M requests + 400K GB-seconds/month (permanent) |
| **Max duration** | 15 minutes |
| **Suitability for agent loop** | **Poor.** The agent loop requires persistent database connections with 4-minute keepalives. Lambda's ephemeral nature means cold starts on every invocation and no persistent connections. While 15-min timeout matches the polling interval, the keepalive pattern is awkward to implement. |
| **Suitability for SSR** | **Moderate.** Next.js on Lambda is possible via custom runtime or OpenNext, but cold starts impact TTFB. Vercel's edge optimisations are hard to replicate. |
| **Monthly cost estimate** | Agent: ~$2-5/mo (if using EventBridge triggers). Frontend: Complex to estimate, likely $10-20/mo with API Gateway. |

**Verdict:** Lambda is unsuitable for the persistent agent pattern. The 4-minute keepalive requirement fundamentally conflicts with Lambda's stateless model.

#### AWS Fargate (Serverless Containers)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.04048/vCPU-hour + $0.004445/GB-hour (x86). ARM: 20% cheaper. |
| **Free tier** | None |
| **Suitability for agent loop** | **Good.** Can run a persistent container with pm2-managed Node.js process. Supports the keepalive pattern natively. |
| **Suitability for SSR** | **Good.** Can containerise Next.js with standalone output. No cold start issues. |
| **Monthly cost estimate** | Minimum config (0.25 vCPU, 0.5 GB): ~$20/month running 24/7. With 1 vCPU + 2 GB: ~$45/month. |

**Cost breakdown (0.25 vCPU, 0.5 GB, 730 hours/month):**
- vCPU: 0.25 × $0.04048 × 730 = $7.39
- Memory: 0.5 × $0.004445 × 730 = $1.62
- **Total: ~$9/month per container**
- Two containers (agent + frontend): **~$18-20/month**

**Verdict:** Fargate works architecturally but costs more than the current $4 Hetzner VPS. However, it's competitive with Vercel Pro pricing for the frontend portion.

#### ECS on EC2 (Managed Containers)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | EC2 instance cost only (ECS control plane is free) |
| **Free tier** | t4g.small free through Dec 2026 (750 hours/month) |
| **Suitability for agent loop** | **Excellent.** Full control, persistent connections, no timeouts. |
| **Suitability for SSR** | **Excellent.** Same as any EC2 deployment. |
| **Monthly cost estimate** | t4g.small: Free (until Dec 2026), then ~$12/month. t4g.micro: ~$6/month on-demand. |

**Verdict:** Best price-performance if you're comfortable managing EC2 instances. The current Hetzner pattern translates directly.

#### App Runner

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.064/vCPU-hour + $0.007/GB-hour. $1/month per app for auto-deploy. |
| **Free tier** | None |
| **Suitability for agent loop** | **Poor.** Designed for request-driven workloads. Scales to zero when idle, which breaks the persistent agent pattern. |
| **Suitability for SSR** | **Moderate.** Works for Next.js but scale-to-zero causes cold starts. |
| **Monthly cost estimate** | Minimum (1 vCPU, 2 GB) running 24/7: ~$52/month. With idle scaling: highly variable. |

**Verdict:** App Runner's scale-to-zero model is incompatible with the 4-minute keepalive requirement.

#### EC2 (Traditional VMs)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | t4g.micro: $0.0084/hour (~$6/month). t4g.small: $0.0168/hour (~$12/month). |
| **Free tier** | t4g.small: 750 hours/month free through Dec 2026 |
| **Suitability for agent loop** | **Excellent.** Direct equivalent to current Hetzner VPS. |
| **Suitability for SSR** | **Excellent.** Can run both agent and Next.js on single instance. |
| **Monthly cost estimate** | t4g.small (2 vCPU, 2 GB): Free through Dec 2026, then ~$12/month. |

**Verdict:** Most direct migration path. The t4g.small free tier through Dec 2026 makes this the cheapest option.

### 1.3 Compute Recommendation

| Workload | Recommended Service | Rationale |
|----------|--------------------|-----------|
| **Agent loop** | EC2 t4g.small | Direct equivalent to Hetzner. Free tier through Dec 2026. Supports pm2, persistent connections, 4-min keepalive pattern. |
| **Next.js frontend** | Same EC2 instance | Single-instance deployment keeps costs minimal. Caddy reverse proxy handles TLS. |

**Alternative (if separate concerns preferred):**
- Agent: EC2 t4g.micro (~$6/month)
- Frontend: Fargate with 0.25 vCPU (~$9/month)
- Total: ~$15/month (still cheaper than current $24)

**Note:** Continuing with Vercel Pro ($20/month) for the frontend and only migrating the agent to AWS EC2 ($0-6/month) is also a valid hybrid approach.

---

## 2. Database Options Analysis

### 2.1 Requirements Recap

From SPEC.md:
- PostgreSQL with heavy JSONB usage for artefacts
- 0.5 GB storage budget (current Neon free tier limit)
- Structured schemas for delivery_state, RAID log, backlog_summary, decision_log
- Agent needs persistent connections (node-postgres)
- Frontend uses serverless driver (@neondatabase/serverless)
- Keepalive queries every 4 minutes to prevent cold starts

### 2.2 Option Comparison

#### DynamoDB (NoSQL)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | On-demand: $0.25/million WRUs, $0.25/million RRUs |
| **Free tier** | 25 GB storage, 25 WCUs, 25 RCUs (provisioned mode) - permanent |
| **JSONB compatibility** | **Poor.** DynamoDB stores JSON natively but lacks PostgreSQL's JSONB operators (`->`, `->>`, `@>`, `?`). Would require rewriting all artefact queries. |
| **Migration effort** | **High.** Complete schema redesign. Different query patterns. |
| **Monthly cost estimate** | Low workload: ~$0-2/month within free tier. |

**Verdict:** Not recommended. The application is designed around PostgreSQL JSONB semantics. Migration would require significant code changes with no clear benefit.

#### Aurora Serverless v2 (PostgreSQL)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | ~$0.12/ACU-hour. Minimum 0.5 ACU. |
| **Free tier** | None |
| **JSONB compatibility** | **Excellent.** Full PostgreSQL compatibility. |
| **Minimum cost** | 0.5 ACU × 730 hours × $0.12 = **~$44/month** |
| **Cold starts** | Scales down but never to zero. Minimum 0.5 ACU always running. |

**Cost breakdown:**
- Minimum running (0.5 ACU): $44/month
- Storage: $0.10/GB-month for standard, ~$0.05 for this workload
- I/O: $0.20/million requests, likely <$1/month
- **Total: ~$45-50/month**

**Verdict:** Too expensive. Exceeds the entire $35 budget ceiling on database alone.

#### RDS PostgreSQL (Traditional)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | db.t4g.micro: ~$0.016/hour (~$12/month). db.t3.micro: ~$0.017/hour. |
| **Free tier** | 750 hours/month for db.t3.micro or db.t4g.micro (12 months only for new accounts) |
| **Storage** | 20 GB gp2 included in free tier. gp3: $0.08/GB-month after. |
| **JSONB compatibility** | **Excellent.** Full PostgreSQL. |
| **Connection limits** | ~80-100 connections on micro instances (sufficient for single-user app). |

**Cost breakdown (post-free-tier):**
- db.t4g.micro instance: $12/month
- 20 GB gp2 storage: Included in free tier, then ~$2/month
- Backups (7-day retention, 1 GB): ~$0.10/month
- **Total: ~$14/month post-free-tier**

**During free tier (first 12 months):**
- Instance: Free (750 hours)
- 20 GB gp2: Free
- **Total: ~$0/month**

**Verdict:** Best option if migrating to AWS. Free tier provides 12 months of zero cost. Post-free-tier cost is reasonable at ~$14/month.

### 2.3 Database Recommendation

| Option | Recommended | Rationale |
|--------|-------------|-----------|
| **Primary** | RDS PostgreSQL db.t4g.micro | Full PostgreSQL compatibility, 12-month free tier, reasonable post-free-tier cost. |
| **Alternative** | Keep Neon (free tier) | Zero cost, serverless scaling, works with current code. Mix with AWS compute. |

**Hybrid approach:** Keep Neon PostgreSQL (free) and only migrate compute to AWS. This preserves the $0 database cost and avoids migration complexity.

**Connection strategy on AWS:**
- Agent (EC2): Use `pg` (node-postgres) for persistent connections
- Frontend (if on EC2/Fargate): Use `pg` directly (no serverless driver needed)
- If keeping Vercel frontend: Continue using `@neondatabase/serverless`

---

## 3. Orchestration Options Analysis

### 3.1 Requirements Recap

The agent loop runs every 15 minutes:
1. Keepalive query to database
2. Poll Jira and Outlook for changes
3. Process signals through LLM if changes detected
4. Execute actions and update artefacts
5. Daily housekeeping (prune old events)

The current implementation is a simple `setInterval` in a persistent Node.js process.

### 3.2 Option Comparison

#### Step Functions (State Machine)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.000025/state transition. 4,000 free/month. |
| **Suitability** | **Overkill.** Step Functions excel at complex branching workflows. The agent loop is linear with simple conditional logic. |
| **Monthly cost estimate** | 64 runs/day × 30 days × ~10 transitions = 19,200 transitions. Cost: ~$0.38/month. |

**Verdict:** Works but adds unnecessary complexity. The visual workflow designer adds no value for a simple polling loop.

#### EventBridge Scheduler + Lambda

| Aspect | Assessment |
|--------|------------|
| **Pricing** | 14 million invocations/month free. Lambda: 1M requests free + 400K GB-seconds. |
| **Suitability** | **Moderate for triggering, poor for execution.** EventBridge can trigger every 15 minutes reliably, but Lambda's stateless nature conflicts with the keepalive pattern. |
| **Pattern** | EventBridge → Lambda → Database. Each invocation is independent. |

**Verdict:** Works only if you abandon the keepalive pattern and accept cold starts. Not recommended given current architecture.

#### ECS Scheduled Tasks

| Aspect | Assessment |
|--------|------------|
| **Pricing** | Fargate pricing for task runtime. EventBridge for scheduling (free tier). |
| **Suitability** | **Poor.** Designed for batch jobs, not persistent processes. Each run spins up a new container. |
| **Pattern** | EventBridge → ECS Task (runs, completes, terminates). |

**Verdict:** Wrong model. The agent needs persistence, not scheduled job execution.

#### Persistent Process (Current Pattern)

| Aspect | Assessment |
|--------|------------|
| **Pricing** | EC2/Fargate instance cost only. No orchestration fees. |
| **Suitability** | **Excellent.** Matches current Hetzner implementation exactly. |
| **Pattern** | pm2-managed Node.js process with `setInterval` for polling. |

**Verdict:** Keep the current pattern. It's simpler, cheaper, and proven.

### 3.3 Orchestration Recommendation

**Keep the current pattern:** Persistent Node.js process managed by pm2 on EC2.

| Component | Implementation |
|-----------|---------------|
| Polling loop | `setInterval(runAgentCycle, 15 * 60 * 1000)` |
| Keepalive | `setInterval(sendKeepalive, 4 * 60 * 1000)` |
| Process manager | pm2 with auto-restart on crash |
| Logging | pm2 logs + CloudWatch agent (optional) |

**Why not serverless orchestration?**
1. The 4-minute keepalive pattern requires persistent database connections
2. EventBridge + Lambda adds latency and complexity for no benefit
3. Step Functions cost money for a trivially simple workflow
4. Current pattern is battle-tested on Hetzner

---

## 4. Supporting Services Analysis

### 4.1 Secrets Management

#### AWS Secrets Manager

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.40/secret/month + $0.05/10K API calls |
| **Features** | Automatic rotation, RDS integration, cross-region replication |
| **For this project** | 4-5 secrets (Jira, Outlook, Resend, DB, encryption key): ~$2/month |

#### Systems Manager Parameter Store

| Aspect | Assessment |
|--------|------------|
| **Pricing** | Free (standard tier, up to 10K parameters) |
| **Features** | No automatic rotation, 4 KB limit per parameter |
| **For this project** | Free. Sufficient for static API keys. |

**Recommendation:** **Parameter Store (free tier)** for API tokens and configuration. These don't require rotation. Use SecureString type for encryption at rest.

### 4.2 Monitoring

#### CloudWatch

| Aspect | Assessment |
|--------|------------|
| **Pricing** | Free tier: 10 custom metrics, 1M API requests, 5 GB logs ingestion/month |
| **For this project** | Likely stays within free tier. Basic metrics and logs. |

#### X-Ray

| Aspect | Assessment |
|--------|------------|
| **Pricing** | Free tier: 100K traces recorded, 1M traces scanned/month |
| **For this project** | Overkill. X-Ray is for distributed tracing across microservices. |

**Recommendation:** **CloudWatch only.** Install CloudWatch agent on EC2 for logs and basic metrics. X-Ray adds no value for a single-instance application.

### 4.3 Storage

#### S3

| Aspect | Assessment |
|--------|------------|
| **For this project** | Not needed. All data fits in PostgreSQL JSONB. No file uploads in MVP. |
| **If needed later** | $0.023/GB-month for Standard. Free tier: 5 GB for 12 months. |

**Recommendation:** **Not required.** Keep data in PostgreSQL as currently designed.

### 4.4 CDN

#### CloudFront

| Aspect | Assessment |
|--------|------------|
| **Pricing** | $0.085/GB data transfer (first 10 TB). 1 TB/month free for 12 months. |
| **For this project** | Single user = minimal traffic. CDN adds latency for SSR pages. |
| **Value** | Static assets only (JS bundles, CSS). Not worth the complexity for single user. |

**Recommendation:** **Not required for MVP.** If needed later, CloudFront in front of EC2 is straightforward to add.

### 4.5 Authentication

#### Amazon Cognito

| Aspect | Assessment |
|--------|------------|
| **Pricing** | Lite: Free for first 10K MAU, then $0.0055-$0.0025/MAU |
| **For this project** | Single user = 1 MAU = free. But massive overkill. |
| **Current approach** | NextAuth.js + Credentials provider. Username/password in env vars. |

**Recommendation:** **Keep NextAuth.js.** Cognito adds unnecessary complexity for a single-user application. The current approach (bcrypt-hashed password in environment variables) is simpler and free.

### 4.6 Supporting Services Summary

| Service | Recommendation | Monthly Cost |
|---------|---------------|--------------|
| Secrets | Parameter Store (free tier) | $0 |
| Monitoring | CloudWatch (free tier) | $0 |
| Storage | Not required | $0 |
| CDN | Not required | $0 |
| Auth | Keep NextAuth.js | $0 |
| **Total** | | **$0** |

---

## 5. Infrastructure as Code Analysis

### 5.1 Option Comparison

#### AWS CDK

| Aspect | Assessment |
|--------|------------|
| **Language** | TypeScript, Python, Java, Go, C# |
| **AWS integration** | First-class. Same-day support for new services. |
| **Learning curve** | Low for developers already using TypeScript |
| **State management** | CloudFormation (AWS-managed) |
| **Multi-cloud** | AWS only |

**Pros for this project:**
- TypeScript matches the application stack
- L2 constructs provide sensible defaults with security best practices
- No state file to manage
- IDE autocomplete and type checking

#### Terraform

| Aspect | Assessment |
|--------|------------|
| **Language** | HCL (HashiCorp Configuration Language) |
| **AWS integration** | Excellent via AWS provider |
| **Learning curve** | Moderate. HCL is different from general-purpose languages. |
| **State management** | Requires backend (S3 + DynamoDB for locking, or Terraform Cloud) |
| **Multi-cloud** | Excellent. Same tool for AWS, GCP, Azure. |
| **License** | Business Source License (since 2023). OpenTofu is the open-source fork. |

**Cons for this project:**
- State file management adds operational burden
- HCL is another language to learn
- BSL license may concern some organisations
- Overkill for AWS-only, single-environment deployment

#### AWS SAM

| Aspect | Assessment |
|--------|------------|
| **Focus** | Serverless applications (Lambda, API Gateway, DynamoDB) |
| **For this project** | Not recommended. The architecture is not serverless. |

### 5.2 IaC Recommendation

**Recommended: AWS CDK with TypeScript**

| Reason | Detail |
|--------|--------|
| **Stack alignment** | TypeScript throughout (app + infrastructure) |
| **Simplicity** | No state file management |
| **Sensible defaults** | L2 constructs include security best practices |
| **Developer experience** | IDE support, compile-time errors |
| **Single cloud** | No multi-cloud requirement makes Terraform's main advantage irrelevant |

**Minimal CDK structure:**

```
infra/
  bin/
    app.ts              # CDK app entry point
  lib/
    compute-stack.ts    # EC2 instance, security groups
    database-stack.ts   # RDS PostgreSQL (if not using Neon)
    network-stack.ts    # VPC, subnets (or use default VPC)
  cdk.json
  package.json
```

**Alternative:** For a single EC2 instance + RDS, even CDK might be overkill. A simple shell script with AWS CLI commands could suffice:

```bash
#!/bin/bash
# deploy.sh - Manual deployment for single-instance architecture
aws ec2 run-instances --image-id ami-xxx --instance-type t4g.small ...
aws rds create-db-instance --db-instance-identifier pmworkbench --db-instance-class db.t4g.micro ...
```

**Recommendation:** Start with **manual AWS Console setup** for MVP, document the configuration, then codify with **CDK** if the infrastructure grows or needs reproducibility.

---

## 6. Cost Comparison Summary

### Current Infrastructure

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Frontend + SSR | Vercel Pro | $20.00 |
| Agent runtime | Hetzner VPS CX22 | $4.00 |
| Database | Neon PostgreSQL (free) | $0.00 |
| **Total infrastructure** | | **$24.00** |
| LLM (Claude API) | | ~$7.00 |
| **Grand total** | | **~$31.00** |

### AWS Migration Options

#### Option A: Full AWS Migration (Recommended if required)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Compute (agent + frontend) | EC2 t4g.small | $0 (free tier through Dec 2026) |
| Database | RDS db.t4g.micro | $0 (free tier 12 months) |
| Secrets | Parameter Store | $0 |
| Monitoring | CloudWatch | $0 |
| **Total infrastructure** | | **$0** (during free tier) |
| Post-free-tier | | ~$26/month |

#### Option B: Hybrid (Recommended for cost optimisation)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Frontend | Vercel Pro (keep) | $20.00 |
| Agent runtime | EC2 t4g.small | $0 (free tier through Dec 2026) |
| Database | Neon (keep) | $0.00 |
| **Total infrastructure** | | **$20.00** |

#### Option C: AWS Fargate + RDS

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Agent | Fargate (0.25 vCPU, 0.5 GB) | $9.00 |
| Frontend | Fargate (0.25 vCPU, 0.5 GB) | $9.00 |
| Database | RDS db.t4g.micro (post-free-tier) | $14.00 |
| Load balancer | ALB | $16.00 |
| **Total infrastructure** | | **$48.00** |

**Note:** Option C exceeds budget but is included for comparison. The ALB requirement for Fargate significantly increases costs.

---

## 7. Recommendations

### Primary Recommendation: Hybrid Approach (Option B)

Keep Vercel Pro for the frontend and migrate only the agent runtime to AWS EC2:

1. **Frontend:** Vercel Pro ($20/month) - proven, optimised for Next.js
2. **Agent:** EC2 t4g.small (free through Dec 2026, then ~$12/month)
3. **Database:** Keep Neon free tier ($0)

**Benefits:**
- Minimal migration effort (only agent moves)
- Vercel's edge network and SSR optimisations retained
- Total cost: $20/month (saves $4/month vs current)
- AWS experience gained without full commitment

### Secondary Recommendation: Full AWS (Option A)

If full AWS migration is required:

1. **Compute:** EC2 t4g.small running both agent and Next.js (free tier through Dec 2026)
2. **Database:** RDS PostgreSQL db.t4g.micro (free tier 12 months)
3. **Reverse proxy:** Caddy (as currently designed)
4. **Process manager:** pm2 (as currently designed)
5. **IaC:** AWS CDK with TypeScript

**Monthly cost trajectory:**
- Months 1-12: $0 (both free tiers active)
- Months 13-24: ~$12 (EC2 free tier ends Dec 2026)
- Month 25+: ~$26 (RDS free tier ends)

### Not Recommended

1. **Aurora Serverless v2** - $44+/month minimum, exceeds entire budget
2. **App Runner** - scale-to-zero conflicts with keepalive pattern
3. **Lambda for agent** - stateless model incompatible with persistent connections
4. **DynamoDB** - requires rewriting JSONB query logic
5. **Cognito** - overkill for single-user auth

---

## 8. Migration Checklist

If proceeding with AWS migration:

### Phase 1: Preparation
- [ ] Create AWS account (if not exists)
- [ ] Set up IAM user with appropriate permissions
- [ ] Configure AWS CLI locally
- [ ] Verify free tier eligibility

### Phase 2: Infrastructure
- [ ] Launch EC2 t4g.small in preferred region
- [ ] Configure security group (22, 80, 443)
- [ ] Install Node.js, pm2, Caddy
- [ ] Set up Parameter Store secrets
- [ ] (If migrating DB) Create RDS instance and migrate data

### Phase 3: Deployment
- [ ] Clone repository to EC2
- [ ] Configure environment variables
- [ ] Start agent with pm2
- [ ] Configure Caddy for HTTPS
- [ ] Verify agent heartbeat in logs

### Phase 4: Validation
- [ ] Confirm Jira polling works
- [ ] Confirm database connectivity
- [ ] Confirm Resend notifications work
- [ ] Monitor CloudWatch for 24 hours
- [ ] Decommission Hetzner VPS

---

## Sources

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [Amazon Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [AWS App Runner Pricing](https://aws.amazon.com/apprunner/pricing/)
- [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [AWS Step Functions Pricing](https://aws.amazon.com/step-functions/pricing/)
- [Amazon EventBridge Pricing](https://aws.amazon.com/eventbridge/pricing/)
- [EC2 On-Demand Instance Pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [Amazon Cognito Pricing](https://aws.amazon.com/cognito/pricing/)
- [AWS CDK vs Terraform Comparison](https://towardsthecloud.com/blog/aws-cdk-vs-terraform)
- [AWS Secrets Manager vs Parameter Store](https://aws.amazon.com/blogs/security/how-to-choose-the-right-aws-service-for-managing-secrets-and-configurations/)
