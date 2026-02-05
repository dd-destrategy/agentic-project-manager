# Frontend Review Report

**Reviewer:** Frontend Expert **Date:** 2026-02-05 **Branch:**
claude/setup-monorepo-structure-V2G3w **Scope:** packages/web/src/app/,
packages/web/src/components/, packages/web/src/lib/hooks/

---

## Executive Summary

The Agentic PM Workbench frontend demonstrates a **well-architected
React/Next.js implementation** with strong patterns in state management and
component organisation. The codebase shows excellent use of TanStack Query for
server state, proper separation of concerns, and thoughtful accessibility
considerations.

**Key Strengths:**

- Excellent TanStack Query patterns with proper polling and cache invalidation
- Well-structured component hierarchy with clear separation of concerns
- Consistent loading/error state handling across all components
- Good use of TypeScript with comprehensive type definitions
- AA-compliant colour choices documented and implemented

**Areas for Improvement:**

- Some accessibility gaps (missing ARIA labels, keyboard navigation)
- Duplicated time formatting utilities across files
- Limited responsive testing indicators
- Some components could benefit from memoisation

**Frontend Score: 7.5/10**

---

## Component Quality Analysis

### Architecture Overview

The component structure follows a clean hierarchy:

```
packages/web/src/
  app/                    # Next.js App Router pages
    (dashboard)/          # Protected route group
      dashboard/          # Main dashboard page
      escalations/        # Escalation management
      projects/           # Project detail views
      pending/            # Hold queue management
      settings/           # Configuration page
    api/                  # API routes
    auth/                 # Authentication pages
  components/             # Reusable UI components
    ui/                   # Primitive UI components (shadcn/ui style)
  lib/
    hooks/                # TanStack Query hooks
  types/                  # TypeScript definitions
```

### Strengths

#### 1. Excellent Component Composition

Components are well-decomposed with single responsibilities:

```typescript
// Example: agent-status.tsx - Clean separation
export function AgentStatus() {
  /* Main component */
}
function AgentStatusTooltip() {
  /* Sub-component */
}
function AgentStatusLoading() {
  /* Loading skeleton */
}
export function AgentStatusCompact() {
  /* Variant */
}
```

Each major component provides:

- A main export for full functionality
- Internal sub-components for composition
- Loading skeleton components
- Compact/alternative variants where appropriate

#### 2. Consistent Pattern Implementation

Every data-fetching component follows the same pattern:

1. Loading state with skeleton UI
2. Error state with descriptive message
3. Empty state with helpful guidance
4. Success state with actual data

Example from `project-cards.tsx`:

```typescript
if (isLoading) return <ProjectCardsLoading />;
if (isError) return /* error card */;
if (projects.length === 0) return /* empty state */;
return /* actual content */;
```

#### 3. Strong Configuration Objects

Status and styling configurations are centralised and well-typed:

```typescript
const statusConfig: Record<
  AgentStatusType,
  {
    label: string;
    className: string;
    dotClassName: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  /* ... */
};
```

This pattern appears consistently across:

- `agent-status.tsx` (statusConfig)
- `project-cards.tsx` (healthStatusConfig, autonomyLevelConfig)
- `activity-feed.tsx` (eventTypeIcons, severityStyles)
- `autonomy-dial.tsx` (AUTONOMY_LEVELS)

### Concerns

#### 1. Limited Component Memoisation

Components do not use `React.memo()` or `useMemo()` for expensive computations.
This could cause unnecessary re-renders, particularly in:

- `ProjectCards` - maps over projects array
- `ActivityFeed` - renders event list
- `ArtefactViewer` - parses JSON and renders complex views

**Recommendation:** Add memoisation for list items and computed values.

#### 2. Missing Error Boundaries

No error boundaries are implemented. A runtime error in any component would
crash the entire application.

**Recommendation:** Implement error boundaries at the layout level:

- `app/(dashboard)/layout.tsx` - wrap children in error boundary
- Individual high-risk components (e.g., ArtefactViewer with JSON parsing)

#### 3. Duplicated Utility Functions

Time formatting logic is duplicated across multiple files:

- `use-agent-status.ts` - `formatLastHeartbeat()`
- `use-projects.ts` - `formatLastActivity()`
- `use-escalations.ts` - `formatEscalationTime()`
- `artefact-viewer.tsx` - `formatTimestamp()`
- `projects/[id]/page.tsx` - `formatDate()`

All perform similar relative time formatting but with slight variations.

**Recommendation:** Consolidate into a single `formatRelativeTime()` utility in
`lib/utils.ts`.

---

## State Management Analysis

### TanStack Query Implementation

The TanStack Query setup is **exemplary**:

#### Provider Configuration (providers.tsx)

```typescript
const [queryClient] = useState(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30 * 1000, // 30 seconds
          refetchInterval: 30 * 1000,
        },
      },
    })
);
```

Correct use of `useState` with initialiser function prevents creating new
`QueryClient` on every render.

#### Hook Patterns

All hooks follow consistent patterns:

1. **Query Keys:** Well-structured and parameterised

   ```typescript
   queryKey: ['escalations', { status, projectId, limit }];
   ```

