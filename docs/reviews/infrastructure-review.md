# Infrastructure Review: Agentic PM Workbench

> **Review Date:** February 2026 **Reviewer:** Cloud Infrastructure Expert
> **Branch:** claude/setup-monorepo-structure-V2G3w **Scope:** AWS CDK stacks,
> environment configuration, local development

---

## Executive Summary

The Agentic PM Workbench infrastructure is well-architected for its purpose as a
personal, single-user project management assistant. The CDK implementation
demonstrates strong adherence to serverless best practices, with particular
excellence in the security isolation between triage and agent Lambda functions.

**Overall Assessment:** The infrastructure is production-ready with minor
improvements recommended. Cost projections fall well within the $15/month budget
ceiling.

### Key Strengths

- Excellent IAM role separation with explicit deny policies for security
  boundaries
- Cost-optimised architecture avoiding expensive components (NAT Gateway, VPC)
- Proper environment separation with sensible defaults
- Comprehensive CloudWatch observability (dashboards, alarms)
- ARM64 Lambda architecture for cost efficiency

### Areas for Improvement

- Alarm notifications not connected to SNS topics
- No AWS Budget alarms to enforce spending ceiling
- SES permissions overly permissive
- Missing dead letter queues for Lambda failures
- Docker socket mount in local development poses security risk

---

## Infrastructure Score: 7.5/10

| Category               | Score | Notes                                                     |
| ---------------------- | ----- | --------------------------------------------------------- |
| CDK Best Practices     | 8/10  | Well-structured stacks, good use of constructs            |
| Cost Optimisation      | 9/10  | Excellent - well under $15/month budget                   |
| Security               | 7/10  | Strong IAM isolation; some permissions too broad          |
| Observability          | 7/10  | Good dashboards; alarms need notification targets         |
| Disaster Recovery      | 6/10  | PITR enabled; no cross-region or explicit backup strategy |
| Environment Separation | 8/10  | Clear dev/prod isolation with appropriate defaults        |
| Lambda Configuration   | 8/10  | Sensible timeouts; ARM64; could tune memory               |

---

## Cost Analysis

### Estimated Monthly Costs

| Service                    | Configuration                     | Estimated Cost |
| -------------------------- | --------------------------------- | -------------- |
| DynamoDB                   | On-demand, single table + GSI     | ~$0.25         |
| Step Functions             | Standard, ~2,880 executions/month | ~$0.12         |
| Lambda                     | 10 functions, ARM64, 256MB        | ~$0.50         |
| Secrets Manager            | 4 secrets                         | ~$1.60         |
| CloudWatch                 | Logs, metrics, dashboards, alarms | ~$1.50         |
| EventBridge                | 2 schedules                       | ~$0.01         |
| SES                        | Free tier (up to 62,000 emails)   | $0.00          |
| **Total AWS**              |                                   | **~$4.00**     |
| **LLM Budget (remaining)** |                                   | **~$11.00**    |

### Cost Assessment

The infrastructure cost of ~$4/month leaves substantial headroom for LLM costs.
The architecture achieves this through:

1. **No VPC for Lambda** - Avoids ~$32/month NAT Gateway cost
2. **DynamoDB on-demand** - Scales to zero, no provisioned capacity waste
3. **ARM64 Lambda** - 20% cheaper than x86
4. **EventBridge over SQS** - Native integration, no additional service costs
5. **Step Functions Standard** - Appropriate for 15-minute cycles; Express not
   needed

**Recommendation:** Add AWS Budget alerts at $10, $12, and $15 thresholds to
enforce spending ceiling.

---

## Security Findings

### Strengths

#### 1. Two-Tier IAM Role Isolation (Excellent)

The triage/agent role separation in `foundation-stack.ts` is exemplary:

```typescript
// Triage Lambda Role - cannot access integration credentials
triageLambdaRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.DENY,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [
      this.secrets.jiraApiToken.secretArn,
      this.secrets.graphCredentials.secretArn,
    ],
  })
);
```

