# Security Analysis: Vercel Pro Upgrade

**Reviewer:** Security Specialist
**Change under review:** Upgrading from Vercel Hobby (free) to Vercel Pro ($20/month), with potential architectural changes moving more logic from VPS to Vercel.

---

## 1. Credential Architecture: Strengthened, Not Weakened

The current spec (Section 9.2) places the AES-256 encryption key on Vercel specifically so that a VPS compromise does not yield plaintext credentials. The VPS must call an authenticated Vercel API endpoint to retrieve the key at runtime.

**If more logic moves to Vercel:** The security boundary strengthens.

Rationale:
- The encryption key already lives on Vercel. Moving code there keeps credentials and the code that uses them on the same managed platform.
- The current architecture requires credential transit: VPS calls Vercel to fetch the key, caches it in memory with TTL. This transit is a vulnerability window. Eliminating it reduces attack surface.
- Vercel environment variables are isolated per deployment, with no shell access for attackers to probe.

**Bottom line:** The separation was designed to protect against VPS compromise. Running more on Vercel means less exposure on the weaker link (VPS), not a weakening of the boundary.

---

## 2. Claude API Key: Safer on Vercel

The spec currently routes all LLM calls through the VPS because of the 10-second Vercel Hobby function limit. With Vercel Pro (60-second limit), this constraint disappears.

