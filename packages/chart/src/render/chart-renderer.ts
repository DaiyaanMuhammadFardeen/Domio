/**
 * Main chart renderer — dispatches to specific chart type renderers.
 */

import type {
  ChartType,
  Dataset,
  BindingSchema,
  RenderOptions,
  RenderResult,
  RenderBackend,
  SvgElement,
} from '../types.js';
import { renderBar } from '../charts/bar.js';
import { renderLine } from '../charts/line.js';
import { renderArea } from '../charts/area.js';
import { renderPie } from '../charts/pie.js';
import { renderScatter } from '../charts/scatter.js';
import { renderFunnel } from '../charts/funnel.js';
import { renderSankey } from '../charts/sankey.js';
import { renderTreemap } from '../charts/treemap.js';
import { renderHeatmap } from '../charts/heatmap.js';
import { renderWaterfall } from '../charts/waterfall.js';
import { renderGauge } from '../charts/gauge.js';
import { renderRadar } from '../charts/radar.js';
import { renderCandlestick } from '../charts/candlestick.js';
import { renderBullet } from '../charts/bullet.js';
import { renderEmptyState } from '../charts/empty.js';
import { selectRenderer } from '../select-renderer.js';

type ChartRenderer = (
  dataset: Dataset,
  opts: RenderOptions,
  binding: BindingSchema,
) => SvgElement[];

const RENDERERS: Partial<Record<ChartType, ChartRenderer>> = {
  bar: renderBar,
  line: renderLine,
  area: renderArea,
  pie: renderPie,
  scatter: renderScatter,
  funnel: renderFunnel,
  sankey: renderSankey,
  treemap: renderTreemap,
  heatmap: renderHeatmap,
  waterfall: renderWaterfall,
  gauge: renderGauge,
  radar: renderRadar,
  candlestick: renderCandlestick,
  bullet: renderBullet,
};

/**
 * Render a chart from a dataset and binding schema.
 * Returns a RenderResult with elements and metadata.
 */
export function renderChart(
  chartType: ChartType,
  dataset: Dataset,
  binding: BindingSchema,
  opts: RenderOptions,
): RenderResult {
  const width = opts.width;
  const height = opts.height;

  // Empty dataset → empty state
  if (dataset.rows.length === 0) {
    const elements = renderEmptyState(opts);
    return {
      elements,
      backend: 'svg',
      width,
      height,
    };
  }

  // Select backend based on data volume
  const pointCount = dataset.rows.length;
  const backend: RenderBackend = opts.backend ?? selectRenderer(pointCount);

  // Dispatch to specific renderer
  const renderer = RENDERERS[chartType];
  let elements: SvgElement[];

  if (renderer) {
    elements = renderer(dataset, opts, binding);
  } else {
    // Fallback: render as bar
    elements = renderBar(dataset, opts, binding);
  }

  return {
    elements,
    backend,
    width,
    height,
  };
}
