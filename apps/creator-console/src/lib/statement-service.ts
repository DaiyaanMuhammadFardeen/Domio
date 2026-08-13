/**
 * Statement service — creator-side earnings statements.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Extended in Wave 9 §S9.4 with full Statement primitives (line items,
 * generated/finalized/paid timestamps, draft/finalized/paid/disputed status)
 * and a deterministic seeded month-archive so the console renders six
 * historical months even when no upstream data is available.
 */

import { fetcher } from './fetcher';
import type { Statement, StatementLine, StatementStatus } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Wave 9 §S9.4 — Full Statement primitives.
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory store of statements for the current creator.
 * Each creatorId gets its own copy keyed by `creatorId`. The map is
 * populated lazily from `seedStatementsForCreator` and mutated by
 * `generateStatement` / `finalizeStatement`.
 */
const STATEMENT_STORE: Map<string, Statement[]> = new Map();

/** Stable hash so seeded values vary by creator. */
function hashSeed(...parts: ReadonlyArray<string>): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/** Linear-congruential generator seeded from `hashSeed(...)`. */
function makeRng(seed: number): () => number {
  let state = seed === 0 ? 0x9e3779b9 : seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function previousMonths(now: Date, count: number): string[] {
  const out: string[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}`);
  }
  return out;
}

function startOfMonthMs(period: string): number {
  const [y, m] = period.split('-').map((s) => Number(s));
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, 1);
}

function buildLines(creatorId: string, period: string): Statement['lines'] {
  const seed = hashSeed(creatorId, period, 'lines');
  const rng = makeRng(seed);
  const titles = [
    'Aurora Component Pack',
    'Nimbus Icon Set',
    'Pulse Theme Bundle',
    'Cobalt Template Kit',
    'Lumen Sticker Pack',
  ];
  const count = 3 + Math.floor(rng() * 3); // 3..5 lines
  const lines: StatementLine[] = [];
  for (let i = 0; i < count; i++) {
    const units = 8 + Math.floor(rng() * 90);
    const grossCents = units * (800 + Math.floor(rng() * 1200));
    const feesCents = Math.round(grossCents * (0.08 + rng() * 0.07));
    const refundsCents = rng() < 0.4 ? Math.round(grossCents * (rng() * 0.05)) : 0;
    const netCents = grossCents - feesCents - refundsCents;
    lines.push({
      listing_id: `lst_${period}_${i}`,
      listing_title: titles[i % titles.length] ?? `Listing ${i}`,
      units,
      gross_cents: grossCents,
      fees_cents: feesCents,
      refunds_cents: refundsCents,
      net_cents: netCents,
    });
  }
  return lines;
}

function sumLineTotals(
  lines: ReadonlyArray<{
    gross_cents: number;
    fees_cents: number;
    refunds_cents: number;
    net_cents: number;
  }>,
): { gross: number; fees: number; refunds: number; net: number } {
  let gross = 0;
  let fees = 0;
  let refunds = 0;
  let net = 0;
  for (const l of lines) {
    gross += l.gross_cents;
    fees += l.fees_cents;
    refunds += l.refunds_cents;
    net += l.net_cents;
  }
  return { gross, fees, refunds, net };
}

function seedStatementsForCreator(creatorId: string): Statement[] {
  const existing = STATEMENT_STORE.get(creatorId);
  if (existing) return existing;
  const now = new Date();
  const months = previousMonths(now, 6);
  const seeded: Statement[] = [];
  for (let i = 0; i < months.length; i++) {
    const period = months[i] ?? '';
    const lines = buildLines(creatorId, period);
    const totals = sumLineTotals(lines);
    const isMostRecent = i === months.length - 1;
    const isSecondMostRecent = i === months.length - 2;
    const status: StatementStatus = isMostRecent
      ? 'draft'
      : isSecondMostRecent
        ? 'finalized'
        : 'paid';
    const startMs = startOfMonthMs(period);
    seeded.push({
      id: `stmt_${creatorId}_${period}`,
      creator_id: creatorId,
      period_month: period,
      status,
      lines,
      gross_cents: totals.gross,
      fees_cents: totals.fees,
      refunds_cents: totals.refunds,
      net_cents: totals.net,
      currency: 'USD',
      generated_at_ms: status === 'draft' ? null : startMs + 25 * DAY_MS,
      finalized_at_ms: status === 'finalized' || status === 'paid' ? startMs + 26 * DAY_MS : null,
      paid_at_ms: status === 'paid' ? startMs + 28 * DAY_MS : null,
      pdf_url:
        status === 'finalized' || status === 'paid'
          ? `https://example.com/statements/${creatorId}/${period}.pdf`
          : null,
    });
  }
  STATEMENT_STORE.set(creatorId, seeded);
  return seeded;
}

export async function listStatements(creatorId: string): Promise<Statement[]> {
  try {
    const json = await fetcher<{ items?: Statement[] }>(
      API_BASE,
      `/v1/creator/statements/list?creator_id=${encodeURIComponent(creatorId)}`,
    );
    if (json.items && json.items.length > 0) return json.items;
  } catch {
    // fall through to seeded snapshot
  }
  return seedStatementsForCreator(creatorId);
}

export async function getStatement(id: string): Promise<Statement | null> {
  // id format: stmt_<creator>_<YYYY-MM>
  const parts = id.split('_');
  if (parts.length < 3 || parts[0] !== 'stmt') return null;
  const creatorId = parts[1] ?? '';
  const seeded = seedStatementsForCreator(creatorId);
  return seeded.find((s) => s.id === id) ?? null;
}

export async function generateStatement(
  creatorId: string,
  period_month: string,
): Promise<Statement> {
  const seeded = seedStatementsForCreator(creatorId);
  const lines = buildLines(creatorId, period_month);
  const totals = sumLineTotals(lines);
  const draft: Statement = {
    id: `stmt_${creatorId}_${period_month}`,
    creator_id: creatorId,
    period_month,
    status: 'draft',
    lines,
    gross_cents: totals.gross,
    fees_cents: totals.fees,
    refunds_cents: totals.refunds,
    net_cents: totals.net,
    currency: 'USD',
    generated_at_ms: null,
    finalized_at_ms: null,
    paid_at_ms: null,
    pdf_url: null,
  };
  // Replace any existing statement for that period.
  const idx = seeded.findIndex((s) => s.period_month === period_month);
  if (idx >= 0) seeded[idx] = draft;
  else seeded.push(draft);
  return draft;
}

export async function finalizeStatement(id: string): Promise<Statement> {
  const parts = id.split('_');
  if (parts.length < 3 || parts[0] !== 'stmt') {
    throw new Error(`Invalid statement id: ${id}`);
  }
  const creatorId = parts[1] ?? '';
  const seeded = seedStatementsForCreator(creatorId);
  const idx = seeded.findIndex((s) => s.id === id);
  if (idx < 0) {
    throw new Error(`Statement not found: ${id}`);
  }
  const current = seeded[idx] as Statement;
  const now = Date.now();
  const finalized: Statement = {
    ...current,
    status: 'finalized',
    generated_at_ms: current.generated_at_ms ?? now,
    finalized_at_ms: now,
    pdf_url:
      current.pdf_url ?? `https://example.com/statements/${creatorId}/${current.period_month}.pdf`,
  };
  seeded[idx] = finalized;
  return finalized;
}
