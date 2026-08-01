/**
 * Tile cache — LRU by tile key, with byte-budget eviction and a TTL.
 * See docs/development_phases/phase-03 §B.2: LRU at 256 MB, 30 s TTL.
 */

import { tileKey, type TileCoord } from './tile-coords.js';

export interface TileCacheOptions {
  /** Max bytes; defaults to 256 MB. */
  maxBytes?: number;
  /** TTL in ms; defaults to 30s. */
  ttlMs?: number;
  /** Optional clock. */
  now?: () => number;
}

export interface TileEntry<T> {
  coord: TileCoord;
  data: T;
  size: number;
  insertedAt: number;
  lastAccessedAt: number;
}

export class TileCache<T> {
  private readonly entries = new Map<string, TileEntry<T>>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: TileCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  size(): number {
    return this.entries.size;
  }

  bytesUsed(): number {
    return this.bytes;
  }

  get(coord: TileCoord): T | undefined {
    const key = tileKey(coord);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const now = this.now();
    if (now - entry.insertedAt > this.ttlMs) {
      this.entries.delete(key);
      this.bytes -= entry.size;
      return undefined;
    }
    entry.lastAccessedAt = now;
    return entry.data;
  }

  put(coord: TileCoord, data: T, size: number): void {
    const key = tileKey(coord);
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.size;
      this.entries.delete(key);
    }
    const now = this.now();
    this.entries.set(key, {
      coord,
      data,
      size,
      insertedAt: now,
      lastAccessedAt: now,
    });
    this.bytes += size;
    this.evictIfNeeded();
  }

  invalidate(coord: TileCoord): void {
    const key = tileKey(coord);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.size;
    this.entries.delete(key);
  }

  invalidateRegion(coord: TileCoord, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.invalidate({ tx: coord.tx + dx, ty: coord.ty + dy });
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  private evictIfNeeded(): void {
    if (this.bytes <= this.maxBytes) return;
    const byOldest = Array.from(this.entries.values()).sort(
      (a, b) => a.lastAccessedAt - b.lastAccessedAt,
    );
    while (this.bytes > this.maxBytes && byOldest.length > 0) {
      const victim = byOldest.shift();
      if (!victim) break;
      this.invalidate(victim.coord);
    }
  }
}