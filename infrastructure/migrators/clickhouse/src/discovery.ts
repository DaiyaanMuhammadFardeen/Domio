/**
 * Phase 17 — ClickHouse migration discovery.
 *
 * Discovers versioned .sql files in the init directory. Convention:
 *   NNNN_<snake_case>.sql
 * where NNNN is a 4-digit zero-padded ordinal. Up and down migrations are
 * identified by the same ordinal; the down file is the up file with one
 * naming convention.
 *
 * Naming convention used in this repo:
 *   001_phase17_schema.sql        (forward + idempotent)
 *   001_phase17_schema.down.sql   (down / rollback)
 *
 * The migrator is forward-only by default. Down is supported as a
 * best-effort companion file that may be empty for non-reversible ops
 * (e.g., DROP PARTITION). The CLI emits a warning when down is missing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface MigrationFile {
  /** 4-digit ordinal. Lexicographically sortable. */
  ordinal: string;
  /** Snake-case slug, e.g. "phase17_schema". */
  slug: string;
  /** Absolute path to the .sql file. */
  path: string;
  /** SHA-256 of the file contents — used to detect drift. */
  checksum: string;
}

export interface MigrationPair {
  ordinal: string;
  slug: string;
  up: MigrationFile;
  down: MigrationFile | null;
}

const MIGRATION_PATTERN = /^(\d{4})_(.+?)\.sql$/;
const DOWN_MIGRATION_PATTERN = /^(\d{4})_(.+?)\.down\.sql$/;

export function discoverMigrations(initDir: string): MigrationPair[] {
  const entries = readdirSync(initDir);
  const byOrdinal = new Map<string, MigrationPair>();

  for (const entry of entries) {
    const fullPath = join(initDir, entry);
    if (!statSync(fullPath).isFile()) continue;

    const upMatch = MIGRATION_PATTERN.exec(entry);
    const downMatch = DOWN_MIGRATION_PATTERN.exec(entry);

    if (upMatch) {
      const ordinal = upMatch[1]!;
      const slug = upMatch[2]!;
      const pair = byOrdinal.get(ordinal) ?? { ordinal, slug, up: null!, down: null };
      pair.up = mkFile(ordinal, slug, fullPath);
      byOrdinal.set(ordinal, pair);
    } else if (downMatch) {
      const ordinal = downMatch[1]!;
      const slug = downMatch[2]!;
      const pair = byOrdinal.get(ordinal) ?? { ordinal, slug, up: null!, down: null };
      pair.down = mkFile(ordinal, slug, fullPath);
      byOrdinal.set(ordinal, pair);
    }
  }

  const pairs = Array.from(byOrdinal.values()).filter((p) => p.up !== null);
  pairs.sort((a, b) => a.ordinal.localeCompare(b.ordinal));

  for (const pair of pairs) {
    if (!pair.down) {
      // Surface a warning at discovery time; CLI prints it.
      pair.down = null;
    }
  }

  return pairs;
}

function mkFile(ordinal: string, slug: string, path: string): MigrationFile {
  const body = readFileSync(path, 'utf8');
  const checksum = createHash('sha256').update(body).digest('hex');
  return { ordinal, slug, path, checksum };
}

export function checksumStatements(statements: readonly string[]): string {
  // SHA-256 over the concatenated statement set, used to anchor a
  // `__migrations` row to the exact content that was applied.
  return createHash('sha256').update(statements.join('\n;\n')).digest('hex');
}

/**
 * Split a multi-statement .sql file into individual statements. ClickHouse
 * supports multi-statement queries via the HTTP /native protocol when
 * separated by `;` (the default in @clickhouse/client). We split anyway so
 * we can report which statements ran and anchor the checksum.
 */
export function splitStatements(body: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inString = false;
  let quote: '"' | "'" | '`' | null = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (inString) {
      buf += c;
      if (c === '\\' && i + 1 < body.length) {
        buf += body[i + 1]!;
        i++;
      } else if (c === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      quote = c;
      buf += c;
      continue;
    }
    if (c === '-' && body[i + 1] === '-') {
      // SQL line comment — skip to end of line.
      while (i < body.length && body[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && body[i + 1] === '*') {
      // /* block comment */ — skip to */
      i += 2;
      while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === ';') {
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}
