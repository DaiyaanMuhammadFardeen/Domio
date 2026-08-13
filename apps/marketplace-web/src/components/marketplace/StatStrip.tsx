/**
 * StatStrip — Wave 9 S9.9.
 *
 * A horizontal strip of 3-4 big stats (number + label). Used in the
 * "Become a creator" landing page hero.
 */

interface StatStripItem {
  readonly value: string;
  readonly label: string;
}

interface StatStripProps {
  readonly stats: ReadonlyArray<StatStripItem>;
  readonly className?: string;
}

export function StatStrip({ stats, className = '' }: StatStripProps) {
  if (stats.length === 0) return null;

  return (
    <div
      className={`grid grid-cols-1 gap-6 rounded-2xl border border-border bg-panel/60 px-6 py-8 sm:grid-cols-3 ${className}`}
      data-testid="stat-strip"
    >
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <p className="font-display text-3xl font-bold text-fg sm:text-4xl">{s.value}</p>
          <p className="mt-2 text-xs uppercase tracking-wider text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
