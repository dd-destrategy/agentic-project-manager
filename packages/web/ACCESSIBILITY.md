# Web Accessibility Documentation

## Overview

This document tracks WCAG 2.1 AA compliance for the Agentic PM Workbench web
frontend.

**Compliance Target:** WCAG 2.1 Level AA **Last Updated:** 2026-02-05

---

## ARIA Attributes Implemented

### 1. Skeleton Loading States (WCAG 2.1.1 - Keyboard, 4.1.2 - Name, Role, Value)

**File:** `packages/web/src/components/ui/skeleton.tsx:15` **ARIA Attribute:**
`aria-hidden="true"`

**Purpose:** Skeleton loading placeholders are purely visual indicators and
should not be announced to screen readers. The `aria-hidden="true"` attribute
prevents assistive technologies from announcing animation states that would
confuse users.

**Implementation:**

```tsx
<div
  className={cn('animate-pulse rounded-md bg-muted', className)}
  aria-hidden="true"
  {...props}
/>
```

**WCAG Success Criteria:**

- ✅ 1.3.1 Info and Relationships (Level A) - Decorative elements excluded from
  accessibility tree
- ✅ 4.1.2 Name, Role, Value (Level A) - No confusing states announced

---

### 2. Escalation Decision Textarea (WCAG 1.3.1 - Info and Relationships, 2.4.6 - Headings and Labels)

**File:** `packages/web/src/app/(dashboard)/escalations/[id]/page.tsx:330-337`
**ARIA Attribute:** Label with `htmlFor` association

**Purpose:** Form inputs must have programmatically associated labels. This
allows screen readers to announce the label when the textarea receives focus,
and enables users to click the label to focus the input.

**Implementation:**

```tsx
<div className="space-y-2">
  <Label htmlFor="decision-notes">Decision Notes (Optional)</Label>
  <textarea
    id="decision-notes"
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
    placeholder="Add notes about your decision..."
    className="..."
  />
</div>
```

**WCAG Success Criteria:**

- ✅ 1.3.1 Info and Relationships (Level A) - Label programmatically associated
  with input
- ✅ 2.4.6 Headings and Labels (Level AA) - Descriptive label provided
- ✅ 3.3.2 Labels or Instructions (Level A) - Purpose of input clearly
  identified

---

### 3. Countdown Timer Live Regions (WCAG 4.1.3 - Status Messages)

**File:** `packages/web/src/components/communication-preview.tsx:208-217` **ARIA
Attributes:** `aria-live="polite"`, `aria-atomic="true"`, `aria-label`

**Purpose:** Dynamic countdown timers must announce updates to screen readers.
The `aria-live="polite"` region allows assistive technologies to announce time
remaining without interrupting the user's current task.

**Implementation:**

```tsx
<Badge
  variant={urgencyVariant}
  className="flex items-center gap-1 flex-shrink-0"
  aria-live="polite"
  aria-atomic="true"
  aria-label={`Email will send in ${timeRemaining}`}
>
  <Clock className="h-3 w-3" aria-hidden="true" />
  {timeRemaining}
</Badge>
```

**WCAG Success Criteria:**

- ✅ 4.1.3 Status Messages (Level AA) - Dynamic content changes announced
- ✅ 1.3.1 Info and Relationships (Level A) - Context provided via aria-label
- ✅ Decorative icon (Clock) hidden from screen readers with
  `aria-hidden="true"`

**Note:** The `aria-live="polite"` attribute announces updates when the user is
idle. Updates occur every second, which screen readers may batch to avoid
overwhelming users.

---

## WCAG 2.1 AA Compliance Checklist

### Level A Requirements

#### 1.3 Adaptable

- ✅ 1.3.1 Info and Relationships - Form labels, live regions, decorative
  elements
- ⏳ 1.3.2 Meaningful Sequence - To be verified with screen reader testing
- ⏳ 1.3.3 Sensory Characteristics - To be audited

#### 2.1 Keyboard Accessible

- ⏳ 2.1.1 Keyboard - All functionality available via keyboard (needs testing)
- ⏳ 2.1.2 No Keyboard Trap - To be verified

#### 2.4 Navigable