2. **Polling Configuration:** Appropriate intervals
   - Agent status: 30s (standard)
   - Held actions: 10s (more urgent)
   - Projects/Escalations: 30s

3. **Background Refetch Disabled:** Saves resources when tab not focused

   ```typescript
   refetchIntervalInBackground: false;
   ```

4. **Retry Logic:** Configured with exponential backoff
   ```typescript
   retry: 3,
   retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
   ```

#### Mutations with Cache Invalidation

Mutations properly invalidate related queries:

```typescript
// use-escalations.ts
export function useRecordDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recordDecision,
    onSuccess: (updatedEscalation) => {
      queryClient.setQueryData(
        ['escalation', updatedEscalation.id],
        updatedEscalation
      );
      queryClient.invalidateQueries({ queryKey: ['escalations'] });
    },
  });
}
```

### Concerns

1. **No Optimistic Updates:** Mutations do not implement optimistic updates,
   which could improve perceived performance for actions like approving held
   actions.

2. **Cache Not Persisted:** No persistence layer (e.g., `persistQueryClient`)
   for offline support or faster initial loads.

---

## Accessibility Findings

### Positive Findings

#### 1. Semantic HTML Structure

Proper use of semantic elements:

- `<main>` for primary content
- `<nav>` for navigation
- `<aside>` for sidebar
- `<header>` for header content

#### 2. ARIA Live Regions

The escalation banner correctly uses ARIA for announcements:

```typescript
<div
  role="alert"
  aria-live="polite"
>
```

#### 3. AA-Compliant Colour Contrast

Explicit documentation and implementation of contrast-compliant colours:

```typescript
/**
 * RAG status configuration with AA-compliant colours
 * - Green: #22c55e (default success)
 * - Amber: #d97706 (NOT #f59e0b - fails AA contrast)
 * - Red: #dc2626 (default destructive)
 */
```

#### 4. Focus Visible Styles

Button component includes proper focus indicators:

```typescript
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
```

### Issues Requiring Attention

#### 1. Missing ARIA Labels (High Priority)

Several interactive elements lack proper labelling:

**Sidebar navigation:**

```typescript
// Current
<nav className="flex-1 space-y-1 p-2">

// Should be
<nav className="flex-1 space-y-1 p-2" aria-label="Main navigation">
```

**Sign-in form:**

```typescript
// Current
<form onSubmit={handleSubmit}>

// Should be
<form onSubmit={handleSubmit} aria-label="Sign in form">
```

**Autonomy dial buttons lack aria-pressed:**

```typescript
// Current
<button onClick={() => onChange(config.level)}>

// Should include
aria-pressed={isActive}
```

#### 2. Keyboard Navigation Gaps (Medium Priority)

**Escalation option cards are clickable divs:**

```typescript
<Card onClick={() => !disabled && onSelect()}>
```

These should be buttons or have proper keyboard handling (`onKeyDown` for
Enter/Space).

**Activity feed items have no keyboard interaction:** The hover state
(`hover:bg-muted/50`) suggests interactivity, but items are not focusable.

#### 3. Missing Skip Links (Medium Priority)

No skip-to-content link for keyboard users to bypass navigation.

**Recommendation:** Add to `(dashboard)/layout.tsx`:

```typescript
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

#### 4. Screen Reader Announcements (Low Priority)

Loading states should announce to screen readers:

```typescript
// Current
<Loader2 className="h-8 w-8 animate-spin" />

// Should include
<Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
<span className="sr-only">Loading content...</span>
```

---

## Performance Concerns

### Positive Patterns

1. **Code Splitting:** Next.js App Router automatically code-splits pages
2. **Font Optimisation:** Using `next/font/google` for Inter font
3. **Image Handling:** No image components identified (but lucide-react icons
   are tree-shaken)

### Areas for Optimisation

#### 1. Large Component Trees

The `ArtefactViewer` component renders substantial DOM trees for RAID logs and
backlog summaries. Consider:

- Virtual scrolling for long lists
- Lazy loading for collapsed sections

#### 2. Frequent Interval Updates

`CommunicationPreview` updates every second for countdown:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    setTimeRemaining(formatTimeRemaining(action.heldUntil));
  }, 1000);
  return () => clearInterval(interval);
}, [action.heldUntil]);
```

With multiple pending actions, this creates many intervals. Consider:

- Single shared interval at the page level
- Only updating when visible (Intersection Observer)

#### 3. No Dynamic Imports

All components are statically imported. Consider lazy loading for:

- `ArtefactViewer` (heavy with JSON parsing)
- `ArtefactDiff` (likely includes diff library)
- `GraduationEvidence` (used only in specific contexts)

```typescript
const ArtefactViewer = dynamic(
  () => import('@/components/artefact-viewer').then(mod => ({ default: mod.ArtefactViewer })),
  { loading: () => <ArtefactViewerSkeleton /> }
);
```

---

## Responsive Design Analysis

### Grid System

The dashboard uses a 12-column grid with responsive breakpoints:

