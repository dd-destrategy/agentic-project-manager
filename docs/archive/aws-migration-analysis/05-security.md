# AWS Migration Analysis: Security Architecture

> **Analyst:** Security Specialist
> **Date:** February 2026
> **Status:** Analysis complete

---

## Executive Summary

The current Vercel + VPS + Neon architecture has a thoughtfully designed security model with encryption-at-rest separation and two-stage prompt injection defence. An AWS migration offers enhanced secrets management, more granular IAM controls, and better audit capabilities, but introduces new complexity and potential cost. This analysis recommends a pragmatic approach that preserves the existing security strengths while leveraging AWS-native security services where they add clear value.

**Key recommendations:**
1. Use AWS Secrets Manager for integration credentials (not Parameter Store)
2. Maintain NextAuth.js for single-user authentication (Cognito is overkill)
3. Deploy Lambdas in private subnets with NAT Gateway for outbound access
4. Preserve two-stage triage architecture using separate Lambda functions with isolated IAM roles
5. Enable CloudTrail and structured CloudWatch Logs from day one

---

## 1. Secrets Management

### 1.1 Current State

The existing architecture stores secrets as follows:

| Secret | Storage Location | Access Pattern |
|--------|------------------|----------------|
| Integration API tokens (Jira, Graph, Resend) | Encrypted in `integration_configs` table (AES-256) | Agent decrypts at runtime |
| Encryption key | Vercel environment variable | Agent retrieves via authenticated API |
| NextAuth secret | Vercel environment variable | Frontend only |
| Database connection string | pm2 config (VPS) / Vercel env var | Each component |

**Security property:** VPS compromise does not yield credentials because the encryption key resides on Vercel.

### 1.2 AWS Options

#### Secrets Manager vs Parameter Store SecureString

| Criteria | Secrets Manager | Parameter Store (SecureString) |
|----------|-----------------|--------------------------------|
| **Cost** | $0.40/secret/month + $0.05/10K API calls | Free for standard tier; $0.05/10K API calls for advanced |
| **Automatic rotation** | Built-in Lambda rotation support | Manual rotation only |
| **Cross-region replication** | Yes | No (standard tier) |
| **Versioning** | Yes, with staging labels | Yes |
| **Resource policies** | Yes | No |
| **Max size** | 64 KB | 8 KB (standard), 8 KB (advanced) |
| **Audit** | Full CloudTrail integration | Full CloudTrail integration |

**Recommendation: AWS Secrets Manager**

Justification:
1. **Automatic rotation** is valuable for Graph API tokens (which expire) and provides defence-in-depth
2. **Resource policies** allow fine-grained cross-account access if needed
3. **Cost is acceptable:** 5 secrets = $2/month + negligible API costs
4. **Credential separation is preserved:** Unlike the current model where the encryption key is on Vercel, Secrets Manager enforces IAM-based access — a Lambda without the correct role cannot retrieve secrets

### 1.3 Secrets Inventory for AWS

| Secret | Secrets Manager Path | Rotation Strategy | Consumers |
|--------|---------------------|-------------------|-----------|
| Jira API token | `/agentic-pm/jira/api-token` | Manual (no expiry by default) | Agent Lambda |
| Graph API credentials (client ID, client secret, tenant ID) | `/agentic-pm/graph/credentials` | 90-day rotation via Lambda | Agent Lambda |
| Claude/Bedrock API key | `/agentic-pm/llm/api-key` | Manual (Anthropic-managed) | Triage Lambda, Reasoning Lambda |
| Resend API key | `/agentic-pm/resend/api-key` | Manual | Notification Lambda |
| Database connection string | `/agentic-pm/database/connection` | N/A (Neon/Aurora Serverless manages) | All Lambdas, Frontend |
| NextAuth secret | `/agentic-pm/auth/nextauth-secret` | Manual | Frontend only |