- ❌ 2.4.1 Bypass Blocks - Skip to main content link needed
- ⏳ 2.4.2 Page Titled - To be verified
- ❌ 2.4.3 Focus Order - Focus management needs audit
- ⏳ 2.4.4 Link Purpose - To be audited

#### 3.3 Input Assistance

- ✅ 3.3.1 Error Identification - Error states present (needs validation
  testing)
- ✅ 3.3.2 Labels or Instructions - Form labels implemented

#### 4.1 Compatible

- ✅ 4.1.2 Name, Role, Value - ARIA attributes correctly used
- ⏳ 4.1.3 Status Messages - Live regions implemented (needs screen reader
  testing)

### Level AA Requirements

#### 1.4 Distinguishable

- ⏳ 1.4.3 Contrast (Minimum) - To be verified with contrast checker
- ⏳ 1.4.5 Images of Text - To be audited

#### 2.4 Navigable

- ❌ 2.4.5 Multiple Ways - Need breadcrumbs or sitemap
- ✅ 2.4.6 Headings and Labels - Descriptive labels implemented
- ❌ 2.4.7 Focus Visible - Focus indicators need enhancement

#### 3.2 Predictable

- ⏳ 3.2.3 Consistent Navigation - To be verified
- ⏳ 3.2.4 Consistent Identification - To be verified

#### 3.3 Input Assistance

- ⏳ 3.3.3 Error Suggestion - Error recovery to be implemented
- ⏳ 3.3.4 Error Prevention - Confirmation patterns to be verified

---

## Known Gaps and Future Work

### High Priority (Next Sprint)

1. **Skip to Main Content Link**
   - **WCAG:** 2.4.1 Bypass Blocks (Level A)
   - **Impact:** Critical for keyboard users
   - **Implementation:** Add skip link in main layout

2. **Focus Indicators**
   - **WCAG:** 2.4.7 Focus Visible (Level AA)
   - **Impact:** High for keyboard navigation
   - **Implementation:** Enhance focus styles in Tailwind config

3. **Keyboard Navigation Audit**
   - **WCAG:** 2.1.1 Keyboard (Level A)
   - **Impact:** Critical
   - **Action:** Test all interactive elements with keyboard only

4. **Focus Management**
   - **WCAG:** 2.4.3 Focus Order (Level A)
   - **Impact:** High for complex forms
   - **Action:** Add focus management to modals, escalation forms

### Medium Priority

5. **Colour Contrast Audit**
   - **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
   - **Tool:** Use axe DevTools or Lighthouse
   - **Action:** Verify all text meets 4.5:1 ratio

6. **Heading Hierarchy**
   - **WCAG:** 1.3.1 Info and Relationships (Level A)
   - **Action:** Audit all pages for proper h1-h6 structure

7. **ARIA Landmark Roles**
   - **WCAG:** 1.3.1 Info and Relationships (Level A)
   - **Implementation:** Add `<nav>`, `<main>`, `<aside>` landmarks

### Low Priority

8. **Screen Reader Testing**
   - **Tools:** NVDA (Windows), JAWS (Windows), VoiceOver (macOS)
   - **Action:** Full application walkthrough

9. **Automated Testing**
   - **Tools:** axe-core, pa11y, Playwright accessibility tests
   - **Action:** Integrate into CI/CD pipeline

---

## Testing Checklist

### Manual Testing

- [ ] Keyboard navigation through all interactive elements
- [ ] Tab order is logical and matches visual flow
- [ ] All form inputs can be filled with keyboard only
- [ ] Modal dialogs trap focus and return focus on close
- [ ] Screen reader announces all dynamic content updates
- [ ] Focus indicators visible on all interactive elements

### Automated Testing

- [ ] axe DevTools browser extension scan (0 violations)
- [ ] Lighthouse accessibility score ≥ 95
- [ ] TypeScript strict mode passes (✅ Verified 2026-02-05)
- [ ] ESLint accessibility rules passing

---

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)

---

## Changelog

### 2026-02-05 - Stream 3 Quick Wins

**Added ARIA attributes:**

- `aria-hidden="true"` on Skeleton component (C-10)
- `<Label htmlFor>` association on escalation textarea (C-11)
- `aria-live="polite"` on countdown timer (I-07)

**Build status:** ✅ TypeScript compilation passing **Impact:** 3 critical WCAG
violations resolved
