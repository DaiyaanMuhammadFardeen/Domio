/**
 * Core chart engine types.
 *
 * Chart types, binding schemas, datasets, render options, and validation.
 */

// ---------------------------------------------------------------------------
// Chart type union
// ---------------------------------------------------------------------------

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'scatter'
  | 'funnel'
  | 'sankey'
  | 'treemap'
  | 'heatmap'
  | 'waterfall'
  | 'gauge'
  | 'radar'
  | 'candlestick'
  | 'bullet';

// ---------------------------------------------------------------------------
// Dataset & columns
// ---------------------------------------------------------------------------

export type ColumnType = 'number' | 'string' | 'boolean' | 'date' | 'currency' | 'percent';

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

export interface Dataset {
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Binding schema
// ---------------------------------------------------------------------------

export type AxisRole = 'x' | 'y' | 'value' | 'label' | 'series' | 'color' | 'size' | 'tooltip';

export interface BindingColumn {
  role: AxisRole;
  column: string;
}

export interface BindingSchema {
  type: ChartType;
  columns: BindingColumn[];
}

export interface BindingValidationError {
  kind: 'missing_column' | 'type_mismatch';
  role: AxisRole;
  column?: string;
  expected?: ColumnType;
  actual?: ColumnType;
  message: string;
}

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

export type RenderBackend = 'svg' | 'canvas2d' | 'webgl';
export type Theme = 'light' | 'dark';

export interface RenderOptions {
  width: number;
  height: number;
  backend?: RenderBackend;
  theme?: Theme;
  showValues?: boolean;
  showLegend?: boolean;
  reducedMotion?: boolean;
  fontSize?: number;
  locale?: string;
}

// ---------------------------------------------------------------------------
// Render result
// ---------------------------------------------------------------------------

export type SvgElementKind =
  | 'rect'
  | 'text'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'path'
  | 'circle'
  | 'ellipse'
  | 'group';

export interface SvgElement {
  id: string;
  kind: SvgElementKind;
  semanticId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  visible?: boolean;
  points?: Array<{ x: number; y: number }>;
  d?: string;
  rx?: number;
  ry?: number;
  children?: SvgElement[];
}

export interface RenderResult {
  elements: SvgElement[];
  backend: RenderBackend;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Hit testing & interaction
// ---------------------------------------------------------------------------

export interface HitTarget {
  element: SvgElement;
  distance: number;
}

export interface DrillResult {
  dataset: Dataset;
  binding: BindingSchema;
}

export interface BrushRange {
  start: number;
  end: number;
}
