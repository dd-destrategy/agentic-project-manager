# Environment Variables

This document lists all environment variables required for the Agentic PM Workbench.

## Required Variables

### AWS Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AWS_REGION` | Yes | AWS region for all resources | `eu-west-2` |
| `CDK_DEFAULT_ACCOUNT` | Yes (CDK) | AWS account ID for CDK deployment | `123456789012` |
| `CDK_DEFAULT_REGION` | Yes (CDK) | AWS region for CDK deployment | `eu-west-2` |
| `TABLE_NAME` | Yes (Runtime) | DynamoDB table name | `agentic-pm-dev` |
| `TABLE_ARN` | Yes (Runtime) | DynamoDB table ARN | `arn:aws:dynamodb:eu-west-2:123456789012:table/agentic-pm-dev` |

### Authentication & Security

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXTAUTH_SECRET` | Yes | NextAuth.js secret for JWT signing (min 32 chars) | `generate-with-openssl-rand-base64-32` |
| `NEXTAUTH_PASSWORD` | Yes | Password hash for single-user authentication | `bcrypt-hashed-password` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for LLM operations | `sk-ant-api03-...` |

### Email & Notifications

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ALERT_EMAIL` | Yes | Email address for system alerts | `admin@example.com` |
| `SES_FROM_ADDRESS` | Yes | Verified sender email address | `pm-agent@example.com` |
| `SES_VERIFIED_DOMAIN` | Yes | Verified domain for SES | `example.com` |

### Application Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ENVIRONMENT` | Yes | Deployment environment | `dev`, `staging`, `production` |
| `NODE_ENV` | Yes | Node.js environment | `development`, `production` |
| `LOG_LEVEL` | No | Logging verbosity | `debug`, `info`, `warn`, `error` (default: `info`) |

### Development Only

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DYNAMODB_ENDPOINT` | No | Local DynamoDB endpoint (dev only) | `http://localhost:8000` |

## Setup Instructions

### 1. AWS Credentials

Ensure AWS credentials are configured via one of:
- AWS CLI (`~/.aws/credentials`)
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (when running on AWS)

### 2. Generate NextAuth Secret

```bash
openssl rand -base64 32
```

Set the output as `NEXTAUTH_SECRET`.

### 3. Hash Password

```bash
cd packages/web
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-password', 10))"
```

Set the output as `NEXTAUTH_PASSWORD`.

### 4. Obtain Claude API Key

1. Visit https://console.anthropic.com/
2. Create an API key
3. Set as `ANTHROPIC_API_KEY`

### 5. Configure SES

1. Verify email address in AWS SES console
2. Verify domain (optional but recommended)
3. Set `SES_FROM_ADDRESS` and `SES_VERIFIED_DOMAIN`

## Environment Files

### Development (.env.local)

```bash
# AWS
AWS_REGION=eu-west-2
TABLE_NAME=agentic-pm-dev
TABLE_ARN=arn:aws:dynamodb:eu-west-2:123456789012:table/agentic-pm-dev

# Auth
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_PASSWORD=$2a$10$hashed-password-here

# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-...

# Email
ALERT_EMAIL=admin@example.com
SES_FROM_ADDRESS=pm-agent@example.com
SES_VERIFIED_DOMAIN=example.com

# Config
ENVIRONMENT=dev
NODE_ENV=development
LOG_LEVEL=debug

# Local DynamoDB (optional)
# DYNAMODB_ENDPOINT=http://localhost:8000
```

### Production

**Never commit production credentials to git.**

Use AWS Systems Manager Parameter Store or AWS Secrets Manager for production secrets:

```bash
# Store in Parameter Store
aws ssm put-parameter --name /agentic-pm/prod/nextauth-secret --value "..." --type SecureString
aws ssm put-parameter --name /agentic-pm/prod/anthropic-api-key --value "..." --type SecureString
```

Then reference in CDK:
```typescript
const nextAuthSecret = cdk.aws_ssm.StringParameter.fromSecureStringParameterAttributes(
  this,
  'NextAuthSecret',
  { parameterName: '/agentic-pm/prod/nextauth-secret' }
);
```

## Validation

Run validation script to check all required variables are set:

```bash
pnpm run validate-env
```

## Security Notes

1. **Never commit `.env` files** - Added to `.gitignore` by default
2. **Rotate secrets regularly** - At least every 90 days
3. **Use least privilege** - IAM roles should have minimal permissions
4. **Audit access** - CloudTrail logs all AWS API calls
5. **Encrypt at rest** - Use encrypted Parameter Store or Secrets Manager
