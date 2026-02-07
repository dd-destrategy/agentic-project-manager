import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E tests for Natural Language Query Page
 *
 * Tests the "Ask Your Project" page where users can ask questions about
 * their projects and receive answers based on current artefacts and events.
 */

test.describe('Natural Language Query', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display ask page with correct heading', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');

    // Verify page heading
    await expect(page.locator('h1')).toContainText('Ask Your Project');

    // Verify subtitle
    await expect(
      page.locator('text=/Ask questions about your projects/i')
    ).toBeVisible();
  });

  test('should show a text input for questions', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // The question input has id="question-input" and aria-label="Question"
    const questionInput = page.locator('#question-input');
    await expect(questionInput).toBeVisible();

    // Verify placeholder text
    await expect(questionInput).toHaveAttribute(
      'placeholder',
      /blockers|risks/i
    );
  });

  test('should show a submit button', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // The submit button has aria-label="Ask question"
    const submitButton = page.locator('button[aria-label="Ask question"]');
    await expect(submitButton).toBeVisible();

    // Button should be disabled when input is empty
    await expect(submitButton).toBeDisabled();
  });

  test('should accept text input and enable submit button', async ({
    page,
  }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const questionInput = page.locator('#question-input');
    const submitButton = page.locator('button[aria-label="Ask question"]');

    // Initially, submit should be disabled (empty input)
    await expect(submitButton).toBeDisabled();

    // Type a question
    const testQuestion = 'What are the current blockers on the project?';
    await questionInput.fill(testQuestion);

    // Verify the input contains the typed text
    await expect(questionInput).toHaveValue(testQuestion);

    // Submit button should now be enabled
    await expect(submitButton).toBeEnabled();

    // Clear the input — button should become disabled again
    await questionInput.fill('');
    await expect(submitButton).toBeDisabled();
  });

  test('should display empty state when no previous queries exist', async ({
    page,
  }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // The empty state shows "Ask a question to get started"
    const emptyStateHeading = page.locator(
      'text=/Ask a question to get started/i'
    );
    await expect(emptyStateHeading).toBeVisible();

    // Should also show helpful suggestion text
    const suggestionText = page.locator(
      'text=/Try asking about blockers, risks/i'
    );
    await expect(suggestionText).toBeVisible();
  });

  test('should show project selector', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // The project selector has id="project-select"
    const projectSelect = page.locator('#project-select');
    await expect(projectSelect).toBeVisible();

    // Should have "All projects" as the default option
    const allProjectsOption = page.locator('option', {
      hasText: 'All projects',
    });
    await expect(allProjectsOption).toBeAttached();
  });

  test('should not show loading spinners indefinitely', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Count remaining loading spinners
    const spinners = page.locator('[class*="animate-spin"]');
    const spinnerCount = await spinners.count();

    // No persistent spinning indicators should remain
    expect(spinnerCount).toBe(0);

    // The page heading should be present and stable
    await expect(page.locator('h1')).toContainText('Ask Your Project');
  });

  test('should have functional form submission structure', async ({ page }) => {
    await page.goto('/ask');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify the form element exists
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify form contains the input and button
    const inputInForm = form.locator('#question-input');
    await expect(inputInForm).toBeVisible();

    const buttonInForm = form.locator('button[aria-label="Ask question"]');
    await expect(buttonInForm).toBeVisible();

    // Do not actually submit the form to avoid invoking the LLM API
  });
});
