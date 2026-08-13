import type { Rule, LintViolation } from '../types.js';
import { withoutStrings } from '../sqlparse.js';

const TRANSACTION_CONTROL = /\b(begin|commit|rollback)\b/i;
const CREATE_INDEX_CONCURRENTLY = /\bcreate\s+index\s+concurrently\b/i;
const VACUUM = /\bvacuum\b/i;

export const transactionRequiredRule: Rule = {
  id: 'require-transaction',
  description:
    'Schema migrations must be wrapped in BEGIN/COMMIT (or rely on the migration runner default). CREATE INDEX CONCURRENTLY and VACUUM are excluded.',
  defaultSeverity: 'error',
  check(migration) {
    const out: LintViolation[] = [];
    const hasBangAllowed = migration.annotations['BANG-ALLOWED']?.includes('no-transaction');
    if (hasBangAllowed) return out;

    let inTxn = false;
    migration.statements.forEach((stmt) => {
      const sql = withoutStrings(stmt.sql);
      if (CREATE_INDEX_CONCURRENTLY.test(sql) || VACUUM.test(sql)) {
        return;
      }
      const isBegin = /\bbegin\b/i.test(sql);
      const isCommit = /\bcommit\b/i.test(sql);
      const isRollback = /\brollback\b/i.test(sql);
      if (isBegin) {
        inTxn = true;
      }
      if (isCommit || isRollback) {
        inTxn = false;
      }
      // Destructive or structural statement?
      if (/\b(create|alter|drop)\b/i.test(sql) && !inTxn && !TRANSACTION_CONTROL.test(sql)) {
        out.push({
          rule: 'require-transaction',
          file: migration.file,
          line: stmt.startLine,
          message: 'DDL statement must run inside BEGIN/COMMIT.',
          severity: 'error',
          hint: 'Wrap the migration body in BEGIN; ... COMMIT;',
        });
      }
    });
    return out;
  },
};
