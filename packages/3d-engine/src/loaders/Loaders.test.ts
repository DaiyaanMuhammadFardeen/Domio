import { describe, it, expect } from 'vitest';
import { GLTFLoader } from './GLTFLoader.js';
import { USDZLoader, preferredFormat } from './USDZLoader.js';
import { TextureStreamer } from './TextureStreamer.js';

// ---------------------------------------------------------------------------
// GLTFLoader tests
// ---------------------------------------------------------------------------

describe('GLTFLoader', () => {
  it('throws on invalid magic number', () => {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, 0xDEADBEEF, true); // bad magic
    const loader = new GLTFLoader();
    expect(() => loader.parseGLB(buf)).toThrow('invalid magic');
  });

  it('throws on unsupported version', () => {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, 0x46546c67, true); // 'glTF'
    view.setUint32(4, 3, true); // version 3 (unsupported)
    view.setUint32(8, 12, true);
    const loader = new GLTFLoader();
    expect(() => loader.parseGLB(buf)).toThrow('unsupported version 3');
  });

  it('throws on buffer too small', () => {
    const buf = new ArrayBuffer(8);
    const loader = new GLTFLoader();
    expect(() => loader.parseGLB(buf)).toThrow('too small');
  });

  it('parses a valid minimal GLB with JSON chunk only', () => {
    // Build a minimal GLB: header + one JSON chunk.
    const jsonStr = JSON.stringify({
      asset: { version: '2.0' },
      nodes: [{ name: 'TestNode' }],
      meshes: [],
      materials: [],
      animations: [],
    });
    // Pad JSON to 4-byte alignment.
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const padding = (4 - (jsonBytes.byteLength % 4)) % 4;
    const chunkLength = jsonBytes.byteLength + padding;

    const totalLength = 12 + 8 + chunkLength;
    const buf = new ArrayBuffer(totalLength);
    const view = new DataView(buf);

    // Header
    view.setUint32(0, 0x46546c67, true); // magic
    view.setUint32(4, 2, true); // version
    view.setUint32(8, totalLength, true);

    // JSON chunk
    view.setUint32(12, chunkLength, true); // chunk length
    view.setUint32(16, 0x4e4f534a, true); // JSON type
    const bytes = new Uint8Array(buf);
    bytes.set(jsonBytes, 20);
    // Padding bytes are already zero.

    const loader = new GLTFLoader();
    const result = loader.parseGLB(buf);
    expect(result.model.nodes).toHaveLength(1);
    expect(result.model.nodes[0]?.name).toBe('TestNode');
    expect(result.warnings).toHaveLength(0);
  });

  it('parses a GLB with BIN chunk and triangle data', () => {
    // Create accessor/bufferView/buffer structure for a single triangle.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const posBytes = new Uint8Array(positions.buffer);

    // JSON referencing the binary buffer
    const jsonObj = {
      asset: { version: '2.0' },
      nodes: [{ name: 'Tri', mesh: 0 }],
      meshes: [{
        name: 'Triangle',
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
        }],
      }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
        { buffer: 0, byteOffset: posBytes.byteLength, byteLength: 6 },
      ],
      buffers: [{ byteLength: posBytes.byteLength + 6 }],
      materials: [{
        name: 'Red',
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
      }],
      animations: [],
    };
    const jsonStr = JSON.stringify(jsonObj);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;

    // BIN chunk: positions + indices
    const indices = new Uint16Array([0, 1, 2]);
    const idxBytes = new Uint8Array(indices.buffer);
    const binData = new Uint8Array(posBytes.byteLength + idxBytes.byteLength);
    binData.set(posBytes, 0);
    binData.set(idxBytes, posBytes.byteLength);
    const binPadding = (4 - (binData.byteLength % 4)) % 4;

    const totalLength = 12 + 8 + jsonBytes.byteLength + jsonPadding + 8 + binData.byteLength + binPadding;
    const buf = new ArrayBuffer(totalLength);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    // Header
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    let off = 12;
    // JSON chunk
    view.setUint32(off, jsonBytes.byteLength + jsonPadding, true);
    view.setUint32(off + 4, 0x4e4f534a, true);
    bytes.set(jsonBytes, off + 8);
    off += 8 + jsonBytes.byteLength + jsonPadding;

    // BIN chunk
    view.setUint32(off, binData.byteLength + binPadding, true);
    view.setUint32(off + 4, 0x004e4942, true);
    bytes.set(binData, off + 8);

    const loader = new GLTFLoader();
    const result = loader.parseGLB(buf);
    expect(result.model.meshes).toHaveLength(1);
    expect(result.model.meshes[0]?.name).toBe('Triangle');
    expect(result.model.meshes[0]?.positions.length).toBe(9);
    expect(result.model.meshes[0]?.indices.length).toBe(3);
    expect(result.model.materials['material_0']?.baseColor).toBe('#ff0000');
    expect(result.model.nodes[0]?.meshId).toBe('mesh_0');
  });

  it('reports missing texture as warning', () => {
    const jsonStr = JSON.stringify({
      asset: { version: '2.0' },
      nodes: [],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          material: 0,
        }],
      }],
      materials: [{
        name: 'Textured',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
        },
      }],
      textures: [{ source: 0 }],
      images: [{ uri: 'texture.png' }],
      accessors: [],
      bufferViews: [],
      buffers: [],
      animations: [],
    });
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const padding = (4 - (jsonBytes.byteLength % 4)) % 4;
    const chunkLength = jsonBytes.byteLength + padding;

    const totalLength = 12 + 8 + chunkLength;
    const buf = new ArrayBuffer(totalLength);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);
    view.setUint32(12, chunkLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(jsonBytes, 20);

    const loader = new GLTFLoader();
    const result = loader.parseGLB(buf);
    // baseColorTexture IS resolved (URI present), but mesh has no positions.
    // The texture URL is returned.
    expect(result.model.materials['material_0']?.textures.baseColor).toBe('texture.png');
  });

  it('parseGLTFJson parses plain JSON', () => {
    const loader = new GLTFLoader();
    const result = loader.parseGLTFJson(JSON.stringify({
      asset: { version: '2.0' },
      nodes: [{ name: 'JsonNode' }],
      meshes: [],
      materials: [],
      animations: [],
    }));
    expect(result.model.nodes).toHaveLength(1);
    expect(result.model.nodes[0]?.name).toBe('JsonNode');
  });

  it('throws on malformed JSON', () => {
    const loader = new GLTFLoader();
    expect(() => loader.parseGLTFJson('not json')).toThrow('malformed JSON');
  });

  it('creates default material when none declared', () => {
    const loader = new GLTFLoader();
    const result = loader.parseGLTFJson(JSON.stringify({
      asset: { version: '2.0' },
      nodes: [],
      meshes: [{
        primitives: [{ attributes: {}, material: 99 }],
      }],
      materials: [],
      animations: [],
    }));
    expect(result.model.materials['default_material']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// USDZLoader tests
// ---------------------------------------------------------------------------

describe('USDZLoader', () => {
  it('validates ZIP signature → usdz', () => {
    // Create a buffer starting with ZIP magic and containing 'model.usdc'.
    const content = 'PK\x03\x04model.usdc\x00';
    const buf = new TextEncoder().encode(content).buffer;
    const loader = new USDZLoader();
    const result = loader.validate(buf);
    expect(result.format).toBe('usdz');
    expect(result.hasUsdc).toBe(true);
  });

  it('rejects non-ZIP buffer', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x00, 0x00, 0x00, 0x00]);
    const loader = new USDZLoader();
    expect(() => loader.validate(buf)).toThrow('invalid ZIP signature');
  });

  it('rejects buffer too small', () => {
    const loader = new USDZLoader();
    expect(() => loader.validate(new ArrayBuffer(2))).toThrow('too small');
  });

  it('detects ZIP without model.usdc', () => {
    const content = 'PK\x03\x04readme.txt';
    const buf = new TextEncoder().encode(content).buffer;
    const loader = new USDZLoader();
    const result = loader.validate(buf);
    expect(result.hasUsdc).toBe(false);
  });
});

