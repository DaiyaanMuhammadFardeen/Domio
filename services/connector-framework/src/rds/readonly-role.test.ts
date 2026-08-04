/**
 * RDS readonly role tests (Phase 08).
 *
 * Verifies that createReadonlyRoleSql emits valid SQL for Postgres 14+
 * and MySQL 8, and does NOT emit write-operation tokens.
 */

import { describe, it, expect } from 'vitest';
import { createReadonlyRoleSql } from './create-readonly-role.js';

// ---------------------------------------------------------------------------
// Postgres 14+
// ---------------------------------------------------------------------------

describe('createReadonlyRoleSql — Postgres', () => {
  it('emits CREATE ROLE with LOGIN', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user' });
    expect(sql).toContain('CREATE ROLE');
    expect(sql).toContain('LOGIN');
    expect(sql).toContain('"readonly_user"');
  });

  it('includes PASSWORD when provided', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user', password: 's3cret!' });
    expect(sql).toContain('PASSWORD');
    expect(sql).toContain("'s3cret!'");
  });

  it('emits GRANT USAGE ON SCHEMA', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user' });
    expect(sql).toContain('GRANT USAGE ON SCHEMA');
    expect(sql).toContain('TO "readonly_user"');
  });

  it('emits GRANT SELECT ON ALL TABLES when no specific tables', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user' });
    expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA');
  });

  it('emits GRANT SELECT on specific tables when provided', () => {
    const sql = createReadonlyRoleSql('postgres', {
      role: 'readonly_user',
      tables: ['users', 'orders'],
    });
    expect(sql).toContain('GRANT SELECT ON');
    expect(sql).toContain('"users"');
    expect(sql).toContain('"orders"');
    // Should NOT contain ALL TABLES
    expect(sql).not.toContain('ALL TABLES');
  });

  it('emits ALTER DEFAULT PRIVILEGES', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user' });
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES');
    expect(sql).toContain('GRANT SELECT ON TABLES TO');
  });

  it('uses custom schema', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user', schema: 'analytics' });
    expect(sql).toContain('"analytics"');
  });

  it('role name is quoted', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'user-with-dashes' });
    expect(sql).toContain('"user-with-dashes"');
  });

  it('does NOT emit INSERT/UPDATE/DELETE/DROP/ALTER tokens for data', () => {
    const sql = createReadonlyRoleSql('postgres', { role: 'readonly_user' });
    // ALTER DEFAULT PRIVILEGES contains ALTER but it's for privileges, not DDL
    // Check no write grants exist
    expect(sql).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bGRANT\s+(INSERT|UPDATE|DELETE|CREATE|TRUNCATE)\b/i);
  });
});

// ---------------------------------------------------------------------------
// MySQL 8
// ---------------------------------------------------------------------------

describe('createReadonlyRoleSql — MySQL', () => {
  it('emits CREATE USER', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'readonly_user' });
    expect(sql).toContain('CREATE USER');
    expect(sql).toContain('"readonly_user"');
  });

  it('includes IDENTIFIED BY when password provided', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'readonly_user', password: 'mypass' });
    expect(sql).toContain('IDENTIFIED BY');
    expect(sql).toContain("'mypass'");
  });

  it('emits GRANT SELECT ON db.* when no specific tables', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'readonly_user', database: 'mydb' });
    expect(sql).toContain('GRANT SELECT ON "mydb".*');
    expect(sql).toContain('TO "readonly_user"');
  });

  it('emits default database * when none specified', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'readonly_user' });
    expect(sql).toContain('GRANT SELECT ON "*".*');
  });

  it('emits GRANT SELECT on specific tables', () => {
    const sql = createReadonlyRoleSql('mysql', {
      role: 'readonly_user',
      database: 'mydb',
      tables: ['users', 'orders'],
    });
    expect(sql).toContain('GRANT SELECT ON "mydb"."users"');
    expect(sql).toContain('GRANT SELECT ON "mydb"."orders"');
    expect(sql).not.toContain('.*');
  });

  it('role name is quoted', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'special_user' });
    expect(sql).toContain('"special_user"');
  });

  it('does NOT emit INSERT/UPDATE/DELETE/DROP/ALTER tokens', () => {
    const sql = createReadonlyRoleSql('mysql', { role: 'readonly_user' });
    expect(sql).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bGRANT\s+(INSERT|UPDATE|DELETE|CREATE|TRUNCATE)\b/i);
  });
});

// ---------------------------------------------------------------------------
// Security invariants
// ---------------------------------------------------------------------------

describe('createReadonlyRoleSql — security invariants', () => {
  it('Postgres: only SELECT grants exist', () => {
    const sql = createReadonlyRoleSql('postgres', {
      role: 'auditor',
      schema: 'public',
      tables: ['transactions', 'audit_log'],
    });
    // Split by lines, check each GRANT ... ON ... line (skip GRANT USAGE)
    const lines = sql.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('GRANT') && !trimmed.includes('USAGE')) {
        expect(trimmed).toMatch(/\bSELECT\b/);
        expect(trimmed).not.toMatch(/\bINSERT\b/);
        expect(trimmed).not.toMatch(/\bUPDATE\b/);
        expect(trimmed).not.toMatch(/\bDELETE\b/);
        expect(trimmed).not.toMatch(/\bTRUNCATE\b/);
      }
    }
  });

  it('MySQL: only SELECT grants exist', () => {
    const sql = createReadonlyRoleSql('mysql', {
      role: 'auditor',
      database: 'app',
      tables: ['logs'],
    });
    const lines = sql.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('GRANT') && !trimmed.includes('USAGE')) {
        expect(trimmed).toMatch(/\bSELECT\b/);
        expect(trimmed).not.toMatch(/\bINSERT\b/);
        expect(trimmed).not.toMatch(/\bUPDATE\b/);
        expect(trimmed).not.toMatch(/\bDELETE\b/);
        expect(trimmed).not.toMatch(/\bTRUNCATE\b/);
      }
    }
  });
});
