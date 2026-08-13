'use client';

import type { SentimentSeries, SentimentPoint } from '../lib/sentiment-service';

export interface SentimentTimelineProps {
  series: ReadonlyArray<SentimentSeries>;
}

/**
 * Tiny per-slide sentiment line chart. Each slide series is its
 * own polyline; x-axis is the daily bucket date, y-axis is the
 * sentiment score in [-1, 1]. Zero line is drawn as a dashed
 * gridline so positive vs. negative sentiment is visually obvious.
 *
 * Tailwind class names only — `domio/no-raw-hex` forbids hex in
 * JSX, and the chart sits inside a single overflow-auto card so
 * many series can scroll horizontally.
 */
export function SentimentTimeline({ series }: SentimentTimelineProps) {
  if (series.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
        data-testid="sentiment-empty"
        role="status"
      >
        No sentiment responses in this window.
      </div>
    );
  }

  const allDates = uniqueSortedDates(series);
  const W = Math.max(640, allDates.length * 64);
  const H = 220;
  const padL = 32;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Lines cycle through brand / emerald / amber / rose / violet so
  // we don't reach for raw hex.
  const PALETTE = [
    'stroke-brand-600',
    'stroke-emerald-600',
    'stroke-amber-600',
    'stroke-rose-600',
    'stroke-violet-600',
  ] as const;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="Sentiment timeline"
        data-testid="sentiment-chart"
      >
        {/* y axis: 1, 0, -1 */}
        <line
          x1={padL}
          y1={padT + plotH / 2}
          x2={W - padR}
          y2={padT + plotH / 2}
          className="stroke-slate-200"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={padL - 24} y={padT + 4} className="fill-slate-500 text-[10px]" fontSize={10}>
          1.0
        </text>
        <text
          x={padL - 24}
          y={padT + plotH / 2 + 4}
          className="fill-slate-500 text-[10px]"
          fontSize={10}
        >
          0
        </text>
        <text x={padL - 28} y={H - padB} className="fill-slate-500 text-[10px]" fontSize={10}>
          -1.0
        </text>

        {/* x axis labels */}
        {allDates.map((d, i) => {
          const x = padL + (plotW / Math.max(allDates.length - 1, 1)) * i;
          return (
            <text
              key={d}
              x={x}
              y={H - padB + 18}
              className="fill-slate-500 text-[10px]"
              fontSize={10}
              textAnchor="middle"
            >
              {shortDate(d)}
            </text>
          );
        })}

        {/* Series */}
        {series.map((s, i) => {
          const points = alignPoints(s.points, allDates);
          const step = plotW / Math.max(allDates.length - 1, 1);
          const coords = points.map((p, j) => {
            const x = padL + step * j;
            const y = padT + plotH - ((p?.score ?? 0) + 1) * (plotH / 2);
            return { x, y };
          });
          const dStr = coords
            .map((c, k) => `${k === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
            .join(' ');
          const stroke = PALETTE[i % PALETTE.length] ?? PALETTE[0];
          return (
            <g key={s.slideId} data-testid="sentiment-series" data-slide-id={s.slideId}>
              <path d={dStr} fill="none" className={stroke} strokeWidth={2} />
              {coords.map((c, k) => (
                <circle
                  key={k}
                  cx={c.x}
                  cy={c.y}
                  r={2.5}
                  className={stroke.replace('stroke', 'fill')}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-3 text-xs" data-testid="sentiment-legend">
        {series.map((s, i) => {
          const c = PALETTE[i % PALETTE.length] ?? PALETTE[0];
          return (
            <li key={s.slideId} className="flex items-center gap-1.5 text-slate-600">
              <span
                aria-hidden
                className={`inline-block h-2 w-4 rounded ${c.replace('stroke', 'bg')}`}
              />
              <span className="font-mono">{s.slideId}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function uniqueSortedDates(series: ReadonlyArray<SentimentSeries>): string[] {
  const set = new Set<string>();
  for (const s of series) for (const p of s.points) set.add(p.date);
  return [...set].sort();
}

function alignPoints(
  points: ReadonlyArray<SentimentPoint>,
  dates: ReadonlyArray<string>,
): Array<SentimentPoint | null> {
  const map = new Map(points.map((p) => [p.date, p]));
  return dates.map((d) => map.get(d) ?? null);
}

function shortDate(iso: string): string {
  // YYYY-MM-DD → M/D for compact axes.
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}
