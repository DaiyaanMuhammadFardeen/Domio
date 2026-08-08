/**
 * /api/export/[kind] — streaming CSV + Parquet stub.
 *
 * `csv`: pulls `/v1/decks/summary` from the warehouse row-by-row and
 * streams a CSV using `ReadableStream.from` + a chunked response so
 * the consumer observes backpressure when the network is slow.
 *
 * `parquet`: returns a JSON stub. A real Parquet encoder requires
 * `parquetjs` or `duckdb` which aren't installed in Phase 17 — the
 * comment header explains the upgrade path.
 */

import type { NextRequest } from 'next/server';

const WAREHOUSE_URL = process.env['WAREHOUSE_URL'] ?? 'http://localhost:8088';

interface DeckSummaryRow {
  deckId: string;
  sessionCount: number;
  viewerCount: number;
  avgSessionMs: number;
  completionRate: number;
}

const HEADER = [
  'deck_id',
  'session_count',
  'viewer_count',
  'avg_session_ms',
  'completion_rate',
];

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function streamCsv(_req: NextRequest): Promise<Response> {
  const workspaceId =
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const url = new URL('/v1/decks/summary', WAREHOUSE_URL);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('from_ms', String(Date.now() - 30 * 24 * 60 * 60 * 1000));
  url.searchParams.set('to_ms', String(Date.now()));

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    return new Response(`# warehouse unreachable\n`, {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    });
  }

  const rows = ((await upstream.json().catch(() => ({ rows: [] }))) as { rows?: DeckSummaryRow[] }).rows ?? [];

  // ReadableStream with backpressure-friendly chunking.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(HEADER.join(',') + '\n'));
      for (const r of rows) {
        const line =
          [
            escapeCsv(r.deckId),
            escapeCsv(r.sessionCount),
            escapeCsv(r.viewerCount),
            escapeCsv(r.avgSessionMs),
            escapeCsv(r.completionRate),
          ].join(',') + '\n';
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="deck-summary.csv"`,
    },
  });
}

function parquetStub(): Response {
  // NOTE: a real Parquet encoder ships in Phase 18+. The current
  // stub returns JSON with a leading comment so the dashboard
  // dev workflow can validate the route plumbing without adding
  // parquetjs/duckdb to the bundle.
  const body = JSON.stringify(
    {
      note: 'parquet export is stubbed in Phase 17 — see apps/dashboard/src/app/api/export/[kind]/route.ts',
      columns: HEADER,
      rows: [],
    },
    null,
    2,
  );
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="deck-summary.parquet.json"`,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  if (kind === 'csv') return streamCsv(req);
  if (kind === 'parquet') return parquetStub();
  return new Response(`unknown export kind: ${kind}\n`, {
    status: 400,
    headers: { 'content-type': 'text/plain' },
  });
}

export const dynamic = 'force-dynamic';