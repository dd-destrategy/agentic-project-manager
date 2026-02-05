# Architecture Comparison: AWS Bedrock AgentCore Runtime vs Step Functions + Lambda

> **Date:** February 2026
> **Context:** Agentic PM Workbench — single-user PM assistant with $15/month budget ceiling

---

## Executive Summary

**Recommendation: Stay with Step Functions + Lambda.**

AgentCore Runtime is designed for interactive, session-based AI agents with complex memory requirements and concurrent user sessions. The Agentic PM Workbench is a scheduled batch processor with a single user. The architectural mismatch, uncertain costs, and added complexity outweigh AgentCore's benefits for this use case.

---

## 1. Architecture Overview

### Current Architecture: Step Functions + Lambda

```
EventBridge (15-min) ──► Step Functions State Machine
                              │
                              ├─► heartbeat-lambda
                              ├─► change-detection-lambda
                              ├─► normalise-lambda
                              ├─► triage-sanitise-lambda (Haiku)
                              ├─► triage-classify-lambda (Haiku)
                              ├─► reasoning-lambda (Sonnet)
                              ├─► execute-lambda
                              └─► artefact-update-lambda

EventBridge (1-min) ──► hold-queue-lambda

All Lambdas ──► DynamoDB (persistence)
           ──► Secrets Manager (credentials)
           ──► Claude API (direct)
```

**Key characteristics:**
- Deterministic orchestration via Step Functions
- Each Lambda is stateless, thin wrapper around `@agentic-pm/core`
- State passes between Lambdas via Step Functions
- 15-minute polling cycle (not interactive sessions)
- Change detection gate controls LLM costs
- DynamoDB single-table design for all persistence

### AgentCore Runtime Architecture

```
EventBridge/API Gateway ──► AgentCore Runtime
                                 │
                                 ├─► MicroVM (isolated session)
                                 │      └─► Agent code (LangGraph, Strands, etc.)
                                 │
                                 ├─► AgentCore Gateway (MCP tools)
                                 │      └─► Lambda functions
                                 │      └─► External APIs
                                 │
                                 ├─► AgentCore Memory
                                 │      ├─► Short-term (conversation)
                                 │      ├─► Long-term (persistence)
                                 │      └─► Episodic (learning)
                                 │
                                 ├─► AgentCore Identity (OAuth/API keys)
                                 ├─► AgentCore Observability (traces)
                                 └─► AgentCore Policy (guardrails)
```

**Key characteristics:**
- Single agent with built-in session management
- MicroVM isolation per session (terminates after completion)
- Supports 8-hour continuous execution
- Framework-agnostic (LangGraph, CrewAI, Strands, etc.)
- MCP protocol for tool integration
- Consumption-based pricing (per-second CPU + memory)
- I/O wait is free (no charge when waiting for LLM responses)

---

## 2. Comparison Dimensions

### 2.1 Complexity: Infrastructure Code

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **IaC resources to define** | ~15-20 (Lambdas, Step Functions, DynamoDB, EventBridge, IAM roles) | ~5-10 (AgentCore agent, Gateway tools, EventBridge trigger) |
| **CDK/CloudFormation lines** | ~800-1200 lines | ~300-500 lines (estimated) |
| **IAM complexity** | High (separate roles per Lambda for security isolation) | Medium (AgentCore handles session isolation) |
| **State management code** | Custom (DynamoDB + Step Functions state) | Built-in (AgentCore Memory) |
| **Scheduling logic** | Custom (EventBridge rules + Step Functions Choice states) | Custom (still need EventBridge) |

**Verdict:** AgentCore reduces infrastructure boilerplate but adds framework complexity. Net neutral for this use case.

### 2.2 Deployment: Container vs Lambda Zip

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **Deployment artefact** | Lambda ZIP files (~5-10 MB each) | Container image (ECR) or code ZIP (S3) |
| **Build process** | `npm run build` + `cdk deploy` | Docker build or ZIP + `aws bedrock-agentcore deploy` |
| **CI/CD pipeline** | GitHub Actions → CDK → Lambda | GitHub Actions → ECR/S3 → AgentCore |
| **Cold start** | 500ms-2s per Lambda (acceptable for batch) | "Fast cold starts" (AWS claims, no published numbers) |
| **Deployment speed** | ~2-3 minutes | Unknown (new service) |
| **Rollback** | Lambda versioning + aliases | Unknown mechanism |

