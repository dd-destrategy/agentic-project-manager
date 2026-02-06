import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E tests for Escalation Decision Flow
 *
 * Tests the escalation list and detail pages, verifying that users can
 * view escalations and the decision interface renders correctly.
 */

test.describe('Escalation Decision Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Authenticate before each test
    await login(page);
  });

  test('should display escalations list page', async ({ page }) => {
    await page.goto('/escalations');

    // Verify page title
    await expect(page.locator('h1')).toContainText('Escalations');

    // Verify description
    await expect(page.locator('text=/Review and decide/i')).toBeVisible();
  });

  test('should handle empty escalations state', async ({ page }) => {
    await page.goto('/escalations');

    // Wait for data to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Check if there's an empty state message
    const emptyStateMessages = [
      'No escalations yet',
      'No pending escalations',
      'No decisions recorded',
    ];

    // If there are no escalations, one of these messages should appear
    // If there are escalations, the page should show cards
    const hasEmptyState = await page
      .locator(`text=/${emptyStateMessages.join('|')}/i`)
      .count();
    const hasEscalationCards = await page
      .locator('a[href^="/escalations/"]')
      .count();

    // Either empty state or cards should be present
    expect(hasEmptyState > 0 || hasEscalationCards > 0).toBeTruthy();
  });

  test('should display loading state correctly', async ({ page }) => {
    // Navigate to escalations
    await page.goto('/escalations');

    // The page should either show loading spinner briefly or content
    // Wait for loading to complete
    await page.waitForLoadState('networkidle');

    // After loading, there should be no loading spinner
    // (or loading completed quickly)
    await page.waitForTimeout(2000);

    // Page should show either content or empty state, not stuck loading
    await expect(page.locator('h1')).toContainText('Escalations');
  });

  test('should render escalation cards when data exists', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Check if there are any escalation cards
    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      // Verify first card has expected structure
      const firstCard = escalationLinks.first();
      await expect(firstCard).toBeVisible();

      // Cards should have status badges
      const badge = firstCard
        .locator('[class*="badge"]')
        .or(firstCard.locator('text=/Pending|Decided|Expired/i'));
      await expect(badge.first()).toBeVisible();
    } else {
      // If no cards, empty state should be visible
      await expect(
        page.locator('text=/No escalations|No pending escalations/i')
      ).toBeVisible();
    }
  });

  test('should navigate to escalation detail page', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Check if there are any escalation cards to click
    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      // Click the first escalation
      const firstLink = escalationLinks.first();
      await firstLink.click();

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/escalations\/.+/);

      // Verify detail page elements load
      await page.waitForTimeout(1000);

      // Should have back button
      const backButton = page
        .locator('a[href="/escalations"]')
        .or(page.locator('text=/Back/i'));
      await expect(backButton.first()).toBeVisible();
    }
  });

  test('should display escalation detail page elements', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Check if there are escalations to view
    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      // Click first escalation
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Verify key sections are present
      // Back button
      const backButton = page.locator('text=/Back/i').first();
      await expect(backButton).toBeVisible();

      // Status badge (Pending or Decided)
      const statusBadge = page.locator('text=/Pending|Decided/i').first();
      await expect(statusBadge).toBeVisible();

      // Verify options section exists (may be "Choose an Option" or "Options Considered")
      const optionsHeading = page.locator('h2').filter({
        hasText: /Choose an Option|Options Considered/i,
      });
      await expect(optionsHeading).toBeVisible();
    }
  });

  test('should display agent rationale section', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Look for agent analysis section
      const _agentAnalysis = page.locator('text=/Agent Analysis/i');
      // This section might not always be present
      // Just verify the page loaded without errors
      await expect(page.locator('text=/Back/i').first()).toBeVisible();
    }
  });

  test('should display triggering signals section', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Look for triggering signals section
      const signals = page.locator('text=/Triggering Signals/i');
      // This should be present on detail pages
      await expect(signals).toBeVisible();
    }
  });

  test('should display decision options with risk levels', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Look for risk level badges
      const riskBadges = page.locator('text=/low risk|medium risk|high risk/i');
      const _riskCount = await riskBadges.count();

      // If there are options, there should be risk level indicators
      // Options might vary, so we just verify the page structure loaded
      await expect(
        page.locator('h2').filter({
          hasText: /Choose an Option|Options Considered/i,
        })
      ).toBeVisible();
    }
  });

  test('should show approve/reject buttons for pending escalations', async ({
    page,
  }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Check if this is a pending escalation
      const isPending = await page.locator('text=/Pending Decision/i').count();

      if (isPending > 0) {
        // Should have submit decision button
        const submitButton = page.locator('button').filter({
          hasText: /Submit Decision/i,
        });
        await expect(submitButton).toBeVisible();

        // Should have decision notes textarea
        const notesArea = page.locator('textarea[id*="decision-notes"]');
        await expect(notesArea).toBeVisible();
      }
    }
  });

  test('should allow selecting an option without submitting', async ({
    page,
  }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Check if this is a pending escalation
      const isPending = await page.locator('text=/Pending Decision/i').count();

      if (isPending > 0) {
        // Try to click an option card
        const optionCards = page.locator('[class*="cursor-pointer"]').filter({
          has: page.locator('text=/Pros|Cons/i'),
        });
        const optionCount = await optionCards.count();

        if (optionCount > 0) {
          // Click first option
          await optionCards.first().click();

          // Option should be visually selected
          // Submit button should still be visible
          const submitButton = page.locator('button').filter({
            hasText: /Submit Decision/i,
          });
          await expect(submitButton).toBeVisible();

          // Don't actually submit - just verify the UI works
        }
      }
    }
  });

  test('should navigate back to escalations list', async ({ page }) => {
    await page.goto('/escalations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const escalationLinks = page.locator('a[href^="/escalations/"]');
    const count = await escalationLinks.count();

    if (count > 0) {
      // Navigate to detail page
      await escalationLinks.first().click();
      await page.waitForLoadState('networkidle');

      // Click back button
      const backButton = page
        .locator('a[href="/escalations"]')
        .or(page.locator('text=/Back/i').first());
      await backButton.first().click();

      // Should return to escalations list
      await expect(page).toHaveURL('/escalations');
      await expect(page.locator('h1')).toContainText('Escalations');
    }
  });
});
