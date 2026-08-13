import { describe, it, expect } from 'vitest';
import { forwardOnlyRule } from '../src/rules/forward-only.js';
import { dropColumnRule } from '../src/rules/drop-column.js';
import { renameTableRule } from '../src/rules/rename-table.js';
import { requireIfExistsRule } from '../src/rules/require-if-exists.js';
import { transactionRequiredRule } from '../src/rules/transaction-required.js';
import { namingConventionRule } from '../src/rules/naming.js';
import { parseStatements } from '../src/sqlparse.js';
import { parseAnnotations } from '../src/loader.js';
import type { LintMigration } from '../src/types.js';

const buildMigration = (
  file: string,
  body: string,
  annotations: Record<string, string> = {},
): LintMigration => {
  const sequence = (file.match(/^(\d{4,})_/) ?? [])[1] ?? '';
  return {
    file,
    direction: file.endsWith('.down.sql') ? 'down' : 'up',
    sequence,
    statements: parseStatements(body),
    annotations: { ...annotations },
  };
};

describe('forward-only rule', () => {
  it('passes for a well-named migration with paired down', () => {
    const up = buildMigration('0001_health_check.up.sql', 'CREATE TABLE x (id int);');
    const down = buildMigration('0001_health_check.down.sql', 'DROP TABLE IF EXISTS x;');
    expect(forwardOnlyRule.check(up, [up, down])).toEqual([]);
  });

  it('fails when file name does not match NNNN_<slug>.up.sql', () => {
    const up = buildMigration('health_check.up.sql', 'CREATE TABLE x (id int);');
    expect(forwardOnlyRule.check(up, [up])[0].rule).toBe('forward-only');
  });

  it('fails when paired down migration is missing', () => {
    const up = buildMigration('0001_health_check.up.sql', 'CREATE TABLE x (id int);');
    expect(forwardOnlyRule.check(up, [up]).some((v) => /Missing paired down/.test(v.message))).toBe(
      true,
    );
  });

  it('fails when migration uses consecutive empty SQL files', () => {
    const up = buildMigration('0001_health_check.up.sql', '');
    expect(forwardOnlyRule.check(up, [up]).length).toBeGreaterThan(0);
  });
});

describe('drop-column rule', () => {
  it('passes for DROP COLUMN preceded by RENAME', () => {
    const body = `
      BEGIN;
      ALTER TABLE foo RENAME COLUMN dropped TO dropped_backup_2026;
      ALTER TABLE foo DROP COLUMN dropped;
      COMMIT;
    `;
    const m = buildMigration('0001_drop.up.sql', body);
    expect(dropColumnRule.check(m, [m])).toEqual([]);
  });

  it('fails for DROP COLUMN without rename', () => {
    const body = 'BEGIN; ALTER TABLE foo DROP COLUMN dropped; COMMIT;';
    const m = buildMigration('0001_drop.up.sql', body);
    const violations = dropColumnRule.check(m, [m]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('no-drop-column-without-rename');
  });

  it('passes with explicit BANG-ALLOWED annotation', () => {
    const body =
      '-- BANG-ALLOWED: drop-without-rename\nBEGIN; ALTER TABLE foo DROP COLUMN dropped; COMMIT;';
    const m = buildMigration('0001_drop.up.sql', body, parseAnnotations(body));
    expect(dropColumnRule.check(m, [m])).toEqual([]);
  });

  it('does not flag DROP COLUMN inside a string literal (false positive guard)', () => {
    const body = `BEGIN; INSERT INTO foo(notes) VALUES ('does not DROP COLUMN anything'); COMMIT;`;
    const m = buildMigration('0001_log.up.sql', body);
    expect(dropColumnRule.check(m, [m])).toEqual([]);
  });

  it('rejects missing bang-allowed reviewer justification', () => {
    const body = 'BEGIN; ALTER TABLE foo DROP COLUMN big; COMMIT;';
    const m = buildMigration('0001_drop.up.sql', body, { 'BANG-ALLOWED': 'rename-table' });
    expect(dropColumnRule.check(m, [m]).length).toBe(1);
  });
});

describe('rename-table rule', () => {
  it('passes when no rename is present', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; ALTER TABLE foo ADD COLUMN y int; COMMIT;');
    expect(renameTableRule.check(m, [m])).toEqual([]);
  });

  it('fails for ALTER TABLE ... RENAME TO', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; ALTER TABLE foo RENAME TO bar; COMMIT;');
    expect(renameTableRule.check(m, [m]).length).toBe(1);
  });

  it('passes when BANG-ALLOWED annotation is present', () => {
    const body = '-- BANG-ALLOWED: rename-table\nBEGIN; ALTER TABLE foo RENAME TO bar; COMMIT;';
    const m = buildMigration('0001_x.up.sql', body, parseAnnotations(body));
    expect(renameTableRule.check(m, [m])).toEqual([]);
  });

  it('does not flag rename inside string literal', () => {
    const body = `BEGIN; INSERT INTO foo(notes) VALUES ('rename table foo to bar'); COMMIT;`;
    const m = buildMigration('0001_x.up.sql', body);
    expect(renameTableRule.check(m, [m])).toEqual([]);
  });
});

