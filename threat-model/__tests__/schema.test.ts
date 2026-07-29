import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'components');

interface StrideEntry {
  score: number;
  notes: string;
}
interface ComponentDoc {
  unit: string;
  owner: string;
  stride: Record<'S' | 'T' | 'R' | 'I' | 'D' | 'E', StrideEntry>;
}

const REQUIRED_CATEGORIES = ['S', 'T', 'R', 'I', 'D', 'E'] as const;

/** Count leading spaces in a line. */
function indentOf(line: string): number {
  const m = line.match(/^[ \t]*/);
  return m ? m[0]!.length : 0;
}

/**
 * Parse the simple `key: value` plus indented `stride:` block format we
 * use for threat-model components. We expect:
 *
 *   unit: <string>
 *   owner: <email-ish string>
 *   stride:
 *     <CATEGORY>:
 *       score: <integer 1..25>
 *       notes:
 *         - bullet line one
 *         - bullet line two
 *
 * This avoids depending on a YAML library and is sufficient for our
 * hand-authored files.
 */
function parseComponent(raw: string): ComponentDoc {
  const lines = raw.split(/\r?\n/);
  const doc: Record<string, unknown> = { stride: {} };
  const stride: Record<string, StrideEntry> = {};

  let i = 0;
  // Track the indent of the current scope so we know when to "fall
  // back" to a less-indented line.
  let scopeIndent = -1;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    i++;
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const lineIndent = indentOf(line);
    if (scopeIndent !== -1 && lineIndent <= scopeIndent) {
      // Fell out of the previous scope; treat this line as a new
      // top-level entry by re-processing it.
      i--;
      scopeIndent = -1;
      continue;
    }

    const m = line.match(/^([a-z]+):\s*(.*)$/);
    if (!m) {
      // Not a key:value line at all; bail out of any current scope.
      scopeIndent = -1;
      continue;
    }
    const key = m[1]!;
    const rest = (m[2] ?? '').trim();

    if (rest !== '') {
      doc[key] = rest;
      scopeIndent = -1;
      continue;
    }

    if (key === 'stride') {
      scopeIndent = lineIndent;
      // Read the indented categories.
      while (i < lines.length) {
        const sub = lines[i] ?? '';
        const subIndent = indentOf(sub);
        if (!/^\s+/.test(sub)) break;
        if (subIndent <= scopeIndent) break;
        const cm = sub.match(/^\s+([A-Z]):\s*$/);
        if (!cm) break;
        const cat = cm[1]!;
        i++;
        const entry: StrideEntry = { score: 0, notes: '' };
        const noteLines: string[] = [];
        let bulletIndent = -1;

        while (i < lines.length) {
          const inner = lines[i] ?? '';
          const innerIndent = indentOf(inner);
          // Stop when we hit a line at or below the category's indent.
          if (!/^\s+/.test(inner)) break;
          // Recognize `score:` and `notes:` at the standard category
          // inner indent (one level deeper than the category letter).
          const fm = inner.match(/^\s+(score|notes):\s*(.*)$/);
          if (fm && bulletIndent === -1) {
            if (fm[1] === 'score') {
              entry.score = Number(fm[2]);
            } else {
              const v = (fm[2] ?? '').trim();
              if (v !== '') noteLines.push(v);
            }
            i++;
            continue;
          }
          // Bullet item — adopt its indent as the bullet base.
          const bm = inner.match(/^(\s+)-\s+(.*)$/);
          if (bm) {
            bulletIndent = bm[1]!.length;
            noteLines.push((bm[2] ?? '').trim());
            i++;
            continue;
          }
          // Continuation: must be more indented than the bullet AND not
          // a recognizable key:value at category-inner indent. We only
          // consider it a continuation if it's strictly deeper than the
          // bullet and we already have at least one note.
          if (
            bulletIndent !== -1 &&
            noteLines.length > 0 &&
            innerIndent > bulletIndent &&
            inner.trim() !== ''
          ) {
            // Skip stray `key:` looking things at deeper indents — they
            // would have been caught by `fm` if they matched the
            // pattern; if they don't match the pattern, treat as text.
            noteLines[noteLines.length - 1] += ' ' + inner.trim();
            i++;
            continue;
          }
          break;
        }

        entry.notes = noteLines.join(' | ');
        stride[cat] = entry;
      }
      doc.stride = stride;
      scopeIndent = -1;
    }
  }

  return doc as unknown as ComponentDoc;
}

describe('threat-model components', () => {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md'));

  it('has at least one component file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`${f} parses with required STRIDE structure`, () => {
      const full = join(ROOT, f);
      const raw = readFileSync(full, 'utf8');
      const doc = parseComponent(raw);
      expect(doc.unit).toBeTruthy();
      expect(typeof doc.owner).toBe('string');
      expect(doc.owner).toContain('@');
      for (const cat of REQUIRED_CATEGORIES) {
        const e = doc.stride[cat];
        expect(e, `missing STRIDE category ${cat} in ${f}`).toBeDefined();
        expect(typeof e.score).toBe('number');
        expect(e.score).toBeGreaterThanOrEqual(1);
        expect(e.score).toBeLessThanOrEqual(25);
        expect(typeof e.notes).toBe('string');
        expect(e.notes.length).toBeGreaterThan(0);
      }
    });
  }
});