This explicit DENY ensures that even if prompt injection succeeds in triage
Lambdas, they cannot access Jira/Outlook credentials or send emails. This is a
defence-in-depth pattern that many implementations miss.

#### 2. DynamoDB Encryption

AWS-managed encryption is enabled by default:

```typescript
encryption: dynamodb.TableEncryption.AWS_MANAGED;
```

#### 3. Point-in-Time Recovery

PITR is enabled for data protection:

```typescript
pointInTimeRecovery: true;
```

#### 4. Production Data Retention

Production DynamoDB table uses RETAIN removal policy, preventing accidental
deletion:

```typescript
removalPolicy: config.envName === 'prod'
  ? cdk.RemovalPolicy.RETAIN
  : cdk.RemovalPolicy.DESTROY;
```

### Issues

#### HIGH: SES Permissions Too Broad

**Location:** `foundation-stack.ts` lines 175-180

```typescript
agentLambdaRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['ses:SendEmail', 'ses:SendRawEmail', 'ses:GetSendQuota'],
    resources: ['*'], // Too permissive
  })
);
```

**Risk:** Allows sending email from any verified identity in the account.

**Recommendation:** Restrict to specific verified identity ARN once SES is
configured:

```typescript
resources: [
  'arn:aws:ses:${region}:${account}:identity/notifications@yourdomain.com',
];
```

#### MEDIUM: No Secrets Rotation Configured

**Location:** `foundation-stack.ts` lines 79-104

Secrets are created without rotation schedules:

```typescript
const llmApiKey = new secretsmanager.Secret(this, 'LLMApiKey', {
  secretName: '/agentic-pm/llm/api-key',
  description: 'Claude API key for LLM operations',
  // No rotation configured
});
```

**Recommendation:** For personal tool, manual rotation is acceptable. Document
rotation procedure in runbook.

#### MEDIUM: Docker Socket Mount in Local Development

**Location:** `docker-compose.yml` line 42

```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

**Risk:** Container escape possible if LocalStack is compromised.

**Recommendation:** Remove socket mount unless specifically required for
LocalStack functionality. For this use case (SES, Secrets Manager), it is not
needed.

#### LOW: CloudWatch Log Groups Not Encrypted

Step Functions log group uses default encryption. For sensitive PM data,
consider KMS encryption.

---

## CDK Best Practices Analysis

### Strengths

1. **Stack Separation:** Three focused stacks (Foundation, Agent, Monitoring)
   with clear responsibilities
2. **Cross-Stack References:** Proper use of props to pass resources between
   stacks
3. **Type Safety:** TypeScript interfaces for stack props
   (`FoundationStackProps`, `AgentStackProps`)
4. **Environment Configuration:** Centralised config with type-safe environment
   lookup
5. **Naming Conventions:** Consistent resource naming (`agentic-pm-*`)
6. **Output Exports:** Key values exported for cross-stack/external reference

### Minor Issues

1. **Hardcoded Stack Prefixes:** Consider making `AgenticPM` a configurable app
   name
2. **Lambda Code Path:** Relative path `../lambdas/dist` assumes specific
   monorepo structure
3. **Missing Stack Tags:** No cost allocation or environment tags applied

### Recommended Pattern

Add stack tags for cost tracking:

```typescript
cdk.Tags.of(this).add('Project', 'agentic-pm');
cdk.Tags.of(this).add('Environment', config.envName);
```

---

## Observability Assessment

### CloudWatch Dashboards

The monitoring stack creates a comprehensive dashboard with:

- Step Functions execution success/failure metrics
- Step Functions duration tracking
- DynamoDB read/write capacity consumption
- DynamoDB throttling and system errors

**Assessment:** Good coverage for operational visibility.

### CloudWatch Alarms

Two alarms are configured for production:

1. **StateMachineFailureAlarm** - Triggers on any state machine failure
2. **DynamoDBThrottleAlarm** - Triggers on 5+ throttled requests in 5 minutes

### Critical Gap: No Alarm Actions

**Issue:** Alarms are created but have no notification targets:

```typescript
new cloudwatch.Alarm(this, 'StateMachineFailureAlarm', {
  // ... configuration
  // NO alarmActions, okActions, or insufficientDataActions
});
```

**Impact:** Failures will appear in CloudWatch console but no alerts will be
sent.

**Recommendation:** Add SNS topic for alarm notifications:

```typescript
const alertTopic = new sns.Topic(this, 'AlertTopic');
alertTopic.addSubscription(
  new subscriptions.EmailSubscription('you@example.com')
);

