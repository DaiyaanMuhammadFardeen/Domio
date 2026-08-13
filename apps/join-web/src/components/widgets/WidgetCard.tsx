/**
 * Internal widget card chrome — shared by all 8 widget kinds.
 * Mobile-first: full-width card, padded.
 */

'use client';

import type React from 'react';

export interface WidgetCardProps {
  readonly label: string;
  readonly testIdPrefix: string;
  readonly children: React.ReactNode;
}

export function WidgetCard({ label, testIdPrefix, children }: WidgetCardProps) {
  return (
    <section
      className="bg-white rounded-lg shadow p-4 mb-3"
      data-testid={`${testIdPrefix}-card`}
    >
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}