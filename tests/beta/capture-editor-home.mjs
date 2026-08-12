/**
 * Capture screenshots of the editor home + a few panel deep-links.
 * Used to verify Phase A. Saves under tests/beta/screenshots/.
 *
 * Usage:
 *   node tests/beta/capture-editor-home.mjs
 */
import pwPkg from '../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.js';
const { chromium } = pwPkg;
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'screenshots');
await mkdir(OUT, { recursive: true });

const targets = [
  { name: 'editor-home', url: 'http://localhost:3100/' },
  { name: 'editor-demo', url: 'http://localhost:3100/editor/demo' },
  { name: 'editor-panel-theme-brand', url: 'http://localhost:3100/editor/demo?panel=theme-brand' },
  { name: 'editor-panel-animations', url: 'http://localhost:3100/editor/demo?panel=animations' },
  { name: 'editor-panel-marketplace', url: 'http://localhost:3100/editor/demo?panel=marketplace' },
  { name: 'editor-panel-copilot-outline', url: 'http://localhost:3100/editor/demo?panel=p12-copilot' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

for (const t of targets) {
  console.log(`→ ${t.name}: ${t.url}`);
  await page.goto(t.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(OUT, `${t.name}.png`),
    fullPage: true,
  });
}

await browser.close();
console.log('Done.');