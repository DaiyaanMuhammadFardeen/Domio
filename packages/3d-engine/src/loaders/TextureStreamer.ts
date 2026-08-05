/**
 * @domio/3d-engine — async texture fetch wrapper with timing.
 *
 * Injects an optional `fetch` function for testability.  Missing textures
 * produce a checkerboard placeholder and a console.warn.
 */

export interface TextureLoadResult {
  /** The texture URL that was loaded (or the placeholder). */
  url: string;
  /** Load time in milliseconds. */
  loadMs: number;
  /** Whether the texture was missing (checkerboard placeholder used). */
  missing: boolean;
  /** The raw bytes loaded (empty for missing textures). */
  data: Uint8Array;
}

export type FetchFn = (url: string) => Promise<Response>;

/** A tiny 2×2 checkerboard PNG (base64) used as a placeholder. */
const CHECKERBOARD_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVQI12P4z8BQD8RABwA//wH/KQq3hQAAAABJRU5ErkJggg==';

export class TextureStreamer {
  private _fetch: FetchFn;
  private _warn: (msg: string) => void;

  constructor(deps?: { fetch?: FetchFn; warn?: (msg: string) => void }) {
    this._fetch = deps?.fetch ?? globalThis.fetch.bind(globalThis);
    this._warn = deps?.warn ?? ((msg: string) => { console.warn(msg); });
  }

  /**
   * Load a texture by URL.
   *
   * @returns A `TextureLoadResult` with timing information.
   */
  async load(url: string): Promise<TextureLoadResult> {
    const start = performance.now();
    try {
      const response = await this._fetch(url);
      if (!response.ok) {
        this._warn(`TextureStreamer: missing texture at ${url} (HTTP ${response.status})`);
        return {
          url,
          loadMs: performance.now() - start,
          missing: true,
          data: new Uint8Array(0),
        };
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        url,
        loadMs: performance.now() - start,
        missing: false,
        data: new Uint8Array(arrayBuffer),
      };
    } catch {
      this._warn(`TextureStreamer: failed to load texture at ${url}`);
      return {
        url,
        loadMs: performance.now() - start,
        missing: true,
        data: new Uint8Array(0),
      };
    }
  }

  /**
   * Get a checkerboard placeholder as a base64 data URL.
   */
  static checkerboardDataUrl(): string {
    return `data:image/png;base64,${CHECKERBOARD_BASE64}`;
  }
}
