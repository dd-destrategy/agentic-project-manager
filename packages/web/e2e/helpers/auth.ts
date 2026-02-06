import { Page } from '@playwright/test';

/**
 * Authentication helper for E2E tests
 *
 * Provides utilities to log in and manage authentication state
 */

export const TEST_PASSWORD = process.env.NEXTAUTH_PASSWORD || 'test-password';

/**
 * Log in via the sign-in page
 */
export async function login(page: Page, password: string = TEST_PASSWORD) {
  await page.goto('/auth/signin');
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Check if user is authenticated by verifying dashboard access
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    // If we're on the dashboard, we're authenticated
    return page.url().includes('/dashboard');
  } catch {
    return false;
  }
}

/**
 * Log out by navigating to the sign-out endpoint
 */
export async function logout(page: Page) {
  await page.goto('/api/auth/signout');
  // Click the sign out button if present
  const signOutButton = page.locator('form button');
  if (await signOutButton.isVisible()) {
    await signOutButton.click();
  }

  // Wait for redirect to sign-in page
  await page.waitForURL('/auth/signin', { timeout: 10000 });
}
