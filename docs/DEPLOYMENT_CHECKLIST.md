# Deployment Checklist

Use this checklist for each deployment to ensure nothing is missed.

## Pre-Deployment

### Code Quality
- [ ] All tests passing (130/130)
- [ ] TypeScript compilation successful (0 errors)
- [ ] ESLint checks passing (0 errors)
- [ ] Code reviewed and approved
- [ ] CHANGELOG.md updated
- [ ] Version number bumped (if applicable)

### Environment Configuration
- [ ] Environment variables documented
- [ ] Secrets stored in AWS Secrets Manager
- [ ] IAM roles and policies reviewed
- [ ] Budget limits configured
- [ ] Alert email addresses verified

### AWS Prerequisites
- [ ] AWS account access confirmed
- [ ] AWS CLI configured and authenticated
- [ ] CDK bootstrapped in target region
- [ ] SES email/domain verified
- [ ] DynamoDB table name available
- [ ] Amplify app created (or planned)

### Integration Setup
- [ ] Jira API token generated
- [ ] Jira credentials stored in Secrets Manager
- [ ] Outlook app registered in Azure AD (if using)
- [ ] Outlook credentials stored in Secrets Manager (if using)
- [ ] Test Jira connection manually
- [ ] Test Outlook connection manually (if using)

## Deployment Steps

### 1. Build Phase
- [ ] Clean build artifacts: `pnpm clean`
- [ ] Install dependencies: `pnpm install --frozen-lockfile`
- [ ] Build core package: `pnpm --filter @agentic-pm/core build`
- [ ] Build Lambda package: `pnpm --filter @agentic-pm/lambdas build`
- [ ] Build web package: `pnpm --filter @agentic-pm/web build`
- [ ] Verify build outputs exist in dist/ folders

### 2. Infrastructure Deployment (CDK)
- [ ] Review CDK diff: `pnpm --filter @agentic-pm/cdk cdk diff`
- [ ] Check for breaking changes in diff output
- [ ] Deploy stack: `pnpm --filter @agentic-pm/cdk cdk deploy`
- [ ] Note stack outputs (table name, Lambda ARNs)
- [ ] Verify DynamoDB table created
- [ ] Verify Lambda functions deployed
- [ ] Verify EventBridge schedules created
- [ ] Verify IAM roles attached correctly

### 3. Frontend Deployment (Amplify)
- [ ] Connect Git repository to Amplify
- [ ] Configure build settings (see DEPLOYMENT.md)
- [ ] Add environment variables in Amplify Console
- [ ] Trigger initial build
- [ ] Monitor build logs for errors
- [ ] Verify frontend accessible at URL
- [ ] Test authentication flow
- [ ] Verify API routes responding

### 4. Secrets Configuration
- [ ] Store NextAuth secret in Parameter Store
- [ ] Store Anthropic API key in Secrets Manager
- [ ] Store Jira credentials in Secrets Manager
- [ ] Store Outlook credentials in Secrets Manager (if using)
- [ ] Verify Lambda has access to secrets (IAM policy)
- [ ] Test secret retrieval from Lambda

### 5. Database Initialization
- [ ] Verify DynamoDB table accessible
- [ ] Check GSI indexes created (ProjectIndex, DateIndex, TypeIndex)
- [ ] Verify TTL enabled on expiresAt field
- [ ] Test write operation to table
- [ ] Test read operation from table
- [ ] Verify on-demand billing mode

## Post-Deployment Verification

### Smoke Tests
- [ ] Frontend loads without errors
- [ ] Login works with credentials
- [ ] Dashboard displays (even if empty)
- [ ] Agent status API responds
- [ ] Settings page accessible
- [ ] Projects list accessible
- [ ] Escalations page accessible
- [ ] Pending actions page accessible

