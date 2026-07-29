import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMigrations } from './loader.js';
import type { LintViolation, Rule } from './types.js';
import { forwardOnlyRule } from './rules/forward-only.js';
import { dropColumnRule } from './rules/drop-column.js';
import { renameTableRule } from './rules/rename-table.js';
import { requireIfExistsRule } from './rules/require-if-exists.js';
import { transactionRequiredRule } from './rules/transaction-required.js';
import { namingConventionRule } from './rules/naming.js';

export const defaultRules: Rule[] = [
  forwardOnlyRule,
  dropColumnRule,
  renameTableRule,
  requireIfExistsRule,
  transactionRequiredRule,
  namingConventionRule,
];

export interface LintOptions {
  migrationsDir: string;
  rulesDir?: string;
  strict?: boolean;
  failOn?: Array<'error' | 'warning'>;
}

export async function lint(opts: LintOptions): Promise<LintViolation[]> {
  const migrations = loadMigrations(opts.migrationsDir);
  const rules = defaultRules;
  if (opts.rulesDir && existsSync(opts.rulesDir)) {
    // dynamic loading skipped: only built-in rules shipped in Phase 01
  }
  const failOn = new Set(opts.failOn ?? ['error']);
  const out: LintViolation[] = [];
  for (const m of migrations) {
    for (const rule of rules) {
      const violations = rule.check(m, migrations);
      for (const v of violations) {
        if (opts.strict || failOn.has(v.severity)) out.push(v);
      }
    }
  }
  return out;
}

export function formatViolations(violations: LintViolation[]): string {
  if (violations.length === 0) return '✓ 0 violations.';
  return violations
    .map(
      (v) =>
        `  ${v.severity.toUpperCase()} [${v.rule}] ${v.file}:${v.line}  ${v.message}` +
        (v.hint ? `\n      hint: ${v.hint}` : ''),
    )
    .join('\n');
}

export function migrationsFromDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => join(dir, f));
}