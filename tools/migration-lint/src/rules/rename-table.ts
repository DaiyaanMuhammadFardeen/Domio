import type { Rule, LintViolation } from '../types.js';
import { withoutStrings } from '../sqlparse.js';

const RENAME_TABLE = /\b(rename|alter)\s+table\b[\s\S]*?\b(rename|to)\b/i;

export const renameTableRule: Rule = {
  id: 'no-rename-table',
  description: 'Renaming tables is forbidden; instead create a new table and migrate rows.',
  defaultSeverity: 'error',
  check(migration) {
    const out: LintViolation[] = [];
    const hasBangAllowed = migration.annotations['BANG-ALLOWED']?.includes('rename-table');
    for (const stmt of migration.statements) {
      if (!RENAME_TABLE.test(withoutStrings(stmt.sql))) continue;
      if (hasBangAllowed) continue;
      out.push({
        rule: 'no-rename-table',
        file: migration.file,
        line: stmt.startLine,
        message: 'Renaming tables is forbidden.',
        severity: 'error',
        hint: 'Create the new table, backfill, and switch reads/writes in a later migration.',
      });
    }
    return out;
  },
};