### 1.4 Secrets Access Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Secrets Manager                          │
│  /agentic-pm/                                                   │
│    ├── jira/api-token                                           │
│    ├── graph/credentials                                        │
│    ├── llm/api-key                                              │
│    ├── resend/api-key                                           │
│    ├── database/connection                                      │
│    └── auth/nextauth-secret                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Triage Lambda   │  │ Agent Lambda    │  │ Frontend        │
│ (Haiku calls)   │  │ (orchestration) │  │ (App Runner)    │
│                 │  │                 │  │                 │
│ Can access:     │  │ Can access:     │  │ Can access:     │
│ - llm/api-key   │  │ - jira/*        │  │ - database/*    │
│ - database/*    │  │ - graph/*       │  │ - auth/*        │
│                 │  │ - resend/*      │  │                 │
│ Cannot access:  │  │ - database/*    │  │ Cannot access:  │
│ - jira/*        │  │ - llm/api-key   │  │ - jira/*        │
│ - graph/*       │  │                 │  │ - graph/*       │
│ - resend/*      │  │ Cannot access:  │  │ - llm/*         │
│ - auth/*        │  │ - auth/*        │  │ - resend/*      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 1.5 Secrets Caching Strategy

To minimise API calls and latency:

1. **Lambda layer with caching:** Use AWS Parameters and Secrets Lambda Extension
2. **TTL:** Cache secrets for 5 minutes (configurable)
3. **Refresh:** Automatic background refresh before TTL expiry
4. **Cost impact:** Reduces API calls from ~2,880/day (per 15-min cycle × 4 secrets × 4 Lambdas) to ~288/day (90% reduction)

---

## 2. IAM Design

### 2.1 Principle: Least Privilege Per Function

Each component gets its own IAM role with minimal permissions. No shared roles.

### 2.2 Role Inventory

#### 2.2.1 Triage Lambda Role (`agentic-pm-triage-role`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/llm/api-key-*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/database/connection-*"
      ]
    },
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*"
      ]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/agentic-pm-triage:*"
    },
    {
      "Sid": "VPCNetworkInterface",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ],
      "Resource": "*"
    }
  ]
}
```

**Key restrictions:**
- Can only invoke Haiku models (not Sonnet)
- No access to integration secrets (Jira, Graph, Resend)
- Cannot send emails or update external systems
- This is the **security boundary** for prompt injection defence

#### 2.2.2 Reasoning Lambda Role (`agentic-pm-reasoning-role`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/llm/api-key-*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/database/connection-*"
      ]
    },
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-*",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*"
      ]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/agentic-pm-reasoning:*"
    },
    {
      "Sid": "VPCNetworkInterface",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ],
      "Resource": "*"
    }
  ]
}
```

**Key restrictions:**
- Can invoke both Haiku and Sonnet
- Still no access to integration secrets
- Receives only sanitised input from Triage Lambda

#### 2.2.3 Agent Orchestration Lambda Role (`agentic-pm-agent-role`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/jira/*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/graph/*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/resend/*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/database/*"
      ]
    },
    {
      "Sid": "StepFunctionsInvoke",
      "Effect": "Allow",
      "Action": [
        "states:StartExecution"
      ],
      "Resource": "arn:aws:states:*:*:stateMachine:agentic-pm-*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/agentic-pm-agent:*"
    },
    {
      "Sid": "VPCNetworkInterface",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ],
      "Resource": "*"
    }
  ]
}
```

**Key point:** This role has access to integration secrets but cannot invoke LLMs directly. It calls other Lambdas (via Step Functions) for LLM operations.

#### 2.2.4 Step Functions Role (`agentic-pm-stepfunctions-role`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaInvoke",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:agentic-pm-*"
      ]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/vendedlogs/states/agentic-pm-*"
    },
    {
      "Sid": "XRayTracing",
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 2.2.5 Frontend Role (`agentic-pm-frontend-role`)

For App Runner or ECS Fargate:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/database/connection-*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/auth/nextauth-secret-*"
      ]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/apprunner/agentic-pm-*"
    }
  ]
}
```

**Key restriction:** Frontend cannot access any integration secrets. It can only read the database and manage user sessions.

### 2.3 IAM Permission Boundaries

Apply a permission boundary to all roles to prevent privilege escalation:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIAMModification",
      "Effect": "Deny",
      "Action": [
        "iam:*",
        "organizations:*",
        "account:*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenySecretsModification",
      "Effect": "Deny",
      "Action": [
        "secretsmanager:DeleteSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyDestructiveActions",
      "Effect": "Deny",
      "Action": [
        "rds:DeleteDB*",
        "dynamodb:DeleteTable",
        "lambda:DeleteFunction",
        "s3:DeleteBucket"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 3. Network Security

### 3.1 VPC Design

**Recommendation:** Deploy in a custom VPC with private subnets for Lambdas.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VPC: 10.0.0.0/16                            │
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐ │
│  │   Public Subnet A            │  │   Public Subnet B            │ │
│  │   10.0.1.0/24                │  │   10.0.2.0/24                │ │
│  │   AZ: us-east-1a             │  │   AZ: us-east-1b             │ │
│  │                              │  │                              │ │
│  │   ┌────────────────────┐     │  │   ┌────────────────────┐     │ │
│  │   │   NAT Gateway A    │     │  │   │   (NAT Gateway B)  │     │ │
│  │   │   (required)       │     │  │   │   (optional HA)    │     │ │
│  │   └────────────────────┘     │  │   └────────────────────┘     │ │
│  │                              │  │                              │ │
│  │   Internet Gateway           │  │                              │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐ │
│  │   Private Subnet A           │  │   Private Subnet B           │ │
│  │   10.0.10.0/24               │  │   10.0.20.0/24               │ │
│  │   AZ: us-east-1a             │  │   AZ: us-east-1b             │ │
│  │                              │  │                              │ │
│  │   Lambda Functions:          │  │   Lambda Functions:          │ │
│  │   - Triage                   │  │   - (redundant deployment)   │ │
│  │   - Reasoning                │  │                              │ │
│  │   - Agent                    │  │                              │ │
│  │   - Notification             │  │                              │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
│                                                                     │
│  VPC Endpoints (Interface):                                         │
│  - secretsmanager.us-east-1.amazonaws.com                          │
│  - bedrock-runtime.us-east-1.amazonaws.com                         │
│  - logs.us-east-1.amazonaws.com                                    │
│  - states.us-east-1.amazonaws.com                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 NAT Gateway: Cost vs Security Trade-off

| Option | Monthly Cost | Security | Recommendation |
|--------|--------------|----------|----------------|
| **Single NAT Gateway** | ~$32 + data | Outbound internet via single egress point | **Recommended** |
| **Dual NAT Gateway (HA)** | ~$64 + data | Redundancy, no single AZ failure | Overkill for personal tool |
| **No NAT, public Lambdas** | $0 | Lambdas have public IPs, broader attack surface | Not recommended |
| **NAT Instance (t3.nano)** | ~$3.50 | Manual management, single point of failure | Acceptable cost-optimised option |

**Recommendation:** Start with a single NAT Gateway. The ~$32/month cost is significant against the $35 budget, but network isolation is valuable. If budget is critical, a NAT Instance on t3.nano ($3.50/month) is acceptable for a personal tool with the understanding that it requires manual maintenance.

**Alternative:** For aggressive cost optimisation, deploy Lambdas publicly and rely on IAM + security groups. This is less ideal but acceptable given single-user context.

### 3.3 VPC Endpoints

VPC endpoints allow private connectivity to AWS services without traversing the internet.

| Service | Endpoint Type | Monthly Cost | Recommendation |
|---------|---------------|--------------|----------------|
| Secrets Manager | Interface | ~$7.20 | **Yes** - reduces NAT data costs |
| Bedrock Runtime | Interface | ~$7.20 | **Yes** - LLM traffic stays private |
| CloudWatch Logs | Interface | ~$7.20 | Optional - logs are not sensitive |
| Step Functions | Interface | ~$7.20 | Optional - low traffic volume |
| S3 | Gateway | Free | **Yes** - if using S3 |

**Cost consideration:** Each interface endpoint costs ~$7.20/month per AZ. For a personal tool, prioritise Secrets Manager and Bedrock endpoints only.

### 3.4 Security Groups

#### Lambda Security Group (`agentic-pm-lambda-sg`)

```
Inbound: None (Lambdas are invoked, not directly accessed)

Outbound:
- TCP 443 to 0.0.0.0/0 (HTTPS for Jira, Graph, Resend, Neon)
- TCP 443 to VPC Endpoint Security Group (AWS services)
- TCP 5432 to Neon IP range (if using Neon) OR to Aurora SG (if migrated)
```

#### VPC Endpoint Security Group (`agentic-pm-vpce-sg`)

```
Inbound:
- TCP 443 from agentic-pm-lambda-sg

Outbound: None
```

#### Frontend Security Group (`agentic-pm-frontend-sg`)

For App Runner or ALB:

```
Inbound:
- TCP 443 from 0.0.0.0/0 (HTTPS from internet)

Outbound:
- TCP 5432 to database (Neon or Aurora)
- TCP 443 to Secrets Manager VPC Endpoint
```

### 3.5 Network Security Assessment

| Threat | Mitigation |
|--------|-----------|
| Lambda compromise accessing internal services | Private subnets, security group egress rules |
| Data exfiltration via outbound | NAT Gateway provides single egress point for monitoring |
| Unauthorised API access | VPC endpoints keep AWS API traffic private |
| Database exposure | Security group restricts access to Lambda/Frontend SGs only |

---

## 4. Authentication

### 4.1 Cognito vs NextAuth.js

| Criteria | Amazon Cognito | NextAuth.js |
|----------|---------------|-------------|
| **Cost** | Free tier: 50K MAU | Free |
| **Setup complexity** | Medium (user pool, app client, hosted UI) | Low (already implemented) |
| **Single user fit** | Overkill — designed for multi-tenant | Perfect fit |
| **API Gateway integration** | Native Cognito authoriser | Custom Lambda authoriser needed |
| **Session management** | JWT tokens, refresh tokens | Server-side sessions, CSRF protection |
| **Migration effort** | 2-3 days | 0 days (keep existing) |

**Recommendation: Keep NextAuth.js**

Justification:
1. **Single user context:** Cognito's features (user pools, sign-up flows, MFA federation) are unnecessary
2. **Already implemented:** NextAuth.js with Credentials provider is specified and provides CSRF protection
3. **Cost:** Both are effectively free, but Cognito adds unnecessary complexity
4. **No benefit:** The spec explicitly states "Single user. NextAuth.js with Credentials provider."

### 4.2 API Gateway Authorisation

If using API Gateway for frontend-to-backend communication:

**Option A: Lambda Authoriser (Recommended)**

```typescript
// Lambda authoriser validates NextAuth session
export async function handler(event: APIGatewayTokenAuthorizerEvent) {
  const sessionToken = event.authorizationToken;

  // Validate session against NextAuth session store
  const session = await validateSession(sessionToken);

  if (!session) {
    return generatePolicy('user', 'Deny', event.methodArn);
  }

  return generatePolicy('user', 'Allow', event.methodArn);
}
```

**Option B: IAM Authorisation**

For internal Lambda-to-Lambda calls via Step Functions, use IAM roles — no additional authorisation layer needed.

### 4.3 Frontend Authentication Flow

```
User (Browser)
    │
    ▼
┌─────────────────────────────────────┐
│ App Runner / CloudFront + S3        │
│ Next.js Frontend                    │
│                                     │
│ NextAuth.js:                        │
│ - Credentials provider              │
│ - bcrypt password verification      │
│ - Server-side session cookie        │
│ - CSRF protection                   │
└─────────────────────────────────────┘
    │
    │ (authenticated requests)
    ▼
┌─────────────────────────────────────┐
│ API Gateway (HTTP API)              │
│ Lambda Authoriser                   │
│ - Validates session cookie          │
│ - Returns IAM policy                │
└─────────────────────────────────────┘
    │
    ▼
Backend Services
```

---

## 5. Two-Stage Triage Security Boundary

### 5.1 Current Architecture Security Property

The spec describes a critical security control:

> "A separate, tool-less Haiku call sanitises external content before it enters reasoning prompts. The sanitisation call has no access to tools — it cannot send emails or update tickets even if compromised."

This must be preserved in AWS.

### 5.2 AWS Implementation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SECURITY BOUNDARY                                 │
│                    (Prompt Injection Defence)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STAGE 1: SANITISATION                                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Triage Lambda                                                 │  │
│  │ Role: agentic-pm-triage-role                                  │  │
│  │                                                               │  │
│  │ CAN:                                                          │  │
│  │ - Call Bedrock (Haiku only)                                   │  │
│  │ - Read from database                                          │  │
│  │ - Write sanitised output to database/state                    │  │
│  │                                                               │  │
│  │ CANNOT:                                                       │  │
│  │ - Access Jira API credentials                                 │  │
│  │ - Access Graph API credentials                                │  │
│  │ - Access Resend API credentials                               │  │
│  │ - Call Sonnet models                                          │  │
│  │ - Invoke other Lambdas directly                               │  │
│  │ - Send any external communications                            │  │
│  │                                                               │  │
│  │ Input: Raw signals (untrusted content)                        │  │
│  │ Output: Sanitised signals (safe for reasoning)                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│                    Step Functions                                   │
│                    (orchestration only)                             │
│                              │                                      │
│                              ▼                                      │
│  STAGE 2: REASONING + ACTION                                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Reasoning Lambda                                              │  │
│  │ Role: agentic-pm-reasoning-role                               │  │
│  │                                                               │  │
│  │ CAN:                                                          │  │
│  │ - Call Bedrock (Haiku and Sonnet)                             │  │
│  │ - Read from database                                          │  │
│  │ - Return action recommendations                               │  │
│  │                                                               │  │
│  │ CANNOT:                                                       │  │
│  │ - Access integration credentials                              │  │
│  │ - Execute actions directly                                    │  │
│  │                                                               │  │
│  │ Input: Sanitised signals (from Stage 1)                       │  │
│  │ Output: Structured action recommendations                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  STAGE 3: EXECUTION (Separate Lambda)                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Action Executor Lambda                                        │  │
│  │ Role: agentic-pm-agent-role                                   │  │
│  │                                                               │  │
│  │ CAN:                                                          │  │
│  │ - Access Jira, Graph, Resend credentials                      │  │
│  │ - Execute approved actions                                    │  │
│  │                                                               │  │
│  │ CANNOT:                                                       │  │
│  │ - Call LLMs directly                                          │  │
│  │ - Receive raw untrusted content                               │  │
│  │                                                               │  │
│  │ Input: Structured action commands (deterministic)             │  │
│  │ Output: Execution results                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Security Properties Preserved

| Property | Current (VPS) | AWS Implementation |
|----------|---------------|-------------------|
| Sanitisation has no tool access | Tool-less Haiku call | Triage Lambda has no integration credentials in IAM |
| Untrusted content never reaches action layer | Code separation | Lambda separation + IAM boundary |
| Even compromised LLM cannot exfiltrate | No credentials in prompt | Secrets Manager access denied for Triage role |

### 5.4 Additional AWS Enhancements

1. **VPC isolation:** Triage Lambda could be in a separate VPC with no route to external APIs (only Bedrock endpoint)
2. **CloudWatch Alarms:** Alert on any Triage Lambda attempting to access denied resources
3. **Resource policies on Secrets Manager:** Explicit deny for Triage Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyTriageLambdaAccess",
      "Effect": "Deny",
      "Principal": {
        "AWS": "arn:aws:iam::*:role/agentic-pm-triage-role"
      },
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/jira/*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/graph/*",
        "arn:aws:secretsmanager:*:*:secret:/agentic-pm/resend/*"
      ]
    }
  ]
}
```

---

## 6. Audit and Compliance

### 6.1 CloudTrail Configuration

Enable CloudTrail for all API activity:

```yaml
CloudTrail:
  Name: agentic-pm-trail
  IsMultiRegionTrail: true
  EnableLogFileValidation: true
  IncludeGlobalServiceEvents: true

  EventSelectors:
    - ReadWriteType: All
      IncludeManagementEvents: true
      DataResources:
        - Type: AWS::Lambda::Function
          Values:
            - arn:aws:lambda:*:*:function:agentic-pm-*
        - Type: AWS::SecretsManager::Secret
          Values:
            - arn:aws:secretsmanager:*:*:secret:/agentic-pm/*
```

**Key events to monitor:**
- `secretsmanager:GetSecretValue` — track all credential access
- `bedrock:InvokeModel` — track all LLM calls
- `lambda:Invoke` — track function invocations
- IAM policy changes — alert immediately

### 6.2 CloudWatch Logs Structure

#### Application Log Format (JSON structured)

```json
{
  "timestamp": "2026-02-04T10:30:00.000Z",
  "level": "INFO",
  "service": "triage-lambda",
  "requestId": "abc123",
  "projectId": "proj-uuid",
  "action": "sanitise_signal",
  "signalSource": "jira",
  "signalType": "ticket_updated",
  "tokenCount": {
    "input": 1500,
    "output": 300
  },
  "durationMs": 2340,
  "costUsd": 0.0023
}
```

#### Log Groups

| Log Group | Retention | Purpose |
|-----------|-----------|---------|
| `/aws/lambda/agentic-pm-triage` | 30 days | Sanitisation pass logs |
| `/aws/lambda/agentic-pm-reasoning` | 30 days | Reasoning pass logs |
| `/aws/lambda/agentic-pm-agent` | 90 days | Action execution logs |
| `/aws/stepfunctions/agentic-pm-workflow` | 30 days | Orchestration logs |
| `/aws/apprunner/agentic-pm-frontend` | 14 days | Frontend access logs |
| `/agentic-pm/audit` | 365 days | Security-relevant events |

### 6.3 CloudWatch Alarms

| Alarm | Threshold | Action |
|-------|-----------|--------|
| Secrets access by unexpected role | Any | SNS → Email alert |
| Lambda error rate | > 5% over 5 minutes | SNS → Email alert |
| Budget exceeded (daily) | > $0.50 | SNS → Email + trigger degradation |
| Budget exceeded (monthly) | > $11 | SNS → Email + switch to monitoring-only |
| Triage Lambda timeout | > 3 per hour | Investigate prompt injection attempt |
| Unauthorised API call | Any AccessDenied | SNS → Email alert |

### 6.4 Encryption Requirements

| Data | At Rest | In Transit |
|------|---------|------------|
| Secrets Manager | AES-256 (AWS KMS) | TLS 1.2+ |
| CloudWatch Logs | Optional (SSE-KMS) | TLS 1.2+ |
| Database (Neon/Aurora) | AES-256 | TLS 1.2+ (enforced) |
| Lambda environment variables | AES-256 (AWS KMS) | N/A |
| S3 (if used) | SSE-S3 or SSE-KMS | TLS 1.2+ |

**Recommendation:** Use default AWS-managed keys (SSE-S3, Secrets Manager default encryption). Customer-managed KMS keys add cost and complexity without meaningful security benefit for a personal tool.

---

## 7. Security Posture Comparison

### 7.1 Current Architecture (Vercel + VPS + Neon)

| Aspect | Implementation | Risk Level |
|--------|----------------|------------|
| **Credential storage** | AES-256 encrypted in DB, key on Vercel | Medium — custom crypto, single encryption key |
| **Credential access** | Agent retrieves key via authenticated API call | Medium — network hop, caching in memory |
| **IAM/Permissions** | None (single VPS process has all access) | Higher — no least-privilege separation |
| **Network isolation** | VPS on public internet with UFW firewall | Medium — standard hardening |
| **Prompt injection defence** | Two-stage triage in same process | Medium — code boundary, not process boundary |
| **Audit logging** | pm2 logs, manual CloudWatch/Datadog setup | Lower maturity — requires setup |
| **Secrets rotation** | Manual | Higher risk — no automation |
| **Compliance** | Basic | No formal controls |

### 7.2 AWS Architecture

| Aspect | Implementation | Risk Level |
|--------|----------------|------------|
| **Credential storage** | AWS Secrets Manager (AWS-managed encryption) | Lower — industry-standard, audited |
| **Credential access** | IAM role-based, per-function isolation | Lower — least privilege enforced |
| **IAM/Permissions** | Fine-grained per Lambda | Lower — AWS IAM is mature |
| **Network isolation** | VPC with private subnets, VPC endpoints | Lower — no public exposure |
| **Prompt injection defence** | Lambda isolation, separate IAM roles | Lower — process + IAM boundary |
| **Audit logging** | CloudTrail + CloudWatch (native) | Higher maturity — automatic |
| **Secrets rotation** | Automated via Secrets Manager | Lower risk — automation built-in |
| **Compliance** | SOC 2, ISO 27001 inherited from AWS | Higher — inherited controls |

### 7.3 What Improves with AWS

1. **Stronger credential isolation:** IAM roles prevent lateral movement. A compromised Triage Lambda cannot access Jira credentials.

2. **Defense in depth:** Multiple layers (IAM, VPC, security groups, resource policies) vs single UFW firewall.

3. **Native audit trail:** CloudTrail provides immutable, tamper-evident logs without additional setup.

4. **Secrets rotation:** Built-in rotation for credentials that support it (Graph API client secrets).

5. **Process isolation:** Each Lambda is a separate execution context vs shared Node.js process.

6. **Compliance inheritance:** AWS's certifications (SOC 2, ISO 27001) provide assurance.

### 7.4 Risks Introduced by AWS

1. **Complexity:** More moving parts means more potential misconfiguration. IAM policy errors can create security gaps.

2. **Shared responsibility model:** Must correctly configure AWS services; AWS only secures the infrastructure.

3. **Cost-driven shortcuts:** Pressure to skip NAT Gateway or VPC endpoints may weaken network isolation.

4. **Cold start timing attacks:** Lambda cold starts have predictable patterns that could theoretically be exploited.

5. **Vendor lock-in:** AWS-specific IAM policies and service integrations increase switching cost.

6. **API Gateway exposure:** New attack surface if not properly configured (authorisers, rate limiting, WAF).

### 7.5 Security Recommendation

| Scenario | Recommendation |
|----------|----------------|
| **Budget allows $10-15/month for security services** | Full AWS security implementation with VPC, NAT Gateway, VPC endpoints, Secrets Manager |
| **Budget constrained to ~$5/month for security** | Secrets Manager + CloudTrail only; deploy Lambdas publicly with strict security groups |
| **Maximum security required** | Add WAF on API Gateway, enable GuardDuty, use customer-managed KMS keys |

---

## 8. Implementation Checklist

### 8.1 Pre-Migration

- [ ] Document all current credentials and their access patterns
- [ ] Create AWS account with MFA on root
- [ ] Set up AWS Organizations and SCPs (optional but recommended)
- [ ] Enable CloudTrail in all regions
- [ ] Create IAM admin user (not root) for deployment

### 8.2 Secrets Migration

- [ ] Create Secrets Manager secrets for all credentials
- [ ] Configure resource policies denying Triage Lambda access to integration secrets
- [ ] Test credential retrieval from Lambda
- [ ] Implement secrets caching layer
- [ ] Document rotation procedures

### 8.3 IAM Setup

- [ ] Create all IAM roles with least-privilege policies
- [ ] Apply permission boundaries
- [ ] Test each role's access (positive and negative tests)
- [ ] Document role-to-function mapping

### 8.4 Network Setup

- [ ] Create VPC with public and private subnets
- [ ] Deploy NAT Gateway (or NAT instance)
- [ ] Create VPC endpoints for Secrets Manager and Bedrock
- [ ] Configure security groups
- [ ] Test outbound connectivity from private subnets

### 8.5 Audit Setup

- [ ] Configure CloudTrail with data events
- [ ] Create CloudWatch log groups with retention policies
- [ ] Set up CloudWatch alarms
- [ ] Create SNS topic for alerts
- [ ] Test alerting pipeline

### 8.6 Validation

- [ ] Penetration test: attempt Triage Lambda to access Jira credentials
- [ ] Validate two-stage triage security boundary
- [ ] Review all IAM policies for overly permissive statements
- [ ] Conduct security review with fresh eyes

---

## 9. Cost Summary (Security-Related)

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Secrets Manager | ~$2.00 | 5 secrets |
| NAT Gateway | ~$32.00 | Or $3.50 for NAT instance |
| VPC Endpoints (2) | ~$14.40 | Secrets Manager + Bedrock |
| CloudTrail | Free | Management events; data events extra |
| CloudWatch Logs | ~$0.50 | Based on estimated volume |
| **Total (full security)** | **~$49** | Exceeds budget |
| **Total (minimum security)** | **~$6** | Secrets Manager + NAT instance + CloudTrail |

**Budget impact:** Full AWS security implementation is expensive ($49/month) relative to the $35 total budget. A pragmatic approach:

1. **Essential:** Secrets Manager ($2), CloudTrail (free), CloudWatch Logs ($0.50) = $2.50/month
2. **Recommended:** Add NAT instance ($3.50) = $6/month total
3. **Ideal:** Add one VPC endpoint for Secrets Manager ($7.20) = $13/month total

The security improvement from Secrets Manager + IAM isolation alone justifies the ~$6/month minimum investment.

---

## 10. Conclusion

AWS provides a more robust security posture than the current Vercel + VPS architecture, particularly for:

- **Credential isolation** (IAM role separation)
- **Audit logging** (CloudTrail)
- **Prompt injection defence** (Lambda isolation)

However, the cost of full AWS security services exceeds the project budget. The recommended approach is:

1. **Adopt:** AWS Secrets Manager, CloudTrail, IAM least-privilege roles
2. **Consider:** NAT instance for network isolation (cost-effective alternative)
3. **Defer:** VPC endpoints, WAF, GuardDuty until budget allows or security requirements increase
4. **Keep:** NextAuth.js for authentication (Cognito adds no value for single user)

This provides meaningful security improvements while respecting budget constraints.
