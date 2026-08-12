#!/usr/bin/env node
/**
 * i18n-check — verifies every FormattedMessage id, useT('key') and
 * t('key') reference in apps/ resolves to a key in the per-app
 * messages/en.json catalogue.
 *
 * Per Wave 1 §S1.8 + Wave 2.1 §Phase E of
 * docs/frontend-roadmap/01-wave-productionization.md.
 *
 * All .ts/.tsx files are scanned regardless of import source — local
 * `useT()` hooks (e.g. apps/editor/src/lib/locale.tsx) and the
 * `FormattedMessage` component from @domio/ui share the same
 * catalogue. Wave 2 §Phase E removed the dual-dict (lib/i18n.ts +
 * messages/en.json) so only one source of truth remains.
 *
 * Usage:
 *   node tools/i18n-check.mjs                # check all apps
 *   node tools/i18n-check.mjs editor         # check a single app
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const filterArg = process.argv[2];
const appsDir = join(repoRoot, 'apps');

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Regex catalogue:
//   - <FormattedMessage id="key" />
//   - useT('key') — the local hook from lib/locale.tsx
//   - t('key') — when called from a `const t = useT()` shadow
const formattedIdRe = /<FormattedMessage[^>]*\sid=["']([^"']+)["']/g;
const useTRe = /\buseT\(\s*["']([^"']+)["']/g;
// `t('key')` only counts when `t` was assigned from `useT()` somewhere
// earlier in the same file — so we test for `const t = useT()` first
// to avoid false positives on unrelated `t(...)` calls (e.g. test
// names like `t('foo')`).
const tShadowRe = /const\s+t\s*=\s*useT\(\)/;

const errors = [];

for (const app of readdirSync(appsDir)) {
  if (filterArg && app !== filterArg) continue;
  const appDir = join(appsDir, app);
  if (!statSync(appDir).isDirectory()) continue;

  const messagesFile = join(appDir, 'messages', 'en.json');
  const catalogue = readJson(messagesFile) ?? {};
  const keys = new Set(Object.keys(catalogue));

  const srcDir = join(appDir, 'src');
  if (!statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) continue;
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');

    const found = new Set();
    for (const re of [formattedIdRe, useTRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) found.add(m[1]);
    }
    if (tShadowRe.test(text)) {
      // Only scan `t('key')` literals when `t` is a `useT()` shadow —
      // prevents false positives on test files with `t('foo')` calls.
      const tCallRe = /\bt\(\s*["']([^"']+)["']/g;
      tCallRe.lastIndex = 0;
      let m;
      while ((m = tCallRe.exec(text)) !== null) found.add(m[1]);
    }
    for (const id of found) {
      if (!keys.has(id)) {
        errors.push(`${app}: missing key "${id}" (referenced in ${file.replace(repoRoot + '/', '')})`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n-check: ${errors.length} missing keys`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else {
  console.log('i18n-check: all referenced keys resolve');
}