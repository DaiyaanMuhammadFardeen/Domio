/**
 * Charts family — bar, line, donut, and quadrant charts built from data
 * arrays. All coordinates are computed in the component's local space.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, line, polyline, fitText, asNumber, asString, asBoolean, asArray, accentOf, clamp, round } from '../helpers.js';
import { tokensFor } from '../tokens.js';

const LIGHT_DARK = [
  { id: 'light', label: 'Light', theme: 'light' as const },
  { id: 'dark', label: 'Dark', theme: 'dark' as const },
];

const accentSchema: PropSchemaFragment = {
  type: 'string',
  title: 'Accent',
  format: 'color',
  default: '#4F46E5',
  'x-domio-prop': { category: 'Style', control: 'color' },
};

const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316'];

function datumList(value: unknown, fallback: Array<{ label: string; value: number }>): Array<{ label: string; value: number; color?: string }> {
  return asArray<Record<string, unknown>>(value, fallback as unknown as Record<string, unknown>[]).map((d) => ({
    label: typeof d.label === 'string' ? d.label : '',
    value: typeof d.value === 'number' ? d.value : 0,
    ...(typeof d.color === 'string' ? { color: d.color } : {}),
  }));
}

const dataProp: PropSchemaFragment = {
  type: 'array',
  title: 'Data',
  minItems: 1,
  maxItems: 12,
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'Label', default: 'Item' },
      value: { type: 'number', title: 'Value', default: 0 },
      color: { type: 'string', title: 'Color', format: 'color' },
    },
    required: ['label', 'value'],
  },
  default: [
    { label: 'Mon', value: 42 },
    { label: 'Tue', value: 68 },
    { label: 'Wed', value: 55 },
    { label: 'Thu', value: 91 },
    { label: 'Fri', value: 74 },
  ],
  'x-domio-prop': { category: 'Content', control: 'repeatable' },
};

export const BAR_CHART: DomioComponentDef = {
  catalogId: 'domio.bar-chart',
  name: 'Bar Chart',
  description: 'Vertical bars with optional value labels.',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 320 },
  propsSchema: {
    $id: 'domio.bar-chart/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    properties: {
      data: dataProp,
      accent: { ...accentSchema },
      showValues: { type: 'boolean', title: 'Show values', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      showGridlines: { type: 'boolean', title: 'Gridlines', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      maxValue: { type: 'number', title: 'Max value', default: 100, minimum: 1, 'x-domio-prop': { category: 'Layout', control: 'number' } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = typeof props.accent === 'string' ? props.accent : tokens.accent;
    const data = datumList(props.data, [
      { label: 'Mon', value: 42 },
      { label: 'Tue', value: 68 },
      { label: 'Wed', value: 55 },
      { label: 'Thu', value: 91 },
      { label: 'Fri', value: 74 },
    ]).slice(0, 12);
    const showValues = asBoolean(props.showValues, true);
    const showGridlines = asBoolean(props.showGridlines, true);
    const maxValue = Math.max(1, asNumber(props.maxValue, 100));

    const W = 640;
    const H = 320;
    const padL = 14;
    const padR = 14;
    const padT = 24;
    const padB = 40;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = data.length;
    const slot = plotW / n;
    const barW = Math.min(56, slot * 0.55);
    const out: Element[] = [];

    if (showGridlines) {
      for (let i = 0; i <= 4; i += 1) {
        const y = padT + (plotH / 4) * i;
        out.push(line(ctx, { x1: padL, y1: y, x2: W - padR, y2: y, stroke: tokens.border, strokeWidth: 1, semanticId: `grid_${i}`, dash: i === 0 ? undefined : '4 4' }));
      }
    }

    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = clamp((Math.abs(d.value) / maxValue) * plotH, 0, plotH);
      const y = padT + (plotH - h);
      const color = d.color ?? accent;
      out.push(rect(ctx, { x: cx - barW / 2, y, w: barW, h: h, radius: 4, fill: color, semanticId: `bar_${i}` }));
      out.push(text(ctx, { x: cx - slot / 2, y: H - 30, w: slot, h: 18, content: fitText(d.label, slot - 4, 13), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: `bar_label_${i}` }));
      if (showValues && h > 26) {
        out.push(text(ctx, { x: cx - 60, y: y - 22, w: 120, h: 16, content: String(round(d.value, 0)), fontSize: 13, color: tokens.text, align: 'middle', fontWeight: 600, semanticId: `bar_value_${i}` }));
      }
    });

    return out;
  },
};

export const LINE_CHART: DomioComponentDef = {
  catalogId: 'domio.line-chart',
  name: 'Line Chart',
  description: 'A time-series line with area fill.',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 320 },
  propsSchema: {
    $id: 'domio.line-chart/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    properties: {
      data: dataProp,
      accent: { ...accentSchema },
      fillArea: { type: 'boolean', title: 'Fill area', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      showPoints: { type: 'boolean', title: 'Show points', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      showGridlines: { type: 'boolean', title: 'Gridlines', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      maxValue: { type: 'number', title: 'Max value', default: 100, minimum: 1, 'x-domio-prop': { category: 'Layout', control: 'number' } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = typeof props.accent === 'string' ? props.accent : tokens.accent;
    const data = datumList(props.data, [
      { label: 'W1', value: 30 },
      { label: 'W2', value: 45 },
      { label: 'W3', value: 38 },
      { label: 'W4', value: 62 },
      { label: 'W5', value: 58 },
      { label: 'W6', value: 84 },
    ]).slice(0, 12);
    const fillArea = asBoolean(props.fillArea, true);
    const showPoints = asBoolean(props.showPoints, true);
    const showGridlines = asBoolean(props.showGridlines, true);
    const maxValue = Math.max(1, asNumber(props.maxValue, 100));

    const W = 640;
    const H = 320;
    const padL = 14;
    const padR = 14;
    const padT = 24;
    const padB = 40;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = data.length;
    const out: Element[] = [];

    if (showGridlines) {
      for (let i = 0; i <= 4; i += 1) {
        const y = padT + (plotH / 4) * i;
        out.push(line(ctx, { x1: padL, y1: y, x2: W - padR, y2: y, stroke: tokens.border, strokeWidth: 1, semanticId: `grid_${i}`, dash: i === 0 ? undefined : '4 4' }));
      }
    }

    if (n > 1) {
      const points = data.map((d, i) => ({
        x: padL + (plotW / (n - 1)) * i,
        y: padT + plotH - clamp((d.value / maxValue) * plotH, 0, plotH),
      }));
      if (fillArea) {
        const fillPoints = [
          { x: points[0]!.x, y: padT + plotH },
          ...points,
          { x: points[points.length - 1]!.x, y: padT + plotH },
        ];
        const fill = `rgba(${hexToRgb(accent).join(',')},0.15)`;
        out.push(polyline(ctx, { points: fillPoints, stroke: accent, strokeWidth: 0, fill, semanticId: 'area', closed: true }));
      }
      out.push(polyline(ctx, { points, stroke: accent, strokeWidth: 3, semanticId: 'line' }));
      if (showPoints) {
        points.forEach((p, i) => {
          out.push(rect(ctx, { x: p.x - 4, y: p.y - 4, w: 8, h: 8, radius: 4, fill: accent, semanticId: `point_${i}` }));
        });
      }
      data.forEach((d, i) => {
        const x = padL + (plotW / (n - 1)) * i;
        out.push(text(ctx, { x: Math.min(W - 80, Math.max(0, x - 40)), y: H - 30, w: 80, h: 18, content: fitText(d.label, 80, 13), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: `label_${i}` }));
      });
    }

    return out;
  },
};

export const DONUT_CHART: DomioComponentDef = {
  catalogId: 'domio.donut-chart',
  name: 'Donut Chart',
  description: 'Segmented donut with a center total and legend.',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 320 },
  propsSchema: {
    $id: 'domio.donut-chart/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['segments'],
    properties: {
      segments: {
        type: 'array',
        title: 'Segments',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', default: 'Segment' },
            value: { type: 'number', default: 1, minimum: 0 },
            color: { type: 'string', format: 'color' },
          },
          required: ['label', 'value'],
        },
        default: [
          { label: 'Product', value: 46, color: '#4F46E5' },
          { label: 'Marketing', value: 28, color: '#0EA5E9' },
          { label: 'Sales', value: 16, color: '#10B981' },
          { label: 'Other', value: 10, color: '#F59E0B' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      centerLabel: { type: 'string', title: 'Center label', default: 'Total', 'x-domio-prop': { category: 'Content' } },
      showLegend: { type: 'boolean', title: 'Show legend', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
      ringThickness: { type: 'number', title: 'Ring thickness', default: 44, minimum: 12, maximum: 90, 'x-domio-prop': { category: 'Layout', control: 'slider', step: 2 } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const raw = asArray<Record<string, unknown>>(props.segments, []);
    const segments = raw.slice(0, 8).map((s, i) => ({
      label: typeof s.label === 'string' ? s.label : 'Segment',
      value: Math.max(0, typeof s.value === 'number' ? s.value : 1),
      color: typeof s.color === 'string' ? s.color : PALETTE[i % PALETTE.length] ?? '#94A3B8',
    }));
    const centerLabel = asString(props.centerLabel, 'Total');
    const showLegend = asBoolean(props.showLegend, true);
    const ringThickness = clamp(asNumber(props.ringThickness, 44), 12, 90);
    const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

    const W = 640;
    const H = 320;
    const cx = showLegend ? 200 : W / 2;
    const cy = H / 2;
    const R = Math.min(H / 2 - 16, ringThickness * 2.4);
    const r = Math.max(6, R - ringThickness);
    const out: Element[] = [];

    let angle = -Math.PI / 2;
    segments.forEach((s, i) => {
      const sweep = (s.value / total) * Math.PI * 2;
      const largeArc = sweep > Math.PI ? 1 : 0;
      const x1 = cx + R * Math.cos(angle);
      const y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(angle + sweep);
      const y2 = cy + R * Math.sin(angle + sweep);
      const x3 = cx + r * Math.cos(angle + sweep);
      const y3 = cy + r * Math.sin(angle + sweep);
      const x4 = cx + r * Math.cos(angle);
      const y4 = cy + r * Math.sin(angle);
      const d = `M ${round(x1)} ${round(y1)} A ${R} ${R} 0 ${largeArc} 1 ${round(x2)} ${round(y2)} L ${round(x3)} ${round(y3)} A ${r} ${r} 0 ${largeArc} 0 ${round(x4)} ${round(y4)} Z`;
      out.push({
        id: ctx.id(),
        semanticId: ctx.semanticId(`segment_${i}`),
        type: 'vector',
        name: `segment_${i}`,
        parentId: null,
        transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
        paths: [d],
        fill: { type: 'solid', color: hexToRgba(s.color) },
      });
      angle += sweep;
    });

    out.push(text(ctx, { x: cx - 60, y: cy - 22, w: 120, h: 30, content: fitText(String(round(total, 0)), 120, 28), fontSize: 28, color: tokens.text, align: 'middle', fontWeight: 700, semanticId: 'total' }));
    out.push(text(ctx, { x: cx - 60, y: cy + 8, w: 120, h: 18, content: fitText(centerLabel, 120, 13), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: 'center_label' }));

    if (showLegend) {
      const legendX = 380;
      segments.forEach((s, i) => {
        const y = 84 + i * 44;
        out.push(rect(ctx, { x: legendX, y, w: 14, h: 14, radius: 4, fill: s.color, semanticId: `legend_swatch_${i}` }));
        out.push(text(ctx, { x: legendX + 24, y, w: 180, h: 16, content: fitText(s.label, 180, 14), fontSize: 14, color: tokens.text, fontWeight: 500, semanticId: `legend_label_${i}` }));
        out.push(text(ctx, { x: legendX + 190, y, w: 50, h: 16, content: `${round((s.value / total) * 100, 0)}%`, fontSize: 14, color: tokens.muted, align: 'end', semanticId: `legend_pct_${i}` }));
      });
    }

    return out;
  },
};

export const QUADRANT_CHART: DomioComponentDef = {
  catalogId: 'domio.quadrant-chart',
  name: 'Quadrant Chart',
  description: 'A 2×2 priority matrix (e.g. effort vs impact).',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 420 },
  propsSchema: {
    $id: 'domio.quadrant-chart/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    properties: {
      xAxis: { type: 'string', title: 'X axis', default: 'Effort →', 'x-domio-prop': { category: 'Content' } },
      yAxis: { type: 'string', title: 'Y axis', default: 'Impact ↑', 'x-domio-prop': { category: 'Content' } },
      quadrants: {
        type: 'array',
        title: 'Quadrants',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', default: 'Quadrant' },
            description: { type: 'string', default: '' },
            accent: { type: 'string', format: 'color' },
          },
          required: ['title'],
        },
        default: [
          { title: 'Quick wins', description: 'High impact, low effort', accent: '#10B981' },
          { title: 'Big bets', description: 'High impact, high effort', accent: '#4F46E5' },
          { title: 'Fill-ins', description: 'Low impact, low effort', accent: '#F59E0B' },
          { title: 'Reconsider', description: 'Low impact, high effort', accent: '#EF4444' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const quadrants = asArray<Record<string, unknown>>(props.quadrants, [])
      .slice(0, 4)
      .map((q, i) => ({
        title: typeof q.title === 'string' ? q.title : 'Quadrant',
        description: typeof q.description === 'string' ? q.description : '',
        accent: typeof q.accent === 'string' ? q.accent : PALETTE[i % PALETTE.length] ?? '#4F46E5',
      }));
    const W = 640;
    const H = 420;
    const pad = 24;
    const innerW = (W - pad * 2 - 16) / 2;
    const innerH = (H - pad * 2 - 48) / 2;
    const positions = [
      { x: pad, y: pad }, // top-left (quick wins)
      { x: pad + innerW + 16, y: pad }, // top-right
      { x: pad, y: pad + innerH + 16 }, // bottom-left
      { x: pad + innerW + 16, y: pad + innerH + 16 }, // bottom-right
    ];
    const out: Element[] = [];

    out.push(rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 16, fill: tokens.background, stroke: tokens.border, strokeWidth: 1, semanticId: 'card' }));

    quadrants.forEach((q, i) => {
      const p = positions[i]!;
      out.push(rect(ctx, { x: p.x, y: p.y, w: innerW, h: innerH, radius: 12, fill: tokens.surface, semanticId: `quad_bg_${i}` }));
      out.push(rect(ctx, { x: p.x, y: p.y, w: 5, h: innerH, radius: 3, fill: q.accent, semanticId: `quad_stripe_${i}` }));
      out.push(text(ctx, { x: p.x + 22, y: p.y + 20, w: innerW - 40, h: 24, content: fitText(q.title, innerW - 40, 18), fontSize: 18, color: tokens.text, fontWeight: 600, semanticId: `quad_title_${i}` }));
      out.push(text(ctx, { x: p.x + 22, y: p.y + 50, w: innerW - 40, h: 20, content: fitText(q.description, innerW - 40, 14), fontSize: 14, color: tokens.muted, semanticId: `quad_desc_${i}` }));
    });

    out.push(text(ctx, { x: pad, y: H - 20, w: W - pad * 2, h: 16, content: asString(props.xAxis, 'Effort →'), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: 'x_axis' }));
    out.push(text(ctx, { x: 4, y: pad - 10, w: W - 8, h: 18, content: asString(props.yAxis, 'Impact ↑'), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: 'y_axis' }));

    return out;
  },
};

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  const n = parseInt(value, 16);
  if (value.length === 8) {
    return { r: (n >> 24) & 0xff, g: (n >> 16) & 0xff, b: (n >> 8) & 0xff, a: (n & 0xff) / 255 };
  }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
}

function hexToRgb(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgba(hex);
  return [r, g, b];
}
