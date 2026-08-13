/**
 * Layout family — bento grid (adapted from Magic UI's bento-grid into an
 * SVG canvas component), kanban board, and org chart.
 */

import type { Element } from '@domio/schema';
import type { PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef } from '../types.js';
import { rect, text, line, fitText, asString, asArray, accentOf, clamp } from '../helpers.js';
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

const BENTO_ACCENTS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6'];

interface BentoCell {
  title?: unknown;
  detail?: unknown;
  accent?: unknown;
}

export const BENTO_GRID: DomioComponentDef = {
  catalogId: 'domio.bento-grid',
  name: 'Bento Grid',
  description: 'A bento-style dashboard grid of stat tiles (Magic UI bento adapted to SVG).',
  category: 'layout',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 480 },
  propsSchema: {
    $id: 'domio.bento-grid/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['cells'],
    properties: {
      cells: {
        type: 'array',
        title: 'Cells',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', default: 'Metric' },
            detail: { type: 'string', default: '' },
            accent: { type: 'string', format: 'color' },
          },
          required: ['title'],
        },
        default: [
          { title: 'Revenue', detail: '+18% vs last quarter', accent: '#4F46E5' },
          { title: 'Active users', detail: '48.2k this week', accent: '#0EA5E9' },
          { title: 'Retention', detail: '94% monthly', accent: '#10B981' },
          { title: 'NPS', detail: '72 — all-time high', accent: '#F59E0B' },
          { title: 'Churn', detail: '3.1% down from 4.8%', accent: '#8B5CF6' },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
      gap: {
        type: 'number',
        title: 'Gap',
        default: 16,
        minimum: 4,
        maximum: 48,
        'x-domio-prop': { category: 'Layout', control: 'stepper', step: 4 },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const cells = asArray<BentoCell>(props.cells, []).slice(0, 6);
    const gap = clamp(typeof props.gap === 'number' ? props.gap : 16, 4, 48);
    const W = 960;
    const H = 480;
    const cols = 3;
    const rows = 2;
    const cellW = (W - gap * (cols - 1)) / cols;
    const cellH = (H - gap * (rows - 1)) / rows;
    const out: Element[] = [];

    cells.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (cellW + gap);
      const y = row * (cellH + gap);
      const accent =
        typeof c.accent === 'string'
          ? c.accent
          : (BENTO_ACCENTS[i % BENTO_ACCENTS.length] ?? '#4F46E5');
      out.push(
        rect(ctx, {
          x,
          y,
          w: cellW,
          h: cellH,
          radius: 20,
          fill: tokens.background,
          stroke: tokens.border,
          strokeWidth: 1,
          semanticId: `cell_${i}`,
        }),
      );
      out.push(
        rect(ctx, {
          x: x + 20,
          y: y + 20,
          w: 14,
          h: 14,
          radius: 4,
          fill: accent,
          semanticId: `cell_dot_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 20,
          y: y + 54,
          w: cellW - 40,
          h: 28,
          content: fitText(typeof c.title === 'string' ? c.title : 'Metric', cellW - 40, 24),
          fontSize: 24,
          color: tokens.text,
          fontWeight: 700,
          semanticId: `cell_title_${i}`,
        }),
      );
      if (typeof c.detail === 'string' && c.detail) {
        out.push(
          text(ctx, {
            x: x + 20,
            y: y + 92,
            w: cellW - 40,
            h: 20,
            content: fitText(c.detail, cellW - 40, 14),
            fontSize: 14,
            color: tokens.muted,
            semanticId: `cell_detail_${i}`,
          }),
        );
      }
    });

    return out;
  },
};

interface Column {
  title?: unknown;
  cards?: unknown;
}

export const KANBAN_BOARD: DomioComponentDef = {
  catalogId: 'domio.kanban-board',
  name: 'Kanban Board',
  description: 'Three swimlane columns with stacked cards.',
  category: 'layout',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 420 },
  propsSchema: {
    $id: 'domio.kanban-board/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['columns'],
    properties: {
      columns: {
        type: 'array',
        title: 'Columns',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', default: 'Column' },
            cards: { type: 'array', items: { type: 'string' } },
          },
          required: ['title'],
        },
        default: [
          { title: 'Backlog', cards: ['Research SDK', 'Draft roadmap'] },
          { title: 'In progress', cards: ['Bento grid', 'Prop engine'] },
          { title: 'Done', cards: ['Scene-graph kind', 'Variant tokens'] },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, undefined);
    const columns = asArray<Column>(props.columns, []).slice(0, 4);
    const W = 960;
    const H = 420;
    const gap = 16;
    const colW = (W - gap * (columns.length - 1)) / columns.length;
    const cardH = 56;
    const out: Element[] = [];

    columns.forEach((col, i) => {
      const x = i * (colW + gap);
      out.push(
        rect(ctx, {
          x,
          y: 0,
          w: colW,
          h: H,
          radius: 14,
          fill: tokens.surface,
          semanticId: `col_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: x + 16,
          y: 16,
          w: colW - 32,
          h: 22,
          content: fitText(typeof col.title === 'string' ? col.title : 'Column', colW - 32, 16),
          fontSize: 16,
          color: tokens.text,
          fontWeight: 600,
          semanticId: `col_title_${i}`,
        }),
      );
      const cards = asArray<string>(col.cards, []).slice(0, 4);
      cards.forEach((card, j) => {
        const cy = 52 + j * (cardH + 12);
        out.push(
          rect(ctx, {
            x: x + 10,
            y: cy,
            w: colW - 20,
            h: cardH,
            radius: 10,
            fill: tokens.background,
            stroke: tokens.border,
            strokeWidth: 1,
            semanticId: `card_${i}_${j}`,
          }),
        );
        out.push(
          text(ctx, {
            x: x + 22,
            y: cy + (cardH - 15) / 2,
            w: colW - 44,
            h: 15,
            content: fitText(card, colW - 44, 13),
            fontSize: 13,
            color: tokens.text,
            fontWeight: 500,
            semanticId: `card_text_${i}_${j}`,
          }),
        );
      });
    });

    return out;
  },
};

