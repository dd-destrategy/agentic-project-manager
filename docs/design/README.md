# Solution Design Package

> **Status:** Ready for development handoff **Date:** February 2026 **Total
> Documentation:** ~561KB across 9 documents

---

## Executive Summary

This package contains all solution design artefacts required to begin Phase 1
development of the Agentic PM Workbench.

### Key Findings

**Gap Analysis (00):** 47 gaps identified, 4 critical:

1. Azure AD admin consent must be obtained before S3 spike
2. Claude tool-use reliability needs validation (S1 spike)
3. Working hours timezone handling needs clarification
4. Jira auth method should be locked to API token

**Market Position (04):** **Market gap confirmed.** No competitor synthesises
data across PM + communication tools. The "autonomous PM assistant for
individuals" category is effectively empty.

**Scalability (05):** Current design handles 5-10 projects. SaaS viability
questionable due to narrow TAM and compliance overhead. **Recommendation: Stay
personal.**

---

## Document Index

| #   | Document                                               | Size  | Purpose                                          |
| --- | ------------------------------------------------------ | ----- | ------------------------------------------------ |
| 00  | [Gap Analysis](00-gap-analysis.md)                     | 27KB  | SPEC unknowns, risks, blocking items             |
| 01  | [Technical Architecture](01-technical-architecture.md) | 119KB | Diagrams, Lambda specs, Step Functions ASL       |
| 02  | [API & Schemas](02-api-schemas.md)                     | 67KB  | DynamoDB patterns, TypeScript types, Zod schemas |
| 03  | [Dev Backlog](03-dev-backlog.md)                       | 75KB  | Epics, user stories, sprint planning             |
| 04  | [Competitor Analysis](04-competitor-analysis.md)       | 31KB  | Market gap, competitive positioning              |
| 05  | [Scalability Analysis](05-scalability-analysis.md)     | 23KB  | Growth scenarios, SaaS viability                 |
| 06  | [Prompt Library](06-prompt-library.md)                 | 60KB  | System prompts, tool schemas, cache strategy     |
| 07  | [Testing Strategy](07-testing-strategy.md)             | 76KB  | Test pyramid, golden scenarios, CI pipeline      |
| 08  | [Infrastructure Code](08-infrastructure-code.md)       | 83KB  | CDK stacks, CI/CD, local dev setup               |

---

## Development Handoff Checklist

### Before Phase 1 Begins

- [ ] **User Action:** Attempt Azure AD admin consent (blocking for Outlook)
- [ ] **User Action:** Verify Jira Cloud API access with API token
- [ ] **User Action:** Set up AWS account with IAM user
- [ ] **User Action:** Baseline one week of PM time (passive tracking)
- [ ] **Spike S1:** Validate Claude tool-use generates valid artefact JSON
- [ ] **Spike S2:** Measure actual token usage with real prompts

### Phase 1 Sprint 0 (Setup)

- [ ] Create monorepo structure (`packages/core`, `packages/lambdas`,
      `packages/web`)
- [ ] Set up AWS CDK project (see `08-infrastructure-code.md`)
- [ ] Configure local development (DynamoDB Local, LocalStack)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Create DynamoDB table with GSI1 and TTL

### Phase 1 Development

See `03-dev-backlog.md` for:

- Epic breakdown with acceptance criteria
- User stories with Given/When/Then format
- Story point estimates
- Suggested 2-week sprint groupings

---

## Architecture Decision Record

| Decision      | Choice                  | Rationale                                    |
| ------------- | ----------------------- | -------------------------------------------- |
| Agent runtime | Step Functions + Lambda | Cheaper than AgentCore, better IAM isolation |
| Database      | DynamoDB single-table   | $0.25/month, no cold starts                  |
| LLM           | Direct Claude API       | Not Bedrock (avoids migration risk)          |
| Frontend      | AWS Amplify + Next.js   | $0.50/month, integrated with AWS             |
| Notifications | Amazon SES              | Free tier, breaks Outlook dependency         |

See `../archive/agentcore-analysis/` for detailed evaluation of AgentCore
Runtime alternative.

---

## Cost Model Summary

| Component       | Monthly Cost      |
| --------------- | ----------------- |
| Amplify Hosting | ~$0.50            |
| Lambda          | ~$0 (free tier)   |
| Step Functions  | ~$1.00            |
| DynamoDB        | ~$0.25            |
| Secrets Manager | ~$2.00            |
| CloudWatch      | ~$1-2             |
| SES             | ~$0 (free tier)   |
| Claude API      | ~$7.00            |
| **Total**       | **~$11-13/month** |

Budget ceiling: $15/month

---

## Risk Summary

| Risk                         | Severity    | Mitigation                           |
| ---------------------------- | ----------- | ------------------------------------ |
| Azure AD consent denied      | Critical    | Jira-only MVP fallback               |
| LLM budget exceeded          | Critical    | Degradation ladder                   |
| Claude tool-use invalid JSON | Critical    | Schema validation + retry + fallback |
| NAT Gateway provisioned      | Critical    | Lambda outside VPC (enforced in CDK) |
| Prompt injection             | Significant | Two-stage triage with IAM isolation  |

See `00-gap-analysis.md` for complete risk register.

---

## Next Steps

1. **Create development branch** (`feature/phase-1-foundation`)
2. **Run validation spikes** (S1, S2) before writing production code
3. **Begin Sprint 0** (infrastructure setup)
4. **Iterate through Phase 1 sprints** per backlog

**Estimated Phase 1 duration:** 4-6 sprints (8-12 weeks)
