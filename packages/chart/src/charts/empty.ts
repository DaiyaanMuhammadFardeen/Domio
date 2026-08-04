/**
 * Empty state renderer — shown when dataset has no rows.
 */

import type { SvgElement, RenderOptions } from '../types.js';
import { rect, text, group } from '../render/element.js';

const PALETTE = {
  light: { bg: '#f8fafc', text: '#64748b', muted: '#94a3b8' },
  dark: { bg: '#1e293b', text: '#94a3b8', muted: '#64748b' },
};

/** Render an empty state element group. */
export function renderEmptyState(opts: RenderOptions): SvgElement[] {
  const theme = opts.theme ?? 'light';
  const colors = PALETTE[theme];
  const cx = opts.width / 2;
  const cy = opts.height / 2;

  return [
    group('empty_state', [
      rect(0, 0, opts.width, opts.height, 'empty_bg', { fill: colors.bg }),
      text(cx - 60, cy - 10, 'No data available', 'empty_text', {
        fontSize: opts.fontSize ?? 14,
        fill: colors.text,
        textAnchor: 'middle',
      }),
      text(cx - 40, cy + 14, 'Add data to see a chart', 'empty_subtext', {
        fontSize: (opts.fontSize ?? 14) - 2,
        fill: colors.muted,
        textAnchor: 'middle',
      }),
    ]),
  ];
}
