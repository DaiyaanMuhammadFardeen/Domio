import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseStatements } from './sqlparse.js';
import type { LintMigration } from './types.js';

const ANNOTATION_RE = /^--\s*BANG-ALLOWED:\s*([a-z0-9_-]+)\s*(?:\(([^)]+)\))?$/i;

export function loadMigrations(root: string): LintMigration[] {
  const out: LintMigration[] = [];
  if (!existsSync(root)) return out;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.sql')) {
        const rel = relative(root, full).replace(/\\/g, '/');
        const sql = readFileSync(full, 'utf8');
        const statements = parseStatements(sql);
        const annotations = parseAnnotations(sql);
        const direction: 'up' | 'down' = rel.endsWith('.down.sql') ? 'down' : 'up';
        const seqMatch = basename(rel).match(/^(\d{4,})_/);
        const sequence = (seqMatch?.[1]) ?? '';
        out.push({
          file: rel,
          direction,
          sequence,
          statements,
          annotations,
        });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Parse `-- BANG-ALLOWED: <reason>` annotations from a migration body. The
 * annotation always groups under the canonical key `BANG-ALLOWED`; the
 * captured `<reason>` is lowercased and concatenated so a file can list
 * multiple allow-listed operations as separate `-- BANG-ALLOWED:` lines.
 */
export function parseAnnotations(sql: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of sql.split(/\r?\n/)) {
    const m = line.match(ANNOTATION_RE);
    if (!m) continue;
    const reason = (m[1] ?? '').toLowerCase();
    if (!reason) continue;
    const key = 'BANG-ALLOWED';
    out[key] = (out[key] ?? '') + (out[key] ? ',' : '') + reason;
  }
  return out;
}