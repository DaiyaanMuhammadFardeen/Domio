/**
 * Statistics family — stat cards, KPI rows, metric heroes, progress cards.
 */

import type { Element } from '@domio/schema';
import type { DomioPropsSchema, PropSchemaFragment } from '@domio/schema-prop';
import type { BuildContext, DomioComponentDef } from '../types.js';
import { rect, text, fitText, asNumber, asString, asBoolean, asArray, clamp, round } from '../helpers.js';
import { tokensFor, type VariantTokens } from '../tokens.js';

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

function accentOf(props: Record<string, unknown>): string | undefined {
  return typeof props.accent === 'string' ? props.accent : undefined;
}

function tokenFor(ctx: BuildContext, accent?: string): VariantTokens {
  return tokensFor(ctx.variantId, accent);
}

interface StatCardProps {
  value?: unknown;
  label?: unknown;
  unit?: unknown;
  accent?: unknown;
  showDelta?: unknown;
  deltaValue?: unknown;
  showIcon?: unknown;
}

function statCardBody(ctx: BuildContext, tokens: VariantTokens, p: StatCardProps): Element[] {
  const accent = asString(p.accent, tokens.accent);
  const label = asString(p.label, 'Metric');
  const unit = asString(p.unit, '');
  const showDelta = asBoolean(p.showDelta, true);
  const deltaValue = asNumber(p.deltaValue, 12);
  const showIcon = asBoolean(p.showIcon, true);
  const value = typeof p.value === 'number' ? p.value : asNumber(p.value, 42);

  const W = 320;
  const H = 160;
  const out: Element[] = [];

  out.push(rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 16, fill: tokens.background, stroke: tokens.border, strokeWidth: 1, semanticId: 'card' }));

  // Accent top bar.
  out.push(rect(ctx, { x: 0, y: 0, w: 6, h: H, radius: 3, fill: accent, semanticId: 'accent_bar' }));

  if (showIcon) {
    // Decorative accent chip with a glyph-like path (rounded square + dot).
    out.push(rect(ctx, { x: 22, y: 22, w: 34, h: 34, radius: 10, fill: accent, semanticId: 'icon_chip' }));
    out.push(rect(ctx, { x: 34, y: 34, w: 10, h: 10, radius: 3, fill: '#FFFFFF', semanticId: 'icon_dot' }));
  }

  const labelY = showIcon ? 72 : 42;
  out.push(text(ctx, { x: 22, y: labelY, w: W - 44, h: 22, content: fitText(label.toUpperCase(), W - 44, 13), fontSize: 13, color: tokens.muted, fontWeight: 600, letterSpacing: 1.2, semanticId: 'label' }));

  const valueText = `${value}${unit}`;
  out.push(text(ctx, { x: 22, y: labelY + 30, w: W - 44, h: 48, content: fitText(valueText, W - 44, 40), fontSize: 40, color: tokens.text, fontWeight: 700, semanticId: 'value' }));

  if (showDelta) {
    const positive = deltaValue >= 0;
    const deltaColor = positive ? '#16A34A' : '#DC2626';
    const arrow = positive ? '↑' : '↓';
    const deltaText = `${arrow} ${Math.abs(deltaValue)}%`;
    out.push(text(ctx, { x: 22, y: H - 34, w: 120, h: 20, content: deltaText, fontSize: 14, color: deltaColor, fontWeight: 600, semanticId: 'delta' }));
    out.push(text(ctx, { x: 110, y: H - 34, w: W - 150, h: 20, content: 'vs last period', fontSize: 13, color: tokens.muted, semanticId: 'delta_caption' }));
  }

  return out;
}

