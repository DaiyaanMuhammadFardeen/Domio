/**
 * People family — team grids and profile cards.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, fitText, asString, asArray, clamp } from '../helpers.js';
import { tokensFor } from '../tokens.js';

const LIGHT_DARK = [
  { id: 'light', label: 'Light', theme: 'light' as const },
  { id: 'dark', label: 'Dark', theme: 'dark' as const },
];

const ACCENTS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

interface Person {
  name: string;
  role: string;
  initials: string;
  accent?: string;
}

function peopleOf(value: unknown, fallback: Person[]): Person[] {
  return asArray<Record<string, unknown>>(
    value,
    fallback as unknown as Record<string, unknown>[],
  ).map((p) => ({
    name: typeof p.name === 'string' ? p.name : 'Name',
    role: typeof p.role === 'string' ? p.role : '',
    initials:
      typeof p.initials === 'string'
        ? p.initials
        : typeof p.name === 'string'
          ? p.name.slice(0, 2)
          : 'NN',
    ...(typeof p.accent === 'string' ? { accent: p.accent } : {}),
  }));
}

const personItems: PropSchemaFragment = {
  type: 'array',
  title: 'People',
  minItems: 1,
  maxItems: 8,
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name', default: 'Person' },
      role: { type: 'string', title: 'Role', default: 'Role' },
      initials: { type: 'string', title: 'Initials', default: 'NN', maxLength: 3 },
      accent: { type: 'string', title: 'Accent', format: 'color' },
    },
    required: ['name'],
  },
  default: [
    { name: 'Maya Chen', role: 'Design Lead', initials: 'MC', accent: '#4F46E5' },
    { name: 'Jonas Weber', role: 'Eng Lead', initials: 'JW', accent: '#0EA5E9' },
    { name: 'Priya Rao', role: 'Product', initials: 'PR', accent: '#10B981' },
  ],
  'x-domio-prop': { category: 'Content', control: 'repeatable' },
};

export const TEAM_GRID: DomioComponentDef = {
  catalogId: 'domio.team-grid',
  name: 'Team Grid',
  description: 'A grid of member cards with initials avatars.',
  category: 'people',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 400 },
  propsSchema: {
    $id: 'domio.team-grid/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['people'],
    properties: {
      people: personItems,
      columns: {
        type: 'integer',
        title: 'Columns',
        default: 3,
        minimum: 1,
        maximum: 4,
        'x-domio-prop': { category: 'Layout', control: 'stepper', step: 1 },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const people = peopleOf(props.people, []).slice(0, 8);
    const columns = clamp(typeof props.columns === 'number' ? props.columns : 3, 1, 4);
    const W = 960;
    const H = 400;
    const gap = 20;
    const cardW = (W - gap * (columns - 1)) / columns;
    const rows = Math.ceil(people.length / columns);
    const cardH = Math.min((H - gap * (rows - 1)) / Math.max(1, rows), 170);
    const out: Element[] = [];

    people.forEach((p, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * (cardW + gap);
      const y = row * (cardH + gap);
      out.push(
        rect(ctx, {
          x,
          y,
          w: cardW,
          h: cardH,
          radius: 14,
          fill: tokens.background,
          stroke: tokens.border,
          strokeWidth: 1,
          semanticId: `card_${i}`,
        }),
      );
      const accent = p.accent ?? ACCENTS[i % ACCENTS.length] ?? '#4F46E5';
      out.push(
        rect(ctx, {
          x: x + 20,
          y: y + 20,
          w: 52,
          h: 52,
          radius: 26,
          fill: accent,
          semanticId: `avatar_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 20,
          y: y + 32,
          w: 52,
          h: 28,
          content: p.initials.slice(0, 3),
          fontSize: 16,
          color: '#FFFFFF',
          align: 'middle',
          fontWeight: 700,
          semanticId: `avatar_text_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 20,
          y: y + 88,
          w: cardW - 40,
          h: 20,
          content: fitText(p.name, cardW - 40, 16),
          fontSize: 16,
          color: tokens.text,
          fontWeight: 600,
          semanticId: `name_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 20,
          y: y + 112,
          w: cardW - 40,
          h: 18,
          content: fitText(p.role, cardW - 40, 13),
          fontSize: 13,
          color: tokens.muted,
          semanticId: `role_${i}`,
        }),
      );
    });

    return out;
  },
};

export const PROFILE_CARD: DomioComponentDef = {
  catalogId: 'domio.profile-card',
  name: 'Profile Card',
  description: 'A single person card with avatar and details.',
  category: 'people',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 320, h: 200 },
  propsSchema: {
    $id: 'domio.profile-card/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        default: 'Maya Chen',
        'x-domio-prop': { category: 'Content' },
      },
      role: {
        type: 'string',
        title: 'Role',
        default: 'Design Lead',
        'x-domio-prop': { category: 'Content' },
      },
      company: {
        type: 'string',
        title: 'Company',
        default: 'Acme Inc.',
        'x-domio-prop': { category: 'Content' },
      },
      initials: {
        type: 'string',
        title: 'Initials',
        default: 'MC',
        maxLength: 3,
        'x-domio-prop': { category: 'Content' },
      },
      accent: {
        type: 'string',
        title: 'Accent',
        format: 'color',
        default: '#4F46E5',
        'x-domio-prop': { category: 'Style', control: 'color' },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(
      ctx.variantId,
      typeof props.accent === 'string' ? props.accent : undefined,
    );
    const accent = asString(props.accent, tokens.accent);
    const name = asString(props.name, 'Maya Chen');
    const role = asString(props.role, '');
    const company = asString(props.company, '');
    const initials = asString(props.initials, 'NN').slice(0, 3);
    const W = 320;
    const H = 200;
    const out: Element[] = [];

    out.push(
      rect(ctx, {
        x: 0,
        y: 0,
        w: W,
        h: H,
        radius: 16,
        fill: tokens.background,
        stroke: tokens.border,
        strokeWidth: 1,
        semanticId: 'card',
      }),
    );
    out.push(rect(ctx, { x: 0, y: 0, w: W, h: 8, radius: 4, fill: accent, semanticId: 'top_bar' }));
    out.push(
      rect(ctx, { x: 24, y: 36, w: 64, h: 64, radius: 32, fill: accent, semanticId: 'avatar' }),
    );
    out.push(
      text(ctx, {
        x: 24,
        y: 52,
        w: 64,
        h: 32,
        content: initials,
        fontSize: 20,
        color: '#FFFFFF',
        align: 'middle',
        fontWeight: 700,
        semanticId: 'avatar_text',
      }),
    );
    out.push(
      text(ctx, {
        x: 104,
        y: 52,
        w: W - 128,
        h: 24,
        content: fitText(name, W - 128, 18),
        fontSize: 18,
        color: tokens.text,
        fontWeight: 600,
        semanticId: 'name',
      }),
    );
    out.push(
      text(ctx, {
        x: 104,
        y: 80,
        w: W - 128,
        h: 18,
        content: fitText(role, W - 128, 14),
        fontSize: 14,
        color: tokens.muted,
        semanticId: 'role',
      }),
    );
    out.push(
      text(ctx, {
        x: 24,
        y: 132,
        w: W - 48,
        h: 18,
        content: fitText(company, W - 48, 14),
        fontSize: 14,
        color: accent,
        fontWeight: 500,
        semanticId: 'company',
      }),
    );

    return out;
  },
};
