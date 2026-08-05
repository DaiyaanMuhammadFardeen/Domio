/**
 * Bar terrain — value grid → 3D bar positions.
 *
 * Turns a 2D grid of numeric values into positioned 3D bar primitives
 * for a bar-terrain (Manhattan-style) data visualization.
 */

import type { Vec3, LODSelection } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface BarTerrainConfig {
  /** 2D grid of values [row][col]. */
  grid: number[][];
  /** Spacing between bars on the X axis. */
  spacingX?: number;
  /** Spacing between bars on the Z axis. */
  spacingZ?: number;
  /** Maximum bar height (values are normalised to this). */
  maxHeight?: number;
  /** Bar width on X axis. */
  barWidth?: number;
  /** Bar depth on Z axis. */
  barDepth?: number;
}

export interface BarPosition {
  position: Vec3;
  height: number;
  row: number;
  col: number;
  /** Normalised value [0, 1]. */
  normalisedValue: number;
}

export interface BarTerrainResult {
  bars: BarPosition[];
  instanceCount: number;
  lod: LODSelection;
}

// ---------------------------------------------------------------------------
// BarTerrain
// ---------------------------------------------------------------------------

function lodScale(level: LODSelection['level']): number {
  switch (level) {
    case 0: return 1.0;
    case 1: return 0.5;
    case 2: return 0.25;
    case 3: return 0.125;
  }
}

/**
 * Generate bar positions from a value grid.
 */
export function generateBarTerrain(
  config: BarTerrainConfig,
  lod: LODSelection,
): BarTerrainResult {
  const {
    grid,
    spacingX = 1.0,
    spacingZ = 1.0,
    maxHeight = 5.0,
  } = config;

  // Find max value for normalisation
  let maxVal = 0;
  for (const row of grid) {
    for (const v of row) {
      if (v > maxVal) maxVal = v;
    }
  }

  const bars: BarPosition[] = [];
  const scale = lodScale(lod.level);

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      const val = row[c]!;
      const normalisedValue = maxVal > 0 ? val / maxVal : 0;
      const height = normalisedValue * maxHeight;
      bars.push({
        position: {
          x: c * spacingX,
          y: height / 2,
          z: r * spacingZ,
        },
        height,
        row: r,
        col: c,
        normalisedValue,
      });
    }
  }

  return {
    bars,
    instanceCount: Math.round(bars.length * scale),
    lod,
  };
}
