import { test, expect } from '@playwright/test';

// ── Public pages render ────────────────────────────────────────────────────

test('Home page loads and shows content', async ({ page }) => {
  await page.goto('/');
  // Layout shell should always be present
  await expect(page.locator('header')).toBeVisible();
  // Page should not show a JS crash screen
  await expect(page.locator('body')).not.toContainText('Cannot read properties');
  await expect(page.locator('body')).not.toContainText('Unexpected token');
});

test('Discover page loads and shows browse UI', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.locator('header')).toBeVisible();
  // Search input is present (aria-label or type=search)
  const searchInput = page.locator('input[type="search"], input[aria-label]').first();
  await expect(searchInput).toBeVisible();
});

test('Watchlist page loads (public — no redirect)', async ({ page }) => {
  await page.goto('/watchlist');
  await expect(page.locator('header')).toBeVisible();
  // Page renders without crashing (may show empty state or login prompt)
  await expect(page.locator('body')).not.toContainText('Cannot read properties');
});

// ── Protected route redirects ──────────────────────────────────────────────

test('/profile redirects unauthenticated users to /login', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('Login page has email/password form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

// ── 404 fallback redirects to home ────────────────────────────────────────

test('Unknown route redirects to home', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-xyz');
  await expect(page).toHaveURL('/');
});

// ── Mobile viewport smoke ─────────────────────────────────────────────────

test('Header renders on mobile viewport without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const header = page.locator('header');
  await expect(header).toBeVisible();
  const box = await header.boundingBox();
  // Header should not be wider than viewport
  expect(box.width).toBeLessThanOrEqual(375 + 1);
});
