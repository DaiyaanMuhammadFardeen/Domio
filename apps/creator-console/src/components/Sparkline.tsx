import { sparkline, type SvgElement } from '@domio/chart';
import { useId } from 'react';

export interface SparklineProps {
  values: ReadonlyArray<number>;
  color?: string;
  width?: number;
  height?: number;
}

/**
 * Wraps the @domio/chart `sparkline` primitive with a fixed 80×24
 * viewBox and a slate stroke default. Renders the resulting SVG
 * elements inline as `<svg>` so callers can drop it into KPI tiles.
 */
export function Sparkline({
  values,
  color = '#475569',
  width = 80,
  height = 24,
}: SparklineProps) {
  const reactId = useId();
  const semanticId = `spark_${reactId.replace(/:/g, '_')}`;
  const elements: SvgElement[] = sparkline([...values], semanticId, {
    width,
    height,
    color,
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block"
      aria-hidden
    >
      {elements.map((el, idx) => {
        const stroke = el.stroke ?? color;
        const sw = el.strokeWidth ?? 1.5;
        switch (el.kind) {
          case 'rect':
            return (
              <rect
                key={idx}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                fill={el.fill ?? 'transparent'}
                rx={el.rx ?? 0}
              />
            );
          case 'line':
            return (
              <line
                key={idx}
                x1={el.x}
                y1={el.y}
                x2={el.x + el.width}
                y2={el.y + el.height}
                stroke={stroke}
                strokeWidth={sw}
              />
            );
          case 'polyline': {
            const pts = el.points ?? [];
            const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <polyline
                key={idx}
                points={pointsStr}
                fill="none"
                stroke={stroke}
                strokeWidth={sw}
              />
            );
          }
          case 'text':
            return (
              <text
                key={idx}
                x={el.x}
                y={el.y}
                fontSize={el.fontSize ?? 10}
                fill={el.fill ?? color}
              >
                {el.text ?? ''}
              </text>
            );
          case 'group':
            return <g key={idx} />;
          default:
            return null;
        }
      })}
    </svg>
  );
}