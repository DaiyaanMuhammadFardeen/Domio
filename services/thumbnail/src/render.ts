/**
 * @domio/thumbnail — render producer.
 *
 * The render step turns a scene-graph into a raster. In production this
 * is the same headless renderer the export pipeline uses (puppeteer
 * in a serverless function). For local/dev/tests we ship a deterministic
 * bitmap producer: a colored rectangle whose color is derived from a
 * SHA-256 of the scene-graph + size spec. This guarantees visual
 * stability across runs while still exercising the full cache pipeline.
 */

import { createHash } from 'crypto';
import type { RenderInput } from './types.js';
import { THUMBNAIL_SIZES } from './types.js';
import { ThumbnailRenderError } from './types.js';

export interface RenderProducer {
  render(input: RenderInput): Promise<{
    bytes: Uint8Array;
    content_type: string;
    source_hash: string;
  }>;
}

/** Stable, deterministic PNG-ish bitmap producer. Used in tests and
 *  when no headless renderer is configured. The output is a minimal
 *  BMP blob — enough to test caching and CDN URL generation without
 *  pulling in a heavy image dependency. */
export class BitmapRenderProducer implements RenderProducer {
  async render(input: RenderInput): Promise<{
    bytes: Uint8Array;
    content_type: string;
    source_hash: string;
  }> {
    const size = THUMBNAIL_SIZES[input.size];
    if (!size) throw new ThumbnailRenderError(`unknown size: ${input.size}`);
    const sourceHash = hashSource(input);
    const color = colorFromHash(sourceHash);
    const bytes = encodeBmp(size.width, size.height, color);
    return { bytes, content_type: 'image/bmp', source_hash: sourceHash };
  }
}

function hashSource(input: RenderInput): string {
  // Canonical JSON for the scene-graph.
  const scene = JSON.stringify(input.scene_graph, Object.keys(input.scene_graph).sort());
  return createHash('sha256')
    .update(`${input.deck_version_id}|${input.slide_id}|${input.size}|${scene}`)
    .digest('hex');
}

function colorFromHash(hash: string): { r: number; g: number; b: number } {
  // Take 3 bytes from the hash at fixed offsets to color the bitmap.
  const r = parseInt(hash.slice(0, 2), 16);
  const g = parseInt(hash.slice(2, 4), 16);
  const b = parseInt(hash.slice(4, 6), 16);
  return { r, g, b };
}

/** Encode an N×M BMP filled with the supplied color. Uncompressed
 *  24-bit RGB. The BMP format includes a 14-byte file header and a
 *  40-byte DIB header; total file size = 54 + width*height*3. */
function encodeBmp(width: number, height: number, color: { r: number; g: number; b: number }): Uint8Array {
  const stride = width * 3;
  // BMP rows are 4-byte aligned.
  const paddedStride = (stride + 3) & ~3;
  const pixelDataSize = paddedStride * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);
  let o = 0;
  // File header
  buf.write('BM', o); o += 2;
  buf.writeUInt32LE(fileSize, o); o += 4;
  buf.writeUInt16LE(0, o); o += 2;
  buf.writeUInt16LE(0, o); o += 2;
  buf.writeUInt32LE(54, o); o += 4;
  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, o); o += 4;
  buf.writeInt32LE(width, o); o += 4;
  buf.writeInt32LE(height, o); o += 4;
  buf.writeUInt16LE(1, o); o += 2;
  buf.writeUInt16LE(24, o); o += 2;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(pixelDataSize, o); o += 4;
  buf.writeInt32LE(2835, o); o += 4;
  buf.writeInt32LE(2835, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4;
  // Pixel data (BMP rows are bottom-up).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[o++] = color.b;
      buf[o++] = color.g;
      buf[o++] = color.r;
    }
    // Pad to 4-byte boundary.
    for (let p = 0; p < paddedStride - stride; p++) buf[o++] = 0;
  }
  return new Uint8Array(buf);
}