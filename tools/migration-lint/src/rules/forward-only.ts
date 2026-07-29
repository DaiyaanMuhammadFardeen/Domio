import type { Rule } from '../types.js';

const UP_NAME = /^\d{4,}_[a-z0-9_]+\.up\.sql$/;
const DOWN_NAME = /^\d{4,}_[a-z0-9_]+\.down\.sql$/;

export const forwardOnlyRule: Rule = {
  id: 'forward-only',
  description:
    'A migration file must be named NNNN_<slug>.up.sql (denying random ordering) and have a paired NNNN_<slug>.down.sql in P01.',
  defaultSeverity: 'error',
  check(migration, all) {
    const out: import('../types.js').LintViolation[] = [];
    if (migration.direction === 'up' && !UP_NAME.test(migration.file)) {
      out.push({
        rule: 'forward-only',
        file: migration.file,
        line: 1,
        message: `Migration "${migration.file}" must match NNNN_<slug>.up.sql.`,
        severity: 'error',
        hint: 'Rename to e.g. 0001_health_check.up.sql',
      });
    } else if (migration.direction === 'down' && !DOWN_NAME.test(migration.file)) {
      out.push({
        rule: 'forward-only',
        file: migration.file,
        line: 1,
        message: `Migration "${migration.file}" must match NNNN_<slug>.down.sql.`,
        severity: 'error',
        hint: 'Rename to e.g. 0001_health_check.down.sql',
      });
    }

    // Every UP migration must have a paired DOWN with the same sequence.
    if (migration.direction === 'up') {
      const base = migration.file.replace(/\.up\.sql$/, '');
      const expectedDown = `${base}.down.sql`;
      const hasDown = all.some((m) => m.file === expectedDown);
      if (!hasDown) {
        out.push({
          rule: 'forward-only',
          file: migration.file,
          line: 1,
          message: `Missing paired down migration: ${expectedDown}.`,
          severity: 'error',
          hint: 'Every migration must provide a reversible down migration in P01.',
        });
      }
    }
    return out;
  },
};