const statCardProps: DomioPropsSchema = {
  $id: 'domio.stat-card/props/1.0.0',
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: {
    value: { type: 'number', title: 'Value', minimum: 0, default: 42, 'x-domio-prop': { category: 'Content', control: 'number' } },
    label: { type: 'string', title: 'Label', default: 'Revenue', maxLength: 40, 'x-domio-prop': { category: 'Content' } },
    unit: { type: 'string', title: 'Unit', enum: ['', 'k', 'M', 'B', '%', '$'], default: '', 'x-domio-prop': { category: 'Content' } },
    accent: { ...accentSchema },
    showDelta: { type: 'boolean', title: 'Show delta', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
    deltaValue: { type: 'number', title: 'Delta %', default: 12, 'x-domio-prop': { category: 'Behavior', control: 'stepper', step: 1 } },
    showIcon: { type: 'boolean', title: 'Show icon chip', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
  },
};

export const STAT_CARD: DomioComponentDef = {
  catalogId: 'domio.stat-card',
  name: 'Stat Card',
  description: 'A single key metric with label, unit, and delta.',
  category: 'statistics',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 320, h: 160 },
  propsSchema: statCardProps,
  build: (props, ctx) => statCardBody(ctx, tokenFor(ctx, accentOf(props)), props),
};

export const KPI_TRIO: DomioComponentDef = {
  catalogId: 'domio.kpi-trio',
  name: 'KPI Trio',
  description: 'Three stat cards in a row — a compact KPI dashboard band.',
  category: 'statistics',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 160 },
  propsSchema: {
    $id: 'domio.kpi-trio/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['stats'],
    properties: {
      stats: {
        type: 'array',
        title: 'Stats',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', default: 'Metric' },
            value: { type: 'number', default: 0 },
            unit: { type: 'string', enum: ['', 'k', 'M', 'B', '%', '$'], default: '' },
            accent: { type: 'string', format: 'color', default: '#4F46E5' },
          },
          required: ['label', 'value'],
        },
        default: [
          { label: 'Revenue', value: 128, unit: 'k', accent: '#4F46E5' },
          { label: 'Customers', value: 2400, unit: '', accent: '#0EA5E9' },
          { label: 'NPS', value: 72, unit: '', accent: '#10B981' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      gap: { type: 'number', title: 'Gap', default: 16, minimum: 4, maximum: 48, 'x-domio-prop': { category: 'Layout', control: 'stepper', step: 4 } },
    },
  },
  build: (props, ctx) => {
    const gap = asNumber(props.gap, 16);
    const stats = asArray<Record<string, unknown>>(props.stats, []);
    const count = clamp(stats.length, 1, 6);
    const cardW = (960 - gap * (count - 1)) / count;
    const out: Element[] = [];
    stats.slice(0, count).forEach((stat, i) => {
      const x = i * (cardW + gap);
      const innerCtx: BuildContext = { ...ctx, id: ctx.id, semanticId: (role) => ctx.semanticId(`stat${i + 1}.${role}`) };
      const body = statCardBody(
        innerCtx,
        tokenFor(ctx, accentOf(stat)),
        {
          value: stat.value,
          label: stat.label,
          unit: stat.unit,
          accent: stat.accent,
          showDelta: false,
          showIcon: i % 2 === 0,
        },
      );
      out.push(
        ...body.map((el) => ({
          ...el,
          transform: {
            ...el.transform,
            x: x + (el.transform?.x ?? 0) * (cardW / 320),
            w: (el.transform?.w ?? 0) * (cardW / 320),
          } as NonNullable<typeof el.transform>,
        })),
      );
    });
    return out;
  },
};

export const METRIC_HERO: DomioComponentDef = {
  catalogId: 'domio.metric-hero',
  name: 'Metric Hero',
  description: 'A large hero number for a title slide or section intro.',
  category: 'statistics',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'dark',
  size: { w: 720, h: 240 },
  propsSchema: {
    $id: 'domio.metric-hero/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['value'],
    properties: {
      value: { type: 'number', title: 'Value', default: 98, 'x-domio-prop': { category: 'Content', control: 'number' } },
      unit: { type: 'string', title: 'Unit', default: '%', enum: ['', 'k', 'M', '%', '$', 'x'], 'x-domio-prop': { category: 'Content' } },
      caption: { type: 'string', title: 'Caption', default: 'of teams hit their quarterly target', maxLength: 80, 'x-domio-prop': { category: 'Content' } },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokenFor(ctx, accentOf(props));
    const value = asNumber(props.value, 98);
    const unit = asString(props.unit, '%');
    const caption = asString(props.caption, 'of teams hit their quarterly target');
    const W = 720;
    const H = 240;
    return [
      rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 24, fill: tokens.background, semanticId: 'hero' }),
      rect(ctx, { x: 0, y: H - 8, w: 120, h: 8, radius: 4, fill: tokens.accent, semanticId: 'accent_underline' }),
      text(ctx, {
        x: 48, y: 40, w: W - 96, h: 100,
        content: fitText(`${value}${unit}`, W - 96, 84),
        fontSize: 84, color: tokens.text, fontWeight: 800, semanticId: 'value',
      }),
      text(ctx, {
        x: 48, y: 148, w: W - 96, h: 64,
        content: fitText(caption, W - 96, 26),
        fontSize: 26, color: tokens.muted, fontWeight: 500, semanticId: 'caption',
      }),
    ];
  },
};

export const PROGRESS_CARD: DomioComponentDef = {
  catalogId: 'domio.progress-card',
  name: 'Progress Card',
  description: 'A goal progress bar with percentage and target label.',
  category: 'statistics',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 320, h: 140 },
  propsSchema: {
    $id: 'domio.progress-card/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['percent'],
    properties: {
      percent: { type: 'number', title: 'Percent', minimum: 0, maximum: 100, default: 64, 'x-domio-prop': { category: 'Content', control: 'slider', step: 1 } },
      label: { type: 'string', title: 'Label', default: 'Q3 target', 'x-domio-prop': { category: 'Content' } },
      sublabel: { type: 'string', title: 'Sublabel', default: 'of goal achieved', 'x-domio-prop': { category: 'Content' } },
      accent: { ...accentSchema },
      showLabel: { type: 'boolean', title: 'Show value', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokenFor(ctx, accentOf(props));
    const percent = clamp(asNumber(props.percent, 64), 0, 100);
    const label = asString(props.label, 'Q3 target');
    const sublabel = asString(props.sublabel, 'of goal achieved');
    const showLabel = asBoolean(props.showLabel, true);
    const W = 320;
    const H = 140;
    const barY = 78;
    return [
      rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 16, fill: tokens.background, stroke: tokens.border, strokeWidth: 1, semanticId: 'card' }),
      text(ctx, { x: 22, y: 22, w: W - 44, h: 22, content: fitText(label, W - 44, 16), fontSize: 16, color: tokens.text, fontWeight: 600, semanticId: 'label' }),
      text(ctx, { x: 22, y: 44, w: W - 44, h: 18, content: fitText(sublabel, W - 44, 13), fontSize: 13, color: tokens.muted, semanticId: 'sublabel' }),
      rect(ctx, { x: 22, y: barY, w: W - 44, h: 12, radius: 6, fill: tokens.surface, semanticId: 'track' }),
      rect(ctx, { x: 22, y: barY, w: Math.max(8, (W - 44) * (percent / 100)), h: 12, radius: 6, fill: tokens.accent, semanticId: 'fill' }),
      ...(showLabel
        ? [text(ctx, { x: 22, y: barY + 26, w: W - 44, h: 20, content: `${round(percent, 0)}%`, fontSize: 20, color: tokens.text, fontWeight: 700, semanticId: 'percent' })]
        : []),
    ];
  },
};
