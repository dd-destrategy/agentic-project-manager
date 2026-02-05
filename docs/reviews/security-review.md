# Security Review: Agentic PM Workbench

**Review Date:** 2026-02-05 **Branch:** `claude/setup-monorepo-structure-V2G3w`
**Reviewer:** Security Engineer (AI-assisted) **Security Score:** 7.5/10

---

## Executive Summary

The Agentic PM Workbench demonstrates a well-considered security architecture
with strong defence-in-depth measures, particularly around prompt injection
protection and IAM isolation. The two-stage triage architecture with explicit
IAM deny policies represents industry best practice for LLM-based autonomous
systems.

However, several medium-priority vulnerabilities require attention before
production deployment, including authentication timing issues, dependency
vulnerabilities, and missing middleware protections. The project's single-user
constraint simplifies the threat model but does not eliminate the need for
robust input validation and authentication security.

**Key Finding:** The IAM isolation between triage and execution Lambdas is the
cornerstone security control. This design ensures that even successful prompt
injection attacks cannot escalate to external action execution.

---

## Strengths

### 1. Exemplary IAM Isolation Architecture

The `FoundationStack` implements a sophisticated security boundary between
triage and execution roles:

**File:** `/packages/cdk/lib/stacks/foundation-stack.ts`

```typescript
// Lines 142-160: Explicit DENY policies prevent triage Lambda from accessing integration credentials
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

This is **defence layer 1**: Even if prompt injection succeeds in the triage
stage, the Lambda cannot access Jira/Outlook/SES to take external actions.
Explicit DENY overrides any accidental permission grants.

### 2. Comprehensive Prompt Injection Sanitisation

**File:** `/packages/core/src/triage/sanitise.ts`

The sanitisation module implements detection for:

- Instruction override attempts (`ignore previous instructions`)
- System message spoofing (`SYSTEM:`, `[INST]`, chat template delimiters)
- Role manipulation (`you are now`, `pretend to be`, `enter admin mode`)
- Social engineering patterns (`this is a test from security`)
- Prompt extraction attempts (`output your system prompt`)
- Action injection (`send email to`, `create ticket`)
- Delimiter escape attacks
- Priority/importance spoofing
- Unicode obfuscation (zero-width characters, RTL override)

High-risk threats automatically flag signals for human review.

### 3. Deterministic Confidence Scoring

**File:** `/packages/core/src/execution/confidence.ts`

The system avoids the common pitfall of LLM self-reported confidence. Instead,
it uses four independently computed dimensions:

| Dimension           | Computation                                   |
| ------------------- | --------------------------------------------- |
| Source Agreement    | Count of corroborating signal sources         |
| Boundary Compliance | Lookup against `decisionBoundaries` allowlist |
| Schema Validity     | Zod schema validation result                  |
| Precedent Match     | Query historical successful actions           |

Auto-execution requires **all four dimensions to pass** - this is inspectable
and auditable.

### 4. Decision Boundaries as Code

**File:** `/packages/core/src/execution/boundaries.ts`

Hard-coded allowlist prevents arbitrary action execution:

```typescript
neverDo: [
  'delete_data',
  'share_confidential',
  'modify_integration_config',
  'change_own_autonomy_level',
];
```

The `isProhibitedAction()` function rejects these regardless of LLM output or
confidence scores.

### 5. Hold Queue for External Communications

The 30-minute hold queue for stakeholder emails and Jira status changes provides
a critical human-in-the-loop checkpoint before external actions are executed.

### 6. DynamoDB Security Configuration

- **Encryption:** AWS-managed encryption enabled
- **Point-in-time recovery:** Enabled for data recovery capability
- **TTL for data hygiene:** Automatic cleanup of events (30 days) and actions
  (90 days)

### 7. Secrets Management

All credentials stored in AWS Secrets Manager with:

- Auto-generated NextAuth secret (64 characters, secure randomness)
- Per-role access controls
- No credentials in environment variables or code

### 8. Rate Limiting on External APIs

Both `JiraClient` and `GraphClient` implement rate limiting to prevent abuse and
respect API quotas:

- Jira: 100 requests/minute
- Graph: 1000 requests/minute

---

## Vulnerabilities

### Critical (Immediate Action Required)

**None identified.** The architecture is fundamentally sound.

---

### Medium Priority

#### M1. Password Comparison Not Constant-Time

**File:** `/packages/web/src/app/api/auth/[...nextauth]/auth-options.ts:49-53`

```typescript
if (
  credentials?.password &&
  credentials.password.length === storedPassword.length &&
  credentials.password === storedPassword
) {
```

**Issue:** Despite the comment claiming "constant-time comparison", this
implementation:

1. Short-circuits on length mismatch (leaks password length)
2. Uses JavaScript string equality (`===`) which is not constant-time

**Risk:** Timing side-channel attack could reveal password length and
potentially characters through statistical analysis of response times.

**Recommendation:** Use `crypto.timingSafeEqual()`:

```typescript
import { timingSafeEqual } from 'crypto';

const storedBuffer = Buffer.from(storedPassword);
const providedBuffer = Buffer.from(credentials.password);
if (
  storedBuffer.length === providedBuffer.length &&
  timingSafeEqual(storedBuffer, providedBuffer)
) {
  // authenticated
}
```

---

#### M2. High-Severity Dependency Vulnerabilities

**Source:** `pnpm audit`

| Package          | Severity | Advisory            | Impact                                                       |
| ---------------- | -------- | ------------------- | ------------------------------------------------------------ |
| `next@14.2.35`   | HIGH     | GHSA-h25m-26qc-wcjf | HTTP request deserialization DoS via React Server Components |
| `glob@10.3.10`   | HIGH     | GHSA-5j98-mcp5-4vw2 | Command injection via CLI `-c` flag                          |
| `next@14.2.35`   | MODERATE | GHSA-9g9p-9gw9-jx7f | DoS via Image Optimizer remotePatterns                       |
| `esbuild@0.21.5` | MODERATE | GHSA-67mh-4wv8-2f99 | Dev server cross-origin access                               |

**Recommendation:**

1. Upgrade `next` to `>=15.5.10`
2. Upgrade `eslint-config-next` to pull in fixed `glob@>=10.5.0`
3. The esbuild issue only affects development servers - acceptable risk for dev
   dependency

---

#### M3. Missing Next.js Middleware for Route Protection

**Issue:** No `middleware.ts` file exists to protect routes globally. Each API
route manually checks session:

```typescript
const session = await getServerSession(authOptions);
if (!session) {
  return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
}
```

**Risk:**

- New routes may forget session checks
- No protection for static assets that should be authenticated
- Inconsistent error responses across routes

**Recommendation:** Create `/packages/web/src/middleware.ts`:

```typescript
export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/projects/:path*'],
};
```

---

#### M4. Session Duration Excessive

**File:** `/packages/web/src/app/api/auth/[...nextauth]/auth-options.ts:69`

```typescript
session: {
  strategy: 'jwt',
  maxAge: 7 * 24 * 60 * 60, // 7 days
},
```

**Issue:** 7-day sessions without re-authentication for a tool with access to
Jira and Outlook integrations increases exposure window if a session token is
compromised.

**Recommendation:** Reduce to 24 hours for active sessions, with optional
"remember me" for 7 days with additional verification.

---

#### M5. No API Rate Limiting

**Issue:** Authentication and API endpoints have no rate limiting, enabling:

- Brute force password attacks
- API abuse causing budget overrun (LLM costs)
- Denial of service

**Recommendation:** Implement rate limiting at the API route level or via
Next.js middleware. Consider using `@upstash/ratelimit` or similar.

---

### Low Priority

#### L1. Overly Broad Unicode Pattern for Cyrillic

**File:** `/packages/core/src/triage/sanitise.ts:97`

```typescript
{ pattern: /[\u0400-\u04FF]/g, threat: 'potential_homoglyph' }
```

**Issue:** Flags ALL Cyrillic characters, causing false positives for legitimate
content in Russian, Ukrainian, Bulgarian, etc.

**Recommendation:** Implement targeted homoglyph detection for confusable
characters only (e.g., Cyrillic `а` vs Latin `a`).

---

#### L2. Missing Environment Variable Warning in Logs

**File:** `/packages/web/src/app/api/auth/[...nextauth]/auth-options.ts:27`

```typescript
if (missing.length > 0 && process.env.NODE_ENV === 'production') {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}
```

**Issue:** Logs which secrets are missing, potentially revealing configuration
to log aggregators.

**Recommendation:** Log a generic error without enumerating specific variable
names.

---

#### L3. Missing Zod Validation on API Request Bodies

**Issue:** Some API routes accept request bodies without schema validation,
relying on TypeScript types which don't exist at runtime.

**Example:** The autonomy change endpoint should validate the incoming level is
a valid enum value.

**Recommendation:** Add Zod schemas for all API request bodies with
`.safeParse()` validation.

---

#### L4. No Content Security Policy Headers

**Issue:** Missing CSP configuration could allow XSS attacks if any
user-controlled content is rendered.

**Recommendation:** Configure CSP headers in `next.config.js`:

```javascript
headers: [
  {
    source: '/:path*',
    headers: [
      {
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self'",
      },
    ],
  },
];
```

---

#### L5. Caret Ranges in Dependencies

**Issue:** Package.json uses caret (`^`) ranges which could introduce vulnerable
patch versions.

**Recommendation:** Use exact versions or lock file for production dependencies.
Run `pnpm audit` in CI pipeline.

---

## OWASP Top 10 Assessment

| Category                             | Status  | Notes                                          |
| ------------------------------------ | ------- | ---------------------------------------------- |
| A01:2021 - Broken Access Control     | Pass    | Session-based auth on all routes               |
| A02:2021 - Cryptographic Failures    | Partial | JWT signing OK, password comparison needs work |
| A03:2021 - Injection                 | Pass    | Comprehensive prompt injection defence         |
| A04:2021 - Insecure Design           | Pass    | Defence-in-depth architecture                  |
| A05:2021 - Security Misconfiguration | Partial | Missing CSP headers, middleware                |
| A06:2021 - Vulnerable Components     | Fail    | High-severity dependency CVEs                  |
| A07:2021 - Auth Failures             | Partial | Timing attack, no rate limiting                |
| A08:2021 - Data Integrity Failures   | Pass    | No unsafe deserialisation identified           |
| A09:2021 - Logging Failures          | Pass    | CloudWatch logging configured                  |
| A10:2021 - SSRF                      | Pass    | External URLs are hardcoded/validated          |

---

## Prompt Injection Defence Assessment

### Effectiveness: Strong (8/10)

The two-stage triage architecture with IAM isolation is the gold standard for
LLM agent security:

1. **Layer 1 (IAM):** Triage Lambda cannot access integration credentials - even
   complete prompt injection cannot execute external actions
2. **Layer 2 (Sanitisation):** Comprehensive pattern matching neutralises known
   injection techniques
3. **Layer 3 (Boundaries):** Allowlist-only action execution prevents LLM from
   inventing new actions
4. **Layer 4 (Hold Queue):** Human review for external communications
5. **Layer 5 (Confidence):** Deterministic scoring prevents execution without
   corroborating signals

### Potential Gaps

- Novel prompt injection techniques not covered by patterns (continuous
  monitoring recommended)
- Indirect injection via Jira ticket descriptions that reference other tickets
  (chain attacks)
- The sanitisation logs might be useful to attackers if exposed

---

## Recommendations (Prioritised)

### Immediate (Before Production)

1. **Fix password timing attack** (M1) - Critical authentication flaw
2. **Update vulnerable dependencies** (M2) - High-severity CVEs in Next.js
3. **Add Next.js middleware** (M3) - Prevent authentication bypass on new routes

### Short-Term (Within 2 Weeks)

4. Implement API rate limiting (M5)
5. Reduce session duration or add re-verification (M4)
6. Add Zod validation for all API request bodies (L3)

### Medium-Term (Within 1 Month)

7. Add Content Security Policy headers (L4)
8. Refine Cyrillic homoglyph detection (L1)
9. Remove environment variable names from error logs (L2)
10. Pin dependency versions and add audit to CI (L5)

### Ongoing

- Monitor for new prompt injection techniques
- Quarterly dependency audit
- Review IAM policies after any Lambda changes
- Penetration testing before enabling Level 3 (Tactical) autonomy

---

## Security Score Breakdown

| Category                       | Weight | Score | Weighted |
| ------------------------------ | ------ | ----- | -------- |
| Authentication & Authorisation | 25%    | 6/10  | 1.5      |
| Data Protection                | 15%    | 9/10  | 1.35     |
| Input Validation               | 20%    | 8/10  | 1.6      |
| LLM/AI Security                | 20%    | 9/10  | 1.8      |
| Infrastructure Security        | 15%    | 8/10  | 1.2      |
| Dependency Management          | 5%     | 3/10  | 0.15     |

**Total: 7.5/10**

---

## Conclusion

The Agentic PM Workbench demonstrates mature security thinking, particularly in
its approach to LLM agent safety. The IAM isolation between triage and execution
roles, combined with comprehensive prompt injection defences and deterministic
confidence scoring, provides robust protection against the primary threat
vector.

The identified vulnerabilities are addressable with moderate effort and do not
represent architectural flaws. Addressing the authentication timing issue and
dependency updates should be prioritised before production deployment.

**Recommendation:** Proceed with development. Address M1-M3 before any
production deployment. The security architecture is sound and represents best
practices for autonomous LLM systems.

---

_Review generated: 2026-02-05_ _Files reviewed: 15_ _Lines analysed: ~4,500_
