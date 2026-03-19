import { test, expect } from '@playwright/test';

// NOTE: Watchlist is a public page — unauthenticated users see an empty list.
// These tests verify the UI structure and interactions that work without auth.
// Full add/status-update tests require auth and are marked with test.skip
// so CI doesn't fail — run them manually after adding auth setup.

test.describe('Watchlist — public structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForSelector('.watchlist-controls-shell', { state: 'visible', timeout: 10000 });
  });

  test('shows My List and Favorites tabs', async ({ page }) => {
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(2);
    // First tab is active by default
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking Favorites tab switches active tab', async ({ page }) => {
    const tabs = page.locator('[role="tab"]');
    await tabs.last().click();
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'false');
  });

  test('filter buttons have aria-pressed attributes', async ({ page }) => {
    // "All" filter should be pressed by default
    const allFilterBtn = page.locator('[role="group"] button').first();
    await expect(allFilterBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('sort select is present and functional', async ({ page }) => {
    const sortSelect = page.locator('.watchlist-sorter select');
    await expect(sortSelect).toBeVisible();
    await sortSelect.selectOption('score');
    await expect(sortSelect).toHaveValue('score');
  });

  test('stats panel shows 4 stat items', async ({ page }) => {
    const stats = page.locator('.stat-item');
    await expect(stats).toHaveCount(4);
  });

  test('shows empty state (no watchlist items when unauthenticated)', async ({ page }) => {
    // Either shows empty-state or skeleton — just verify no crash
    await expect(page.locator('body')).not.toContainText('Cannot read properties');
    await expect(page.locator('.watchlist-page')).toBeVisible();
  });

  test('switching to favorites tab shows mood grid', async ({ page }) => {
    const tabs = page.locator('[role="tab"]');
    await tabs.last().click();

    // Mood chip buttons should appear
    const moodGroup = page.locator('[role="group"]').filter({ has: page.locator('.watchlist-mood-chip') });
    await expect(moodGroup).toBeVisible({ timeout: 5000 });

    const chips = page.locator('.watchlist-mood-chip');
    await expect(chips.first()).toBeVisible();
  });

  test('mood chip has aria-pressed attribute', async ({ page }) => {
    const tabs = page.locator('[role="tab"]');
    await tabs.last().click();
    await page.waitForSelector('.watchlist-mood-chip', { state: 'visible' });

    const firstChip = page.locator('.watchlist-mood-chip').first();
    await expect(firstChip).toHaveAttribute('aria-pressed');
  });
});

// ── Auth-required flow tests (skipped in CI) ──────────────────────────────

test.describe('Watchlist — authenticated flows (requires login)', () => {
  // To run these, set PLAYWRIGHT_AUTH_EMAIL and PLAYWRIGHT_AUTH_PASSWORD env vars
  // and implement storageState-based auth setup in playwright.config.js
  test.skip(!process.env.PLAYWRIGHT_AUTH_EMAIL, 'Auth credentials not configured');

  test.beforeEach(async ({ page }) => {
    // Login flow
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.PLAYWRIGHT_AUTH_EMAIL);
    await page.fill('input[type="password"]', process.env.PLAYWRIGHT_AUTH_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    await page.goto('/watchlist');
    await page.waitForSelector('.watchlist-controls-shell', { state: 'visible' });
  });

  test('adding a title from Home appears in watchlist', async ({ page }) => {
    // Navigate to home, add first available title card
    await page.goto('/');
    await page.waitForSelector('.title-card', { state: 'visible', timeout: 10000 });

    const firstCard = page.locator('.title-card').first();
    const saveBtn = firstCard.locator('.save-btn');
    await saveBtn.click();

    // Go to watchlist and verify item is present
    await page.goto('/watchlist');
    await page.waitForSelector('.watchlist-controls-shell', { state: 'visible' });
    await expect(page.locator('.results-grid .title-card').first()).toBeVisible({ timeout: 10000 });
  });

  test('changing status via quick-status menu updates status indicator', async ({ page }) => {
    // Assumes at least one item in watchlist
    await page.waitForSelector('.watchlist-item-wrapper', { state: 'visible', timeout: 10000 });

    const firstItem = page.locator('.watchlist-item-wrapper').first();
    const statusMenuBtn = firstItem.locator('.quick-status-btn');
    await statusMenuBtn.click();

    // Status menu should open
    await expect(firstItem.locator('[role="menu"]')).toBeVisible();

    // Click "Completed"
    const completedOption = firstItem.locator('[role="menuitem"]').filter({ hasText: /completed|จบ/i }).first();
    await completedOption.click();

    // Menu should close and status indicator updates
    await expect(firstItem.locator('[role="menu"]')).not.toBeVisible();
    const statusIndicator = firstItem.locator('.status-indicator');
    await expect(statusIndicator).toBeVisible();
  });
});
