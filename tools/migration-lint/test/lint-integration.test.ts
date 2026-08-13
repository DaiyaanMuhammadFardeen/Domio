import { describe, it, expect } from 'vitest';
import { lint } from '../src/lint.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tmpMigrations() {
  const dir = mkdtempSync(join(tmpdir(), 'domio-mig-'));
  return dir;
}

function writeMig(dir: string, name: string, body: string) {
  const path = join(dir, name);
  writeFileSync(path, body);
}

describe('lint (integration)', () => {
  it('returns 0 violations for a clean migration set', async () => {
    const dir = tmpMigrations();
    writeMig(
      dir,
      '0001_health_check.up.sql',
      `BEGIN;\nCREATE TABLE health_check (id uuid PRIMARY KEY, probe_at timestamptz NOT NULL DEFAULT now());\nCOMMIT;\n`,
    );
    writeMig(
      dir,
      '0001_health_check.down.sql',
      `BEGIN;\nDROP TABLE IF EXISTS health_check;\nCOMMIT;\n`,
    );
    const v = await lint({ migrationsDir: dir });
    expect(v).toEqual([]);
  });

  it('flags drop-column-without-rename', async () => {
    const dir = tmpMigrations();
    writeMig(
      dir,
      '0001_health_check.up.sql',
      `BEGIN;\nALTER TABLE health_check DROP COLUMN probe_at;\nCOMMIT;\n`,
    );
    writeMig(
      dir,
      '0001_health_check.down.sql',
      `BEGIN;\nDROP TABLE IF EXISTS health_check;\nCOMMIT;\n`,
    );
    const v = await lint({ migrationsDir: dir });
    expect(v.some((x) => x.rule === 'no-drop-column-without-rename')).toBe(true);
  });

  it('flags missing down migration', async () => {
    const dir = tmpMigrations();
    writeMig(
      dir,
      '0001_health_check.up.sql',
      `BEGIN;\nCREATE TABLE health_check (id uuid PRIMARY KEY);\nCOMMIT;\n`,
    );
    const v = await lint({ migrationsDir: dir });
    expect(v.some((x) => x.rule === 'forward-only' && /Missing paired down/.test(x.message))).toBe(
      true,
    );
  });

  it('flags DDL outside transaction', async () => {
    const dir = tmpMigrations();
    writeMig(dir, '0001_health_check.up.sql', `CREATE TABLE health_check (id uuid PRIMARY KEY);\n`);
    writeMig(dir, '0001_health_check.down.sql', `DROP TABLE IF EXISTS health_check;\n`);
    const v = await lint({ migrationsDir: dir });
    expect(v.some((x) => x.rule === 'require-transaction')).toBe(true);
  });

  it('flags DROP TABLE without IF EXISTS', async () => {
    const dir = tmpMigrations();
    writeMig(
      dir,
      '0001_health_check.up.sql',
      `BEGIN;\nCREATE TABLE health_check (id uuid PRIMARY KEY);\nCOMMIT;\n`,
    );
    writeMig(dir, '0001_health_check.down.sql', `BEGIN;\nDROP TABLE health_check;\nCOMMIT;\n`);
    const v = await lint({ migrationsDir: dir });
    expect(v.some((x) => x.rule === 'require-if-exists')).toBe(true);
  });

  it('does not flag BANG-ALLOWED: drop-without-rename', async () => {
    const dir = tmpMigrations();
    writeMig(
      dir,
      '0001_health_check.up.sql',
      `-- BANG-ALLOWED: drop-without-rename\nBEGIN;\nALTER TABLE health_check DROP COLUMN probe_at;\nCOMMIT;\n`,
    );
    writeMig(
      dir,
      '0001_health_check.down.sql',
      `BEGIN;\nDROP TABLE IF EXISTS health_check;\nCOMMIT;\n`,
    );
    const v = await lint({ migrationsDir: dir });
    expect(v.some((x) => x.rule === 'no-drop-column-without-rename')).toBe(false);
  });

  it('returns empty for non-existent migrations directory', async () => {
    const dir = join(tmpdir(), 'domio-non-existent-', String(Math.random()));
    const v = await lint({ migrationsDir: dir });
    expect(v).toEqual([]);
  });

  it('strict mode escalates warnings to failures', async () => {
    const dir = tmpMigrations();
    writeMig(dir, '0001_tmp.up.sql', `BEGIN;\nCREATE TABLE tmp (id int);\nCOMMIT;\n`);
    writeMig(dir, '0001_tmp.down.sql', `BEGIN;\nDROP TABLE IF EXISTS tmp;\nCOMMIT;\n`);
    const v = await lint({ migrationsDir: dir, strict: true });
    expect(v.some((x) => x.rule === 'enforce-naming-convention' && x.severity === 'warning')).toBe(
      true,
    );
  });
});
