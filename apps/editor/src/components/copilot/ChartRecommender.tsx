/**
 * ChartRecommender — suggest 3 chart types for a selected data element.
 *
 * Per Wave 6 §S6.10 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Flow:
 *  1. A data element is selected in the canvas (passed via props).
 *  2. Click "Suggest chart types" → POST /v1/ai/chart/recommend.
 *  3. Render 3 options with rationale; "Apply" swaps the chart type.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '../../lib/locale';
import {
  recommendCharts,
  type ChartRecommendResponse,
  type ChartType,
} from '../../lib/search-service';

export interface ChartRecommenderProps {
  /** Element id of the selected data binding. */
  dataElementId: string;
  /** Optional inline data preview (columns + sample rows). */
  dataPreview?: {
    columns: ReadonlyArray<string>;
    rows: ReadonlyArray<ReadonlyArray<string | number>>;
  };
  /** Current chart type on the selected element. */
  currentChartType?: ChartType;
  /** Apply the chosen chart type to the selected element. */
  onApply: (chartType: ChartType) => void;
  /** Optional base URL for the AI service. */
  apiBaseUrl?: string;
}

const CHART_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  line: 'Line',
  pie: 'Pie',
  scatter: 'Scatter',
  area: 'Area',
  table: 'Table',
};

const OPTION_TESTID_PREFIX = 'p6-chart-option';

export function ChartRecommender({
  dataElementId,
  dataPreview,
  currentChartType,
  onApply,
  apiBaseUrl,
}: ChartRecommenderProps): ReactElement {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChartRecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await recommendCharts(
        {
          dataElementId,
          ...(dataPreview ? { dataPreview } : {}),
        },
        apiBaseUrl,
      );
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dataElementId, dataPreview, apiBaseUrl]);

  return (
    <div className="flex flex-col gap-3" data-testid="p6-chart-recommender">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-blue-400" />
        <span className="text-xs font-medium text-slate-200">
          {t('p6.copilot.chart.title')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSuggest()}
          disabled={busy}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
          data-testid="p6-chart-suggest-btn"
        >
          {busy ? t('p6.copilot.chart.suggesting') : t('p6.copilot.chart.suggestBtn')}
        </button>
        {currentChartType && (
          <span className="text-[11px] text-slate-500" data-testid="p6-chart-current">
            {t('p6.copilot.chart.current', { type: CHART_LABELS[currentChartType] })}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300" data-testid="p6-chart-error">
          {error}
        </div>
      )}

      {result && (
        <ul className="flex flex-col gap-2" data-testid="p6-chart-results">
          {result.recommendations.map((rec, i) => {
            const isCurrent = currentChartType === rec.chartType;
            return (
              <li
                key={`${rec.chartType}-${i}`}
                className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-2"
                data-testid={`${OPTION_TESTID_PREFIX}-${i}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
                      {CHART_LABELS[rec.chartType]}
                    </span>
                    <span className="text-[10px] text-slate-500" data-testid={`${OPTION_TESTID_PREFIX}-${i}-confidence`}>
                      {Math.round(rec.confidence * 100)}%
                    </span>
                    {isCurrent && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                        {t('p6.copilot.chart.currentTag')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onApply(rec.chartType)}
                    className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300 transition-colors hover:border-blue-400 hover:text-blue-200 disabled:opacity-40"
                    disabled={isCurrent}
                    data-testid={`${OPTION_TESTID_PREFIX}-${i}-apply`}
                  >
                    {isCurrent ? t('p6.copilot.chart.applied') : t('p6.copilot.chart.apply')}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-400" data-testid={`${OPTION_TESTID_PREFIX}-${i}-rationale`}>
                  {rec.rationale}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}