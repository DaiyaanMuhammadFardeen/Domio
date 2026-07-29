#!/usr/bin/env node
// scripts/axe-scan.mjs
// Loads .axe/config.json, runs Playwright + axe-core, fails on
// serious/critical violations.
//
// In CI we only have static pages. This script gracefully handles both:
//  - live pages (default): Playwright fetches each target.
//  - offline fixtures (when --offline-fixtures is passed): scans .axe/fixtures/*.html.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseArgs(argv) {
  const out = { url: null, config: ".axe/config.json", report: ".axe/report.json", offline: false };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === "--url") { out.url = val; i++; }
    else if (flag === "--config") { out.config = val; i++; }
    else if (flag === "--report") { out.report = val; i++; }
    else if (flag === "--offline-fixtures") { out.offline = true; }
    else if (flag === "--fixture") { out.fixture = val; i++; }
  }
  return out;
}

async function runLive(url, config) {
  // Dynamic imports so missing Playwright/axe doesn't crash in offline mode.
  const { chromium } = await import("playwright");
  const axePath = join(ROOT, "node_modules", "axe-core", "axe.min.js");
  let axeSource;
  try {
    axeSource = readFileSync(axePath, "utf8");
  } catch {
    throw new Error(
      "axe-core not installed locally. Run `pnpm add -D axe-core` or use --offline-fixtures."
    );
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate((cfg) => {
    // eslint-disable-next-line no-undef
    return axe.run(document, {
      runOnly: cfg.runOnly,
      rules: cfg.rules,
      resultTypes: cfg.resultTypes || ["violations"],
    });
  }, config);
  await browser.close();
  return result;
}

function runOfflineFixture(fixturePath, config) {
  const html = readFileSync(fixturePath, "utf8");
  const issues = [];
  // Naive offline checks mirroring axe rule names.
  if (config.rules["image-alt"] && /<img(?![^>]*\balt=)/i.test(html)) {
    issues.push({ id: "image-alt", impact: "serious", description: "<img> missing alt" });
  }
  if (config.rules["html-has-lang"] && !/<html[^>]*\blang=/i.test(html)) {
    issues.push({ id: "html-has-lang", impact: "serious", description: "<html> missing lang" });
  }
  if (config.rules["document-title"] && !/<title>[^<]+<\/title>/i.test(html)) {
    issues.push({ id: "document-title", impact: "serious", description: "missing <title>" });
  }
  if (config.rules["page-has-heading-one"] && !/<h1[\s>]/i.test(html)) {
    issues.push({ id: "page-has-heading-one", impact: "moderate", description: "no <h1>" });
  }
  return {
    url: `fixture:${fixturePath}`,
    timestamp: new Date().toISOString(),
    violations: issues.map((v) => ({ ...v, nodes: [{ html: html.slice(0, 80) }] })),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfgPath = join(ROOT, args.config);
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  let result;

  if (args.offline) {
    const fixturePath = args.fixture || join(ROOT, ".axe", "fixtures", "skeleton.html");
    result = runOfflineFixture(fixturePath, cfg);
  } else if (args.url) {
    result = await runLive(args.url, cfg);
    result.url = args.url;
    result.timestamp = new Date().toISOString();
  } else {
    console.error("Either --url or --offline-fixtures is required.");
    process.exit(2);
  }

  mkdirSync(dirname(join(ROOT, args.report)), { recursive: true });
  writeFileSync(join(ROOT, args.report), JSON.stringify(result, null, 2));

  const failOn = cfg.failOn || ["serious", "critical"];
  const violations = (result.violations || []);
  const failing = violations.filter((v) => failOn.includes(v.impact));

  console.log(`Total violations: ${violations.length}; failing: ${failing.length}`);
  if (failing.length > 0) {
    for (const v of failing) {
      console.error(`  - [${v.impact}] ${v.id}: ${v.description || ""}`);
    }
    process.exit(1);
  }
  console.log("axe scan passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