describe('require-if-exists rule', () => {
  it('passes for DROP TABLE IF EXISTS', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; DROP TABLE IF EXISTS foo; COMMIT;');
    expect(requireIfExistsRule.check(m, [m])).toEqual([]);
  });

  it('fails for DROP TABLE without IF EXISTS', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; DROP TABLE foo; COMMIT;');
    expect(requireIfExistsRule.check(m, [m]).length).toBe(1);
  });

  it('fails for DROP INDEX without IF EXISTS', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; DROP INDEX foo; COMMIT;');
    expect(requireIfExistsRule.check(m, [m]).length).toBe(1);
  });

  it('does not flag DROP COLUMN inside a CREATE INDEX', () => {
    const m = buildMigration(
      '0001_x.up.sql',
      'BEGIN; CREATE INDEX IF NOT EXISTS foo ON bar(x); COMMIT;',
    );
    expect(requireIfExistsRule.check(m, [m])).toEqual([]);
  });
});

describe('transaction-required rule', () => {
  it('passes when DDL is wrapped in BEGIN/COMMIT', () => {
    const m = buildMigration('0001_x.up.sql', 'BEGIN; CREATE TABLE foo (id int); COMMIT;');
    expect(transactionRequiredRule.check(m, [m])).toEqual([]);
  });

  it('fails when DDL is not wrapped', () => {
    const m = buildMigration('0001_x.up.sql', 'CREATE TABLE foo (id int);');
    expect(transactionRequiredRule.check(m, [m]).length).toBe(1);
  });

  it('passes for CREATE INDEX CONCURRENTLY outside transaction', () => {
    const m = buildMigration('0001_x.up.sql', 'CREATE INDEX CONCURRENTLY foo ON bar(x);');
    expect(transactionRequiredRule.check(m, [m])).toEqual([]);
  });

  it('passes when BANG-ALLOWED: no-transaction is annotated', () => {
    const body = '-- BANG-ALLOWED: no-transaction\nCREATE TABLE foo (id int);';
    const m = buildMigration('0001_x.up.sql', body, parseAnnotations(body));
    expect(transactionRequiredRule.check(m, [m])).toEqual([]);
  });

  it('detects nested DDL (multiple statements)', () => {
    const body = 'BEGIN; CREATE TABLE foo (id int); CREATE INDEX i ON foo(id); COMMIT;';
    const m = buildMigration('0001_x.up.sql', body);
    expect(transactionRequiredRule.check(m, [m])).toEqual([]);
  });
});

describe('enforce-naming-convention rule', () => {
  it('passes for a valid filename', () => {
    const m = buildMigration('0001_health_check.up.sql', '');
    expect(namingConventionRule.check(m, [m])).toEqual([]);
  });

  it('warns for reserved slugs', () => {
    const m = buildMigration('0001_tmp.up.sql', '');
    expect(namingConventionRule.check(m, [m])[0].severity).toBe('warning');
  });

  it('warns for sloppy names', () => {
    const m = buildMigration('0001_other.up.sql', '');
    expect(namingConventionRule.check(m, [m])[0].severity).toBe('warning');
  });

  it('warns when name does not match the pattern', () => {
    const m = buildMigration('001-fix.up.sql', '');
    expect(namingConventionRule.check(m, [m]).length).toBeGreaterThan(0);
  });
});