**Verdict:** Lambda deployment is battle-tested. AgentCore deployment is newer with less documentation on production operations.

### 2.3 Local Development

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **Local database** | DynamoDB Local (Docker) | Not applicable (uses AgentCore Memory) |
| **Local AWS services** | LocalStack | Not supported for AgentCore |
| **Offline development** | Full offline capability | Requires AWS connectivity |
| **Unit testing** | Jest + mocked DynamoDB | Framework-dependent (LangGraph, Strands) |
| **Integration testing** | LocalStack + DynamoDB Local | Must deploy to AWS |
| **Debugging** | Standard Node.js debugging | Framework-specific debugging |
| **Development workflow** | `pnpm dev:agent` (local) | Deploy → test → iterate |

**Verdict:** Step Functions + Lambda has superior local development experience. AgentCore requires cloud deployment for testing.

### 2.4 Observability

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **Execution traces** | Step Functions visual execution history | AgentCore Observability (OpenTelemetry) |
| **Logs** | CloudWatch Logs (per-Lambda log groups) | CloudWatch Logs (via Observability) |
| **Metrics** | CloudWatch Metrics + custom dashboards | CloudWatch Metrics (bundled) |
| **Debugging** | Step Functions execution inspector (excellent) | OpenTelemetry traces |
| **Cost visibility** | AWS Cost Explorer (granular per-service) | AgentCore-specific metering (new) |
| **Alerting** | CloudWatch Alarms | CloudWatch Alarms |

**Verdict:** Step Functions execution history is exceptional for debugging orchestration. AgentCore observability is good but less mature.

### 2.5 Flexibility: Custom Orchestration Logic

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **Orchestration control** | Full control (Choice, Parallel, Map, Wait states) | Framework-dependent (LangGraph, Strands) |
| **Change detection gate** | Trivial (Choice state after detection Lambda) | Custom code in agent |
| **Budget controls** | Step Functions Choice state checks budget | Custom code in agent |
| **Hold queue timing** | Separate EventBridge (1-min) + Lambda | Custom code or AgentCore Gateway |
| **Degradation ladder** | Step Functions state transitions | Custom code in agent |
| **Conditional LLM routing** | Step Functions Choice states | Framework graph nodes |

**Critical difference:** The Agentic PM Workbench requires precise cost controls:
- Change detection gate (skip LLM if no changes)
- Budget degradation ladder (Haiku/Sonnet ratio, polling frequency)
- Hard ceiling enforcement (monitoring-only fallback)

Step Functions provides **declarative, inspectable** control flow. AgentCore requires embedding this logic in agent code, making it less visible and harder to audit.

**Verdict:** Step Functions is significantly better for the cost-control requirements of this project.

### 2.6 Vendor Lock-in

| Aspect | Step Functions + Lambda | AgentCore Runtime |
|--------|-------------------------|-------------------|
| **AWS specificity** | High (Step Functions is AWS-only) | High (AgentCore is AWS-only) |
| **LLM provider** | Direct Claude API (portable) | Any provider via Gateway (portable) |
| **Database** | DynamoDB (AWS-only, but standard NoSQL patterns) | AgentCore Memory (AWS-only, proprietary) |
| **Framework lock-in** | None (custom `@agentic-pm/core`) | Medium (LangGraph, Strands, CrewAI) |
| **Exit path** | Rewrite Step Functions to Temporal/Conductor | Rewrite agent + find memory replacement |

**Verdict:** Similar AWS lock-in. AgentCore adds framework lock-in risk if using LangGraph/Strands. Step Functions patterns are more transferable (state machines are universal).

---

## 3. Cost Analysis

### 3.1 Step Functions + Lambda (Current Estimate)

From SPEC.md:

| Service | Monthly Cost |
|---------|--------------|
| Amplify Hosting | $0.50 |
| Lambda | $0.00 (free tier) |
| Step Functions | $1.00 |
| DynamoDB | $0.25 |
| Secrets Manager | $2.00 |
| SES | $0.00 (free tier) |
| CloudWatch | $1-2 |
| **Infrastructure Total** | **~$5-8** |
| Claude API | ~$5-7 |
| **Grand Total** | **~$11-13/month** |

**Key cost control:** Change detection gate ensures LLM calls only happen when there are actual changes. This is critical for staying under budget.

### 3.2 AgentCore Runtime (Estimated)

