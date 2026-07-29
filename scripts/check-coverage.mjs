#!/usr/bin/env node
// scripts/check-coverage.mjs
// Aggregates coverage-summary.json files and enforces gate thresholds.
// Used by .github/workflows/unit.yml.
//
// Thresholds mirror vitest.config.ts but are explicitly passed in by CI so
// the values can't drift between code and CI.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

function parseArgs(argv) {
  const out = { lines: "70", branches: "60", functions: "65", statements: "65" };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === "--lines") { out.lines = val; i++; }
    else if (flag === "--branches") { out.branches = val; i++; }
    else if (flag === "--functions") { out.functions = val; i++; }
    else if (flag === "--statements") { out.statements = val; i++; }
  }
  return out;
}

function findCoverageFiles(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".turbo" || name === "dist") continue;
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) findCoverageFiles(p, acc);
    else if (name === "coverage-summary.json") acc.push(p);
  }
  return acc;
}

function pct(s) {
  if (!s || typeof s.pct !== "number") return 0;
  return s.pct;
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function colorize(v, threshold) {
  return v >= threshold ? "\x1b[32m" + v.toFixed(2) + "%\x1b[0m" : "\x1b[31m" + v.toFixed(2) + "%\x1b[0m";
}

function main() {
  const args = parseArgs(process.argv);
  const T = {
    lines: Number(args.lines),
    branches: Number(args.branches),
    functions: Number(args.functions),
    statements: Number(args.statements),
  };

  const root = process.cwd();
  const files = findCoverageFiles(root, []);
  if (files.length === 0) {
    console.error("No coverage-summary.json files found. Coverage gate cannot run.");
    console.error("Run unit tests with --coverage first.");
    process.exit(2);
  }

  let linesPcts = [];
  let branchesPcts = [];
  let functionsPcts = [];
  let statementsPcts = [];

  console.log("Workspace coverage summaries:");
  for (const f of files) {
    let json;
    try { json = JSON.parse(readFileSync(f, "utf8")); }
    catch (e) { console.warn(`Skipping invalid ${f}: ${e.message}`); continue; }
    const total = json.total || {};
    const l = pct(total.lines);
    const b = pct(total.branches);
    const fn = pct(total.functions);
    const st = pct(total.statements);
    linesPcts.push(l); branchesPcts.push(b); functionsPcts.push(fn); statementsPcts.push(st);
    console.log(`  ${basename(f).padEnd(30)} L=${colorize(l, T.lines)} B=${colorize(b, T.branches)} F=${colorize(fn, T.functions)} S=${colorize(st, T.statements)}`);
  }

  const avgL = avg(linesPcts);
  const avgB = avg(branchesPcts);
  const avgF = avg(functionsPcts);
  const avgS = avg(statementsPcts);

  console.log("");
  console.log("Averages:");
  console.log(`  Lines:      ${colorize(avgL, T.lines)} (gate ${T.lines})`);
  console.log(`  Branches:   ${colorize(avgB, T.branches)} (gate ${T.branches})`);
  console.log(`  Functions:  ${colorize(avgF, T.functions)} (gate ${T.functions})`);
  console.log(`  Statements: ${colorize(avgS, T.statements)} (gate ${T.statements})`);

  let failed = [];
  if (avgL < T.lines) failed.push(`lines ${avgL.toFixed(2)}% < ${T.lines}%`);
  if (avgB < T.branches) failed.push(`branches ${avgB.toFixed(2)}% < ${T.branches}%`);
  if (avgF < T.functions) failed.push(`functions ${avgF.toFixed(2)}% < ${T.functions}%`);
  if (avgS < T.statements) failed.push(`statements ${avgS.toFixed(2)}% < ${T.statements}%`);

  if (failed.length > 0) {
    console.error("\nCoverage gate FAILED:");
    for (const f of failed) console.error("  - " + f);
    process.exit(1);
  }
  console.log("\nCoverage gate passed.");
}

main();
