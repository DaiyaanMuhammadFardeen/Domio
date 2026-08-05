/**
 * @domio/3d-engine — environment map registry.
 *
 * Registry keyed by environment id with a DEFAULT_NEUTRAL fallback.
 */

export interface EnvMapEntry {
  id: string;
  /** URL of the environment map (HDR or equirectangular). */
  url: string;
  /** Human-readable label. */
  label: string;
}

/** The default neutral environment map (solid gray, 50% intensity). */
const DEFAULT_NEUTRAL: EnvMapEntry = {
  id: 'default_neutral',
  url: 'data:application/octet-stream;base64,',
  label: 'Default Neutral',
};

export class EnvMapRegistry {
  private _entries = new Map<string, EnvMapEntry>();

  constructor() {
    // Always register the default neutral envmap.
    this._entries.set(DEFAULT_NEUTRAL.id, DEFAULT_NEUTRAL);
  }

  /**
   * Register an environment map.
   */
  register(entry: EnvMapEntry): void {
    this._entries.set(entry.id, entry);
  }

  /**
   * Get an environment map by id.
   * Returns the default neutral fallback for unknown ids.
   */
  get(id: string): EnvMapEntry {
    return this._entries.get(id) ?? DEFAULT_NEUTRAL;
  }

  /**
   * Check if an environment map exists.
   */
  has(id: string): boolean {
    return this._entries.has(id);
  }

  /**
   * Remove an environment map. Cannot remove the default neutral.
   */
  remove(id: string): boolean {
    if (id === DEFAULT_NEUTRAL.id) return false;
    return this._entries.delete(id);
  }

  /**
   * List all registered environment maps.
   */
  list(): EnvMapEntry[] {
    return Array.from(this._entries.values());
  }
}
