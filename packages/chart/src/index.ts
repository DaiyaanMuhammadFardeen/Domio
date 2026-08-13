/**
 * @domio/chart — Charts engine (SVG/Canvas2D/WebGL).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  ChartType,
  ColumnType,
  ColumnDef,
  Dataset,
  AxisRole,
  BindingColumn,
  BindingSchema,
  BindingValidationError,
  RenderBackend,
  Theme,
  RenderOptions,
  SvgElementKind,
  SvgElement,
  RenderResult,
  HitTarget,
  DrillResult,
  BrushRange,
} from './types.js';

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------
export {
  createElement,
  resetIdCounter,
  rect,
  text,
  line,
  polyline,
  group,
} from './render/element.js';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
export {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDate,
  formatBoolean,
  detectColumnType,
} from './render/formatter.js';

// ---------------------------------------------------------------------------
// Chart renderer
// ---------------------------------------------------------------------------
export { renderChart } from './render/chart-renderer.js';

// ---------------------------------------------------------------------------
// Renderer selection
// ---------------------------------------------------------------------------
export { selectRenderer, renderWithEscalation } from './select-renderer.js';

// ---------------------------------------------------------------------------
// Binding schema
// ---------------------------------------------------------------------------
export { requiredBindings, validateBinding, bindingCompatible } from './binding-schema.js';

// ---------------------------------------------------------------------------
// Individual chart renderers
// ---------------------------------------------------------------------------
export { renderBar } from './charts/bar.js';
export { renderLine } from './charts/line.js';
export { renderArea } from './charts/area.js';
export { renderPie } from './charts/pie.js';
export { renderScatter } from './charts/scatter.js';
export { renderFunnel } from './charts/funnel.js';
export { renderSankey } from './charts/sankey.js';
export { renderTreemap } from './charts/treemap.js';
export { renderHeatmap } from './charts/heatmap.js';
export { renderWaterfall } from './charts/waterfall.js';
export { renderGauge } from './charts/gauge.js';
export { renderRadar } from './charts/radar.js';
export { renderCandlestick } from './charts/candlestick.js';
export { renderBullet } from './charts/bullet.js';
export { renderEmptyState } from './charts/empty.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export { sortDataset } from './tables/sort.js';
export type { SortOptions } from './tables/sort.js';
export { paginate, firstPage, nextPage } from './tables/paginate.js';
export type { PageCursor, PageResult } from './tables/paginate.js';
export { formatCell } from './tables/format-cell.js';
export { applyConditionalFormat } from './tables/conditional-format.js';
export type { ConditionalFormatRule } from './tables/conditional-format.js';
export { sparkline } from './tables/sparkline.js';
export type { SparklineOptions } from './tables/sparkline.js';

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
export { hitTest, hitTestBar, hitTestPoint } from './interaction/hit-test.js';
export { drill, drillMultiple } from './interaction/drill.js';
export { toggleSeries, toggleElement, setAllVisible } from './interaction/toggle-series.js';
export { brushZoom, brushZoomByValue } from './interaction/brush-zoom.js';