interface TeamGroup {
  name?: unknown;
  members?: unknown;
}

export const ORG_CHART: DomioComponentDef = {
  catalogId: 'domio.org-chart',
  name: 'Org Chart',
  description: 'A leadership card with reporting team groups.',
  category: 'layout',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 960, h: 460 },
  propsSchema: {
    $id: 'domio.org-chart/props/1.0.0',
    type: 'object',
    additionalProperties: false,
    required: ['leader'],
    properties: {
      leader: {
        type: 'object',
        title: 'Leader',
        properties: {
          name: { type: 'string', default: 'Ada Lovelace' },
          role: { type: 'string', default: 'Chief Executive Officer' },
        },
        required: ['name'],
        default: { name: 'Ada Lovelace', role: 'Chief Executive Officer' },
      },
      teams: {
        type: 'array',
        title: 'Teams',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', default: 'Team' },
            members: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
        },
        default: [
          { name: 'Product', members: ['Maya Chen', 'Priya Rao'] },
          { name: 'Engineering', members: ['Jonas Weber', 'Tom Okafor', 'Lena Kovács'] },
          { name: 'Go-to-market', members: ['Sofia Reyes', 'Omar Haddad'] },
        ],
        'x-domio-prop': { category: 'Content', control: 'repeatable' },
      },
      accent: { ...accentSchema },
    },
  },
  build: (props, ctx) => {
    const tokens = tokensFor(ctx.variantId, accentOf(props));
    const accent = accentOf(props) ?? tokens.accent;
    const leader = (
      typeof props.leader === 'object' && props.leader !== null ? props.leader : {}
    ) as Record<string, unknown>;
    const leaderName = asString(leader.name, 'Ada Lovelace');
    const leaderRole = asString(leader.role, 'Chief Executive Officer');
    const teams = asArray<TeamGroup>(props.teams, []).slice(0, 5);
    const W = 960;
    const n = teams.length;
    const colW = W / Math.max(1, n);
    const out: Element[] = [];

    // Leader card centered on top.
    const leaderW = 260;
    const leaderX = (W - leaderW) / 2;
    out.push(
      rect(ctx, {
        x: leaderX,
        y: 0,
        w: leaderW,
        h: 76,
        radius: 14,
        fill: accent,
        semanticId: 'leader_card',
      }),
    );
    out.push(
      text(ctx, {
        x: leaderX + 16,
        y: 16,
        w: leaderW - 32,
        h: 22,
        content: fitText(leaderName, leaderW - 32, 16),
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: 700,
        semanticId: 'leader_name',
      }),
    );
    out.push(
      text(ctx, {
        x: leaderX + 16,
        y: 42,
        w: leaderW - 32,
        h: 18,
        content: fitText(leaderRole, leaderW - 32, 13),
        fontSize: 13,
        color: '#E0E7FF',
        semanticId: 'leader_role',
      }),
    );

    // Connector from leader down to team row.
    out.push(
      line(ctx, {
        x1: W / 2,
        y1: 76,
        x2: W / 2,
        y2: 100,
        stroke: tokens.border,
        strokeWidth: 2,
        semanticId: 'spine',
      }),
    );
    if (n > 1) {
      const startX = colW / 2;
      const endX = (n - 1) * colW + colW / 2;
      out.push(
        line(ctx, {
          x1: startX,
          y1: 100,
          x2: endX,
          y2: 100,
          stroke: tokens.border,
          strokeWidth: 2,
          semanticId: 'branch',
        }),
      );
    }

    teams.forEach((team, i) => {
      const cx = colW * i + colW / 2;
      out.push(
        line(ctx, {
          x1: cx,
          y1: 100,
          x2: cx,
          y2: 124,
          stroke: tokens.border,
          strokeWidth: 2,
          semanticId: `drop_${i}`,
        }),
      );
      const teamW = Math.min(colW - 24, 260);
      const teamX = cx - teamW / 2;
      out.push(
        rect(ctx, {
          x: teamX,
          y: 124,
          w: teamW,
          h: 44,
          radius: 10,
          fill: tokens.surface,
          semanticId: `team_${i}`,
        }),
      );
      out.push(
        text(ctx, {
          x: teamX + 14,
          y: 136,
          w: teamW - 28,
          h: 20,
          content: fitText(typeof team.name === 'string' ? team.name : 'Team', teamW - 28, 15),
          fontSize: 15,
          color: tokens.text,
          fontWeight: 600,
          semanticId: `team_name_${i}`,
        }),
      );
      const members = asArray<string>(team.members, []).slice(0, 5);
      members.forEach((member, j) => {
        const my = 178 + j * 24;
        out.push(
          rect(ctx, {
            x: teamX,
            y: my,
            w: teamW,
            h: 20,
            radius: 5,
            fill: tokens.background,
            semanticId: `member_bg_${i}_${j}`,
          }),
        );
        out.push(
          rect(ctx, {
            x: teamX + 6,
            y: my + 6,
            w: 8,
            h: 8,
            radius: 4,
            fill: accent,
            semanticId: `member_dot_${i}_${j}`,
          }),
        );
        out.push(
          text(ctx, {
            x: teamX + 22,
            y: my + 3,
            w: teamW - 34,
            h: 15,
            content: fitText(member, teamW - 34, 13),
            fontSize: 13,
            color: tokens.muted,
            semanticId: `member_${i}_${j}`,
          }),
        );
      });
    });

    return out;
  },
};