### Lambda Function Tests
- [ ] Triage Lambda invokable
- [ ] Execute Lambda invokable
- [ ] Change Detection Lambda invokable
- [ ] Artefact Update Lambda invokable
- [ ] Housekeeping Lambda invokable
- [ ] Check CloudWatch Logs for each function
- [ ] Verify no cold start errors
- [ ] Test function with sample event

### Integration Tests
- [ ] Test Jira connection from Lambda
- [ ] Fetch test issue from Jira
- [ ] Test Outlook connection (if using)
- [ ] Fetch test email (if using)
- [ ] Test Claude API connection
- [ ] Send test prompt to Claude
- [ ] Test SES email sending
- [ ] Receive test alert email

### Monitoring Setup
- [ ] CloudWatch Logs groups created for all Lambdas
- [ ] CloudWatch alarms configured:
  - [ ] Lambda errors > 5 in 5 minutes
  - [ ] DynamoDB throttling > 10 in 5 minutes
  - [ ] Budget exceeded 80%
  - [ ] Lambda duration > 25 seconds (timeout warning)
- [ ] CloudWatch dashboard created
- [ ] SNS topic for alerts configured
- [ ] Alert email subscribed to SNS topic
- [ ] Test alarm by triggering condition

### Security Verification
- [ ] IAM roles follow least privilege
- [ ] No hardcoded credentials in code
- [ ] All secrets in Secrets Manager
- [ ] Lambda execution role cannot access other accounts
- [ ] API Gateway has authentication (if public)
- [ ] CloudTrail logging enabled
- [ ] VPC endpoints used (if Lambda in VPC)
- [ ] S3 buckets not public
- [ ] DynamoDB encryption at rest enabled

### Cost Verification
- [ ] Check initial AWS bill estimate
- [ ] Verify DynamoDB on-demand mode
- [ ] Verify Lambda memory settings (256MB default)
- [ ] Check Amplify build minutes used
- [ ] Review Claude API usage
- [ ] Set AWS Budget alert at $10/month
- [ ] Document baseline cost

## Configuration

### First Project Setup
- [ ] Log in to Mission Control
- [ ] Navigate to Settings → Projects
- [ ] Click "Add Project"
- [ ] Enter project details:
  - [ ] Project name
  - [ ] Jira project key
  - [ ] Jira board ID
  - [ ] Monitored email addresses (if using Outlook)
- [ ] Set autonomy level to "Monitoring" (safe start)
- [ ] Save project
- [ ] Verify project appears in list

### First Agent Run
- [ ] Wait for scheduled run (or invoke manually)
- [ ] Check CloudWatch Logs for triage Lambda
- [ ] Verify agent detected Jira signals
- [ ] Check DynamoDB for event records
- [ ] Verify heartbeat event created
- [ ] Check agent status in UI shows "Active"
- [ ] Review any escalations created
- [ ] Verify artefacts initialized (if autonomy > monitoring)

## Rollback Plan

If deployment fails or issues found:

### Immediate Actions
- [ ] Note time and symptoms of failure
- [ ] Capture error logs from CloudWatch
- [ ] Notify team of rollback decision

### CDK Rollback
- [ ] Revert Git commit: `git revert HEAD`
- [ ] Redeploy previous version: `pnpm cdk deploy`
- [ ] Verify stack returns to previous state

### Amplify Rollback
- [ ] Go to Amplify Console
- [ ] Find previous successful build
- [ ] Click "Promote to production"
- [ ] Verify frontend restored

### Lambda Rollback
- [ ] Identify previous version number
- [ ] Update alias to previous version
- [ ] Verify Lambda responding correctly

### Post-Rollback
- [ ] Verify all services operational
- [ ] Document root cause
- [ ] Create fix in new branch
- [ ] Re-test before next deployment

## Sign-Off

Deployment completed by: _______________________

Date: _______________________

Environment: [ ] Development [ ] Staging [ ] Production

Issues encountered: _______________________

Resolution: _______________________

Approved by: _______________________

Notes:
_______________________________________________________
_______________________________________________________
_______________________________________________________
