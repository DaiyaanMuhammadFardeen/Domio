import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

interface SliEntry {
  slo: string;
  page: string;
  ticket: string;
}

interface SloDoc {
  owner: string;
  slis: SliEntry[];
  burnAlerts: string[];
}

/**
 * Parse a markdown SLO doc of the form:
 *
 *   # SLO: <component>
 *   Owner: `<email>`
 *   ...
 *   | SLI | SLO target | Ticket | Page |
 *   |-----|------------|--------|------|
 *   | <row>... |
 *   ...
 *
 *   ## Burn-rate alerts
 *   | ALERT ID | ... |
 *
 * We extract just enough structure to validate that the author filled
 * out the doc with the required fields. Tables that don't match the
 * SLI shape (e.g. "User journeys" tables with three columns) are
 * skipped — we keep scanning for the SLI table.
 */
function parseSlo(raw: string): SloDoc {
  const ownerMatch = raw.match(/Owner:\s*`([^`]+)`/);
  const owner = ownerMatch?.[1] ?? '';
  const lines = raw.split(/\r?\n/);

  const slis: SliEntry[] = [];
  // Look for the SLI table: a 4-column markdown table whose header row
  // begins with `SLI`. We accept any number of "off-shape" tables
  // before we find it.
  let headerRow = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (/^\|\s*SLI\s*\|/.test(l)) {
      headerRow = i;
      break;
    }
  }
  if (headerRow !== -1 && /^\|\s*---/.test(lines[headerRow + 1] ?? '')) {
    for (let i = headerRow + 2; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const cleaned = line.trim();
      if (!cleaned.startsWith('|')) break;
      const cells = cleaned
        .split('|')
        .map((c) => c.trim())
        .filter((c, idx, arr) => idx !== 0 && idx !== arr.length - 1);
      if (cells.length < 4) continue;
      if (!/^[A-Z]{2,}-\d/.test(cells[0] ?? '')) continue;
      slis.push({
        slo: cells[1] ?? '',
        page: cells[3] ?? '',
        ticket: cells[2] ?? '',
      });
    }
  }

  // Burn-rate alert names appear at the start of table rows under
  // "## Burn-rate alerts".
  const burnAlerts: string[] = [];
  let inBurnSection = false;
  for (const line of lines) {
    if (line.startsWith('## Burn-rate alerts')) {
      inBurnSection = true;
      continue;
    }
    if (inBurnSection && line.startsWith('## ')) break;
    if (!inBurnSection) continue;
    const m = line.match(/^\|\s*([A-Z][A-Za-z0-9]+)\s*\|/);
    if (m) burnAlerts.push(m[1]!);
  }

  return { owner, slis, burnAlerts };
}

/** Extract a `data: { key: <block-scalar> }` config-map-ish structure. */
function extractDataBlocks(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  // skip until we find `data:`
  while (i < lines.length && !/^data:\s*$/.test(lines[i] ?? '')) i++;
  if (i >= lines.length) return out;
  i++; // past `data:`
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!/^\s+/.test(line) || line.trim() === '') {
      i++;
      continue;
    }
    const m = line.match(/^\s+([a-zA-Z_]+):\s*\|\s*$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1]!;
    // The block scalar body is indented MORE than the `data:` parent,
    // i.e. ≥ 4 spaces. We collect until we see a line at the parent
    // indent (a new key: |). Empty lines inside a block are preserved.
    const parentIndent = 2;
    const blockLines: string[] = [];
    i++;
    while (i < lines.length) {
      const sub = lines[i] ?? '';
      if (sub.trim() === '') {
        blockLines.push('');
        i++;
        continue;
      }
      const subIndent = (sub.match(/^[ ]*/)?.[0] ?? '').length;
      if (subIndent <= parentIndent) break;
      blockLines.push(sub);
      i++;
    }
    out[key] = blockLines.join('\n');
  }
  return out;
}

describe('SLO documents', () => {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md') && f !== 'README.md');

  it('has at least four component SLO docs', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const f of files) {
    it(`${f} has owner and at least one SLI entry`, () => {
      const raw = readFileSync(join(ROOT, f), 'utf8');
      const doc = parseSlo(raw);
      expect(doc.owner, `${f} missing owner`).toMatch(/.+@.+/);
      expect(doc.slis.length, `${f} needs SLI table`).toBeGreaterThan(0);
      for (const sli of doc.slis) {
        expect(sli.slo, `${f} SLI without SLO value`).toBeTruthy();
        expect(sli.page, `${f} SLI without page threshold`).toBeTruthy();
      }
    });

    it(`${f} lists at least one burn-rate alert`, () => {
      const raw = readFileSync(join(ROOT, f), 'utf8');
      const doc = parseSlo(raw);
      expect(doc.burnAlerts.length, `${f} must define burn-rate alerts`).toBeGreaterThan(0);
    });
  }
});

describe('SLO burn-rate rules', () => {
  it('parses and contains fast-burn alerts', () => {
    const raw = readFileSync(join(ROOT, 'rules/budget-burn.yaml'), 'utf8');
    expect(raw).toContain('groups:');
    expect(raw).toContain('domio-slo-budget-burn');

    // Split into one chunk per alert, anchored on `- alert:` after
    // any indent. The `m` flag matters because `- alert:` may appear
    // mid-line in a multi-line search.
    const alertEntries = raw.split(/\n(?=\s*-\s*alert:)/);
    let burnFast = 0;
    for (const a of alertEntries) {
      const nameM = a.match(/-\s*alert:\s*([A-Za-z0-9]+)/);
      if (!nameM) continue;
      if (!nameM[1]!.includes('BurnFast')) continue;
      burnFast++;
      expect(a, `${nameM[1]} must declare severity: page`).toMatch(/severity:\s*page/);
      expect(a, `${nameM[1]} must declare for:`).toMatch(/for:\s*\S/);
      expect(a, `${nameM[1]} must declare summary annotation`).toMatch(/summary:\s*"[^"]+"/);
      expect(a, `${nameM[1]} must declare slo label`).toMatch(/slo:\s*[a-zA-Z0-9-]+/);
    }
    expect(burnFast).toBeGreaterThanOrEqual(4);
  });

  it('every alert name is unique', () => {
    const raw = readFileSync(join(ROOT, 'rules/budget-burn.yaml'), 'utf8');
    const names = Array.from(raw.matchAll(/-\s*alert:\s*([A-Za-z0-9]+)/g)).map((m) => m[1] ?? '');
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every alert maps to a known component', () => {
    const raw = readFileSync(join(ROOT, 'rules/budget-burn.yaml'), 'utf8');
    const labels = Array.from(raw.matchAll(/\bcomponent:\s*([a-z-]+)/g)).map((m) => m[1] ?? '');
    const allowed = ['api-gateway', 'realtime-gateway', 'editor', 'postgres'];
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(allowed, `unknown component "${l}"`).toContain(l);
    }
  });
});

describe('SLO on-call config', () => {
  it('declares apiVersion/kind/data structure', () => {
    const raw = readFileSync(join(ROOT, 'oncall.yaml'), 'utf8');
    expect(raw).toContain('apiVersion: v1');
    expect(raw).toContain('kind: ConfigMap');
    expect(raw).toContain('metadata:');
    expect(raw).toContain('  name: domio-oncall');
    expect(raw).toContain('data:');
    const blocks = extractDataBlocks(raw);
    expect(Object.keys(blocks).sort()).toEqual(
      ['budget_freeze', 'escalation', 'pager_routing', 'schedule'].sort(),
    );
    for (const [k, v] of Object.entries(blocks)) {
      expect(v.length, `block ${k} must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('rotation lists at least four distinct weeks', () => {
    const raw = readFileSync(join(ROOT, 'oncall.yaml'), 'utf8');
    const blocks = extractDataBlocks(raw);
    const weeks = Array.from((blocks['schedule'] ?? '').matchAll(/week:\s*(\d+)/g)).map(
      (m) => m[1],
    );
    expect(weeks.length, 'rotation needs at least 4 weeks').toBeGreaterThanOrEqual(4);
    expect(new Set(weeks).size, 'duplicate week numbers').toBe(weeks.length);
  });

  it('pager routing covers all four SLO components', () => {
    const raw = readFileSync(join(ROOT, 'oncall.yaml'), 'utf8');
    expect(raw).toContain('component: "api-gateway"');
    expect(raw).toContain('component: "realtime-gateway"');
    expect(raw).toContain('component: "editor"');
    expect(raw).toContain('component: "postgres"');
  });

  it('budget-freeze trigger references slo metric', () => {
    const raw = readFileSync(join(ROOT, 'oncall.yaml'), 'utf8');
    expect(raw).toContain('slo_budget_remaining_ratio');
    expect(raw).toContain('threshold: 0.0');
  });
});
