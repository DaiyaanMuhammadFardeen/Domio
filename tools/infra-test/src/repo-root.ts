import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

// Resolve REPO_ROOT robustly. Try by walking up from the source file first
// (which works regardless of where vitest is invoked), then by walking up
// from process.cwd() if needed. This keeps the test runner flexible.

function findRepoRoot(start: string): string {
  let cur = start;
  // Limit the walk to a sane depth so we don't loop forever.
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(`${cur}/infrastructure/terraform/modules/network/main.tf`)) {
      return cur;
    }
    const parent = resolve(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

const here = dirname(fileURLToPath(import.meta.url));
// src/repo-root.ts -> src -> infra-test -> tools -> worktrees -> repo
const bySource = findRepoRoot(resolve(here, "..", "..", "..", ".."));
const byCwd = findRepoRoot(process.cwd());

// Prefer the one that contains the modules dir directly.
export const REPO_ROOT = existsSync(`${bySource}/infrastructure/terraform/modules/network/main.tf`)
  ? bySource
  : byCwd;