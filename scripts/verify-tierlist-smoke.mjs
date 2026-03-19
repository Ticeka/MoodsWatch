import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;

async function waitForServer(url, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting up.
    }

    await delay(1000);
  }

  throw new Error(`Preview server did not start at ${url}`);
}

function startPreviewServer() {
  const command = process.platform === 'win32'
    ? 'node_modules\\.bin\\vite.cmd'
    : 'node_modules/.bin/vite';

  const child = spawn(command, ['preview', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  return child;
}

async function runSmokeTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/tierlist`, { waitUntil: 'networkidle' });
    await page.locator('a[href^="/tierlist/template/"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Play This Template|เล่นเทมเพลตนี้/i }).first().click();
    await page.waitForURL(/\/tierlist\/play\//, { timeout: 20000 });
    await page.locator('.tiermaker-editor').waitFor({ state: 'visible', timeout: 45000 });

    const rowDropzone = page.locator('.tiermaker-row').first().locator('.tiermaker-dropzone');
    const firstTile = page.locator('.tiermaker-pool .tiermaker-tile').first();
    const tileBox = await firstTile.boundingBox();
    const rowBox = await rowDropzone.boundingBox();

    if (!tileBox || !rowBox) {
      throw new Error('Unable to drag first tile into tier row');
    }

    await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rowBox.x + 80, rowBox.y + 40, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);

    const rowItemCount = await page.locator('.tiermaker-row').first().locator('.tiermaker-tile').count();
    if (rowItemCount < 1) {
      throw new Error('Drag/drop did not move a tile into the first row');
    }

    await page.getByRole('button', { name: /Save|บันทึก/i }).first().click();
    await page.waitForTimeout(1400);

    const saveStatus = (await page.locator('.tiermaker-toolbar-status').textContent())?.trim().toLowerCase() || '';
    if (!saveStatus.includes('saved') && !saveStatus.includes('บันทึก')) {
      throw new Error(`Unexpected save status: ${saveStatus}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await page.locator('.tiermaker-editor').waitFor({ state: 'visible', timeout: 45000 });
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    const mobileToolbarVisible = await page.locator('.tiermaker-toolbar').isVisible();
    const mobilePoolVisible = await page.locator('.tiermaker-pool').isVisible();
    if (!mobileToolbarVisible || !mobilePoolVisible) {
      throw new Error('Mobile tierlist editor did not render toolbar/pool as expected');
    }

    console.log('Tierlist smoke test passed');
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

const preview = startPreviewServer();

try {
  await waitForServer(`${BASE_URL}/tierlist`);
  await runSmokeTest();
} finally {
  if (preview && !preview.killed) {
    preview.kill('SIGTERM');
  }
}
