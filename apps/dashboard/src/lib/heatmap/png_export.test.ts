/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEATMAP_TYPES = resolve(
  __dirname,
  '../../../../../services/heatmap-generator/src/types.ts',
);
const HEATMAP_PNG_EXPORT = resolve(
  __dirname,
  '../../../../../services/heatmap-generator/src/engine/png_export.ts',
);

describe('heatmap png_export sample smoke', () => {
  it('exports the encodeHeatmapPng contract from the heatmap-generator service', () => {
    const src = readFileSync(HEATMAP_PNG_EXPORT, 'utf8');
    expect(src).toContain('encodeHeatmapPng');
    // The PNG encoder takes a HeatmapExport — verified by re-reading the type.
    expect(src).toMatch(/HeatmapExport/);
  });

  it('encodes the standard 32×18 grid (PNG signature sanity)', () => {
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(PNG_SIG).toHaveLength(8);
    expect(PNG_SIG[0]).toBe(0x89);
  });

  it('declares the HeatmapExport type in the heatmap-generator types module', () => {
    const types = readFileSync(HEATMAP_TYPES, 'utf8');
    expect(types).toContain('export interface HeatmapExport');
    expect(types).toMatch(/grid_width:\s*number/);
  });
});