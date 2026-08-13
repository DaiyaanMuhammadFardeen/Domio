/**
 * RDS — generate read-only role SQL for Postgres 14+ and MySQL 8 (Phase 08).
 *
 * Emits SQL that creates a read-only database role/user with SELECT-only
 * grants. No INSERT/UPDATE/DELETE/DDL grants are emitted.
 */

export type RdsEngine = 'postgres' | 'mysql';

export interface ReadonlyRoleOpts {
  readonly role: string;
  readonly password?: string;
  readonly schema?: string;
  readonly database?: string;
  readonly tables?: string[];
}

export function createReadonlyRoleSql(engine: RdsEngine, opts: ReadonlyRoleOpts): string {
  if (engine === 'postgres') return createPostgresReadonlyRole(opts);
  return createMysqlReadonlyRole(opts);
}

function createPostgresReadonlyRole(opts: ReadonlyRoleOpts): string {
  const lines: string[] = [];
  const schema = opts.schema ?? 'public';
  const role = quoteIdent(opts.role);

  // CREATE ROLE with LOGIN and PASSWORD
  if (opts.password) {
    lines.push(`CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(opts.password)};`);
  } else {
    lines.push(`CREATE ROLE ${role} LOGIN;`);
  }

  // GRANT USAGE ON SCHEMA
  lines.push(`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${role};`);

  if (opts.tables && opts.tables.length > 0) {
    // GRANT SELECT on specific tables
    for (const table of opts.tables) {
      lines.push(`GRANT SELECT ON ${quoteIdent(schema)}.${quoteIdent(table)} TO ${role};`);
    }
  } else {
    // GRANT SELECT ON ALL TABLES IN SCHEMA
    lines.push(`GRANT SELECT ON ALL TABLES IN SCHEMA ${quoteIdent(schema)} TO ${role};`);
  }

  // ALTER DEFAULT PRIVILEGES so future tables are also readable
  lines.push(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schema)} GRANT SELECT ON TABLES TO ${role};`,
  );

  return lines.join('\n');
}

function createMysqlReadonlyRole(opts: ReadonlyRoleOpts): string {
  const lines: string[] = [];
  const role = quoteIdent(opts.role);
  const database = opts.database ?? '*';

  // CREATE USER with IDENTIFIED BY
  if (opts.password) {
    lines.push(`CREATE USER ${role} IDENTIFIED BY ${quoteLiteral(opts.password)};`);
  } else {
    lines.push(`CREATE USER ${role};`);
  }

  if (opts.tables && opts.tables.length > 0) {
    // GRANT SELECT on specific tables
    const db = quoteIdent(database);
    for (const table of opts.tables) {
      lines.push(`GRANT SELECT ON ${db}.${quoteIdent(table)} TO ${role};`);
    }
  } else {
    // GRANT SELECT ON db.*
    lines.push(`GRANT SELECT ON ${quoteIdent(database)}.* TO ${role};`);
  }

  return lines.join('\n');
}

/** Quote a SQL identifier (simple double-quote wrapping). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a SQL string literal. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
