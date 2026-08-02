/**
 * Structure family — section headers, agendas, bullet lists, numbered
 * steps, callouts, quotes, and badge rows.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, line, fitText, asString, asBoolean, asArray, accentOf } from '../helpers.js';
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

function stringList(value: unknown, fallback: string[]): string[] {
  return asArray<string>(value, fallback).filter((s) => typeof s === 'string');
}

export const SECTION_HEADER: DomioComponentDef = {
  catalogId: 'domio.section-header',
  name: 'Section Header',
  description: 'Kicker, title, and subtitle — the standard section opener.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 160 },
  propsSchema: {
    $id: 'domio.section-header/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    properties: {
      kicker: { type: 'string', title: 'Kicker', default: '01 — Overview', 'x-domio-prop': { category: 'Content' } },
      title: { type: 'string', title: 'Title', default: 'Where we stand', 'x-domio-prop': { category: 'Content' } },
      subtitle: { type: 'string', title: 'Subtitle', default: 'A quick read of the business before the deep dive.', 'x-domio-prop': { category: 'Content' } },
      align: { type: 'string', enum: ['left', 'center'], default: 'left', 'x-domio-prop': { category: 'Layout', control: 'segmented' } },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const kicker = asString(props.kicker, '01 — Overview');
    const title = asString(props.title, 'Where we stand');
    const subtitle = asString(props.subtitle, '');
    const align = props.align === 'center' ? 'center' : 'left';
    const W = 960;
    const tw = align === 'center' ? W : W * 0.85;
    const tx = align === 'center' ? (W - tw) / 2 : 0;

    return [
      rect(ctx, { x: align === 'center' ? W / 2 - 20 : 0, y: 12, w: 40, h: 5, radius: 3, fill: accent, semanticId: 'rule' }),
      text(ctx, { x: align === 'center' ? (W - 400) / 2 : 0, y: 40, w: 400, h: 20, content: fitText(kicker.toUpperCase(), 400, 13), fontSize: 13, color: accent, fontWeight: 600, letterSpacing: 2, align: align === 'center' ? 'middle' : 'start', semanticId: 'kicker' }),
      text(ctx, { x: tx, y: 70, w: tw, h: 52, content: fitText(title, tw, 44), fontSize: 44, color: tokens.text, fontWeight: 700, align: align === 'center' ? 'middle' : 'start', semanticId: 'title' }),
      ...(subtitle
        ? [text(ctx, { x: tx, y: 128, w: tw, h: 24, content: fitText(subtitle, tw, 18), fontSize: 18, color: tokens.muted, align: align === 'center' ? 'middle' : 'start', semanticId: 'subtitle' })]
        : []),
    ];
  },
};

export const AGENDA: DomioComponentDef = {
  catalogId: 'domio.agenda',
  name: 'Agenda',
  description: 'Numbered agenda with time hints.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 400 },
  propsSchema: {
    $id: 'domio.agenda/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        title: 'Items',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string' },
        default: ['Context & goals', 'Market snapshot', 'Strategy deep dive', 'Q&A'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      times: {
        type: 'array',
        title: 'Times',
        items: { type: 'string' },
        default: ['10 min', '15 min', '20 min', '5 min'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const items = stringList(props.items, ['Context & goals', 'Market snapshot', 'Strategy deep dive', 'Q&A']).slice(0, 6);
    const times = stringList(props.times, []);
    const W = 640;
    const H = 400;
    const n = items.length;
    const rowH = H / n;
    const out: Element[] = [];

    items.forEach((item, i) => {
      const y = rowH * i;
      const cx = 34;
      out.push(rect(ctx, { x: cx - 15, y: y + (rowH - 30) / 2, w: 30, h: 30, radius: 8, fill: accent, semanticId: `num_${i}` }));
      out.push(text(ctx, { x: cx - 15, y: y + (rowH - 16) / 2, w: 30, h: 16, content: String(i + 1), fontSize: 14, color: '#FFFFFF', align: 'middle', fontWeight: 700, semanticId: `num_text_${i}` }));
      out.push(text(ctx, { x: cx + 20, y: y + (rowH - 20) / 2, w: W - cx - 130, h: 20, content: fitText(item, W - cx - 130, 17), fontSize: 17, color: tokens.text, fontWeight: 500, semanticId: `item_${i}` }));
      if (typeof times[i] === 'string' && times[i]) {
        out.push(text(ctx, { x: W - 100, y: y + (rowH - 16) / 2, w: 90, h: 16, content: times[i]!, fontSize: 13, color: tokens.muted, align: 'end', semanticId: `time_${i}` }));
      }
    });

    return out;
  },
};

export const BULLET_LIST: DomioComponentDef = {
  catalogId: 'domio.bullet-list',
  name: 'Bullet List',
  description: 'A clean bullet list with optional emphasis.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 360 },
  propsSchema: {
    $id: 'domio.bullet-list/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        title: 'Items',
        minItems: 1,
        maxItems: 8,
        items: { type: 'string' },
        default: ['Revenue grew 2.4× year over year', 'Retention stayed above 90%', 'New markets opened in APAC and LATAM'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      marker: { type: 'string', enum: ['dot', 'check', 'arrow'], default: 'dot', 'x-domio-prop': { category: 'Style', control: 'segmented' } },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const items = stringList(props.items, ['Revenue grew 2.4× year over year', 'Retention stayed above 90%']).slice(0, 8);
    const marker = props.marker === 'check' || props.marker === 'arrow' ? props.marker : 'dot';
    const W = 640;
    const H = 360;
    const n = items.length;
    const rowH = H / Math.max(1, n);
    const out: Element[] = [];

    items.forEach((item, i) => {
      const y = rowH * i + (rowH - 20) / 2;
      if (marker === 'dot') {
        out.push(rect(ctx, { x: 16, y: y + 6, w: 8, h: 8, radius: 4, fill: accent, semanticId: `dot_${i}` }));
      } else {
        const glyph = marker === 'check' ? '✓' : '→';
        out.push(text(ctx, { x: 8, y, w: 28, h: 20, content: glyph, fontSize: 16, color: accent, fontWeight: 700, semanticId: `marker_${i}` }));
      }
      out.push(text(ctx, { x: 44, y, w: W - 64, h: 20, content: fitText(item, W - 64, 16), fontSize: 16, color: tokens.text, fontWeight: 400, semanticId: `item_${i}` }));
    });

    return out;
  },
};

export const NUMBERED_STEPS: DomioComponentDef = {
  catalogId: 'domio.numbered-steps',
  name: 'Numbered Steps',
  description: 'Sequential process steps with connector line.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 180 },
  propsSchema: {
    $id: 'domio.numbered-steps/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        title: 'Steps',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', default: 'Step' },
            detail: { type: 'string', default: '' },
          },
          required: ['title'],
        },
        default: [
          { title: 'Discover', detail: 'Find the opportunity' },
          { title: 'Design', detail: 'Prototype the solution' },
          { title: 'Deliver', detail: 'Ship and measure' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const steps = asArray<Record<string, unknown>>(props.steps, []).slice(0, 5);
    const W = 960;
    const n = steps.length;
    const slot = W / n;
    const out: Element[] = [];

    for (let i = 1; i < n; i += 1) {
      out.push(line(ctx, { x1: slot * i + 14, y1: 28, x2: slot * (i + 1) - 46, y2: 28, stroke: tokens.border, strokeWidth: 2, dash: '4 4', semanticId: `connector_${i}` }));
    }

    steps.forEach((s, i) => {
      const cx = slot * i + slot / 2;
      out.push(rect(ctx, { x: cx - 20, y: 8, w: 40, h: 40, radius: 20, fill: accent, semanticId: `badge_${i}` }));
      out.push(text(ctx, { x: cx - 20, y: 16, w: 40, h: 24, content: String(i + 1), fontSize: 16, color: '#FFFFFF', align: 'middle', fontWeight: 700, semanticId: `num_${i}` }));
      out.push(text(ctx, { x: cx - slot / 2 + 8, y: 62, w: slot - 16, h: 22, content: fitText(s.title as string, slot - 16, 18), fontSize: 18, color: tokens.text, align: 'middle', fontWeight: 600, semanticId: `title_${i}` }));
      if (typeof s.detail === 'string' && s.detail) {
        out.push(text(ctx, { x: cx - slot / 2 + 16, y: 90, w: slot - 32, h: 40, content: fitText(s.detail, slot - 32, 13), fontSize: 13, color: tokens.muted, align: 'middle', semanticId: `detail_${i}` }));
      }
    });

    return out;
  },
};

export const CALLOUT: DomioComponentDef = {
  catalogId: 'domio.callout',
  name: 'Callout',
  description: 'A highlighted note with an icon and title.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 720, h: 96 },
  propsSchema: {
    $id: 'domio.callout/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', title: 'Title', default: 'Note', 'x-domio-prop': { category: 'Content' } },
      body: { type: 'string', title: 'Body', default: 'Add context here so the team leaves with the same takeaway.', 'x-domio-prop': { category: 'Content' } },
      tone: { type: 'string', enum: ['info', 'success', 'warning', 'danger'], default: 'info', 'x-domio-prop': { category: 'Style', control: 'segmented' } },
      showIcon: { type: 'boolean', title: 'Show icon', default: true, 'x-domio-prop': { category: 'Behavior', control: 'toggle' } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const title = asString(props.title, 'Note');
    const body = asString(props.body, '');
    const tone = props.tone === 'success' || props.tone === 'warning' || props.tone === 'danger' ? props.tone : 'info';
    const showIcon = asBoolean(props.showIcon, true);
    const toneColor: Record<string, string> = { info: '#4F46E5', success: '#16A34A', warning: '#D97706', danger: '#DC2626' };
    const toneSoft: Record<string, string> = { info: '#EEF2FF', success: '#F0FDF4', warning: '#FFFBEB', danger: '#FEF2F2' };
    const color = toneColor[tone];
    const soft = toneSoft[tone];
    const W = 720;
    const H = 96;
    const out: Element[] = [];

    out.push(rect(ctx, { x: 0, y: 0, w: W, h: H, radius: 14, fill: soft, semanticId: 'callout_bg' }));
    out.push(rect(ctx, { x: 0, y: 0, w: 5, h: H, radius: 3, fill: color, semanticId: 'callout_bar' }));
    if (showIcon) {
      out.push(rect(ctx, { x: 20, y: (H - 28) / 2, w: 28, h: 28, radius: 8, fill: color, semanticId: 'icon_bg' }));
      out.push(text(ctx, { x: 20, y: (H - 18) / 2, w: 28, h: 18, content: tone === 'success' ? '✓' : tone === 'warning' ? '!' : tone === 'danger' ? '×' : 'i', fontSize: 15, color: '#FFFFFF', align: 'middle', fontWeight: 700, semanticId: 'icon' }));
    }
    out.push(text(ctx, { x: showIcon ? 62 : 24, y: 16, w: W - (showIcon ? 86 : 48), h: 20, content: fitText(title, W - 86, 15), fontSize: 15, color: tokens.text, fontWeight: 600, semanticId: 'title' }));
    out.push(text(ctx, { x: showIcon ? 62 : 24, y: 40, w: W - (showIcon ? 86 : 48), h: 40, content: fitText(body, W - 86, 14), fontSize: 14, color: tokens.muted, semanticId: 'body' }));

    return out;
  },
};

export const QUOTE_BLOCK: DomioComponentDef = {
  catalogId: 'domio.quote-block',
  name: 'Quote Block',
  description: 'Pull quote with attribution.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 720, h: 280 },
  propsSchema: {
    $id: 'domio.quote-block/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['quote'],
    properties: {
      quote: { type: 'string', title: 'Quote', default: 'The best way to predict the future is to invent it.', maxLength: 200, 'x-domio-prop': { category: 'Content' } },
      author: { type: 'string', title: 'Author', default: 'Alan Kay', 'x-domio-prop': { category: 'Content' } },
      role: { type: 'string', title: 'Role', default: 'Computer scientist', 'x-domio-prop': { category: 'Content' } },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const quote = asString(props.quote, '');
    const author = asString(props.author, '');
    const role = asString(props.role, '');
    const W = 720;
    const out: Element[] = [];

    out.push(text(ctx, { x: 0, y: 8, w: 80, h: 64, content: '“', fontSize: 84, color: accent, fontWeight: 800, semanticId: 'quote_mark' }));
    out.push(text(ctx, { x: 64, y: 56, w: W - 96, h: 96, content: fitText(quote, W - 96, 26), fontSize: 26, color: tokens.text, fontWeight: 600, semanticId: 'quote' }));
    out.push(rect(ctx, { x: 64, y: 176, w: 48, h: 4, radius: 2, fill: accent, semanticId: 'rule' }));
    out.push(text(ctx, { x: 64, y: 196, w: W - 96, h: 24, content: fitText(author, W - 96, 18), fontSize: 18, color: tokens.text, fontWeight: 700, semanticId: 'author' }));
    out.push(text(ctx, { x: 64, y: 224, w: W - 96, h: 18, content: fitText(role, W - 96, 14), fontSize: 14, color: tokens.muted, semanticId: 'role' }));

    return out;
  },
};

export const BADGES: DomioComponentDef = {
  catalogId: 'domio.badges',
  name: 'Badge Row',
  description: 'A wrapping row of pill tags.',
  category: 'structure',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 640, h: 120 },
  propsSchema: {
    $id: 'domio.badges/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['labels'],
    properties: {
      labels: {
        type: 'array',
        title: 'Labels',
        minItems: 1,
        maxItems: 12,
        items: { type: 'string' },
        default: ['React', 'TypeScript', 'Rust', 'Go', 'Postgres', 'Kafka'],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
      outline: { type: 'boolean', title: 'Outline style', default: false, 'x-domio-prop': { category: 'Style', control: 'toggle' } },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const labels = stringList(props.labels, ['React', 'TypeScript']).slice(0, 12);
    const outline = asBoolean(props.outline, false);
    const W = 640;
    const out: Element[] = [];
    const fontSize = 14;
    const gap = 10;
    const padX = 14;
    const pillH = 34;
    let x = 0;
    let y = 0;

    labels.forEach((label, i) => {
      const tw = Math.max(fitText(label, 220, fontSize).length * fontSize * 0.58, 28) + padX * 2;
      if (x + tw > W) {
        x = 0;
        y += pillH + gap;
      }
      out.push(rect(ctx, { x, y, w: tw, h: pillH, radius: pillH / 2, fill: outline ? tokens.background : accent, stroke: outline ? accent : undefined, strokeWidth: outline ? 1.5 : undefined, semanticId: `badge_${i}` }));
      out.push(text(ctx, { x, y: y + (pillH - 15) / 2, w: tw, h: 15, content: fitText(label, tw - padX * 2, fontSize), fontSize, color: outline ? accent : '#FFFFFF', align: 'middle', fontWeight: 600, semanticId: `badge_text_${i}` }));
      x += tw + gap;
    });

    return out;
  },
};
