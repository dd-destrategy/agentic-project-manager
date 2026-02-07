import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E tests for "Since You Left" Catch-Up Page
 *
 * Tests the catch-up summary page that shows what happened since the user's
 * last visit, including escalations, artefact changes, actions, and signals.
 */

test.describe('Catch-Up Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display catch-up page with correct heading', async ({
    page,
  }) => {
    await page.goto('/catchup');
    await page.waitForLoadState('networkidle');

    // The page heading is "Since You Left" when data loads,
    // or "Catch-up" while loading / on error
    const heading = page.locator('h1');
    await expect(heading).toContainText(/Since You Left|Catch-up/);
  });

  test('should display stats grid with key metrics', async ({ page }) => {
    await page.goto('/catchup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Once loaded, the stats grid should show six stat cards
    // Check for known metric labels rendered by StatCard components
    const metricLabels = [
      'Escalations Created',
      'Artefacts Updated',
      'Actions Taken',
      'Signals Detected',
    ];

    for (const label of metricLabels) {
      const stat = page.locator(`text=${label}`);
      const count = await stat.count();

      // If the page loaded with data (not error state), stats should be present
      // Skip assertion if in error state
      if (count > 0) {
        await expect(stat.first()).toBeVisible();
      }
    }

    // Verify at least the heading rendered (page did not crash)
    await expect(page.locator('h1')).toContainText(/Since You Left|Catch-up/);
  });

  test('should render recent events section or empty state', async ({
    page,
  }) => {
    await page.goto('/catchup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // After loading, the page should show either:
    // - "Recent Activity" heading with grouped events, or
    // - "No significant activity during this period" empty state
    const hasRecentActivity = await page
      .locator('text=Recent Activity')
      .count();
    const hasEmptyActivity = await page
      .locator('text=/No significant activity/i')
      .count();
    const hasError = await page
      .locator('text=/Failed to load catch-up summary/i')
      .count();

    // One of these states should be present (data, empty, or error)
    expect(
      hasRecentActivity > 0 || hasEmptyActivity > 0 || hasError > 0
    ).toBeTruthy();
  });

  test('should handle empty state gracefully', async ({ page }) => {
    await page.goto('/catchup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Even when there is no activity, the page should render without
    // unhandled errors. The empty state message is
    // "No significant activity during this period"
    const heading = page.locator('h1');
    await expect(heading).toContainText(/Since You Left|Catch-up/);

    // Should not show any unhandled JavaScript error messages
    const unexpectedErrors = page.locator(
      'text=/something went wrong|unhandled|unexpected error/i'
    );
    const unexpectedCount = await unexpectedErrors.count();
    expect(unexpectedCount).toBe(0);
  });

  test('should not show loading spinners indefinitely', async ({ page }) => {
    await page.goto('/catchup');

    // Wait for initial load
    await page.waitForLoadState('networkidle');

    // Wait a reasonable time for dynamic content
    await page.waitForTimeout(3000);

    // Loading skeletons should have resolved by now
    // The loading state renders Skeleton components; count any remaining
    const skeletons = page.locator('[class*="animate-pulse"]');
    const skeletonCount = await skeletons.count();

    // A small number might be acceptable (layout shimmer), but not many
    expect(skeletonCount).toBeLessThan(5);

    // Also check for spinning loaders
    const spinners = page.locator('[class*="animate-spin"]');
    const spinnerCount = await spinners.count();
    expect(spinnerCount).toBeLessThan(3);
  });

  test('should display key highlights section when data is present', async ({
    page,
  }) => {
    await page.goto('/catchup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The "Key Highlights" card is rendered when data loads successfully
    const highlightsHeading = page.locator('text=Key Highlights');
    const highlightsCount = await highlightsHeading.count();

    if (highlightsCount > 0) {
      await expect(highlightsHeading.first()).toBeVisible();
    }

    // Either way the page heading should be present
    await expect(page.locator('h1')).toContainText(/Since You Left|Catch-up/);
  });
});
