/**
 * Tile coordinates — the canvas is partitioned into tiles for caching and
 * viewport culling. See docs/development_phases/phase-03 §B.2.
 */

import type { Aabb } from './camera.js';

export interface TileCoord {
  tx: number;
  ty: number;
}

export const TILE_SIZE = 256;

export function worldToTile(x: number, y: number, tileSize = TILE_SIZE): TileCoord {
  return {
    tx: Math.floor(x / tileSize),
    ty: Math.floor(y / tileSize),
  };
}

export function tileBounds(coord: TileCoord, tileSize = TILE_SIZE): Aabb {
  return {
    x: coord.tx * tileSize,
    y: coord.ty * tileSize,
    w: tileSize,
    h: tileSize,
  };
}

export function tilesIntersecting(bounds: Aabb, tileSize = TILE_SIZE): TileCoord[] {
  const startX = Math.floor(bounds.x / tileSize);
  const startY = Math.floor(bounds.y / tileSize);
  const endX = Math.floor((bounds.x + bounds.w) / tileSize);
  const endY = Math.floor((bounds.y + bounds.h) / tileSize);
  const out: TileCoord[] = [];
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      out.push({ tx: x, ty: y });
    }
  }
  return out;
}

export function tileKey(coord: TileCoord): string {
  return `${coord.tx}:${coord.ty}`;
}