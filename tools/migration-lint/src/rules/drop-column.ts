import type { Rule, LintViolation } from '../types.js';
import { withoutStrings } from '../sqlparse.js';

const DROP_COLUMN = /\bdrop\s+column\b/i;
const RENAME_COLUMN = /\brename\s+column\b/i;

/**
 * no-drop-column-without-rename
 *
 * `ALTER TABLE ... DROP COLUMN x` is a destructive operation that destroys
 * data. Lint requires it to be paired with a prior `ALTER TABLE ... RENAME
 * COLUMN x TO x_backup_<timestamp>` within the same migration file, unless
 * the migration carries the explicit reviewer annotation
 * `BANG-ALLOWED: drop-without-rename`.
 */
export const dropColumnRule: Rule = {
  id: 'no-drop-column-without-rename',
  description:
    'DROP COLUMN requires a preceding RENAME COLUMN within the same migration, unless BANG-ALLOWED annotation is present.',
  defaultSeverity: 'error',
  check(migration) {
    const out: LintViolation[] = [];
    const hasRename = migration.statements.some((s) => RENAME_COLUMN.test(withoutStrings(s.sql)));
    const hasBangAllowed = migration.annotations['BANG-ALLOWED']?.includes('drop-without-rename');
    for (const stmt of migration.statements) {
      // Strip string literals so that mentions like 'DROP COLUMN' inside a
      // comment or value don't trigger this rule.
      if (!DROP_COLUMN.test(withoutStrings(stmt.sql))) continue;
      if (hasRename || hasBangAllowed) continue;
      out.push({
        rule: 'no-drop-column-without-rename',
        file: migration.file,
        line: stmt.startLine,
        message: 'DROP COLUMN is forbidden without a paired RENAME COLUMN.',
        severity: 'error',
        hint: 'Either rename the column first, or annotate `-- BANG-ALLOWED: drop-without-rename` with reviewer sign-off.',
      });
    }
    return out;
  },
};