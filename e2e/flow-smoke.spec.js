import { test, expect } from '@playwright/test';

const ALLOWED_CONSOLE_ERRORS = [
  'Failed to load trending titles',
  'TypeError: Failed to fetch',
  'Failed to load discover catalog',
];

test('Main flow smoke navigation renders key routes without runtime crashes', async ({ page }) => {
  const pageErrors = [];
  const unexpectedConsoleErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const isAllowed = ALLOWED_CONSOLE_ERRORS.some((allowed) => text.includes(allowed));
    if (!isAllowed) {
      unexpectedConsoleErrors.push(text);
    }
  });

  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();

  await page.goto('/discover');
  await expect(page.getByRole('main')).toBeVisible();

  const firstCardLink = page.locator('a[href^="/title/"]').first();
  if (await firstCardLink.count()) {
    await firstCardLink.click();
    await expect(page).toHaveURL(/\/title\//);
  } else {
    await page.goto('/title/frieren-beyond-journeys-end');
  }
  await expect(page.getByRole('main')).toBeVisible();

  await page.goto('/watchlist');
  await expect(page.getByRole('main')).toBeVisible();

  await page.goto('/battle');
  await expect(page.getByRole('main')).toBeVisible();

  await page.goto('/tierlist');
  await expect(page.getByRole('main')).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
});
