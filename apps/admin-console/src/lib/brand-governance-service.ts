/**
 * Brand governance service — Wave 8 §S8.2.
 *
 * Provides the org-wide on-brand score, 30-day trend, violation
 * report, per-deck enforcement status, and a CSV bulk import helper
 * for the `apps/admin-console` Brand governance dashboard.
 *
 * Backed by the marketplace service `/v1/admin/brand-governance`
 * endpoints (deferred). Until those land, deterministic seed data is
 * returned so the dashboard renders with realistic shape.
 */

import { fetcher } from './fetcher';

// ── Types ────────────────────────────────────────────────────────────────

export interface BrandScoreTrendPoint {
  readonly date: string;
  readonly score: number;
}

export type BrandViolationKind = 'off-brand-color' | 'forbidden-font' | 'logo-misuse';

export type BrandViolationSeverity = 'low' | 'medium' | 'high';

export interface BrandViolation {
  readonly id: string;
  readonly deck_id: string;
  readonly deck_title: string;
  readonly slide_index: number | null;
  readonly element_id: string | null;
  readonly kind: BrandViolationKind;
  readonly severity: BrandViolationSeverity;
}

export type BrandLockEnforcement = 'enforced' | 'warning' | 'off';

export interface BrandGovernanceSnapshot {
  readonly orgScore: number;
  readonly previousScore: number;
  readonly trend: ReadonlyArray<BrandScoreTrendPoint>;
  readonly violations: ReadonlyArray<BrandViolation>;
  readonly decksEnforced: number;
  readonly decksWarn: number;
  readonly decksOff: number;
}

// ── Seed ────────────────────────────────────────────────────────────────

const ORG_SCORE = 78;
const PREVIOUS_SCORE = 72;

function generateTrend(): ReadonlyArray<BrandScoreTrendPoint> {
  const points: BrandScoreTrendPoint[] = [];
  // 30 days of trend ending today (2026-08-13).
  const end = Date.UTC(2026, 7, 13);
  const day = 24 * 60 * 60 * 1000;
  // Anchor at previous score and walk upward to the current score.
  for (let i = 29; i >= 0; i -= 1) {
    const t = end - i * day;
    const iso = new Date(t).toISOString().slice(0, 10);
    // Smooth ramp from ~60 → 78 with mild wobble.
    const base = 60 + Math.round(((29 - i) / 29) * (ORG_SCORE - 60));
    const wobble = ((i * 7) % 5) - 2;
    const score = Math.max(0, Math.min(100, base + wobble));
    points.push({ date: iso, score });
  }
  return points;
}

const VIOLATIONS: ReadonlyArray<BrandViolation> = [
  {
    id: 'v-001',
    deck_id: 'd-acme-q3-pitch',
    deck_title: 'Acme Q3 Investor Pitch',
    slide_index: 4,
    element_id: 'el-slide4-chart',
    kind: 'off-brand-color',
    severity: 'high',
  },
  {
    id: 'v-002',
    deck_id: 'd-acme-q3-pitch',
    deck_title: 'Acme Q3 Investor Pitch',
    slide_index: 7,
    element_id: 'el-slide7-headline',
    kind: 'forbidden-font',
    severity: 'medium',
  },
  {
    id: 'v-003',
    deck_id: 'd-initech-launch',
    deck_title: 'Initech Product Launch',
    slide_index: 2,
    element_id: 'el-slide2-logo',
    kind: 'logo-misuse',
    severity: 'high',
  },
  {
    id: 'v-004',
    deck_id: 'd-initech-launch',
    deck_title: 'Initech Product Launch',
    slide_index: null,
    element_id: null,
    kind: 'off-brand-color',
    severity: 'low',
  },
  {
    id: 'v-005',
    deck_id: 'd-stark-deck',
    deck_title: 'Stark Industries Briefing',
    slide_index: 1,
    element_id: 'el-slide1-cover',
    kind: 'forbidden-font',
    severity: 'medium',
  },
  {
    id: 'v-006',
    deck_id: 'd-stark-deck',
    deck_title: 'Stark Industries Briefing',
    slide_index: 9,
    element_id: 'el-slide9-footer',
    kind: 'logo-misuse',
    severity: 'low',
  },
  {
    id: 'v-007',
    deck_id: 'd-cyberdyne-roadmap',
    deck_title: 'Cyberdyne 2026 Roadmap',
    slide_index: 3,
    element_id: 'el-slide3-callout',
    kind: 'off-brand-color',
    severity: 'medium',
  },
  {
    id: 'v-008',
    deck_id: 'd-cyberdyne-roadmap',
    deck_title: 'Cyberdyne 2026 Roadmap',
    slide_index: 12,
    element_id: 'el-slide12-cta',
    kind: 'forbidden-font',
    severity: 'high',
  },
  {
    id: 'v-009',
    deck_id: 'd-tyrell-overview',
    deck_title: 'Tyrell Corporation Overview',
    slide_index: 5,
    element_id: 'el-slide5-image',
    kind: 'logo-misuse',
    severity: 'medium',
  },
  {
    id: 'v-010',
    deck_id: 'd-tyrell-overview',
    deck_title: 'Tyrell Corporation Overview',
    slide_index: null,
    element_id: null,
    kind: 'off-brand-color',
    severity: 'low',
  },
  {
    id: 'v-011',
    deck_id: 'd-umbrella-handbook',
    deck_title: 'Umbrella Field Handbook',
    slide_index: 6,
    element_id: 'el-slide6-callout',
    kind: 'forbidden-font',
    severity: 'low',
  },
  {
    id: 'v-012',
    deck_id: 'd-soylent-proposal',
    deck_title: 'Soylent Strategic Proposal',
    slide_index: 2,
    element_id: 'el-slide2-cover',
    kind: 'logo-misuse',
    severity: 'high',
  },
];