alarm.addAlarmAction(new cw_actions.SnsAction(alertTopic));
```

### Missing Observability

1. **No Lambda error rate alarms** - Should alert on elevated function errors
2. **No LLM cost tracking** - Custom metrics for Claude API usage recommended
3. **No latency percentile alarms** - P95/P99 latency monitoring for early
   warning
4. **No dead letter queue monitoring** - If DLQs are added, need alarm on
   message count

---

## Disaster Recovery Assessment

### Current State

| Capability               | Status         | Notes                            |
| ------------------------ | -------------- | -------------------------------- |
| DynamoDB PITR            | Enabled        | 35-day continuous backup window  |
| Cross-Region Replication | Not configured | Single region deployment         |
| Infrastructure as Code   | Yes            | Full CDK, reproducible           |
| Secrets Backup           | No             | Secrets Manager, no cross-region |
| Explicit Backup Schedule | No             | Relying solely on PITR           |

### Recovery Scenarios

| Scenario              | Recovery Method             | RTO      | RPO                   |
| --------------------- | --------------------------- | -------- | --------------------- |
| Item deletion         | PITR restore                | ~1 hour  | Seconds               |
| Table corruption      | PITR restore to new table   | ~2 hours | Seconds               |
| Stack deletion (dev)  | Redeploy CDK                | ~30 min  | Total loss            |
| Stack deletion (prod) | DynamoDB retained, redeploy | ~30 min  | None (table retained) |
| Region failure        | Not recoverable             | N/A      | Total loss            |

### Recommendations

For a personal tool, current DR posture is acceptable. Consider:

1. **Monthly DynamoDB export to S3** - Long-term archival beyond 35-day PITR
   window
2. **Document recovery procedures** - Create runbook for common scenarios
3. **Test PITR restore annually** - Verify recovery actually works

---

## Lambda Configuration Review

### Current Configuration

| Function         | Timeout | Memory | Assessment                   |
| ---------------- | ------- | ------ | ---------------------------- |
| heartbeat        | 30s     | 256MB  | Appropriate                  |
| change-detection | 60s     | 256MB  | Appropriate                  |
| normalise        | 30s     | 256MB  | Appropriate                  |
| triage-sanitise  | 120s    | 256MB  | May need more for LLM calls  |
| triage-classify  | 120s    | 256MB  | May need more for LLM calls  |
| reasoning        | 300s    | 256MB  | Good timeout; consider 512MB |
| execute          | 60s     | 256MB  | Appropriate                  |
| artefact-update  | 180s    | 256MB  | Appropriate                  |
| housekeeping     | 120s    | 256MB  | Appropriate                  |
| hold-queue       | 60s     | 256MB  | Appropriate                  |

### Positive Patterns

1. **ARM64 Architecture** - Cost-effective, good performance
2. **X-Ray Tracing Enabled** - Distributed tracing for debugging
3. **Source Maps Enabled** - Better error stack traces
4. **No VPC** - Avoids cold start penalty and NAT costs
5. **Appropriate Timeouts** - Matched to function purpose

### Recommendations

1. **Consider Memory Tuning:** LLM-calling functions (triage-\*, reasoning) may
   benefit from 512MB for faster response parsing

2. **Add Reserved Concurrency:** Protect against runaway execution costs:

   ```typescript
   reservedConcurrentExecutions: 5;
   ```

3. **Add Dead Letter Queue:** Capture failed invocations for debugging:

   ```typescript
   deadLetterQueue: new sqs.Queue(this, 'DLQ');
   ```

4. **Environment Variable Security:** Consider moving `LOG_LEVEL` to SSM
   Parameter Store for runtime tunability

---

## Environment Separation Assessment

### Configuration Comparison

| Setting            | Dev           | Prod      | Assessment            |
| ------------------ | ------------- | --------- | --------------------- |
| Table name         | AgenticPM-Dev | AgenticPM | Correct separation    |
| Log retention      | 7 days        | 30 days   | Appropriate           |
| Alarms enabled     | No            | Yes       | Correct               |
| Daily LLM budget   | $0.30         | $0.23     | Conservative, good    |
| Monthly LLM budget | $10.00        | $8.00     | Allows buffer for dev |
| DynamoDB removal   | DESTROY       | RETAIN    | Correct               |

### Strengths

1. **Separate Tables** - No risk of dev affecting prod data
2. **Budget Isolation** - Different limits per environment
3. **Alarm Suppression in Dev** - Avoids noise during development
4. **Shorter Dev Log Retention** - Cost savings

### Recommendations

1. **Add Stack Tags by Environment** - Enables cost filtering in billing
2. **Consider Staging Environment** - Pre-prod testing before production
   deployment
3. **Separate AWS Accounts** - Strongest isolation (optional for personal tool)

---

## Local Development (docker-compose.yml)

### Services Provided

| Service        | Purpose              | Port                   |
| -------------- | -------------------- | ---------------------- |
| DynamoDB Local | Database emulation   | 8000                   |
| DynamoDB Admin | Visual DB management | 8001                   |
| LocalStack     | SES, Secrets Manager | 4566                   |
| MailHog        | Email capture        | 1025 (SMTP), 8025 (UI) |

### Positive Aspects

1. **Complete Local Stack** - Full development without AWS costs
2. **Healthchecks** - Proper container readiness detection
3. **Persistent Volumes** - Data survives container restarts
4. **Email Testing** - MailHog captures SES emails locally

### Issues

1. **Docker Socket Mount** - Security risk (see Security Findings)
2. **No Network Isolation** - All services on default bridge network
3. **No Resource Limits** - Containers can consume unlimited resources
4. **Version 3.8 Deprecated** - Consider updating compose syntax

### Recommendation

Remove Docker socket mount from LocalStack:

```yaml
localstack:
  volumes:
    - localstack-data:/var/lib/localstack
    # Remove: /var/run/docker.sock:/var/run/docker.sock
