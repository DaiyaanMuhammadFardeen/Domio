/**
 * Map provider adapters — headless, zero-runtime-dependency.
 *
 * Each adapter takes a style config and produces deterministic URL construction,
 * viewport defaults, and provider metadata. Real tile fetching is browser-only;
 * all logic here is testable in Node.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Provider = 'mapbox' | 'google' | 'maplibre' | 'custom';

export interface DefaultViewport {
  readonly zoom: number;
  readonly lng: number;
  readonly lat: number;
}

export interface StyleConfig {
  readonly provider: Provider;
  readonly styleUrl?: string;
  readonly apiKey?: string;
  readonly defaultViewport: DefaultViewport;
}

export interface AdapterWarning {
  readonly code: string;
  readonly message: string;
}

export interface ProviderAdapter {
  /** Canonical provider name. */
  readonly providerName: Provider;

  /** Produce a deterministic source/style URL for the given style ID. */
  buildSourceUrl(styleId: string): string;

  /** Return the default viewport for this style config. */
  getViewport(): DefaultViewport;

  /** Any warnings produced during adapter construction (e.g. missing key). */
  readonly warnings: readonly AdapterWarning[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampZoom(z: number): number {
  return Math.max(0, Math.min(22, z));
}

function clampLng(l: number): number {
  return Math.max(-180, Math.min(180, l));
}

function clampLat(l: number): number {
  return Math.max(-85, Math.min(85, l));
}

function normaliseViewport(vp: DefaultViewport): DefaultViewport {
  return {
    zoom: clampZoom(vp.zoom),
    lng: clampLng(vp.lng),
    lat: clampLat(vp.lat),
  };
}

// ---------------------------------------------------------------------------
// Mapbox
// ---------------------------------------------------------------------------

export class MapboxAdapter implements ProviderAdapter {
  readonly providerName = 'mapbox' as const;
  readonly warnings: readonly AdapterWarning[];
  /** The configured Mapbox style URL (e.g. "mapbox://styles/mapbox/streets-v12"). */
  readonly configuredStyleUrl: string;

  private readonly apiKey: string;
  private readonly viewport: DefaultViewport;

  constructor(config: StyleConfig) {
    this.viewport = normaliseViewport(config.defaultViewport);

    if (!config.apiKey) {
      this.warnings = [
        { code: 'missingApiKey', message: 'Mapbox requires an API key' },
      ];
      this.apiKey = '';
    } else {
      this.warnings = [];
      this.apiKey = config.apiKey;
    }

    this.configuredStyleUrl = config.styleUrl ?? 'mapbox://styles/mapbox/streets-v12';
  }

  buildSourceUrl(styleId: string): string {
    if (!this.apiKey) {
      return '';
    }
    // Mapbox tile URL: api.mapbox.com/styles/v1/{owner}/{style}/tiles/...
    // styleId format is "owner/style" (e.g. "mapbox/streets-v12")
    return `https://api.mapbox.com/styles/v1/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${this.apiKey}`;
  }

  getViewport(): DefaultViewport {
    return this.viewport;
  }
}

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

export class GoogleAdapter implements ProviderAdapter {
  readonly providerName = 'google' as const;
  readonly warnings: readonly AdapterWarning[];

  private readonly apiKey: string;
  private readonly viewport: DefaultViewport;

  constructor(config: StyleConfig) {
    this.viewport = normaliseViewport(config.defaultViewport);

    if (!config.apiKey) {
      this.warnings = [
        { code: 'missingApiKey', message: 'Google Maps requires an API key' },
      ];
      this.apiKey = '';
    } else {
      this.warnings = [];
      this.apiKey = config.apiKey;
    }
  }

  buildSourceUrl(_styleId: string): string {
    if (!this.apiKey) {
      return '';
    }
    return `https://maps.googleapis.com/maps/api/staticmap?key=${this.apiKey}`;
  }

  getViewport(): DefaultViewport {
    return this.viewport;
  }
}

// ---------------------------------------------------------------------------
// MapLibre (OSM-based, no key required)
// ---------------------------------------------------------------------------

export class MapLibreAdapter implements ProviderAdapter {
  readonly providerName = 'maplibre' as const;
  readonly warnings: readonly AdapterWarning[] = [];

  private readonly styleUrl: string;
  private readonly viewport: DefaultViewport;

  constructor(config: StyleConfig) {
    this.viewport = normaliseViewport(config.defaultViewport);
    this.styleUrl =
      config.styleUrl ?? 'https://demotiles.maplibre.org/style.json';
  }

  buildSourceUrl(_styleId: string): string {
    return this.styleUrl;
  }

  getViewport(): DefaultViewport {
    return this.viewport;
  }
}

// ---------------------------------------------------------------------------
// Custom tile server
// ---------------------------------------------------------------------------

export class CustomAdapter implements ProviderAdapter {
  readonly providerName = 'custom' as const;
  readonly warnings: readonly AdapterWarning[] = [];

  private readonly styleUrl: string;
  private readonly viewport: DefaultViewport;

  constructor(config: StyleConfig) {
    this.viewport = normaliseViewport(config.defaultViewport);
    if (!config.styleUrl) {
      this.styleUrl = '';
    } else {
      this.styleUrl = config.styleUrl;
    }
  }

  buildSourceUrl(_styleId: string): string {
    // Custom adapter: style URL passed through, no key required
    return this.styleUrl;
  }

  getViewport(): DefaultViewport {
    return this.viewport;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdapter(config: StyleConfig): ProviderAdapter {
  switch (config.provider) {
    case 'mapbox':
      return new MapboxAdapter(config);
    case 'google':
      return new GoogleAdapter(config);
    case 'maplibre':
      return new MapLibreAdapter(config);
    case 'custom':
      return new CustomAdapter(config);
  }
}