// ── Snapshot ────────────────────────────────────────────────────────────

export async function getBrandGovernanceSnapshot(): Promise<BrandGovernanceSnapshot> {
  try {
    const json = await fetcher<BrandGovernanceSnapshot>('/v1/admin/brand-governance/snapshot');
    return json;
  } catch {
    // Backend endpoint deferred — return deterministic seed data.
    return {
      orgScore: ORG_SCORE,
      previousScore: PREVIOUS_SCORE,
      trend: generateTrend(),
      violations: VIOLATIONS,
      decksEnforced: 42,
      decksWarn: 11,
      decksOff: 7,
    };
  }
}

// ── Enforcement ─────────────────────────────────────────────────────────

export async function setBrandLockEnforcement(
  deckId: string,
  mode: BrandLockEnforcement,
): Promise<void> {
  try {
    await fetcher(`/v1/admin/brand-locks/${encodeURIComponent(deckId)}/enforcement`, {
      method: 'PUT',
      body: { mode },
    });
  } catch {
    // Backend deferred — no-op.
  }
}

// ── CSV bulk import ─────────────────────────────────────────────────────

export interface CsvImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: ReadonlyArray<{ row: number; reason: string }>;
}

/**
 * Parse a CSV file client-side, simulate a backend round-trip, and
 * return counts. The CSV is expected to have a header row:
 * `deck_id,mode,notes`.
 */
export async function importBrandLocksCSV(file: File): Promise<CsvImportResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const first = lines[0];
  if (first === undefined || lines.length === 0) {
    return { imported: 0, skipped: 0, errors: [{ row: 0, reason: 'Empty file' }] };
  }
  const header = first.split(',').map((c) => c.trim().toLowerCase());
  const deckIdx = header.indexOf('deck_id');
  const modeIdx = header.indexOf('mode');

  const errors: Array<{ row: number; reason: string }> = [];
  let imported = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    const cols = line.split(',').map((c) => c.trim());
    if (deckIdx < 0 || modeIdx < 0) {
      errors.push({ row: i, reason: 'Missing deck_id or mode column' });
      skipped += 1;
      continue;
    }
    const deckId = cols[deckIdx] ?? '';
    const mode = cols[modeIdx] ?? '';
    if (!deckId) {
      errors.push({ row: i, reason: 'Empty deck_id' });
      skipped += 1;
      continue;
    }
    if (mode !== 'enforced' && mode !== 'warning' && mode !== 'off') {
      errors.push({ row: i, reason: `Invalid mode "${mode}"` });
      skipped += 1;
      continue;
    }
    imported += 1;
  }

  // Simulate backend latency.
  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  try {
    await fetcher('/v1/admin/brand-locks/import', {
      method: 'POST',
      body: { imported, skipped, errors },
    });
  } catch {
    // Backend deferred — counts are returned regardless.
  }

  return { imported, skipped, errors };
}
