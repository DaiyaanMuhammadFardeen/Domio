/**
 * Heatmap generator — PNG export tests (Phase 17 W5).
 */

import { describe, expect, it } from 'vitest';
import { encodeHeatmapPng } from './png_export.js';
import { buildExport } from './aggregator.js';

function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]!) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readChunk(buf: Buffer, off: number): { type: string; data: Buffer; next: number } {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  // CRC over type+data.
  const want = buf.readUInt32BE(off + 8 + len);
  const got = crc32(buf.subarray(off + 4, off + 8 + len));
  expect(got).toBe(want);
  return { type, data, next: off + 12 + len };
}

describe('encodeHeatmapPng', () => {
  it('emits a valid PNG with correct IHDR and at least one IDAT', () => {
    const exp = buildExport('deck-1', 'slide-1', '2026-01-01', new Map(), {
      gridWidth: 32,
      gridHeight: 18,
    });
    // Re-add the tile manually since buildExport filters zeros via aggregate first.
    exp.tiles = [{ x: 0, y: 0, dwell_ms: 10, viewers: 1, pause_count: 0 }];

    const buf = encodeHeatmapPng(exp);

    // PNG signature.
    expect(
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);

    // IHDR.
    const ihdr = readChunk(buf, 8);
    expect(ihdr.type).toBe('IHDR');
    expect(ihdr.data.readUInt32BE(0)).toBe(32);
    expect(ihdr.data.readUInt32BE(4)).toBe(18);
    expect(ihdr.data[8]).toBe(8); // bit depth
    expect(ihdr.data[9]).toBe(2); // truecolor

    // IDAT exists and starts with a zlib header.
    const idat = readChunk(buf, ihdr.next);
    expect(idat.type).toBe('IDAT');
    expect(idat.data[0]).toBe(0x78);

    // IEND closes.
    const iend = readChunk(buf, idat.next);
    expect(iend.type).toBe('IEND');
  });

  it('produces a deterministic PNG for the same export', () => {
    const exp = buildExport('d', 's', '2026-01-01', new Map(), { gridWidth: 32, gridHeight: 18 });
    exp.tiles = [
      { x: 5, y: 9, dwell_ms: 1234, viewers: 7, pause_count: 3 },
      { x: 1, y: 1, dwell_ms: 50, viewers: 1, pause_count: 0 },
    ];
    const a = encodeHeatmapPng(exp);
    const b = encodeHeatmapPng(exp);
    expect(a.equals(b)).toBe(true);
  });

  it('produces different PNGs for different tile intensities', () => {
    const expA = buildExport('d', 's', '2026-01-01', new Map(), { gridWidth: 32, gridHeight: 18 });
    expA.tiles = [{ x: 5, y: 9, dwell_ms: 0, viewers: 1, pause_count: 0 }];
    const expB = buildExport('d', 's', '2026-01-01', new Map(), { gridWidth: 32, gridHeight: 18 });
    expB.tiles = [{ x: 5, y: 9, dwell_ms: 9_999_999, viewers: 1, pause_count: 0 }];
    const a = encodeHeatmapPng(expA);
    const b = encodeHeatmapPng(expB);
    // Stored blocks => same size; but the row bytes differ. Compare a byte
    // well inside the IDAT chunk to confirm the renderer respected the
    // different dwell values.
    expect(a.equals(b)).toBe(false);
    expect(a.length).toBe(b.length);
  });

  it('handles an all-zero export without throwing', () => {
    const exp = buildExport('d', 's', '2026-01-01', new Map(), { gridWidth: 32, gridHeight: 18 });
    expect(exp.tiles.length).toBe(0);
    const buf = encodeHeatmapPng(exp);
    expect(
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);
  });
});
