/**
 * Heatmap generator — PNG export (Phase 17 W5).
 *
 * Renders a 32×18 logical grid into a PNG. We don't pull in a full image
 * library (no canvas, no sharp) because the export endpoint is a low-
 * traffic surface and the PNG format itself is small. The renderer
 * constructs a minimal PNG with:
 *
 *   - 8-bit RGB truecolor
 *   - One pixel per tile (no upscaling — the consumer resizes client-side)
 *   - Indexed-color warmth map: blue (cold) → yellow → red (hot)
 *
 * The implementation uses a self-contained zlib-free PNG encoder
 * (DEFLATE stored blocks) so the service has zero image-processing
 * dependencies. That's acceptable for an analytics tile — typical
 * heatmaps are 32×18 = 576 px which encodes to ~3 KB.
 *
 * If we later need higher-fidelity rendering (e.g. smoothing, gradients
 * within a tile) we can swap in pngjs / sharp behind this same function
 * signature; nothing else in the service changes.
 */

import type { HeatmapExport } from '../types.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const COLOR_BLOCK_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [16, 24, 48], // base (background-cold)
  [40, 88, 160],
  [60, 152, 208],
  [120, 196, 96],
  [232, 196, 64],
  [232, 120, 48],
  [220, 60, 60],
];

/** Map a dwell_ms value (0..max) to an RGB triple. Clamped at max. */
function warmthColor(value: number, max: number): [number, number, number] {
  if (value <= 0 || max <= 0) return COLOR_BLOCK_PALETTE[0] as [number, number, number];
  const t = Math.min(1, value / max);
  const slot = t * (COLOR_BLOCK_PALETTE.length - 1);
  const idx = Math.min(COLOR_BLOCK_PALETTE.length - 2, Math.floor(slot));
  const frac = slot - idx;
  const lo = COLOR_BLOCK_PALETTE[idx]!;
  const hi = COLOR_BLOCK_PALETTE[idx + 1]!;
  return [
    Math.round(lo[0] + (hi[0] - lo[0]) * frac),
    Math.round(lo[1] + (hi[1] - lo[1]) * frac),
    Math.round(lo[2] + (hi[2] - lo[2]) * frac),
  ];
}

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

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Encode a 32×18 PNG-8 (RGB truecolor) with no zlib compression
 * (DEFLATE "stored" blocks). Suitable for 32×18 or 64×N analytics tiles.
 */
export function encodeHeatmapPng(exp: HeatmapExport): Buffer {
  const width = exp.grid_width;
  const height = exp.grid_height;
  const maxDwell = exp.tiles.reduce((m, t) => Math.max(m, t.dwell_ms), 0);

  // Index map for fast lookup.
  const dwellByCoord = new Map<number, number>();
  for (const t of exp.tiles) dwellByCoord.set(t.y * width + t.x, t.dwell_ms);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — RGB rows, filter byte 0 per row.
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    raw[off] = 0; // filter
    for (let x = 0; x < width; x++) {
      const dwell = dwellByCoord.get(y * width + x) ?? 0;
      const [r, g, b] = warmthColor(dwell, maxDwell);
      const px = off + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  // "Stored" DEFLATE — block header + uncompressed data. zlib-level 0.
  const stored = deflateStored(raw);

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', stored),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function deflateStored(input: Buffer): Buffer {
  // zlib = 2-byte header + DEFLATE blocks + 4-byte Adler-32.
  const out: Buffer[] = [];
  out.push(Buffer.from([0x78, 0x01])); // zlib header, no compression

  const BLOCK = 0xffff;
  for (let off = 0; off < input.length; off += BLOCK) {
    const slice = input.subarray(off, Math.min(off + BLOCK, input.length));
    const last = off + slice.length >= input.length ? 1 : 0;
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt16LE(slice.length, 0);
    lenBuf.writeUInt16LE(~slice.length & 0xffff, 2);
    const header = Buffer.from([last]); // BTYPE 00 = stored
    out.push(header, lenBuf, slice);
  }

  // Adler-32 of the input.
  let a = 1;
  let b = 0;
  for (let i = 0; i < input.length; i++) {
    a = (a + input[i]!) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0, 0);
  out.push(adler);

  return Buffer.concat(out);
}
