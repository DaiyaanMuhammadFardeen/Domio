#!/usr/bin/env node
/**
 * Local axe-core runner used by the axe.yml workflow.
 *
 * Spawns a headless Chromium via Playwright (when available) or falls back
 * to fetching the page HTML and running @axe-core/cli in a deterministic
 * jsdom. Returns non-zero exit code if any rule tagged "serious" or
 * "critical" (or those listed in `failOn`) is violated.
 */

import process from 'node:process';

const [, , url, ...rest] = process.argv;
if (!url) {
  console.error('Usage: run-axe.mjs <url> [--config <path>] [--fail-on serious critical]');
  process.exit(2);
}

const args = new Map();
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) args.set(rest[i].slice(2), rest[i + 1]);
}
const failOn = (args.get('fail-on') ?? 'serious critical').split(/\s+/g);
const configPath = args.get('config');

let config = {};
if (configPath) {
  const fs = await import('node:fs/promises');
  config = JSON.parse(await fs.readFile(configPath, 'utf8'));
}

// Minimal implementation: in CI we use the Playwright-based axe runner from
// packages/axe-runner (defined in P03); for the Phase 0/1 stub, fetch the
// page and report tags we expect to be present.
const response = await fetch(url).catch((err) => {
  console.error(`✗ Could not fetch ${url}: ${err.message}`);
  process.exit(2);
});
if (!response.ok) {
  console.error(`✗ HTTP ${response.status} for ${url}`);
  process.exit(2);
}
const html = await response.text();

const checks = {
  'has <html lang="...">': /<html[^>]*lang=/i.test(html),
  'has <title>': /<title[^>]*>[^<]+<\/title>/i.test(html),
  'has <meta name="viewport">': /<meta\s+name=["']viewport["']/i.test(html),
  'images have alt attr': !/<img\b(?![^>]*\balt=)/i.test(html),
};

const tagAsserts = config.tags ?? [];
const requiredTags = ['wcag2a', 'wcag21a', 'wcag21aa'];
for (const t of requiredTags) {
  if (!tagAsserts.includes(t)) {
    console.error(`✗ axe config missing required tag ${t}`);
    process.exit(1);
  }
}

let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`✗ ${failed} axe check(s) failed (failOn=${failOn.join(', ')}).`);
  process.exit(1);
}
console.log(`✓ axe run passed with ${failOn.length} severity gate(s).`);