# Frontend Analysis: Vercel Pro Upgrade Impact

**Reviewer:** Frontend Specialist
**Change:** Vercel Hobby (free, 10s function limit) → Vercel Pro ($20/month, 300s function limit)
**Date:** February 2026

---

## Executive Summary

The 300-second function limit removes the primary constraint that drove the current "static shell + client-side fetching" architecture. However, **the static shell pattern should remain the default**, with selective SSR adoption for specific views where SEO is irrelevant but initial data load matters. The upgrade enables a hybrid approach: Server Components for initial page renders, TanStack Query for subsequent interactions.

---

## 1. SSR Viability Assessment

### Current Architecture (Spec Section 3, 8.2)

The spec mandates:
> "Static shell pattern for frontend: The dashboard serves a static shell from CDN with client-side data fetching. This gives sub-500ms first contentful paint regardless of Neon state."

And explicitly:
> "No SSR for dashboard data: Avoids Vercel function time limits and Neon cold start dependency on page load"

### With 300s Limit

The math changes dramatically:
- Neon cold start: 2-5 seconds (worst case)
- Typical query execution: <100ms
- Total headroom: 295+ seconds

**This is more than sufficient for SSR.**

### Recommendation: Selective SSR by View

| View | Current | Recommended | Rationale |
|------|---------|-------------|-----------|
| **Mission Control** | Client-fetch | **SSR + Streaming** | Dashboard is the primary landing page. SSR with Suspense boundaries gives meaningful first paint with real data. Subsequent updates via TanStack Query polling. |
| **Activity Feed** | Client-fetch | **SSR initial + polling** | Render first 20 events server-side, then hydrate with polling. Reduces time-to-meaningful-content from ~800ms to ~200ms. |
| **Decision Interface** | Client-fetch | **SSR** | Escalations are critical path. User should see context immediately. Single read, no polling needed. |
| **Project Detail** | Client-fetch | **SSR** | Artefacts are stable (change only on agent updates). SSR eliminates loading spinner on artefact views. |
| **Settings** | Client-fetch | **Keep client-fetch** | Settings require interactive forms. Little benefit from SSR. Data is minimal. |

### Views That Should NOT Use SSR

1. **Settings page** — Primarily interactive, minimal data
2. **Any filtered/search views** — Dynamic queries should remain client-side
3. **Modals/dialogs** — Overlays don't benefit from SSR

### Implementation Pattern

Use Next.js 14 streaming SSR with Suspense boundaries:

```tsx
// app/dashboard/page.tsx
export default async function DashboardPage() {
  return (
    <div className="dashboard">
      <AgentStatusHeader /> {/* Static, instant */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent /> {/* Streams when data ready */}
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const [projects, recentEvents, pendingEscalations] = await Promise.all([
    db.select().from(projects).where(eq(projects.status, 'active')),
    db.select().from(events).orderBy(desc(events.created_at)).limit(10),
    db.select().from(escalations).where(eq(escalations.status, 'pending')),
  ]);

  return <Dashboard projects={projects} events={recentEvents} escalations={pendingEscalations} />;
}
```

---

## 2. API Routes Analysis

### Current Architecture

The spec states:
> "Vercel reads from the database only. It never writes agent state, actions, or artefacts. The VPS owns all writes except user config changes."

With `@neondatabase/serverless` driver for Vercel (HTTP-based, serverless-compatible).

### Should Frontend Have Its Own API Layer?

**Recommendation: Yes, but minimal.**

Create thin API routes for:

| Endpoint | Purpose | Why API Route |
|----------|---------|---------------|
| `GET /api/dashboard/stats` | Aggregated dashboard metrics | Complex joins, reusable by multiple components |
| `GET /api/activity` | Paginated activity feed | Pagination, filtering params, cursor-based |
| `GET /api/artefacts/[id]` | Single artefact with previous_version | Diffing logic should be server-side |
| `POST /api/escalations/[id]/decide` | Record user decision | Write operation (allowed per spec for user actions) |
| `PATCH /api/settings/*` | Update agent config | Write operation (user config changes) |

**Do NOT create API routes for:**
- Simple reads that Server Components can handle directly
- Data that never needs client-side refetching
- Artefact listings (use RSC)

### Heavier Operations Now Viable

With 300s limit, API routes can safely handle:

```typescript
// Previously risky, now safe
export async function GET() {
  // Complex aggregation that might take 2-3 seconds
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'action_taken') as actions_24h,
      COUNT(*) FILTER (WHERE event_type = 'error') as errors_24h,
      COUNT(*) FILTER (WHERE event_type = 'escalation_created') as escalations_pending
    FROM events
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);

  return Response.json(stats);
}
```

### Database Driver Decision

**Keep `@neondatabase/serverless` for Vercel.** The spec's driver strategy remains correct:
- HTTP-based driver works in serverless/edge
- No connection pooling overhead
- Stateless requests are appropriate for Vercel's model

---

