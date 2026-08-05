/**
 * @domio/3d-engine — USDZ loader.
 *
 * Minimal: validates the ZIP signature (`PK\x03\x04`), checks for
 * `model.usdc` entry presence, and returns an asset descriptor.
 * The editor renders USDZ via `<model-viewer>` / QuickLook; the loader
 * just gates format support.
 */

export interface USDZLoadResult {
  format: 'usdz';
  /** Whether `model.usdc` was found inside the archive. */
  hasUsdc: boolean;
  /** Entry names found in the ZIP. */
  entries: string[];
}

/** ZIP local file header magic: PK\x03\x04 = 0x04034b50. */
const ZIP_MAGIC = 0x04034b50;

export class USDZLoader {
  /**
   * Validate a USDZ file (which is a ZIP archive).
   * @param buffer - The file contents as an ArrayBuffer.
   * @returns An asset descriptor if the ZIP signature is valid.
   * @throws If the buffer does not start with a valid ZIP signature.
   */
  validate(buffer: ArrayBuffer): USDZLoadResult {
    if (buffer.byteLength < 4) {
      throw new Error('USDZ: file too small');
    }

    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);

    if (magic !== ZIP_MAGIC) {
      throw new Error(
        `USDZ: invalid ZIP signature 0x${magic.toString(16).toUpperCase()}, expected 0x${ZIP_MAGIC.toString(16)}`,
      );
    }

    // Scan for `model.usdc` in the ZIP entry names.
    // A minimal ZIP scan: read central directory entries or local file
    // headers.  For a production loader we'd use a full ZIP parser, but
    // for format-gating we do a heuristic byte scan for the string.
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder('latin1').decode(bytes);
    const hasUsdc = text.includes('model.usdc');

    // Extract visible entry names (heuristic: look for known USDZ files).
    const entries: string[] = [];
    const knownFiles = ['model.usdc', 'model.usda', 'model.usd', 'model.usdz'];
    for (const name of knownFiles) {
      if (text.includes(name)) {
        entries.push(name);
      }
    }

    return {
      format: 'usdz',
      hasUsdc,
      entries,
    };
  }
}

/**
 * Determine the preferred 3D format based on the platform.
 * On iOS/Safari, prefer USDZ (AR Quick Look); elsewhere, prefer GLB.
 */
export function preferredFormat(isIOS: boolean): 'usdz' | 'glb' {
  return isIOS ? 'usdz' : 'glb';
}
