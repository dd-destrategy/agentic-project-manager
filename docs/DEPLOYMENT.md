# Deployment Guide

This guide covers deploying the Agentic PM Workbench to AWS.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 20+ and pnpm installed
- Domain name (optional, for production)
- Verified SES email/domain

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ AWS Amplify (Frontend)                                          │
│ - Next.js 15 App Router                                         │
│ - SSR + Static Generation                                       │
│ - Cost: ~$0.50/month                                            │
└─────────────────────────────────────────────────────────────────┘
                           ↓ API calls
┌─────────────────────────────────────────────────────────────────┐
│ API Gateway (optional) or Direct Lambda Function URLs          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ AWS Lambda Functions                                            │
│ - Triage (15 min schedule)                                      │
│ - Execute (on-demand)                                           │
│ - Change Detection (15 min schedule)                           │
│ - Artefact Update (async)                                       │
│ - Housekeeping (daily)                                          │
│ Cost: ~$2-3/month                                               │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ DynamoDB (Single Table)                                         │
│ - On-demand billing                                             │
│ - GSI: ProjectIndex, DateIndex, TypeIndex                      │
│ - TTL enabled                                                   │
│ Cost: ~$0.25/month                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Steps

### 1. Clone and Install

```bash
git clone https://github.com/your-org/agentic-project-manager.git
cd agentic-project-manager
pnpm install
```

### 2. Configure Environment

Create environment files for each environment:

```bash
# Development
cp .env.example .env.local

# Edit with your values
nano .env.local
```

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for full list.

### 3. Build Packages

```bash
# Build shared core library
pnpm --filter @agentic-pm/core build

# Build Lambda functions
pnpm --filter @agentic-pm/lambdas build

# Build frontend (optional - Amplify does this)
pnpm --filter @agentic-pm/web build
```

### 4. Deploy Infrastructure with CDK

```bash
cd packages/cdk

# Bootstrap CDK (first time only)
pnpm cdk bootstrap

# Review changes
pnpm cdk diff

# Deploy to dev
pnpm cdk deploy AgenticPMStack-dev --require-approval never

# Deploy to production
pnpm cdk deploy AgenticPMStack-prod --require-approval never
```

### 5. Deploy Frontend to Amplify

#### Option A: Amplify Console (Recommended)

1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Connect your Git repository
4. Configure build settings:

```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - npm install -g pnpm
            - pnpm install
            - pnpm --filter @agentic-pm/core build
        build:
          commands:
            - cd packages/web
            - pnpm build
      artifacts:
        baseDirectory: packages/web/.next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - packages/*/node_modules/**/*
    appRoot: /
```

5. Add environment variables (Settings → Environment variables)
6. Deploy

#### Option B: Manual Deployment

```bash
cd packages/web

# Build
pnpm build

# Deploy to S3 + CloudFront (manual)
aws s3 sync .next s3://your-bucket/
aws cloudfront create-invalidation --distribution-id XXX --paths "/*"
```

### 6. Configure Integrations

#### Jira Integration

1. Create Jira API token: https://id.atlassian.com/manage-profile/security/api-tokens
2. Store in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name /agentic-pm/prod/jira-credentials \
  --secret-string '{"email":"user@example.com","apiToken":"your-token","domain":"yourcompany.atlassian.net"}'
```

#### Outlook Integration

1. Register app in Azure AD: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps
2. Grant permissions: `Mail.Read`, `Mail.Send`, `User.Read`
3. Store credentials in Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name /agentic-pm/prod/outlook-credentials \
  --secret-string '{"clientId":"xxx","clientSecret":"xxx","tenantId":"xxx"}'
```

### 7. Verify Deployment

```bash
# Check Lambda functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `agentic-pm`)].FunctionName'

# Check DynamoDB table
aws dynamodb describe-table --table-name agentic-pm-prod

# Check EventBridge schedule
aws scheduler list-schedules --name-prefix agentic-pm

# Test frontend
curl https://your-app.amplifyapp.com/api/agent/status
```

## Post-Deployment

### 1. Create Initial User

```bash
# Generate password hash
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"

# Update NEXTAUTH_PASSWORD environment variable
```

### 2. Configure First Project

1. Log in to Mission Control
2. Go to Settings → Projects
3. Add project with Jira/Outlook details
4. Set autonomy level to "Monitoring" (safe start)

### 3. Monitor First Run

```bash
# Watch Lambda logs
aws logs tail /aws/lambda/agentic-pm-prod-triage --follow

# Check DynamoDB for events
aws dynamodb scan --table-name agentic-pm-prod --limit 10
```

## Environments

### Development

- Table: `agentic-pm-dev`
- Frontend: `https://dev.d1234567890.amplifyapp.com`
- Budget: $5/day
- Log level: DEBUG

### Staging

- Table: `agentic-pm-staging`
- Frontend: `https://staging.d1234567890.amplifyapp.com`
- Budget: $5/day
- Log level: INFO

### Production

- Table: `agentic-pm-prod`
- Frontend: `https://pm.example.com` (custom domain)
- Budget: $15/day
- Log level: WARN

## Rollback

### Lambda Rollback

```bash
# List versions
aws lambda list-versions-by-function --function-name agentic-pm-prod-triage

# Rollback to previous version
aws lambda update-alias \
  --function-name agentic-pm-prod-triage \
  --name prod \
  --function-version 3
```

### CDK Stack Rollback

```bash
# Revert to previous commit
git revert HEAD

# Redeploy
pnpm cdk deploy AgenticPMStack-prod
```

### Frontend Rollback

In Amplify Console:
1. Go to App → Hosting
2. Find previous successful build
3. Click "Promote to production"

## Troubleshooting

### Lambda Cold Starts

If cold starts > 3s are problematic:

```typescript
// In CDK stack
triageLambda.currentVersion.addAlias('prod', {
  provisionedConcurrentExecutions: 1, // ~$10/month
});
```

### DynamoDB Throttling

If seeing throttling errors:

```bash
# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=agentic-pm-prod \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum

# Consider provisioned capacity if sustained load
```

### Budget Exceeded

If hitting budget limits:
1. Check CloudWatch Logs → Insights
2. Query high-cost operations:
```
fields @timestamp, @message
| filter @message like /llmCostUsd/
| stats sum(llmCostUsd) by bin(5m)
```

## Cost Optimization

### Current Baseline: ~$8/month

- DynamoDB: $0.25/month (on-demand)
- Lambda: $2-3/month (300k invocations)
- Amplify: $0.50/month (build + hosting)
- Claude API: $5-7/month (usage-based)
- SES: $0.10/month (email sending)

### Optimization Tips

1. **Reduce polling frequency**: 15min → 30min saves 50% Lambda invocations
2. **Use Haiku more**: Haiku (70%) + Sonnet (30%) for optimal cost
3. **Batch operations**: Process multiple signals per cycle
4. **Enable caching**: Cache Jira/Outlook responses for 5min

## Security Checklist

- [ ] Secrets stored in Secrets Manager (not environment variables)
- [ ] IAM roles use least privilege
- [ ] CloudTrail enabled for audit logs
- [ ] VPC endpoints for DynamoDB (if using VPC)
- [ ] WAF rules on API Gateway (if public)
- [ ] MFA enabled on AWS account
- [ ] Regular secret rotation (90 days)
- [ ] Budget alerts configured
- [ ] Backup policy for DynamoDB
- [ ] SSL/TLS certificates valid

## Support

For deployment issues:
1. Check CloudWatch Logs
2. Review CDK synthesis output
3. Verify IAM permissions
4. Test integrations separately
5. Contact support: support@example.com