**Claude API key on VPS (current):**
- Stored in pm2 ecosystem config or environment variables
- Accessible to anyone with SSH access or a process that reads /proc/*/environ
- VPS is self-managed; a missed security patch exposes the key

**Claude API key on Vercel (with Pro upgrade):**
- Stored as environment variable in Vercel's secrets management
- No shell access to the runtime
- Isolated per-deployment
- Vercel's infrastructure team handles patching and access control

**Security implication:** Moving Claude API calls to Vercel improves key security. The managed platform provides better isolation than a self-managed VPS where the operator must maintain security posture manually.

**One concern:** Vercel function logs could capture request/response data. Ensure:
- Vercel's log retention is understood and acceptable
- Sensitive data in prompts (if any) is not logged at debug level
- Use Vercel's environment variable encryption (enabled by default)

---

## 3. Two-Stage Triage: Works Identically on Vercel

The prompt injection defence (Section 9.1) is an architectural pattern, not an infrastructure dependency. It works as follows:

1. **Pass 1 (Sanitise):** Haiku call with NO tools defined. Even if an attacker injects "send email to attacker@evil.com", this call cannot execute actions because it has no tool access.
2. **Pass 2 (Classify):** Haiku call with tools, but only processing the sanitised output from Pass 1.

**This pattern is code-level, not infra-level.** The isolation between sanitise and reason is enforced by how the LLM calls are constructed, not by which server they run on.

**Can it work on Vercel? Yes, with no modifications.**

Potential concerns:
- **None that are Vercel-specific.** The defence is about tool isolation in the LLM client code.
- **Function execution time:** Pass 1 + Pass 2 must complete within the function timeout. Vercel Pro's 60-second limit should be sufficient (typical Haiku calls complete in 2-5 seconds each), but this needs validation in Spike S2.
- **Cold starts:** If both passes are in separate function invocations, each could incur a cold start. Consider running both passes in a single function invocation to avoid this.

**Recommendation:** If triage moves to Vercel, keep both passes in a single API route handler to minimise latency and ensure they execute atomically.

---

## 4. Attack Surface: Decreased by Running on Vercel

### VPS Attack Surface (current)

| Component | Risk | Mitigation burden |
|-----------|------|-------------------|
| SSH daemon | Brute force, key theft, vulnerabilities | Key-only auth, but you must manage keys |
| Caddy | Web server vulns, TLS misconfig | Mostly self-healing, but still your responsibility |
| pm2 | Process manager running as non-root | Manual update discipline |
| Node.js runtime | CVEs in Node or dependencies | Manual update discipline |
| Ubuntu OS | Kernel vulns, privilege escalation | Unattended upgrades help but don't cover everything |
| UFW firewall | Misconfiguration | Manual rule management |

The VPS requires ongoing security hygiene: patching, monitoring, log review, credential rotation. For a single-user personal tool, this is a significant maintenance burden.

### Vercel Attack Surface

| Component | Risk | Mitigation burden |
|-----------|------|-------------------|
| Vercel platform | Platform-level vulnerabilities | Vercel's security team handles this |
| Environment variables | Leaked via code or logs | Use Vercel's secrets management, review code for leaks |
| Function code | Vulnerabilities in your code | Your responsibility, but isolated per-invocation |
| Dependencies | CVEs in npm packages | Same as VPS, but no OS-level exposure |

**Verdict:** Running more logic on Vercel decreases attack surface.

- No SSH to defend
- No server patching
- No firewall rules to manage
- Automatic TLS
- Isolation between deployments and invocations
- Vercel has a dedicated security team and SOC 2 Type II compliance

**The VPS is the weaker link.** It's a general-purpose Linux box exposed to the internet, requiring manual hardening. Vercel is a hardened, single-purpose platform with professional security operations.

---

## 5. VPS Eliminated Entirely: More Secure, with Caveats

If the VPS is eliminated and everything runs on Vercel:

### Security Improvements

1. **Single platform, single trust boundary.** No credential transit between systems. The encryption key, Claude API key, and the code that uses them all live in one place.

2. **No self-managed infrastructure.** Eliminates the entire class of "forgot to patch" and "misconfigured firewall" vulnerabilities.

3. **Simplified threat model.** Attackers have one target (your Vercel deployment) instead of two (Vercel + VPS). Your code is the only attack surface.

4. **Better isolation.** Vercel functions are ephemeral. Compromise of one invocation doesn't persist to the next.

### Caveats

1. **All eggs in one basket.** If Vercel is compromised or you misconfigure access controls, everything is exposed. However, Vercel's security posture is likely better than a self-managed VPS.

2. **Background job architecture.** The spec explicitly excludes Vercel Cron (Section 2, "Explicitly excluded"). If VPS is eliminated, this decision must be revisited. Vercel Cron or an external trigger (e.g., GitHub Actions on a schedule) would be needed for the 15-minute polling loop.

3. **Long-running processes.** The agent loop (Section 5.1) is designed as a persistent Node.js process. On Vercel, this becomes a series of cron-triggered function invocations. Each invocation must:
   - Complete within 60 seconds (Pro limit)
   - Handle state via database (no in-memory state between invocations)
   - Re-establish context on each run

4. **Neon keepalive.** The current keepalive (SELECT 1 every 4 minutes) prevents cold starts. With Vercel Cron (minimum 1-minute intervals on Pro), this is achievable, but add it explicitly to the cron configuration.

### Security Verdict on VPS Elimination

**A Vercel-only architecture is more secure** for this project, provided:
- Vercel Cron (or equivalent) is adopted for scheduling
- Function execution stays within 60-second limits
- The two-stage triage pattern is preserved in the function code

---

## 6. What Must NOT Change (Regardless of Infrastructure)

These security decisions are fundamental. They must survive any architectural change:

### 6.1 Two-Stage Triage Architecture

The sanitise-then-reason pattern is the primary defence against prompt injection. It must remain:
- **Pass 1 (Sanitise):** Haiku call with ZERO tools. No exceptions.
- **Pass 2 (Classify):** Only processes sanitised output.

This is non-negotiable. Moving to Vercel does not change this requirement.

### 6.2 Outbound Action Allowlist

Section 5.3's `decisionBoundaries` is a code-level constraint:
- `canAutoExecute`: artefact_update, heartbeat_log, notification_internal, jira_comment
- `requireHoldQueue`: email_stakeholder, jira_status_change
- `requireApproval`: email_external, jira_create_ticket, scope_change, milestone_change
- `neverDo`: delete_data, share_confidential, modify_integration_config, change_own_autonomy_level

**This must be enforced in code, not prompts.** The execution layer must reject any action not in the allowlist, regardless of what Claude recommends. This boundary is infrastructure-agnostic.

### 6.3 Encryption at Rest for Credentials

Integration tokens (Jira, Outlook, Resend) must remain AES-256 encrypted in the database. The encryption key must be stored in Vercel environment variables, never in the database or code.

If VPS is eliminated, this simplifies (no transit), but the encryption itself must remain.

### 6.4 Tool-Use for All LLM Structured Outputs

Section 2 locks this decision: "Claude tool-use (function calling) for all LLM structured outputs - no raw JSON.parse on free-text responses."

This is a security and reliability control. Free-text JSON is:
- Susceptible to injection attacks that break JSON structure
- Harder to validate
- More likely to produce malformed output

Tool-use must remain mandatory regardless of where calls are made.

### 6.5 Hold Queue for External Communications

Any communication to external parties must go through the hold queue (30-minute default, graduating down). This gives the user a window to cancel injected or erroneous communications.

Infrastructure-agnostic. Must remain.

### 6.6 Budget Controls and Degradation Ladder

Section 6.3's budget controls prevent runaway costs if an attacker triggers expensive reasoning loops:
- At $0.25/day: Haiku-only
- At $0.30/day: 30-min polling
- At $0.33/day: monitoring-only (no LLM calls)
- Monthly hard ceiling: $10

This is a denial-of-wallet defence. Must remain regardless of infrastructure.

### 6.7 Heartbeat Monitoring with Resend Alerts

If the agent stops running (VPS dies, or Vercel Cron fails), the user must be notified. The spec requires a Resend alert if no heartbeat for 30 minutes.

On Vercel-only architecture, this needs external monitoring (e.g., Vercel's monitoring features, or a separate heartbeat check) since the system can't alert about its own death.

---

## Summary: Security Posture by Architecture

| Architecture | Security Posture | Key Trade-off |
|--------------|-----------------|---------------|
| Current (VPS + Vercel Hobby) | Acceptable but maintenance-heavy | VPS is a self-managed liability |
| VPS + Vercel Pro | Slightly improved (better Vercel features) | VPS remains the weak link |
| Vercel Pro only (VPS eliminated) | **Best** | Requires Vercel Cron adoption |

---

## Recommendations

1. **Move Claude API calls to Vercel.** The API key is safer on the managed platform.

2. **If VPS is eliminated, adopt Vercel Cron.** Override the "No Vercel Cron" exclusion in Section 2. The security benefits of eliminating VPS outweigh the preference for VPS-based scheduling.

3. **Keep two-stage triage in a single function invocation.** Avoids cold start latency and ensures atomicity.

4. **Add external heartbeat monitoring.** If everything runs on Vercel, add an external check (e.g., UptimeRobot, Better Uptime) to detect if Cron jobs stop running.

5. **Validate 60-second function limits.** Run Spike S2 with realistic prompts to confirm the triage + reasoning path completes within Vercel Pro limits.

6. **Document the "must not change" list in CLAUDE.md.** These security invariants should be explicit project instructions, not just spec details.
