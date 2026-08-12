#!/usr/bin/env node
/**
 * i18n-check — verifies every FormattedMessage id + useT key reference
 * in components that import from @domio/ui resolves to a key in the
 * per-app messages/en.json catalogue.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Only files that explicitly import FormattedMessage or useLocale from
 * `@domio/ui` are scanned. Existing local i18n.ts files (which use a
 * different hook) are excluded — migrating them is a separate task.
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

const formattedIdRe = /<FormattedMessage[^>]*\sid=["']([^"']+)["']/g;
const useTRe = /\buseT\(\s*["']([^"']+)["']/g;
const domioUiImportRe = /from\s+['"]@domio\/ui(?:\/[^'"]+)?['"]/;

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
    if (!domioUiImportRe.test(text)) continue;

    const found = new Set();
    for (const re of [formattedIdRe, useTRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) found.add(m[1]);
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