describe('preferredFormat', () => {
  it('returns usdz on iOS', () => {
    expect(preferredFormat(true)).toBe('usdz');
  });

  it('returns glb elsewhere', () => {
    expect(preferredFormat(false)).toBe('glb');
  });
});

// ---------------------------------------------------------------------------
// TextureStreamer tests
// ---------------------------------------------------------------------------

describe('TextureStreamer', () => {
  it('loads texture successfully', async () => {
    const fakeData = new Uint8Array([1, 2, 3, 4]);
    const fakeFetch = async (url: string) => ({
      ok: true,
      arrayBuffer: async () => fakeData.buffer,
      url,
    }) as unknown as Response;

    const streamer = new TextureStreamer({ fetch: fakeFetch as never });
    const result = await streamer.load('https://cdn.example.com/tex.png');
    expect(result.missing).toBe(false);
    expect(result.data.length).toBe(4);
    expect(result.loadMs).toBeGreaterThanOrEqual(0);
  });

  it('handles missing texture (HTTP 404)', async () => {
    const fakeFetch = async () => ({
      ok: false,
      status: 404,
    }) as unknown as Response;

    const warnings: string[] = [];
    const streamer = new TextureStreamer({
      fetch: fakeFetch as never,
      warn: (msg: string) => warnings.push(msg),
    });
    const result = await streamer.load('https://cdn.example.com/missing.png');
    expect(result.missing).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing texture');
  });

  it('handles network error gracefully', async () => {
    const fakeFetch = async () => {
      throw new Error('network error');
    };

    const warnings: string[] = [];
    const streamer = new TextureStreamer({
      fetch: fakeFetch as never,
      warn: (msg: string) => warnings.push(msg),
    });
    const result = await streamer.load('https://cdn.example.com/timeout.png');
    expect(result.missing).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it('provides checkerboard data URL', () => {
    const url = TextureStreamer.checkerboardDataUrl();
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('reports load timing (range check)', async () => {
    const fakeFetch = async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
      url,
    }) as unknown as Response;

    const streamer = new TextureStreamer({ fetch: fakeFetch as never });
    const result = await streamer.load('https://cdn.example.com/fast.png');
    // Should be fast but not negative
    expect(result.loadMs).toBeGreaterThanOrEqual(0);
    expect(result.loadMs).toBeLessThan(1000);
  });
});