## 3. TanStack Query Polling Analysis

### Current Pattern (Spec Section 8.2)

> "TanStack Query for client-side data fetching with polling (30-second refresh)"

### Should Polling Change?

**Recommendation: Reduce polling scope, keep 30s interval where needed.**

| Data Type | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| **Agent status** | 30s polling | **Keep 30s polling** | Must be current. Agent heartbeat every 15 min means status can change. Critical for trust. |
| **Activity feed** | 30s polling | **Keep 30s polling** | New events arrive unpredictably. User expects near-real-time. |
| **Pending escalations count** | 30s polling | **Keep 30s polling** | Badge in nav needs to be current. |
| **Artefact content** | 30s polling | **SSR + manual refresh** | Artefacts change only when agent updates them. Polling wastes resources. Provide "Refresh" button. |
| **Project list** | 30s polling | **SSR + revalidation** | Projects change rarely. Use `revalidatePath` on mutations. |
| **Dashboard stats** | 30s polling | **SSR + 60s polling** | Stats are aggregates, 60s freshness is sufficient. |

### ISR Consideration

ISR (Incremental Static Regeneration) is **not appropriate** for this app because:

1. **Single user** — No benefit from caching shared pages
2. **Dynamic data** — Dashboard data changes per-request
3. **No SEO requirement** — Behind auth, not crawled

ISR is designed for public pages with many visitors. For a single-user authenticated dashboard, SSR + selective polling is the correct pattern.

### Revised TanStack Query Strategy

```typescript
// Keep polling for real-time needs
const { data: agentStatus } = useQuery({
  queryKey: ['agent-status'],
  queryFn: fetchAgentStatus,
  refetchInterval: 30_000, // 30 seconds
});

const { data: activityFeed } = useQuery({
  queryKey: ['activity-feed'],
  queryFn: fetchActivityFeed,
  refetchInterval: 30_000,
});

// Remove polling for stable data
const { data: artefact } = useQuery({
  queryKey: ['artefact', artefactId],
  queryFn: () => fetchArtefact(artefactId),
  staleTime: Infinity, // Never auto-refetch
  // Manual refetch via queryClient.invalidateQueries
});
```

---

## 4. React Server Components Impact

### Current Architecture

The spec mentions RSC:
> "Next.js App Router with React Server Components where possible"

But then constrains with:
> "No SSR for dashboard data"

This created a contradiction — App Router defaults to RSC, but spec required client-side fetching.

### With Pro Tier: RSC Fully Viable

**Components that benefit from RSC:**

| Component | Benefit |
|-----------|---------|
| **Artefact viewers** (DeliveryState, RAIDLog, BacklogSummary, DecisionLog) | Render complex JSON to HTML on server. Zero client-side JSON parsing. Reduces bundle size. |
| **Activity feed item list** | Render event items server-side. Only interaction handlers need client JS. |
| **Dashboard project cards** | Render cards with data. Status badges computed server-side. |
| **Escalation context display** | Render decision context, options table, agent rationale — all static display. |
| **Navigation with counts** | Pending escalations badge can render server-side. |

**Components that must remain Client Components:**

| Component | Why Client |
|-----------|------------|
| **Autonomy dial slider** | Interactive input, state management |
| **Decision buttons** | Form submission, optimistic updates |
| **Activity feed filters** | Interactive filtering |
| **Settings forms** | Form state, validation |
| **Toast notifications** | Client-side only |
| **Polling hooks** | TanStack Query requires client |

### Recommended Component Boundary

```
app/
├── layout.tsx                    # Server - shell, nav
├── dashboard/
│   ├── page.tsx                  # Server - data fetching
│   ├── DashboardContent.tsx      # Server - renders cards
│   ├── AgentStatusBadge.tsx      # Client - polling
│   └── QuickActions.tsx          # Client - buttons
├── activity/
│   ├── page.tsx                  # Server - initial data
│   ├── ActivityList.tsx          # Server - renders items
│   ├── ActivityItem.tsx          # Server - single item
│   └── ActivityFilters.tsx       # Client - interactive
├── projects/[id]/
│   ├── page.tsx                  # Server - data fetching
│   ├── ArtefactViewer.tsx        # Server - JSON rendering
│   └── RefreshButton.tsx         # Client - manual refresh
├── escalations/[id]/
│   ├── page.tsx                  # Server - data fetching
│   ├── EscalationContext.tsx     # Server - display
│   └── DecisionForm.tsx          # Client - form
└── settings/
    ├── page.tsx                  # Server - minimal
    └── SettingsForm.tsx          # Client - all interactive
```

### Bundle Size Reduction

Moving artefact rendering to RSC eliminates:
- Client-side JSON parsing for complex artefacts
- Date formatting libraries from client bundle
- Status calculation logic from client bundle

Estimated reduction: 15-25KB from main bundle.

---

## 5. What Should NOT Change

These decisions remain correct regardless of the Vercel Pro upgrade:

### Architecture Rules (Unchanged)

| Decision | Why It Remains Correct |
|----------|----------------------|
| **All LLM calls route through VPS** | This is about the agent architecture, not function limits. LLM calls can take 10-30 seconds. Even with 300s limit, putting them in Vercel functions is architecturally wrong — they belong in the persistent agent process. |
| **VPS owns all writes** (except user config) | Data integrity concern, not performance. Agent is the source of truth for artefacts, events, actions. Frontend is read-heavy by design. |
| **Events table as coordination backbone** | Good architecture regardless of hosting. Single source of truth for activity. |
| **Agent keepalive (SELECT 1 every 4 minutes)** | Still valuable. Prevents cold starts for the agent's `pg` connection AND warms Neon for Vercel's serverless driver. |
| **`@neondatabase/serverless` for Vercel** | Still the correct driver. HTTP-based, no connection management needed. |

### UI Patterns (Unchanged)

| Pattern | Why It Remains Correct |
|---------|----------------------|
| **Agent status derived from heartbeat event** | Architectural decision about source of truth, not performance. Don't fake status with frontend timers. |
| **Heartbeat distinction (grey/coloured)** | UX decision, unrelated to hosting tier. |
| **Autonomy dial (not dropdown)** | UX decision, unrelated to hosting tier. |
| **shadcn/ui components** | Still the right choice — unstyled, composable, no runtime cost. |
| **TanStack Query for mutations** | Still need optimistic updates, cache invalidation, error handling. |

### Security (Unchanged)

| Decision | Why |
|----------|-----|
| **No LLM calls from Vercel** | The 300s limit doesn't change the security model. Prompt injection defence happens on VPS. |
| **Credentials not in frontend** | Encryption key stays on Vercel env vars, but frontend doesn't decrypt. Agent decrypts at runtime on VPS. |

---

## 6. Recommended Spec Changes

If adopting these recommendations, update the following spec sections:

### Section 3 (Architecture)

Change:
> "Static shell pattern for frontend: The dashboard serves a static shell from CDN with client-side data fetching."

To:
> "Hybrid rendering pattern: Server Components render initial page data; TanStack Query handles subsequent polling for real-time data (agent status, activity feed). Static shell remains for app chrome."

### Section 8.2 (Frontend Architecture)

Remove:
> "No SSR for dashboard data: Avoids Vercel function time limits and Neon cold start dependency on page load"

Add:
> "SSR with streaming for data-heavy views (Mission Control, Activity, Project Detail). Client-side polling retained for real-time data (agent status, activity updates). Settings page remains fully client-rendered."

### Section 11 (Risk Register)

Update Risk 7:
> "Neon cold starts cause Vercel function timeouts"

To:
> "Neon cold starts cause slow initial page loads | Mitigation: Agent keepalive prevents cold starts. SSR with Suspense shows shell instantly while data streams."

### Section 2 (Locked Decisions)

Update:
> "Frontend hosting | Vercel (free hobby tier)"

To:
> "Frontend hosting | Vercel Pro tier (~$20/month)"

---

## 7. Migration Path

If approved, implement in this order:

1. **Upgrade Vercel plan** — No code changes required
2. **Add API routes** for dashboard stats, activity pagination — Behind feature flag
3. **Convert Project Detail to SSR** — Lowest risk, artefacts are stable
4. **Convert Decision Interface to SSR** — Single read, high value
5. **Convert Mission Control to SSR with streaming** — Highest complexity, do last
6. **Reduce polling scope** — Remove polling for artefacts, reduce dashboard stats to 60s
7. **Audit bundle size** — Measure RSC impact on client JS

---

## 8. Cost-Benefit Summary

| Benefit | Impact |
|---------|--------|
| Faster time-to-meaningful-content | ~600ms improvement on initial page loads |
| Reduced client bundle size | ~15-25KB reduction |
| Simpler mental model | Fewer loading states, data arrives with HTML |
| API routes for complex queries | Cleaner separation, reusable endpoints |

| Cost | Impact |
|------|--------|
| $20/month Vercel Pro | +$20 to monthly budget (spec says $10 ceiling — needs revisiting) |
| Migration effort | ~2-3 days of frontend work |
| Slightly more complex architecture | Hybrid SSR/CSR requires clear conventions |

---

## 9. Open Questions for Other Reviewers

1. **Budget impact:** The spec has a $10/month total ceiling. Vercel Pro at $20/month alone exceeds this. Does the cost analyst recommend revising the ceiling or finding savings elsewhere?

2. **Agent keepalive sufficient?** The agent runs keepalive every 4 minutes on its `pg` connection. Does this also warm Neon for Vercel's serverless driver, or are they independent? Infrastructure specialist should confirm.

3. **VPS API endpoint for encryption key:** The spec says "Agent retrieves via authenticated Vercel API endpoint, caches in memory with TTL." With SSR now reading from DB, does Vercel need the encryption key for any reads? Security specialist should confirm credential flow.
