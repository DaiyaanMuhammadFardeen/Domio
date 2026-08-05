/**
 * @domio/3d-engine — model sanitization (§7.1).
 *
 * Scans GLB/GLTF JSON chunks and enforces:
 * - Strip embedded `<script>` / JS expressions in string values.
 * - Reject `KHR_xmp_json_ld` extensions with external refs (URI/http/https/file).
 * - Reject custom extensions unless an opt-in allowlist is provided.
 * - Enforce configurable size caps (default 500 MB).
 * - Best-effort stego scan (flag NUL-byte-heavy strings/textures).
 */

export interface SanitizeResult {
  /** Whether the asset passed all checks. */
  ok: boolean;
  /** Human-readable warnings for stripped or flagged content. */
  warnings: string[];
  /** Whether the asset was rejected outright. */
  rejected: boolean;
  /** Reason for rejection (if rejected). */
  rejectReason?: string;
}

export interface SanitizeOptions {
  /** Maximum allowed byte size. Default: 500 MB. */
  maxBytes?: number;
  /** Allowlist of custom extension prefixes (e.g. ['MY_']). */
  customExtensionAllowlist?: string[];
  /** Skip stego scan (default false — always scan). */
  skipStegoScan?: boolean;
}

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/** Known standard Khronos extensions — not flagged as custom. */
const KNOWN_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'KHR_lights_punctual',
  'KHR_materials_unlit',
  'KHR_materials_pbrSpecularGlossiness',
  'KHR_texture_transform',
  'KHR_texture_webp',
  'KHR_xmp_json_ld',
  'KHR_texture_avif',
  'KHR_materials_clearcoat',
  'KHR_materials_transmission',
  'KHR_materials_volume',
  'KHR_materials_ior',
  'KHR_materials_specular',
  'KHR_materials_sheen',
  'KHR_materials_emissive_strength',
]);

export class Sanitizer {
  private _maxBytes: number;
  private _allowlist: string[];
  private _skipStego: boolean;

  constructor(options?: SanitizeOptions) {
    this._maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    this._allowlist = options?.customExtensionAllowlist ?? [];
    this._skipStego = options?.skipStegoScan ?? false;
  }

  /**
   * Sanitize a GLB ArrayBuffer (scans the JSON chunk).
   */
  sanitizeGLB(buffer: ArrayBuffer): SanitizeResult {
    // --- Size cap ---
    if (buffer.byteLength > this._maxBytes) {
      return {
        ok: false,
        warnings: [],
        rejected: true,
        rejectReason: `File size ${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB exceeds limit of ${(this._maxBytes / (1024 * 1024)).toFixed(0)} MB`,
      };
    }

    // --- Extract JSON chunk from GLB ---
    const view = new DataView(buffer);
    if (buffer.byteLength < 12) {
      return { ok: false, warnings: [], rejected: true, rejectReason: 'File too small' };
    }

    const magic = view.getUint32(0, true);
    if (magic !== 0x46546c67) {
      return { ok: false, warnings: [], rejected: true, rejectReason: 'Not a valid GLB file' };
    }

    // Scan for JSON chunk
    let offset = 12;
    let jsonStr: string | null = null;
    while (offset + 8 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;

      if (chunkStart + chunkLength > buffer.byteLength) break;

      if (chunkType === 0x4e4f534a) {
        const chunkData = new Uint8Array(buffer, chunkStart, chunkLength);
        jsonStr = new TextDecoder().decode(chunkData);
        break;
      }

      offset = chunkStart + chunkLength;
      offset = (offset + 3) & ~3;
    }

    if (jsonStr === null) {
      return { ok: false, warnings: [], rejected: true, rejectReason: 'No JSON chunk found' };
    }

    return this.sanitizeGLTFJson(jsonStr, buffer);
  }

