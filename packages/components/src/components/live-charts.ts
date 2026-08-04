/**
 * Live Charts family — 14 chart types for Phase 08 live data binding.
 * Each def produces a valid scene-graph placeholder; actual rendering
 * happens via @domio/chart at bind time.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, line, fitText } from '../helpers.js';
import { tokensFor } from '../tokens.js';

const LIGHT_DARK = [
  { id: 'light', label: 'Light', theme: 'light' as const },
  { id: 'dark', label: 'Dark', theme: 'dark' as const },
];

// ---------------------------------------------------------------------------
// Shared prop fragments
// ---------------------------------------------------------------------------

const dataBindingProp: PropSchemaFragment = {
  type: 'object',
  title: 'Data binding',
  description: 'Connect this chart to a live data source.',
  default: { queryId: null, fieldMap: {}, listenToFilters: [] },
  'x-domio-prop': { category: 'Advanced', control: 'data-binding' as const },
};

const thresholdsProp: PropSchemaFragment = {
  type: 'array',
  title: 'Threshold rules',
  description: 'Conditional formatting rules based on data values.',
  minItems: 0,
  maxItems: 64,
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', default: '' },
      measure: { type: 'string', default: 'value' },
      comparator: { type: 'string', enum: ['lt', 'lte', 'gt', 'gte', 'eq', 'between', 'outside'], default: 'gt' },
      values: { type: 'array', items: { type: 'number' }, default: [0] },
      severity: { type: 'string', enum: ['info', 'warn', 'critical'], default: 'info' },
    },
  },
  default: [],
  'x-domio-prop': { category: 'Advanced', control: 'repeatable' as const },
};

const accentProp: PropSchemaFragment = {
  type: 'string',
  title: 'Accent',
  format: 'color',
  default: '#4F46E5',
  'x-domio-prop': { category: 'Style', control: 'color' },
};

// ---------------------------------------------------------------------------
// Placeholder builder — renders a mini chart preview
// ---------------------------------------------------------------------------

function placeholderBuilder(
  chartType: string,
  size: { w: number; h: number },
): DomioComponentDef['build'] {
  return (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, typeof props.accent === 'string' ? props.accent : undefined);
    const accent = typeof props.accent === 'string' ? props.accent : tokens.accent;
    const W = size.w;
    const H = size.h;
    const out: Element[] = [];

    // Background card
    out.push(rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 12, fill: tokens.background, stroke: tokens.border, strokeWidth: 1, semanticId: 'card' }));

    // Title bar
    out.push(text(ctx, { x: 16, y: 16, w: W - 32, h: 24, content: fitText(chartType, W - 32, 16), fontSize: 16, color: tokens.text, fontWeight: 600, semanticId: 'title' }));

    // Chart placeholder area
    const plotY = 56;
    const plotH = H - plotY - 48;
    out.push(rect(ctx, { x: 16, y: plotY, w: W - 32, h: plotH, radius: 8, fill: tokens.surface, semanticId: 'plot-area' }));

    // Mini sparkline/preview based on chart type
    const cx = 32;
    const cy = plotY + 16;
    const pw = W - 64;
    const ph = plotH - 32;

    // Simple preview: horizontal bars for bar, line for line/area, etc.
    if (chartType === 'Gauge') {
      // Arc preview
      const gaugeCx = W / 2;
      const gaugeCy = plotY + ph / 2 + 10;
      const R = Math.min(pw, ph) * 0.38;
      const angle = -Math.PI * 0.75;
      const endAngle = Math.PI * 0.75;
      const x1 = gaugeCx + R * Math.cos(angle);
      const y1 = gaugeCy + R * Math.sin(angle);
      const x2 = gaugeCx + R * Math.cos(endAngle);
      const y2 = gaugeCy + R * Math.sin(endAngle);
      out.push({
        id: ctx.id(), semanticId: ctx.semanticId('gauge-arc'), type: 'vector', name: 'gauge-arc',
        parentId: null, transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        paths: [`M ${x1} ${y1} A ${R} ${R} 0 1 1 ${x2} ${y2}`],
        stroke: { color: toRGBA(tokens.border), width: 3 },
      });
      out.push(text(ctx, { x: gaugeCx - 40, y: gaugeCy - 10, w: 80, h: 20, content: '—', fontSize: 18, color: tokens.muted, align: 'middle', fontWeight: 700, semanticId: 'gauge-value' }));
    } else if (chartType === 'Candlestick') {
      // Vertical lines with bodies
      const n = 8;
      const slot = pw / n;
      for (let i = 0; i < n; i++) {
        const x = cx + slot * i + slot / 2;
        const bodyH = ph * (0.2 + Math.abs(Math.sin(i * 1.7)) * 0.3);
        const bodyY = cy + (ph - bodyH) / 2;
        out.push(line(ctx, { x1: x, y1: cy, x2: x, y2: cy + ph, stroke: tokens.muted, strokeWidth: 1, semanticId: `wick_${i}` }));
        out.push(rect(ctx, { x: x - 8, y: bodyY, w: 16, h: bodyH, radius: 2, fill: i % 2 === 0 ? accent : '#EF4444', semanticId: `body_${i}` }));
      }
    } else if (['Pie', 'Radar'].includes(chartType)) {
      // Radial preview
      const rcx = W / 2;
      const rcy = plotY + ph / 2;
      const R = Math.min(pw, ph) * 0.35;
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const px = rcx + R * Math.cos(a);
        const py = rcy + R * Math.sin(a);
        out.push(line(ctx, { x1: rcx, y1: rcy, x2: px, y2: py, stroke: tokens.border, strokeWidth: 1, semanticId: `spoke_${i}` }));
      }
      out.push({
        id: ctx.id(), semanticId: ctx.semanticId('radial-ring'), type: 'vector', name: 'radial-ring',
        parentId: null, transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        paths: [`M ${rcx} ${rcy - R} A ${R} ${R} 0 1 1 ${rcx - 0.001} ${rcy - R} Z`],
        stroke: { color: toRGBA(accent), width: 2 },
        fill: { type: 'solid', color: { r: 0, g: 0, b: 0, a: 0 } },
      });
    } else if (chartType === 'Funnel' || chartType === 'Sankey' || chartType === 'Treemap') {
      // Block preview
      const blocks = [
        { w: pw * 0.9, label: 'Stage 1' },
        { w: pw * 0.7, label: 'Stage 2' },
        { w: pw * 0.5, label: 'Stage 3' },
        { w: pw * 0.3, label: 'Stage 4' },
      ];
      const bh = (ph - 12) / blocks.length;
      blocks.forEach((b, i) => {
        const bx = cx + (pw - b.w) / 2;
        const by = cy + i * (bh + 4);
        out.push(rect(ctx, { x: bx, y: by, w: b.w, h: bh - 4, radius: 4, fill: accent, opacity: 1 - i * 0.18, semanticId: `block_${i}` }));
        out.push(text(ctx, { x: bx + 8, y: by + 4, w: b.w - 16, h: bh - 12, content: fitText(b.label, b.w - 16, 12), fontSize: 12, color: tokens.background, fontWeight: 600, semanticId: `block_label_${i}` }));
      });
    } else if (chartType === 'Heatmap') {
      // Grid preview
      const cols = 8;
      const rows = 5;
      const cellW = pw / cols;
      const cellH = ph / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const intensity = Math.abs(Math.sin((r + 1) * (c + 1) * 0.5));
          out.push(rect(ctx, {
            x: cx + c * cellW + 1, y: cy + r * cellH + 1, w: cellW - 2, h: cellH - 2, radius: 3,
            fill: accent, opacity: 0.15 + intensity * 0.7,
            semanticId: `cell_${r}_${c}`,
          }));
        }
      }
    } else if (chartType === 'Waterfall') {
      // Floating bars
      const vals = [40, -15, 25, -10, 35];
      const barW = pw / (vals.length * 2);
      let accum = 0;
      vals.forEach((v, i) => {
        const x = cx + i * (barW * 2) + barW / 2;
        const top = v >= 0 ? accum : accum + v;
        const h = Math.abs(v) * ph * 0.008;
        const y = cy + ph * 0.5 - (top + h) * 0.5;
        out.push(rect(ctx, { x, y: y, w: barW, h: Math.max(h, 4), radius: 2, fill: v >= 0 ? accent : '#EF4444', semanticId: `wf_${i}` }));
        accum += v;
      });
    } else if (chartType === 'Bullet') {
      // Horizontal bar with marker
      const barH = 20;
      const midY = cy + ph / 2 - barH / 2;
      out.push(rect(ctx, { x: cx, y: midY, w: pw * 0.7, h: barH, radius: 4, fill: tokens.border, semanticId: 'bullet-bar' }));
      out.push(rect(ctx, { x: cx, y: midY, w: pw * 0.55, h: barH, radius: 4, fill: accent, opacity: 0.4, semanticId: 'bullet-fill' }));
      out.push(line(ctx, { x1: cx + pw * 0.65, y1: midY - 8, x2: cx + pw * 0.65, y2: midY + barH + 8, stroke: tokens.text, strokeWidth: 3, semanticId: 'bullet-marker' }));
    } else {
      // Default: sparkline preview for bar, line, area, scatter, waterfall
      const n = 10;
      const points = Array.from({ length: n }, (_, i) => ({
        x: cx + (pw / (n - 1)) * i,
        y: cy + ph * 0.2 + Math.abs(Math.sin(i * 0.8 + 0.5)) * ph * 0.6,
      }));

      if (chartType === 'Bar') {
        const barW = Math.min(36, (pw / n) * 0.6);
        points.forEach((p, i) => {
          const h = cy + ph - p.y;
          out.push(rect(ctx, { x: p.x - barW / 2, y: p.y, w: barW, h, radius: 3, fill: accent, opacity: 0.7, semanticId: `bar_${i}` }));
        });
      } else {
        if (chartType === 'Area') {
          const fillPoints = [{ x: points[0]!.x, y: cy + ph }, ...points, { x: points[n - 1]!.x, y: cy + ph }];
          const d = fillPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
          out.push({
            id: ctx.id(), semanticId: ctx.semanticId('area-fill'), type: 'vector', name: 'area-fill',
            parentId: null, transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
            paths: [d], fill: { type: 'solid', color: { ...toRGBA(accent), a: 0.15 } },
            stroke: { color: toRGBA(accent), width: 0 },
          });
        }
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        out.push({
          id: ctx.id(), semanticId: ctx.semanticId('line'), type: 'vector', name: 'line',
          parentId: null, transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
          paths: [d], stroke: { color: toRGBA(accent), width: 2 },
        });
        if (chartType === 'Scatter') {
          points.forEach((p, i) => {
            out.push({
              id: ctx.id(), semanticId: ctx.semanticId(`dot_${i}`), type: 'vector', name: `dot_${i}`,
              parentId: null, transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
              paths: [`M ${p.x} ${p.y - 4} A 4 4 0 1 1 ${p.x - 0.01} ${p.y - 4} Z`],
              fill: { type: 'solid', color: toRGBA(accent) },
              stroke: { color: toRGBA(tokens.background), width: 1.5 },
            });
          });
        }
      }
    }

    // Bottom label
    out.push(text(ctx, { x: 16, y: H - 36, w: W - 32, h: 20, content: `Live ${chartType} — bind a data source`, fontSize: 12, color: tokens.muted, align: 'middle', semanticId: 'placeholder-label' }));

    return out;
  };
}

function toRGBA(hex: string): { r: number; g: number; b: number; a: number } {
  let v = hex.replace('#', '');
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  const n = parseInt(v, 16);
  if (v.length === 8) {
    return { r: (n >> 24) & 0xff, g: (n >> 16) & 0xff, b: (n >> 8) & 0xff, a: (n & 0xff) / 255 };
  }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
}

// ---------------------------------------------------------------------------
// Per-type definitions
// ---------------------------------------------------------------------------

function makeLiveDef(type: string, label: string, description: string, size: { w: number; h: number }): DomioComponentDef {
  return {
    catalogId: `domio.live-${type}`,
    name: label,
    description,
    category: 'data',
    version: '1.0.0',
    variants: LIGHT_DARK,
    defaultVariant: 'light',
    size,
    propsSchema: {
      $id: `domio.live-${type}/props/1.0.0`,
      type: 'object',
      additionalProperties: false,
      properties: {
        accent: { ...accentProp },
        'x-domio:binding': { ...dataBindingProp },
        'x-domio:thresholds': { ...thresholdsProp },
      },
    },
    build: placeholderBuilder(label, size),
  };
}

export const LIVE_BAR = makeLiveDef('bar', 'Live Bar Chart', 'Bar chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_LINE = makeLiveDef('line', 'Live Line Chart', 'Line chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_AREA = makeLiveDef('area', 'Live Area Chart', 'Area chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_PIE = makeLiveDef('pie', 'Live Pie Chart', 'Pie chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_SCATTER = makeLiveDef('scatter', 'Live Scatter Plot', 'Scatter plot bound to a live data source.', { w: 640, h: 400 });
export const LIVE_FUNNEL = makeLiveDef('funnel', 'Live Funnel Chart', 'Funnel chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_SANKEY = makeLiveDef('sankey', 'Live Sankey Diagram', 'Sankey diagram bound to a live data source.', { w: 640, h: 400 });
export const LIVE_TREEMAP = makeLiveDef('treemap', 'Live Treemap', 'Treemap bound to a live data source.', { w: 640, h: 400 });
export const LIVE_HEATMAP = makeLiveDef('heatmap', 'Live Heatmap', 'Heatmap bound to a live data source.', { w: 640, h: 400 });
export const LIVE_WATERFALL = makeLiveDef('waterfall', 'Live Waterfall Chart', 'Waterfall chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_GAUGE = makeLiveDef('gauge', 'Live Gauge', 'Gauge bound to a live data source.', { w: 400, h: 320 });
export const LIVE_RADAR = makeLiveDef('radar', 'Live Radar Chart', 'Radar chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_CANDLESTICK = makeLiveDef('candlestick', 'Live Candlestick', 'Candlestick chart bound to a live data source.', { w: 640, h: 400 });
export const LIVE_BULLET = makeLiveDef('bullet', 'Live Bullet Chart', 'Bullet chart bound to a live data source.', { w: 640, h: 320 });

export const ALL_LIVE_CHARTS = [
  LIVE_BAR, LIVE_LINE, LIVE_AREA, LIVE_PIE, LIVE_SCATTER,
  LIVE_FUNNEL, LIVE_SANKEY, LIVE_TREEMAP, LIVE_HEATMAP, LIVE_WATERFALL,
  LIVE_GAUGE, LIVE_RADAR, LIVE_CANDLESTICK, LIVE_BULLET,
] as const;