```

---

## Summary of Recommendations

### Priority 1 (High Impact, Easy Fixes)

1. Add SNS topic and alarm actions for CloudWatch alarms
2. Remove Docker socket mount from LocalStack in docker-compose.yml
3. Restrict SES permissions to specific identity ARN

### Priority 2 (Medium Impact)

4. Add AWS Budget alarms at $10/$12/$15 thresholds
5. Add dead letter queues for Lambda failure capture
6. Add stack tags for cost allocation tracking
7. Set reserved concurrency on Lambdas (suggest: 5)

### Priority 3 (Nice to Have)

8. Consider 512MB memory for LLM-calling Lambdas
9. Add KMS encryption to CloudWatch log groups
10. Create disaster recovery runbook
11. Schedule monthly DynamoDB export to S3

---

## Appendix: Files Reviewed

| File                                          | Lines | Purpose                             |
| --------------------------------------------- | ----- | ----------------------------------- |
| `packages/cdk/bin/agentic-pm.ts`              | 36    | CDK app entry point                 |
| `packages/cdk/lib/stacks/foundation-stack.ts` | 199   | DynamoDB, Secrets, IAM roles        |
| `packages/cdk/lib/stacks/agent-stack.ts`      | 295   | Lambda, Step Functions, EventBridge |
| `packages/cdk/lib/stacks/monitoring-stack.ts` | 128   | CloudWatch dashboards, alarms       |
| `packages/cdk/lib/config/environments.ts`     | 56    | Environment configuration           |
| `docker-compose.yml`                          | 60    | Local development services          |
