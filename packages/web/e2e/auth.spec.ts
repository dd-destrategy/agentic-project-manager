import { test, expect } from '@playwright/test';
import { login, logout, TEST_PASSWORD } from './helpers/auth';

/**
 * E2E tests for authentication flow
 *
 * Tests the complete authentication cycle including login, session persistence,
 * and logout functionality.
 */

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated user to sign-in page', async ({
    page,
  }) => {
    // Visit root - should redirect to sign-in
    await page.goto('/');
    await expect(page).toHaveURL('/auth/signin');

    // Verify sign-in page elements
    await expect(page.locator('h1')).toContainText('Agentic PM Workbench');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show error message for invalid password', async ({ page }) => {
    await page.goto('/auth/signin');

    // Enter incorrect password
    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    // Wait for error message
    await expect(page.locator('text=Invalid password')).toBeVisible();

    // Should still be on sign-in page
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should successfully log in with valid credentials', async ({
    page,
  }) => {
    await page.goto('/auth/signin');

    // Enter correct password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL('/dashboard', { timeout: 10000 });
    await expect(page).toHaveURL('/dashboard');

    // Verify dashboard loaded
    await expect(page.locator('h1')).toContainText('Mission Control');
  });

  test('should maintain authentication across page navigations', async ({
    page,
  }) => {
    // Log in first
    await login(page);

    // Navigate to different pages
    await page.goto('/escalations');
    await expect(page.locator('h1')).toContainText('Escalations');

    await page.goto('/ingest');
    // Ingest page might have different title structure, just verify not redirected to login
    await expect(page).not.toHaveURL('/auth/signin');

    // Return to dashboard
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Mission Control');
  });

  test('should display sidebar navigation when authenticated', async ({
    page,
  }) => {
    await login(page);

    // Verify sidebar is visible (look for navigation links)
    // The sidebar should contain links to key pages
    const sidebar = page.locator('nav, aside, [role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // Verify key navigation items exist
    // Based on the sidebar structure, we should see these navigation elements
    await expect(
      page.locator('a[href="/dashboard"], text=/Mission Control|Dashboard/i')
    ).toBeVisible();
  });

  test('should successfully log out and redirect to sign-in', async ({
    page,
  }) => {
    // Log in first
    await login(page);
    await expect(page).toHaveURL('/dashboard');

    // Log out
    await logout(page);

    // Should be redirected to sign-in page
    await expect(page).toHaveURL('/auth/signin');

    // Try to access dashboard - should redirect to sign-in
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should prevent access to protected routes when not authenticated', async ({
    page,
  }) => {
    // Ensure not logged in
    await page.goto('/auth/signin');

    // Try to access protected routes directly
    const protectedRoutes = ['/dashboard', '/escalations', '/ingest'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      // Should redirect to sign-in
      await expect(page).toHaveURL('/auth/signin');
    }
  });
});
