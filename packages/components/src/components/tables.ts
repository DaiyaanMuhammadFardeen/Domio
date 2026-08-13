/**
 * Tables & process family — comparison tables, data tables, roadmaps,
 * and timelines.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, line, fitText, asBoolean, asArray, accentOf, clamp } from '../helpers.js';
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

export const COMPARISON_TABLE: DomioComponentDef = {
  catalogId: 'domio.comparison-table',
  name: 'Comparison Table',
  description: 'Feature-by-feature comparison across options.',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 720, h: 360 },
  propsSchema: {
    $id: 'domio.comparison-table/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['columns', 'rows'],
    properties: {
      columns: {
        type: 'array',
        title: 'Columns',
        minItems: 2,
        maxItems: 5,
        items: { type: 'string' },
        default: ['Feature', 'Option A', 'Option B', 'Option C'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      rows: {
        type: 'array',
        title: 'Rows',
        minItems: 1,
        maxItems: 8,
        items: { type: 'array', items: { type: 'string' } },
        default: [
          ['Pricing', 'Free', '$12/mo', '$29/mo'],
          ['Integrations', '—', '12', '40+'],
          ['Support', 'Community', 'Email', 'Priority'],
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
      highlightColumn: {
        type: 'integer',
        title: 'Highlight column',
        default: 2,
        minimum: 0,
        maximum: 4,
        'x-domio-prop': { category: 'Style', control: 'stepper', step: 1 },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const columns = asArray<string>(props.columns, [
      'Feature',
      'Option A',
      'Option B',
      'Option C',
    ]).slice(0, 5);
    const rows = asArray<unknown[]>(props.rows, []).slice(0, 8);
    const highlight = clamp(
      typeof props.highlightColumn === 'number' ? props.highlightColumn : 2,
      0,
      columns.length - 1,
    );

    const W = 720;
    const H = 360;
    const headerH = 44;
    const rowH = Math.min((H - headerH) / Math.max(1, rows.length), 64);
    const colW = W / columns.length;
    const out: Element[] = [];

    columns.forEach((col, i) => {
      const x = i * colW;
      const isHighlight = i === highlight;
      out.push(
        rect(ctx, {
          x,
          y: 0,
          w: colW,
          h: headerH,
          fill: isHighlight ? accent : tokens.surface,
          semanticId: `header_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 12,
          y: (headerH - 16) / 2,
          w: colW - 24,
          h: 16,
          content: fitText(col, colW - 24, 13),
          fontSize: 13,
          color: isHighlight ? '#FFFFFF' : tokens.text,
          fontWeight: 600,
          semanticId: `header_text_${i}`,
        }),
      );
    });

    rows.forEach((row, r) => {
      const y = headerH + r * rowH;
      columns.forEach((_, c) => {
        const x = c * colW;
        const value = typeof row[c] === 'string' ? (row[c] as string) : '';
        const isFirst = c === 0;
        const isHighlight = c === highlight;
        out.push(
          text(ctx, {
            x: x + 12,
            y: y + (rowH - 15) / 2,
            w: colW - 24,
            h: 15,
            content: fitText(value, colW - 24, 13),
            fontSize: 13,
            color: isHighlight ? accent : isFirst ? tokens.text : tokens.muted,
            fontWeight: isFirst ? 600 : 400,
            semanticId: `cell_${r}_${c}`,
          }),
        );
      });
      out.push(
        line(ctx, {
          x1: 0,
          y1: y + rowH,
          x2: W,
          y2: y + rowH,
          stroke: tokens.border,
          strokeWidth: 1,
          semanticId: `row_line_${r}`,
        }),
      );
    });

    return out;
  },
};

export const DATA_TABLE: DomioComponentDef = {
  catalogId: 'domio.data-table',
  name: 'Data Table',
  description: 'A clean header row with aligned data rows.',
  category: 'data',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 720, h: 360 },
  propsSchema: {
    $id: 'domio.data-table/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['headers', 'rows'],
    properties: {
      headers: {
        type: 'array',
        title: 'Headers',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string' },
        default: ['Name', 'Region', 'Revenue', 'Growth'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      rows: {
        type: 'array',
        title: 'Rows',
        minItems: 1,
        maxItems: 8,
        items: { type: 'array', items: { type: 'string' } },
        default: [
          ['Acme Corp', 'EMEA', '$2.4M', '+18%'],
          ['Northwind', 'AMER', '$1.9M', '+9%'],
          ['Globex', 'APAC', '$1.2M', '+27%'],
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      zebra: {
        type: 'boolean',
        title: 'Zebra stripes',
        default: true,
        'x-domio-prop': { category: 'Style', control: 'toggle' },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const headers = asArray<string>(props.headers, ['Name', 'Region', 'Revenue', 'Growth']).slice(
      0,
      6,
    );
    const rows = asArray<unknown[]>(props.rows, []).slice(0, 8);
    const zebra = asBoolean(props.zebra, true);

    const W = 720;
    const H = 360;
    const headerH = 40;
    const rowH = Math.min((H - headerH) / Math.max(1, rows.length), 56);
    const colW = W / headers.length;
    const out: Element[] = [];

    out.push(
      rect(ctx, { x: 0, y: 0, w: W, h: headerH, fill: tokens.surface, semanticId: 'header_bg' }),
    );
    headers.forEach((h, i) => {
      const x = i * colW;
      out.push(
        text(ctx, {
          x: x + 14,
          y: (headerH - 15) / 2,
          w: colW - 28,
          h: 15,
          content: fitText(h.toUpperCase(), colW - 28, 12),
          fontSize: 12,
          color: tokens.muted,
          fontWeight: 600,
          letterSpacing: 0.8,
          semanticId: `header_${i}`,
        }),
      );
    });

    rows.forEach((row, r) => {
      const y = headerH + r * rowH;
      if (zebra && r % 2 === 1) {
        out.push(
          rect(ctx, { x: 0, y, w: W, h: rowH, fill: tokens.surface, semanticId: `stripe_${r}` }),
        );
      }
      headers.forEach((_, c) => {
        const x = c * colW;
        const value = typeof row[c] === 'string' ? (row[c] as string) : '';
        out.push(
          text(ctx, {
            x: x + 14,
            y: y + (rowH - 15) / 2,
            w: colW - 28,
            h: 15,
            content: fitText(value, colW - 28, 13),
            fontSize: 13,
            color: c === 0 ? tokens.text : tokens.muted,
            fontWeight: c === 0 ? 600 : 400,
            semanticId: `cell_${r}_${c}`,
          }),
        );
      });
    });

    return out;
  },
};

export const ROADMAP: DomioComponentDef = {
  catalogId: 'domio.roadmap',
  name: 'Roadmap',
  description: 'A horizontal phase roadmap with milestones.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 200 },
  propsSchema: {
    $id: 'domio.roadmap/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['phases'],
    properties: {
      phases: {
        type: 'array',
        title: 'Phases',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', default: 'Phase' },
            timeframe: { type: 'string', default: 'Q1' },
            status: {
              type: 'string',
              enum: ['planned', 'in-progress', 'done'],
              default: 'planned',
            },
          },
          required: ['name'],
        },
        default: [
          { name: 'Research', timeframe: 'Q1', status: 'done' },
          { name: 'Prototype', timeframe: 'Q2', status: 'in-progress' },
          { name: 'Launch', timeframe: 'Q3', status: 'planned' },
          { name: 'Scale', timeframe: 'Q4', status: 'planned' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const phases = asArray<Record<string, unknown>>(props.phases, []).slice(0, 6);

    const W = 960;
    const n = phases.length;
    const slot = W / n;
    const lineY = 76;
    const statusColor: Record<string, string> = {
      done: accent,
      'in-progress': '#F59E0B',
      planned: tokens.muted,
    };
    const out: Element[] = [];

    out.push(
      line(ctx, {
        x1: 0,
        y1: lineY,
        x2: W,
        y2: lineY,
        stroke: tokens.border,
        strokeWidth: 2,
        semanticId: 'track',
      }),
    );

    phases.forEach((ph, i) => {
      const cx = slot * i + slot / 2;
      const status = typeof ph.status === 'string' ? ph.status : 'planned';
      const color = statusColor[status] ?? tokens.muted;
      const radius = status === 'in-progress' ? 10 : 7;
      out.push(
        rect(ctx, {
          x: cx - radius,
          y: lineY - radius,
          w: radius * 2,
          h: radius * 2,
          radius,
          fill: status === 'planned' ? tokens.background : color,
          stroke: color,
          strokeWidth: 2,
          semanticId: `dot_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: cx - 90,
          y: lineY + 22,
          w: 180,
          h: 20,
          content: fitText(ph.name as string, 180, 16),
          fontSize: 16,
          color: tokens.text,
          align: 'middle',
          fontWeight: 600,
          semanticId: `phase_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: cx - 90,
          y: lineY - 28,
          w: 180,
          h: 16,
          content: typeof ph.timeframe === 'string' ? ph.timeframe : '',
          fontSize: 13,
          color: tokens.muted,
          align: 'middle',
          semanticId: `timeframe_${i}`,
        }),
      );
    });

    return out;
  },
};

export const TIMELINE: DomioComponentDef = {
  catalogId: 'domio.timeline',
  name: 'Timeline',
  description: 'A vertical timeline of dated events.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 720, h: 400 },
  propsSchema: {
    $id: 'domio.timeline/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        title: 'Events',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', default: 'Q1' },
            title: { type: 'string', default: 'Milestone' },
            detail: { type: 'string', default: '' },
          },
          required: ['title'],
        },
        default: [
          { date: 'Jan', title: 'Kickoff', detail: 'Team assembled, scope locked' },
          { date: 'Mar', title: 'Alpha', detail: 'Internal preview for early users' },
          { date: 'Jun', title: 'Public beta', detail: 'Waitlist opens to everyone' },
          { date: 'Sep', title: 'Launch', detail: 'General availability' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const events = asArray<Record<string, unknown>>(props.events, []).slice(0, 8);

    const W = 720;
    const H = 400;
    const railX = 48;
    const n = events.length;
    const rowH = H / Math.max(1, n);
    const out: Element[] = [];

    out.push(
      line(ctx, {
        x1: railX,
        y1: rowH / 2,
        x2: railX,
        y2: H - rowH / 2,
        stroke: tokens.border,
        strokeWidth: 2,
        semanticId: 'rail',
      }),
    );

    events.forEach((ev, i) => {
      const cy = rowH * i + rowH / 2;
      out.push(
        rect(ctx, {
          x: railX - 6,
          y: cy - 6,
          w: 12,
          h: 12,
          radius: 6,
          fill: accent,
          semanticId: `dot_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: railX + 22,
          y: cy - 16,
          w: 120,
          h: 16,
          content: typeof ev.date === 'string' ? ev.date : '',
          fontSize: 13,
          color: accent,
          fontWeight: 600,
          semanticId: `date_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: railX + 22,
          y: cy + 4,
          w: W - railX - 40,
          h: 20,
          content: fitText(ev.title as string, W - railX - 40, 16),
          fontSize: 16,
          color: tokens.text,
          fontWeight: 600,
          semanticId: `title_${i}`,
        }),
      );
      if (typeof ev.detail === 'string' && ev.detail) {
        out.push(
          text(ctx, {
            x: railX + 22,
            y: cy + 26,
            w: W - railX - 40,
            h: 16,
            content: fitText(ev.detail, W - railX - 40, 13),
            fontSize: 13,
            color: tokens.muted,
            semanticId: `detail_${i}`,
          }),
        );
      }
    });

    return out;
  },
};
