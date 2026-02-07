import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E tests for Status Reports Page
 *
 * Tests the reports page where users can generate and view status reports
 * from project artefacts using various templates.
 */

test.describe('Status Reports', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display reports page with correct heading', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Verify page heading
    await expect(page.locator('h1')).toContainText('Status Reports');

    // Verify subtitle
    await expect(
      page.locator('text=/Generate and manage status reports/i')
    ).toBeVisible();
  });

  test('should show generate report controls', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Verify the "Generate Report" button is present
    const generateButton = page.locator('button').filter({
      hasText: /Generate Report/i,
    });
    await expect(generateButton).toBeVisible();

    // Verify the template selector exists with options
    const templateSelect = page.locator('select');
    await expect(templateSelect.first()).toBeVisible();

    // Verify template options are available
    const executiveOption = page.locator('option', { hasText: 'Executive' });
    await expect(executiveOption).toBeAttached();

    const teamOption = page.locator('option', { hasText: 'Team' });
    await expect(teamOption).toBeAttached();

    const steeringOption = page.locator('option', {
      hasText: 'Steering Committee',
    });
    await expect(steeringOption).toBeAttached();
  });

  test('should handle empty report list gracefully', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The page should show "Past Reports" heading
    const pastReportsHeading = page.locator('text=Past Reports');
    await expect(pastReportsHeading).toBeVisible();

    // If no reports exist, should display the empty state message
    const emptyState = page.locator('text=/No reports generated yet/i');
    const emptyCount = await emptyState.count();

    // Also check if there is at least one report card
    const reportCards = page.locator('.cursor-pointer');
    const reportCount = await reportCards.count();

    // Either we have reports or the empty state message
    expect(emptyCount > 0 || reportCount > 0).toBeTruthy();

    // The "Select a report to preview" placeholder should be visible
    // when no report is selected
    const previewPlaceholder = page.locator(
      'text=/Select a report to preview/i'
    );
    const placeholderCount = await previewPlaceholder.count();

    // If no report is selected, placeholder should be shown
    if (reportCount === 0) {
      expect(placeholderCount).toBeGreaterThan(0);
    }
  });

  test('should have interactive report generation form', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Verify the template selector is interactive
    const templateSelect = page.locator('select').first();
    await expect(templateSelect).toBeVisible();

    // Change the template selection
    await templateSelect.selectOption('team');
    await expect(templateSelect).toHaveValue('team');

    // Change to another template
    await templateSelect.selectOption('steering_committee');
    await expect(templateSelect).toHaveValue('steering_committee');

    // Switch back to executive
    await templateSelect.selectOption('executive');
    await expect(templateSelect).toHaveValue('executive');

    // Verify the generate button is still present and clickable
    // (we do not click it to avoid invoking the LLM API)
    const generateButton = page.locator('button').filter({
      hasText: /Generate Report/i,
    });
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();
  });

  test('should display project label in controls', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // The controls card should show a "Project" label
    const projectLabel = page.locator('label', { hasText: /Project/i });
    await expect(projectLabel).toBeVisible();

    // It should display either the active project name or "No active project"
    const projectName = page.locator('text=/No active project/i');
    const projectCards = page.locator('p.text-sm.text-muted-foreground');

    // Just verify the controls section rendered
    expect(
      (await projectName.count()) > 0 || (await projectCards.count()) > 0
    ).toBeTruthy();
  });

  test('should not show loading spinners indefinitely', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Count remaining loading spinners
    const spinners = page.locator('[class*="animate-spin"]');
    const spinnerCount = await spinners.count();

    // Should not have persistent spinning indicators
    expect(spinnerCount).toBeLessThan(3);

    // The page heading should be present and stable
    await expect(page.locator('h1')).toContainText('Status Reports');
  });
});
