'use client';

/**
 * Skeleton — generic loading placeholder primitives.
 *
 * Per Wave 1 §S1.5 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Three variants:
 *   - Skeleton.Text — line of text-shaped placeholder.
 *   - Skeleton.Circle — round placeholder (avatars, icons).
 *   - Skeleton.Block — rectangular placeholder (cards, panels).
 *
 * Use composable: <Skeleton.Block rows={4} /> renders 4 stacked rows.
 */

import { type CSSProperties, type ReactElement } from 'react';

const baseStyle: CSSProperties = {
  display: 'block',
  background: 'var(--surface-2)',
  borderRadius: 'var(--radius-sm)',
  animation: 'domio-skeleton-pulse 1.4s ease-in-out infinite',
};

function Pulse(): ReactElement {
  return (
    <style>{`
      @keyframes domio-skeleton-pulse {
        0% { opacity: 1; }
        50% { opacity: 0.55; }
        100% { opacity: 1; }
      }
    `}</style>
  );
}

function Text({
  width = '100%',
  height = '0.875em',
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <>
      <Pulse />
      <span
        aria-hidden
        style={{
          ...baseStyle,
          width,
          height,
          ...style,
        }}
      />
    </>
  );
}

function Circle({ size = 32, style }: { size?: number; style?: CSSProperties }): ReactElement {
  return (
    <>
      <Pulse />
      <span
        aria-hidden
        style={{
          ...baseStyle,
          width: size,
          height: size,
          borderRadius: 'var(--radius-full)',
          ...style,
        }}
      />
    </>
  );
}

interface BlockProps {
  rows?: number;
  height?: number;
  gap?: number;
  style?: CSSProperties;
  ariaLabel?: string;
}

function Block({ rows = 1, height = 16, gap = 8, style, ariaLabel }: BlockProps): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? 'Loading…'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap,
        ...style,
      }}
    >
      <Pulse />
      {Array.from({ length: rows }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            ...baseStyle,
            height,
            width: i === rows - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

export const Skeleton = {
  Text,
  Circle,
  Block,
} as const;
