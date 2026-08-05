/**
 * @domio/3d-engine — GLB / glTF 2.0 loader.
 *
 * Pure binary parsing of GLB (12-byte header magic `0x46546C67` = 'glTF',
 * version 2, chunk table with JSON chunk type `0x4E4F534A` and BIN chunk
 * type `0x004E4942`).  Also accepts `.gltf` JSON input.
 *
 * Produces a `LoadedModel` (nodes, meshes, materials, animations).
 * Missing textures are reported as warnings; the renderer shows checkerboard.
 */

import type {
  LoadedModel,
  ModelNode,
  ModelMesh,
  ModelMaterial,
  ModelAnimation,
  Vec3,
  Mat4,
} from '../contracts/renderer.v1.js';

export interface GLTFLoadResult {
  model: LoadedModel;
  warnings: string[];
}

/** GLB magic number: 'glTF' as uint32 LE = 0x46546C67. */
const GLB_MAGIC = 0x4654_6c67;
/** GLB version 2. */
const GLB_VERSION = 2;
/** JSON chunk type. */
const CHUNK_TYPE_JSON = 0x4e4f_534a;
/** BIN chunk type. */
const CHUNK_TYPE_BIN = 0x004e_4942;

export class GLTFLoader {
  /**
   * Parse a GLB binary buffer.
   */
  parseGLB(buffer: ArrayBuffer): GLTFLoadResult {
    const view = new DataView(buffer);
    const warnings: string[] = [];

    // --- 12-byte header ---
    if (buffer.byteLength < 12) {
      throw new Error('GLB: buffer too small for header (minimum 12 bytes)');
    }

    const magic = view.getUint32(0, true);
    if (magic !== GLB_MAGIC) {
      throw new Error(
        `GLB: invalid magic 0x${magic.toString(16).toUpperCase()}, expected 0x${GLB_MAGIC.toString(16)}`,
      );
    }

    const version = view.getUint32(4, true);
    if (version !== GLB_VERSION) {
      throw new Error(
        `GLB: unsupported version ${version}, expected ${GLB_VERSION}`,
      );
    }

    const _totalLength = view.getUint32(8, true);
    void _totalLength;

    // --- Chunk table ---
    let offset = 12;
    let jsonChunk: string | null = null;
    let binChunk: Uint8Array | null = null;

    while (offset + 8 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkDataStart = offset + 8;

      if (chunkDataStart + chunkLength > buffer.byteLength) {
        throw new Error('GLB: chunk extends beyond buffer');
      }

      const chunkData = new Uint8Array(buffer, chunkDataStart, chunkLength);

      if (chunkType === CHUNK_TYPE_JSON) {
        // JSON chunk — decode as UTF-8, trim trailing NUL padding bytes.
        const raw = new TextDecoder().decode(chunkData);
        jsonChunk = raw.replace(/\0+$/, '');
      } else if (chunkType === CHUNK_TYPE_BIN) {
        // BIN chunk
        binChunk = chunkData;
      }

      offset = chunkDataStart + chunkLength;
      // Chunks are padded to 4-byte boundaries
      offset = (offset + 3) & ~3;
    }

    if (jsonChunk === null) {
      throw new Error('GLB: no JSON chunk found');
    }

    // Parse JSON; BIN chunk may be absent for JSON-only assets.
    return this._parseGLTFJson(jsonChunk, binChunk, warnings);
  }

  /**
   * Parse a glTF JSON string (`.gltf` format).
   */
  parseGLTFJson(json: string): GLTFLoadResult {
    const warnings: string[] = [];
    return this._parseGLTFJson(json, null, warnings);
  }

  private _parseGLTFJson(
    json: string,
    binChunk: Uint8Array | null,
    warnings: string[],
  ): GLTFLoadResult {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error('GLTF: malformed JSON');
    }

    // --- Nodes ---
    const rawNodes = (doc['nodes'] as Record<string, unknown>[] | undefined) ?? [];
    const nodes: ModelNode[] = rawNodes.map((n, i) => {
      const raw = n as Record<string, unknown>;
      const name = (raw['name'] as string | undefined) ?? `node_${i}`;
      const parentId = (raw['parent'] as string | undefined) ?? null;
      const rawMeshIdx = raw['mesh'] as number | undefined;
      const meshId = rawMeshIdx !== undefined ? `mesh_${rawMeshIdx}` : undefined;

      // Build identity transform if no matrix provided.
      const transform = this._buildTransform(raw, i);

      const node: ModelNode = { id: `node_${i}`, name, parentId, transform };
      if (meshId !== undefined) {
        node.meshId = meshId;
      }
      return node;
    });

