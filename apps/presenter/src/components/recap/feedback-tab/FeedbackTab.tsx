/**
 * @domio/presenter — feedback tab inside recap.
 *
 * Phase 16 W9. Consumes @domio/feedback-collector aggregation and
 * shows NPS + star average + free-text count.
 */

'use client';

import { useEffect, useState } from 'react';

export interface FeedbackTabProps {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly fetcher?: (input: {
    workspace_id: string;
    session_id: string;
  }) => Promise<RecapAggregationView>;
}

export interface RecapAggregationView {
  nps_promoters: number;
  nps_passives: number;
  nps_detractors: number;
  star_average: number | null;
  free_text_count: number;
}

const DEFAULT_FETCHER: NonNullable<FeedbackTabProps['fetcher']> = async () => ({
  nps_promoters: 0,
  nps_passives: 0,
  nps_detractors: 0,
  star_average: null,
  free_text_count: 0,
});

export function FeedbackTab(props: FeedbackTabProps) {
  const fetcher: NonNullable<FeedbackTabProps['fetcher']> = props.fetcher ?? DEFAULT_FETCHER;
  const [data, setData] = useState<RecapAggregationView | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetcher({ workspace_id: props.workspace_id, session_id: props.session_id }).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, props.workspace_id, props.session_id]);

  if (!data) return <p className="text-sm text-slate-500">Loading feedback…</p>;
  const total = data.nps_promoters + data.nps_passives + data.nps_detractors;
  const nps =
    total === 0 ? 0 : Math.round(((data.nps_promoters - data.nps_detractors) / total) * 100);

  return (
    <section className="rounded border bg-white p-4" data-testid="recap-feedback-tab">
      <h2 className="font-semibold mb-3">Audience feedback</h2>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-slate-500">NPS</div>
          <div className="text-2xl font-semibold">{nps}</div>
          <div className="text-xs text-slate-500">
            {data.nps_promoters} promoters · {data.nps_passives} passives · {data.nps_detractors}{' '}
            detractors
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Star average</div>
          <div className="text-2xl font-semibold">
            {typeof data.star_average === 'number' ? data.star_average.toFixed(2) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Free-text responses</div>
          <div className="text-2xl font-semibold">{data.free_text_count}</div>
        </div>
      </div>
    </section>
  );
}
