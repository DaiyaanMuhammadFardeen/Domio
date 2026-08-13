/**
 * Phase 17 — ClickHouse migrator unit tests.
 *
 * Pure-Node tests (no ClickHouse server required) that exercise:
 *   * splitStatements — multi-statement .sql parsing
 *   * discoverMigrations — file ordering + checksum
 *   * flagValue — CLI argument parsing
 *
 * Integration tests against the live cluster live in
 * tests/integration/clickhouse/migrator/.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitStatements, discoverMigrations, checksumStatements } from './discovery.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'clickhouse-migrator-'));
}

describe('splitStatements', () => {
  it('splits on semicolons at top level', () => {
    const body = `
      CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x;
      CREATE TABLE b (y String) ENGINE = MergeTree ORDER BY y;
    `;
    const stmts = splitStatements(body);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE a');
    expect(stmts[1]).toContain('CREATE TABLE b');
  });

  it('honors string literals', () => {
    const body = `
      INSERT INTO x VALUES ('a;b;c'), ('d');
      INSERT INTO x VALUES ('e');
    `;
    const stmts = splitStatements(body);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'a;b;c'");
  });

  it('drops line comments and block comments', () => {
    const body = `
      -- single line comment
      CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x; /* inline */
      /* multi
         line */
      CREATE TABLE b (y String) ENGINE = MergeTree ORDER BY y;
    `;
    const stmts = splitStatements(body);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).not.toContain('comment');
    expect(stmts[1]).not.toContain('multi');
  });

  it('returns empty array for empty body', () => {
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('   \n  ')).toEqual([]);
  });
});

describe('discoverMigrations', () => {
  it('orders migrations by ordinal', () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '001_a.sql'),
        'CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x;',
      );
      writeFileSync(
        join(dir, '002_b.sql'),
        'CREATE TABLE b (y String) ENGINE = MergeTree ORDER BY y;',
      );
      writeFileSync(
        join(dir, '003_c.sql'),
        'CREATE TABLE c (z Float64) ENGINE = MergeTree ORDER BY z;',
      );
      const pairs = discoverMigrations(dir);
      expect(pairs.map((p) => p.ordinal)).toEqual(['001', '002', '003']);
      expect(pairs.map((p) => p.slug)).toEqual(['a', 'b', 'c']);
      for (const pair of pairs) {
        expect(pair.up.checksum).toMatch(/^[a-f0-9]{64}$/);
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('pairs up and down migrations by ordinal', () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '001_a.sql'),
        'CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x;',
      );
      writeFileSync(join(dir, '001_a.down.sql'), 'DROP TABLE a;');
      writeFileSync(
        join(dir, '002_b.sql'),
        'CREATE TABLE b (y String) ENGINE = MergeTree ORDER BY y;',
      );
      const pairs = discoverMigrations(dir);
      expect(pairs).toHaveLength(2);
      expect(pairs[0]!.down).not.toBeNull();
      expect(pairs[0]!.down!.path).toContain('001_a.down.sql');
      expect(pairs[1]!.down).toBeNull();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('ignores non-migration files', () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, '001_a.sql'),
        'CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x;',
      );
      writeFileSync(join(dir, 'README.md'), '# not a migration');
      writeFileSync(join(dir, 'data.json'), '{}');
      const pairs = discoverMigrations(dir);
      expect(pairs).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('checksumStatements', () => {
  it('is deterministic for the same input', () => {
    const a = checksumStatements([
      'CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x',
      'INSERT INTO a VALUES (1)',
    ]);
    const b = checksumStatements([
      'CREATE TABLE a (x UInt32) ENGINE = MergeTree ORDER BY x',
      'INSERT INTO a VALUES (1)',
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
