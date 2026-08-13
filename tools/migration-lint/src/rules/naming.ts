import type { Rule, LintViolation } from '../types.js';

const NAMING_UP_RE = /^[0-9]{4,}_[a-z0-9_]{3,}\.up\.sql$/;
const NAMING_DOWN_RE = /^[0-9]{4,}_[a-z0-9_]{3,}\.down\.sql$/;

const RESERVED_SLUGS = new Set([
  'temp',
  'tmp',
  'test',
  'demo',
  'wip',
  'fix',
  'misc',
  'other',
  'stuff',
]);

export const namingConventionRule: Rule = {
  id: 'enforce-naming-convention',
  description: 'Migrations follow NNNN_<slug>.up.sql with a non-reserved slug.',
  defaultSeverity: 'warning',
  check(migration) {
    const out: LintViolation[] = [];
    const isUp = NAMING_UP_RE.test(migration.file);
    const isDown = NAMING_DOWN_RE.test(migration.file);
    if (!isUp && !isDown) {
      out.push({
        rule: 'enforce-naming-convention',
        file: migration.file,
        line: 1,
        message: `Migration file does not follow NNNN_<slug>.up.sql or NNNN_<slug>.down.sql.`,
        severity: 'warning',
      });
      return out;
    }
    // Only check reserved slugs for up migrations
    if (isUp) {
      const slug = migration.file
        .split('_')
        .slice(1)
        .join('_')
        .replace(/\.up\.sql$/, '');
      if (RESERVED_SLUGS.has(slug)) {
        out.push({
          rule: 'enforce-naming-convention',
          file: migration.file,
          line: 1,
          message: `Migration slug "${slug}" is reserved; choose a descriptive name.`,
          severity: 'warning',
        });
      }
    }
    return out;
  },
};
