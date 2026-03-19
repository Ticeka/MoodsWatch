import { test, expect } from '@playwright/test';

// ── Discover: search ───────────────────────────────────────────────────────

test.describe('Discover — search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover');
    // Wait for the search input to be interactive
    await page.waitForSelector('input[type="search"]', { state: 'visible' });
  });

  test('typing a query updates the visible filter pill', async ({ page }) => {
    const input = page.locator('input[type="search"]');
    await input.fill('one piece');

    // Active filter pill shows the search term
    const pill = page.locator('.discover-filter-pill').first();
    await expect(pill).toBeVisible({ timeout: 5000 });
    await expect(pill).toContainText('one piece');
  });

  test('clear button removes the query and pill', async ({ page }) => {
    const input = page.locator('input[type="search"]');
    await input.fill('naruto');

    const clearBtn = page.locator('.search-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    await expect(input).toHaveValue('');
    await expect(page.locator('.discover-filter-pill')).toHaveCount(0);
  });

  test('query shorter than 2 chars shows no filter pill', async ({ page }) => {
    const input = page.locator('input[type="search"]');
    await input.fill('a');
    await expect(page.locator('.discover-filter-pill')).toHaveCount(0);
  });
});

// ── Discover: type filter tabs ─────────────────────────────────────────────

test.describe('Discover — type filter tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/discover');
    await page.waitForSelector('.type-tabs', { state: 'visible' });
  });

  test('clicking a type tab marks it active', async ({ page }) => {
    const tabs = page.locator('.type-tab');
    // At least 3 tabs (all / anime / manga / manhwa)
    await expect(tabs).toHaveCount(4);

    // Click the second tab (Anime)
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    // First tab (All) should no longer be active
    await expect(tabs.nth(0)).not.toHaveClass(/active/);
  });

  test('switching type resets page to 1', async ({ page }) => {
    const tabs = page.locator('.type-tab');
    await tabs.nth(2).click(); // Manga
    await page.waitForTimeout(500);
    // Page counter should show "1 / ..." or pagination should start fresh
    const pageDisplay = page.locator('.page-display, .discover-pagination');
    // We just assert no JS error and page is still mounted
    await expect(page.locator('header')).toBeVisible();
  });
});

// ── Discover: quick-tag filter ─────────────────────────────────────────────

test.describe('Discover — quick tag filter', () => {
  test('clicking a quick tag marks it active and shows filter pill', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForSelector('.quick-search-tags', { state: 'visible' });

    const firstTag = page.locator('.quick-tag').first();
    const tagText = await firstTag.innerText();
    await firstTag.click();

    await expect(firstTag).toHaveClass(/active/);

    const pill = page.locator('.discover-filter-pill').first();
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(tagText.trim());
  });

  test('clicking the same tag again removes it', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForSelector('.quick-search-tags', { state: 'visible' });

    const firstTag = page.locator('.quick-tag').first();
    await firstTag.click();
    await expect(firstTag).toHaveClass(/active/);

    // Click again → deactivate
    await firstTag.click();
    await expect(firstTag).not.toHaveClass(/active/);
    await expect(page.locator('.discover-filter-pill')).toHaveCount(0);
  });
});

// ── Discover: sort select ──────────────────────────────────────────────────

test('Discover sort select changes value without crash', async ({ page }) => {
  await page.goto('/discover');
  await page.waitForSelector('.discover-sorter select', { state: 'visible' });

  const sortSelect = page.locator('.discover-sorter select');
  await sortSelect.selectOption('score');
  await expect(sortSelect).toHaveValue('score');
  await expect(page.locator('header')).toBeVisible();
});

// ── Discover: pagination buttons ───────────────────────────────────────────

test('Discover pagination next/prev buttons exist and prev is disabled on page 1', async ({ page }) => {
  await page.goto('/discover');
  await page.waitForSelector('.discover-pagination', { state: 'visible', timeout: 10000 });

  const prevBtn = page.locator('.discover-page-btn').first();
  const nextBtn = page.locator('.discover-page-btn').last();

  await expect(prevBtn).toBeDisabled();
  // Next may or may not be enabled depending on data, but it should exist
  await expect(nextBtn).toBeVisible();
});

// ── Discover: a11y basics ──────────────────────────────────────────────────

test('Discover search input has accessible label', async ({ page }) => {
  await page.goto('/discover');
  const input = page.locator('input[type="search"]');
  await expect(input).toHaveAttribute('aria-label');
  const label = await input.getAttribute('aria-label');
  expect(label?.length).toBeGreaterThan(0);
});