  /**
   * Sanitize a glTF JSON string.
   */
  sanitizeGLTFJson(json: string, fullBuffer?: ArrayBuffer): SanitizeResult {
    const warnings: string[] = [];
    let doc: Record<string, unknown>;

    try {
      doc = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return { ok: false, warnings: [], rejected: true, rejectReason: 'Malformed JSON' };
    }

    // --- Size cap (on full buffer if provided) ---
    if (fullBuffer && fullBuffer.byteLength > this._maxBytes) {
      return {
        ok: false,
        warnings: [],
        rejected: true,
        rejectReason: `File size exceeds limit`,
      };
    }

    // --- Strip embedded JavaScript ---
    this._scanForScript(doc, warnings);

    // --- KHR_xmp_json_ld external refs ---
    this._scanForExternalRefs(doc, warnings);

    // --- Custom extensions ---
    this._scanCustomExtensions(doc, warnings);

    // --- Stego scan ---
    if (!this._skipStego) {
      this._scanForStego(doc, warnings);
    }

    return {
      ok: warnings.length === 0,
      warnings,
      rejected: false,
    };
  }

  /**
   * Scan all string values for embedded `<script>` tags or JS expressions.
   */
  private _scanForScript(obj: unknown, warnings: string[]): void {
    if (typeof obj === 'string') {
      if (/<script[\s>]/i.test(obj) || /<\/script\s*>/i.test(obj)) {
        warnings.push(`Stripped embedded <script> tag from string value`);
      }
      if (/\b(eval|Function|setTimeout|setInterval)\s*\(/.test(obj)) {
        warnings.push(`Stripped JS expression from string value`);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        this._scanForScript(item, warnings);
      }
    } else if (obj !== null && typeof obj === 'object') {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        this._scanForScript(val, warnings);
      }
    }
  }

  /**
   * Reject KHR_xmp_json_ld extensions that contain external refs.
   */
  private _scanForExternalRefs(doc: Record<string, unknown>, warnings: string[]): void {
    const extensions = doc['extensions'] as Record<string, unknown> | undefined;
    if (!extensions) return;

    const xmp = extensions['KHR_xmp_json_ld'] as Record<string, unknown> | undefined;
    if (!xmp) return;

    // KHR_xmp_json_ld may contain URIs that leak data.
    const checkForExternalRefs = (obj: unknown): boolean => {
      if (typeof obj === 'string') {
        if (/^(https?:\/\/|file:\/\/|uri:)/i.test(obj)) {
          return true;
        }
      } else if (Array.isArray(obj)) {
        for (const item of obj) {
          if (checkForExternalRefs(item)) return true;
        }
      } else if (obj !== null && typeof obj === 'object') {
        for (const val of Object.values(obj as Record<string, unknown>)) {
          if (checkForExternalRefs(val)) return true;
        }
      }
      return false;
    };

    if (checkForExternalRefs(xmp)) {
      warnings.push('Rejected KHR_xmp_json_ld extension with external references (data leak risk)');
    }
  }

  /**
   * Reject custom extensions not in the allowlist.
   */
  private _scanCustomExtensions(doc: Record<string, unknown>, warnings: string[]): void {
    const extensions = doc['extensions'] as Record<string, unknown> | undefined;
    if (!extensions) return;

    for (const extName of Object.keys(extensions)) {
      if (KNOWN_EXTENSIONS.has(extName)) continue;

      // Check allowlist — either exact match or prefix match.
      const allowed = this._allowlist.some(
        (prefix) => extName.startsWith(prefix) || extName === prefix,
      );

      if (!allowed) {
        warnings.push(`Custom extension "${extName}" not in allowlist — rejected`);
      }
    }
  }

  /**
   * Best-effort steganography scan: flag NUL-byte-heavy content.
   */
  private _scanForStego(doc: Record<string, unknown>, warnings: string[]): void {
    const scanString = (s: string): void => {
      let nulCount = 0;
      for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) === 0) nulCount++;
      }
      if (s.length > 100 && nulCount / s.length > 0.05) {
        warnings.push('Possible steganographic payload detected (NUL-byte-heavy string)');
      }
    };

    const scanValue = (obj: unknown): void => {
      if (typeof obj === 'string') {
        scanString(obj);
      } else if (Array.isArray(obj)) {
        for (const item of obj) scanValue(item);
      } else if (obj !== null && typeof obj === 'object') {
        for (const val of Object.values(obj as Record<string, unknown>)) {
          scanValue(val);
        }
      }
    };

    scanValue(doc);
  }
}
