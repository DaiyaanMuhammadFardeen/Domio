import type { Rule } from '../types.js';
import { withoutStrings } from '../sqlparse.js';

const DROP_TABLE = /\bdrop\s+table\b/i;
const DROP_INDEX = /\bdrop\s+index\b/i;
const DROP_VIEW = /\bdrop\s+view\b/i;
const DROP_FUNCTION = /\bdrop\s+function\b/i;
const IF_EXISTS = /\bif\s+exists\b/i;

/**
 * require-if-exists
 *
 * All destructive operations against possibly-missing objects must use
 * `IF EXISTS` so the migration is idempotent against partially-applied
 * state from interrupted runs.
 */
export const requireIfExistsRule: Rule = {
  id: 'require-if-exists',
  description: 'Destructive operations against catalog objects must include IF EXISTS.',
  defaultSeverity: 'error',
  check(migration) {
    const out: import('../types.js').LintViolation[] = [];
    for (const stmt of migration.statements) {
      const sql = withoutStrings(stmt.sql);
      const destructive =
        DROP_TABLE.test(sql) ||
        DROP_INDEX.test(sql) ||
        DROP_VIEW.test(sql) ||
        DROP_FUNCTION.test(sql);
      if (!destructive) continue;
      if (IF_EXISTS.test(sql)) continue;
      out.push({
        rule: 'require-if-exists',
        file: migration.file,
        line: stmt.startLine,
        message: 'Destructive statement must include IF EXISTS.',
        severity: 'error',
        hint: 'Re-run with `DROP TABLE IF EXISTS ...` to keep the migration idempotent.',
      });
    }
    return out;
  },
};