```typescript
<div className="grid grid-cols-12 gap-6">
  <div className="col-span-12 lg:col-span-8">
  <div className="col-span-12 lg:col-span-4">
```

### Mobile Considerations

#### Positive

1. **Sidebar:** Fixed width (w-64) - standard approach
2. **Cards:** Stack vertically on mobile (`md:grid-cols-2`)
3. **Text truncation:** Applied where appropriate

#### Concerns

1. **Sidebar Always Visible:** No mobile hamburger menu or collapsible sidebar
   - On mobile, the 64-unit sidebar takes significant space
   - **Recommendation:** Implement drawer pattern for mobile

2. **Autonomy Dial Labels Hidden on Mobile:**

   ```typescript
   <span className="hidden sm:inline">{config.label}</span>
   ```

   Only icons visible on mobile - may confuse users unfamiliar with the system

3. **Tables/Complex Views Not Tested:**
   - Backlog summary distribution bars may not scale well
   - RAID log grid layout needs mobile consideration

---

## Code Organisation Review

### File Structure

**Strengths:**

- Clear separation between pages (`app/`) and components (`components/`)
- UI primitives in dedicated `ui/` directory
- Hooks in logical `lib/hooks/` location

**Concerns:**

- No `lib/utils/` for shared utilities
- Types defined in single large file (could be split by domain)

### Import Patterns

Clean import structure using path aliases:

```typescript
import { useAgentStatus } from '@/lib/hooks/use-agent-status';
import { Card } from '@/components/ui/card';
```

### Barrel Exports

Good use of index.ts for hooks:

```typescript
// lib/hooks/index.ts
export { useAgentStatus, formatLastHeartbeat } from './use-agent-status';
export { useEvents, useInfiniteEvents, formatEventTime } from './use-events';
// ...
```

Allows clean imports:

```typescript
import {
  useAgentStatus,
  useEscalations,
  formatEscalationTime,
} from '@/lib/hooks';
```

---

## Recommendations

### High Priority

1. **Add Error Boundaries**
   - Wrap dashboard layout in error boundary
   - Add component-level boundaries for JSON parsing

2. **Improve Keyboard Navigation**
   - Make clickable cards accessible via keyboard
   - Add skip link for main content

3. **Implement Mobile Navigation**
   - Add collapsible sidebar/hamburger menu
   - Test all views on mobile viewport sizes

### Medium Priority

4. **Consolidate Time Formatting**
   - Create single `formatRelativeTime()` utility
   - Add options for different formats (short, medium, full)

5. **Add Component Memoisation**
   - Wrap list item components in `React.memo()`
   - Use `useMemo()` for expensive computations

6. **Implement Optimistic Updates**
   - Add optimistic updates to mutation hooks
   - Improves perceived responsiveness

### Low Priority

7. **Add Dynamic Imports**
   - Lazy load heavy components
   - Reduces initial bundle size

8. **Persist Query Cache**
   - Implement `persistQueryClient` for offline support
   - Faster initial loads

9. **Centralise Interval Management**
   - Single countdown manager for hold queue items
   - Reduces number of active intervals

---

## Component Inventory

| Component            | Purpose               | Loading | Error |  A11y   |
| -------------------- | --------------------- | :-----: | :---: | :-----: |
| AgentStatus          | Real-time agent state |   Yes   |  Yes  | Partial |
| ProjectCards         | Project grid          |   Yes   |  Yes  | Partial |
| EscalationBanner     | Alert banner          |    -    |   -   |   Yes   |
| EscalationSummary    | Count card            |   Yes   |  Yes  |   OK    |
| ActivityFeed         | Event list            |   Yes   |  Yes  | Partial |
| ActivityStats        | 24h statistics        |   Yes   |  Yes  |   OK    |
| AutonomyDial         | Level selector        |    -    |   -   | Partial |
| ArtefactViewer       | Content display       |   Yes   |  Yes  |   OK    |
| CommunicationPreview | Held action card      |   Yes   |   -   |   OK    |

---

## Summary

The Agentic PM Workbench frontend is **production-ready with caveats**. The core
architecture is sound, state management is well-implemented, and the codebase
demonstrates good engineering practices.

Priority actions before production deployment:

1. Add error boundaries to prevent full-app crashes
2. Complete keyboard accessibility for interactive elements
3. Implement mobile-responsive navigation
4. Test all views across device sizes

The overall code quality is high, TypeScript usage is consistent, and the
TanStack Query patterns could serve as a reference implementation for other
projects.

**Frontend Score: 7.5/10**

| Category               | Score | Weight | Weighted |
| ---------------------- | :---: | :----: | :------: |
| Component Architecture | 8/10  |  25%   |   2.0    |
| State Management       | 9/10  |  20%   |   1.8    |
| Performance            | 7/10  |  15%   |   1.05   |
| Accessibility          | 6/10  |  20%   |   1.2    |
| Responsive Design      | 6/10  |  10%   |   0.6    |
| Code Organisation      | 8/10  |  10%   |   0.8    |
| **Total**              |       |        | **7.45** |

---

_Review conducted on branch claude/setup-monorepo-structure-V2G3w at commit
4b0d9b6_