    // --- Meshes ---
    const rawMeshes = (doc['meshes'] as Record<string, unknown>[] | undefined) ?? [];
    const meshes: ModelMesh[] = rawMeshes.map((m, i) => {
      const raw = m as Record<string, unknown>;
      const name = (raw['name'] as string | undefined) ?? `mesh_${i}`;
      const primitives = (raw['primitives'] as Record<string, unknown>[] | undefined) ?? [];
      const prim = primitives[0] ?? {};

      // Extract accessors for positions, normals, UVs, indices.
      const positions = this._readAccessor(doc, prim['attributes'] as Record<string, unknown> | undefined, 'POSITION', binChunk);
      const normals = this._readAccessor(doc, prim['attributes'] as Record<string, unknown> | undefined, 'NORMAL', binChunk);
      const uvs = this._readAccessor(doc, prim['attributes'] as Record<string, unknown> | undefined, 'TEXCOORD_0', binChunk);
      const indices = this._readIndicesAccessor(doc, prim['indices'] as number | undefined, binChunk);

      const materialId = (prim['material'] as string | undefined) ?? 'default_material';

      // Compute bounding box from positions.
      let boundsMin: Vec3 = { x: 0, y: 0, z: 0 };
      let boundsMax: Vec3 = { x: 0, y: 0, z: 0 };
      if (positions.length >= 3) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let j = 0; j < positions.length; j += 3) {
          const x = positions[j] ?? 0;
          const y = positions[j + 1] ?? 0;
          const z = positions[j + 2] ?? 0;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
        boundsMin = { x: minX, y: minY, z: minZ };
        boundsMax = { x: maxX, y: maxY, z: maxZ };
      }

      return {
        id: `mesh_${i}`,
        name,
        positions,
        normals,
        uvs,
        indices,
        materialId,
        bounds: { min: boundsMin, max: boundsMax },
      };
    });

    // --- Materials ---
    const rawMaterials = (doc['materials'] as Record<string, unknown>[] | undefined) ?? [];
    const materials: Record<string, ModelMaterial> = {};
    for (let i = 0; i < rawMaterials.length; i++) {
      const raw = rawMaterials[i] as Record<string, unknown>;
      const id = `material_${i}`;
      const name = (raw['name'] as string | undefined) ?? id;
      const pbr = (raw['pbrMetallicRoughness'] as Record<string, unknown> | undefined) ?? {};

      const baseColorFactor = pbr['baseColorFactor'] as number[] | undefined;
      const baseColor = baseColorFactor
        ? this._vec4ToHex(baseColorFactor)
        : '#ffffff';

      const metallic = (pbr['metallicFactor'] as number | undefined) ?? 1.0;
      const roughness = (pbr['roughnessFactor'] as number | undefined) ?? 1.0;
      const alphaMode = (raw['alphaMode'] as string | undefined) ?? 'OPAQUE';
      const opacity = alphaMode === 'BLEND'
        ? ((pbr['baseColorFactor'] as number[] | undefined)?.[3] ?? 1)
        : 1;

      // Textures — report missing ones as warnings.
      const baseColorTexture = this._resolveTextureUrl(doc, pbr, 'baseColorTexture', binChunk);
      const normalTexture = this._resolveTextureUrl(doc, raw, 'normalTexture', binChunk);
      const metallicRoughnessTexture = this._resolveTextureUrl(doc, pbr, 'metallicRoughnessTexture', binChunk);
      const emissiveTexture = this._resolveTextureUrl(doc, raw, 'emissiveTexture', binChunk);

      if (baseColorTexture === undefined) warnings.push(`Material "${name}": missing baseColor texture`);
      if (normalTexture === undefined && (raw['normalTexture'] as Record<string, unknown> | undefined) != null) {
        warnings.push(`Material "${name}": normal texture reference could not be resolved`);
      }

      materials[id] = {
        id,
        name,
        baseColor,
        metallic,
        roughness,
        opacity,
        textures: {
          baseColor: baseColorTexture,
          normal: normalTexture,
          metallicRoughness: metallicRoughnessTexture,
          emissive: emissiveTexture,
        },
      };
    }

    // Ensure default material exists.
    if (!materials['default_material']) {
      materials['default_material'] = {
        id: 'default_material',
        name: 'Default',
        baseColor: '#ffffff',
        metallic: 0.0,
        roughness: 0.5,
        opacity: 1.0,
        textures: { baseColor: undefined, normal: undefined, metallicRoughness: undefined, emissive: undefined },
      };
    }

    // --- Animations ---
    const rawAnimations = (doc['animations'] as Record<string, unknown>[] | undefined) ?? [];
    const animations: ModelAnimation[] = rawAnimations.map((a, i) => {
      const raw = a as Record<string, unknown>;
      const name = (raw['name'] as string | undefined) ?? `animation_${i}`;
      const channels = (raw['channels'] as Record<string, unknown>[] | undefined) ?? [];

      const animChannels = channels.map((ch) => {
        const channel = ch as Record<string, unknown>;
        const target = (channel['target'] as Record<string, unknown>) ?? {};
        const nodeId = `node_${(target['node'] as number) ?? 0}`;
        const property = (target['path'] as 'position' | 'rotation' | 'scale') ?? 'position';
        const samplerIdx = (channel['sampler'] as number) ?? 0;
        const sampler = ((raw['samplers'] as Record<string, unknown>[] | undefined)?.[samplerIdx]) as Record<string, unknown> | undefined;

        // Read keyframe times from input accessor.
        const inputIdx = sampler ? (sampler['input'] as number) : undefined;
        const times = this._readAccessorScalar(doc, inputIdx, binChunk);

        // Read keyframe values from output accessor.
        const outputIdx = sampler ? (sampler['output'] as number) : undefined;
        const values = outputIdx !== undefined
          ? this._readAccessorFloatN(doc, outputIdx, binChunk, property === 'rotation' ? 4 : 3)
          : [];

        const keyframes: Array<{ timeMs: number; value: Float32Array }> = [];
        for (let k = 0; k < times.length; k++) {
          const timeMs = (times[k] ?? 0) * 1000;
          const start = k * (property === 'rotation' ? 4 : 3);
          const value = values.slice(start, start + (property === 'rotation' ? 4 : 3));
          keyframes.push({ timeMs, value: new Float32Array(value) });
        }

        return { nodeId, property, keyframes };
      });

      // Compute duration from the last keyframe.
      let durationMs = 0;
      for (const ch of animChannels) {
        const last = ch.keyframes[ch.keyframes.length - 1];
        if (last && last.timeMs > durationMs) durationMs = last.timeMs;
      }

      return { id: `animation_${i}`, name, durationMs, channels: animChannels };
    });

    // --- Bounding radius ---
    let boundingRadius = 1.0;
    if (meshes.length > 0) {
      let maxR = 0;
      for (const mesh of meshes) {
        const { min, max } = mesh.bounds;
        const dx = Math.max(Math.abs(min.x), Math.abs(max.x));
        const dy = Math.max(Math.abs(min.y), Math.abs(max.y));
        const dz = Math.max(Math.abs(min.z), Math.abs(max.z));
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > maxR) maxR = r;
      }
      boundingRadius = maxR;
    }

    return {
      model: {
        assetId: 'parsed',
        nodes,
        meshes,
        materials,
        animations,
        boundingRadius,
      },
      warnings,
    };
  }

  // --- Accessor helpers ---

  private _readAccessor(
    doc: Record<string, unknown>,
    attributes: Record<string, unknown> | undefined,
    attrName: string,
    binChunk: Uint8Array | null,
  ): Float32Array {
    if (!attributes) return new Float32Array(0);
    const accessorIdx = attributes[attrName] as number | undefined;
    if (accessorIdx === undefined) return new Float32Array(0);
    return this._readAccessorFloatN(doc, accessorIdx, binChunk, 3);
  }

  private _readAccessorFloatN(
    doc: Record<string, unknown>,
    accessorIdx: number,
    binChunk: Uint8Array | null,
    n: number,
  ): Float32Array {
    const accessors = doc['accessors'] as Record<string, unknown>[] | undefined;
    if (!accessors || !accessors[accessorIdx]) return new Float32Array(0);
    const acc = accessors[accessorIdx] as Record<string, unknown>;
    const count = (acc['count'] as number) ?? 0;
    const bufferViewIdx = acc['bufferView'] as number | undefined;
    if (bufferViewIdx === undefined) return new Float32Array(count * n);

    const bufferViews = doc['bufferViews'] as Record<string, unknown>[] | undefined;
    if (!bufferViews || !bufferViews[bufferViewIdx]) return new Float32Array(count * n);
    const bv = bufferViews[bufferViewIdx] as Record<string, unknown>;

    const byteOffset = (bv['byteOffset'] as number) ?? 0;
    const byteLength = (bv['byteLength'] as number) ?? (count * n * 4);

    if (!binChunk) return new Float32Array(count * n);

    const bytes = binChunk.slice(byteOffset, byteOffset + byteLength);
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, byteLength / 4);
    return f32;
  }

  private _readAccessorScalar(
    doc: Record<string, unknown>,
    accessorIdx: number | undefined,
    binChunk: Uint8Array | null,
  ): number[] {
    if (accessorIdx === undefined) return [];
    const accessors = doc['accessors'] as Record<string, unknown>[] | undefined;
    if (!accessors || !accessors[accessorIdx]) return [];
    const acc = accessors[accessorIdx] as Record<string, unknown>;
    const count = (acc['count'] as number) ?? 0;
    const bufferViewIdx = acc['bufferView'] as number | undefined;
    if (bufferViewIdx === undefined) return [];

    const bufferViews = doc['bufferViews'] as Record<string, unknown>[] | undefined;
    if (!bufferViews || !bufferViews[bufferViewIdx]) return [];
    const bv = bufferViews[bufferViewIdx] as Record<string, unknown>;

    const byteOffset = (bv['byteOffset'] as number) ?? 0;
    const byteLength = (bv['byteLength'] as number) ?? (count * 4);

    if (!binChunk) return [];

    const bytes = binChunk.slice(byteOffset, byteOffset + byteLength);
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, byteLength / 4);
    return Array.from(f32);
  }

  private _readIndicesAccessor(
    doc: Record<string, unknown>,
    accessorIdx: number | undefined,
    binChunk: Uint8Array | null,
  ): Uint32Array {
    if (accessorIdx === undefined) return new Uint32Array(0);
    const accessors = doc['accessors'] as Record<string, unknown>[] | undefined;
    if (!accessors || !accessors[accessorIdx]) return new Uint32Array(0);
    const acc = accessors[accessorIdx] as Record<string, unknown>;
    const count = (acc['count'] as number) ?? 0;
    const bufferViewIdx = acc['bufferView'] as number | undefined;
    if (bufferViewIdx === undefined) return new Uint32Array(0);

    const bufferViews = doc['bufferViews'] as Record<string, unknown>[] | undefined;
    if (!bufferViews || !bufferViews[bufferViewIdx]) return new Uint32Array(0);
    const bv = bufferViews[bufferViewIdx] as Record<string, unknown>;

    const byteOffset = (bv['byteOffset'] as number) ?? 0;
    const byteLength = (bv['byteLength'] as number) ?? (count * 4);

    if (!binChunk) return new Uint32Array(0);

    const bytes = binChunk.slice(byteOffset, byteOffset + byteLength);

    // Determine component type — default to uint16, check componentType.
    const componentType = (acc['componentType'] as number) ?? 5123; // 5123 = UNSIGNED_SHORT
    if (componentType === 5125) {
      // UNSIGNED_INT
      return new Uint32Array(bytes.buffer, bytes.byteOffset, byteLength / 4);
    }
    // UNSIGNED_SHORT (5123)
    const u16 = new Uint16Array(bytes.buffer, bytes.byteOffset, byteLength / 2);
    const u32 = new Uint32Array(u16.length);
    for (let i = 0; i < u16.length; i++) {
      u32[i] = u16[i] ?? 0;
    }
    return u32;
  }

  private _resolveTextureUrl(
    doc: Record<string, unknown>,
    parent: Record<string, unknown>,
    textureKey: string,
    _binChunk: Uint8Array | null,
  ): string | undefined {
    const texRef = parent[textureKey] as Record<string, unknown> | undefined;
    if (!texRef) return undefined;

    const textureIdx = texRef['index'] as number | undefined;
    if (textureIdx === undefined) return undefined;

    const textures = doc['textures'] as Record<string, unknown>[] | undefined;
    if (!textures || !textures[textureIdx]) return undefined;

    const tex = textures[textureIdx] as Record<string, unknown>;
    const sourceIdx = tex['source'] as number | undefined;
    if (sourceIdx === undefined) return undefined;

    const images = doc['images'] as Record<string, unknown>[] | undefined;
    if (!images || !images[sourceIdx]) return undefined;

    const img = images[sourceIdx] as Record<string, unknown>;
    const uri = img['uri'] as string | undefined;
    return uri;
  }

  private _buildTransform(raw: Record<string, unknown>, _index: number): Mat4 {
    const matrix = raw['matrix'] as number[] | undefined;
    if (matrix && matrix.length === 16) {
      return { elements: new Float32Array(matrix) };
    }
    // Default: identity matrix
    return {
      elements: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]),
    };
  }

  private _vec4ToHex(rgba: number[]): string {
    const r = Math.round((rgba[0] ?? 1) * 255);
    const g = Math.round((rgba[1] ?? 1) * 255);
    const b = Math.round((rgba[2] ?? 1) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}