AgentCore uses **consumption-based pricing**:
- Per-second CPU usage (active compute only)
- Per-second memory (peak usage, 128MB minimum)
- I/O wait is free (waiting for LLM responses)
- Gateway: per-API call
- Memory: per-event, per-record, per-retrieval
- Identity: per-authentication request
- Observability: CloudWatch rates

**The challenge:** AWS does not publish specific dollar-per-second rates. Pricing page states "contact AWS for detailed rate information."

**Rough estimate for 15-minute polling pattern:**
- 96 invocations/day × 30 days = 2,880 invocations/month
- Each invocation: ~60-120 seconds execution, ~50% I/O wait
- Active CPU time: ~30-60 seconds per invocation
- Memory: ~256-512 MB

Without published rates, cost projection is speculative. However, based on the [Scalevise analysis](https://scalevise.com/resources/agentcore-bedrock-pricing-self-hosting/):

> "Agentic systems are a stack, not a single SKU — costs compound across multiple small meters that scale quickly with traffic."

**Hidden costs to consider:**
- AgentCore Memory (per-event writes for every signal)
- AgentCore Gateway (per-API call for Jira, Outlook, Claude)
- AgentCore Observability (log ingestion)
- ECR storage (for container deployment)

**Risk:** AgentCore may cost more than Step Functions + Lambda for batch processing patterns due to the overhead of session management and built-in services.

### 3.3 Cost Control Comparison

| Control | Step Functions + Lambda | AgentCore Runtime |
|---------|-------------------------|-------------------|
| **Change detection gate** | Step Functions Choice state (zero-cost skip) | Custom code check before tool calls |
| **Budget tracking** | DynamoDB counter + Choice state | Custom code or AgentCore Memory counter |
| **Degradation enforcement** | Step Functions conditional paths | Custom code branching |
| **Hard ceiling** | Step Functions fail-fast with alert | Custom code with early exit |
| **Cost visibility** | Per-Lambda, per-execution granularity | AgentCore aggregate billing |

**Verdict:** Step Functions provides better cost control transparency. AgentCore cost metering is less granular and harder to audit.

---

## 4. Use Case Fit Analysis

### 4.1 AgentCore Sweet Spots

AgentCore is designed for:
1. **Interactive sessions** — chatbots, voice agents, customer support
2. **Multi-user concurrency** — session isolation for many simultaneous users
3. **Learning agents** — episodic memory that improves over time
4. **Long-running tasks** — up to 8-hour execution windows
5. **Complex tool orchestration** — MCP protocol, automatic discovery

### 4.2 Agentic PM Workbench Requirements

| Requirement | AgentCore Fit | Step Functions Fit |
|-------------|---------------|-------------------|
| **Single user** | Overkill (session isolation for one user) | Perfect fit |
| **$15/month budget** | Uncertain (unpublished pricing) | Proven ($11-13/month) |
| **15-minute polling** | Not a session pattern | Native EventBridge integration |
| **1-minute hold queue** | Requires custom solution | Native EventBridge integration |
| **Change detection gate** | Custom implementation | Native Step Functions Choice |
| **LLM cost control** | Custom implementation | Native Step Functions orchestration |
| **No interactive sessions** | Session features unused | Stateless Lambda perfect |
| **Deterministic orchestration** | Framework-dependent | Step Functions excels |

### 4.3 AgentCore Features We Would Not Use

| Feature | Why Not Needed |
|---------|----------------|
| Session isolation (microVM) | Single user, no concurrency concerns |
| Short-term memory | No conversation turns, batch processing |
| Episodic memory | Deterministic artefact updates, not learning |
| WebSocket streaming | Dashboard polling, not real-time chat |
| 8-hour execution | 15-minute cycles complete in <5 minutes |
| Multi-agent collaboration | Single agent architecture |
| Browser Tool | No web automation requirements |
| Code Interpreter | No dynamic code execution needs |

---

## 5. Migration Effort Assessment

### 5.1 If We Chose AgentCore

| Task | Effort | Risk |
|------|--------|------|
| Select agent framework (LangGraph, Strands) | 1-2 days | Medium (framework learning curve) |
| Rewrite orchestration as graph/agent | 2-3 weeks | High (business logic translation) |
| Implement change detection in agent | 3-5 days | Medium (custom metering) |
| Implement budget controls in agent | 3-5 days | Medium (no native support) |
| Configure AgentCore Gateway for tools | 1-2 weeks | Medium (MCP server setup) |
| Replace DynamoDB with AgentCore Memory | 1 week | High (data model translation) |
| Set up EventBridge to trigger agent | 2-3 days | Low (documented pattern) |
| Validate cost model | Unknown | High (no published pricing) |
| **Total** | **6-8 weeks** | **High** |

### 5.2 Staying with Step Functions + Lambda

Already designed and documented in SPEC.md. Implementation effort is Phase 1-3 as planned.

---

## 6. Scenarios Where AgentCore Would Win

AgentCore becomes the better choice if:

1. **Multi-user expansion** — If the tool becomes a team product with concurrent users, AgentCore's session isolation becomes valuable.

2. **Interactive interface added** — If we add a chat interface for real-time PM queries, AgentCore's WebSocket streaming and short-term memory become essential.

3. **Learning capabilities required** — If we want the agent to learn from corrections and improve over time, episodic memory is a significant benefit.

4. **Complex tool chains** — If we add many integrations (Asana, GitHub, Confluence, etc.), MCP-based tool discovery simplifies management.

5. **Cost model becomes favourable** — If AWS publishes pricing that shows AgentCore is cheaper for batch processing patterns, revisit this decision.

---

## 7. Recommendation

### Primary Recommendation: **Stay with Step Functions + Lambda**

**Rationale:**

1. **Use case mismatch.** AgentCore is optimised for interactive, session-based agents. The Agentic PM Workbench is a scheduled batch processor with no interactive sessions.

2. **Cost uncertainty.** AgentCore does not publish per-second pricing. With a $15/month ceiling and no room for surprises, the proven $11-13/month Step Functions architecture is lower risk.

3. **Cost control superiority.** Step Functions provides declarative, inspectable cost controls (Choice states for change detection gate, budget enforcement, degradation ladder). AgentCore requires embedding this logic in code.

4. **Local development.** Step Functions + DynamoDB Local + LocalStack provides full offline development. AgentCore requires cloud deployment for testing.

5. **Operational maturity.** Step Functions has 8+ years of production history. AgentCore launched in preview July 2025. Debugging patterns and failure modes are well-documented for Step Functions.

6. **No wasted features.** AgentCore's session isolation, memory services, and long-running execution are not needed for this use case. Paying for unused capabilities is inefficient.

### When to Revisit

Create a calendar reminder to revisit this decision in **Q4 2026** if:

- AWS publishes specific AgentCore pricing that shows cost parity or savings
- The product evolves to require interactive sessions or multi-user support
- AgentCore Memory provides capabilities that would simplify artefact versioning
- Step Functions costs exceed expectations (>$3/month)

### Deferred Investigation

Add to deferred backlog:
- Monitor AgentCore general availability (GA) announcements
- Watch for AgentCore pricing calculator release
- Track community experience reports (Medium, dev.to, AWS re:Post)

---

## 8. Sources

- [Amazon Bedrock AgentCore Overview](https://aws.amazon.com/bedrock/agentcore/)
- [Amazon Bedrock AgentCore Pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)
- [Amazon Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html)
- [AgentCore Runtime Documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html)
- [AgentCore Pricing Analysis (Scalevise)](https://scalevise.com/resources/agentcore-bedrock-pricing-self-hosting/)
- [Building AI Agents on AWS in 2025 (dev.to)](https://dev.to/aws-builders/building-ai-agents-on-aws-in-2025-a-practitioners-guide-to-bedrock-agentcore-and-beyond-4efn)
- Agentic PM Workbench SPEC.md (internal)

---

## Appendix: Decision Matrix

| Criterion | Weight | Step Functions + Lambda | AgentCore Runtime | Winner |
|-----------|--------|-------------------------|-------------------|--------|
| Cost certainty | 25% | 10 (proven $11-13/mo) | 4 (unpublished) | Step Functions |
| Cost control capability | 20% | 10 (native Choice states) | 5 (custom code) | Step Functions |
| Use case fit | 20% | 9 (batch processing) | 4 (session-optimised) | Step Functions |
| Local development | 10% | 9 (DynamoDB Local) | 3 (requires AWS) | Step Functions |
| Operational maturity | 10% | 10 (8+ years) | 4 (preview 2025) | Step Functions |
| Infrastructure simplicity | 10% | 6 (many resources) | 8 (fewer resources) | AgentCore |
| Future flexibility | 5% | 6 (rewrite for interactive) | 9 (ready for interactive) | AgentCore |
| **Weighted Score** | 100% | **8.6** | **4.8** | **Step Functions** |
