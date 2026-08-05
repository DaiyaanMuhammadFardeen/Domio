import { describe, it, expect } from 'vitest';
import {
  MapboxAdapter,
  GoogleAdapter,
  MapLibreAdapter,
  CustomAdapter,
  createAdapter,
} from './adapters.js';
import type { StyleConfig } from './adapters.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseViewport = { zoom: 2, lng: 0, lat: 0 };

const mapboxWithKey: StyleConfig = {
  provider: 'mapbox',
  apiKey: 'pk.test123',
  styleUrl: 'mapbox://styles/mapbox/dark-v11',
  defaultViewport: baseViewport,
};

const mapboxNoKey: StyleConfig = {
  provider: 'mapbox',
  defaultViewport: baseViewport,
};

const googleWithKey: StyleConfig = {
  provider: 'google',
  apiKey: 'AIza-test456',
  defaultViewport: baseViewport,
};

const googleNoKey: StyleConfig = {
  provider: 'google',
  defaultViewport: baseViewport,
};

const maplibreConfig: StyleConfig = {
  provider: 'maplibre',
  defaultViewport: baseViewport,
};

const maplibreCustomStyle: StyleConfig = {
  provider: 'maplibre',
  styleUrl: 'https://tiles.example.com/style.json',
  defaultViewport: baseViewport,
};

const customConfig: StyleConfig = {
  provider: 'custom',
  styleUrl: 'https://tiles.internal.co/style.json',
  defaultViewport: baseViewport,
};

const customNoStyle: StyleConfig = {
  provider: 'custom',
  defaultViewport: baseViewport,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MapboxAdapter', () => {
  it('builds a deterministic tile URL with the style ID and API key', () => {
    const adapter = new MapboxAdapter(mapboxWithKey);
    const url = adapter.buildSourceUrl('mapbox/user/style-abc');
    expect(url).toContain('api.mapbox.com');
    expect(url).toContain('mapbox/user/style-abc');
    expect(url).toContain('access_token=pk.test123');
    expect(url).toContain('tiles/256/{z}/{x}/{y}');
  });

  it('returns the configured style URL base', () => {
    const adapter = new MapboxAdapter(mapboxWithKey);
    // The style URL is used as the base for tile URL construction
    const url = adapter.buildSourceUrl('mapbox/user/style-abc');
    expect(url).toContain('mapbox/user/style-abc');
  });

  it('returns empty string when API key is missing', () => {
    const adapter = new MapboxAdapter(mapboxNoKey);
    expect(adapter.buildSourceUrl('any')).toBe('');
  });

  it('reports a missingApiKey warning when no key is provided', () => {
    const adapter = new MapboxAdapter(mapboxNoKey);
    expect(adapter.warnings).toHaveLength(1);
    expect(adapter.warnings[0]?.code).toBe('missingApiKey');
  });

  it('has no warnings when key is provided', () => {
    const adapter = new MapboxAdapter(mapboxWithKey);
    expect(adapter.warnings).toHaveLength(0);
  });

  it('returns clamped viewport', () => {
    const adapter = new MapboxAdapter({
      provider: 'mapbox',
      apiKey: 'key',
      defaultViewport: { zoom: 30, lng: 200, lat: 100 },
    });
    const vp = adapter.getViewport();
    expect(vp.zoom).toBe(22);
    expect(vp.lng).toBe(180);
    expect(vp.lat).toBe(85);
  });
});

describe('GoogleAdapter', () => {
  it('builds a deterministic static-map URL with the API key', () => {
    const adapter = new GoogleAdapter(googleWithKey);
    const url = adapter.buildSourceUrl('style-id');
    expect(url).toContain('maps.googleapis.com');
    expect(url).toContain('key=AIza-test456');
  });

  it('returns empty string when API key is missing', () => {
    const adapter = new GoogleAdapter(googleNoKey);
    expect(adapter.buildSourceUrl('any')).toBe('');
  });

  it('reports a missingApiKey warning when no key is provided', () => {
    const adapter = new GoogleAdapter(googleNoKey);
    expect(adapter.warnings).toHaveLength(1);
    expect(adapter.warnings[0]?.code).toBe('missingApiKey');
  });

  it('has no warnings when key is provided', () => {
    const adapter = new GoogleAdapter(googleWithKey);
    expect(adapter.warnings).toHaveLength(0);
  });
});

describe('MapLibreAdapter', () => {
  it('uses the default demo style when no custom URL provided', () => {
    const adapter = new MapLibreAdapter(maplibreConfig);
    const url = adapter.buildSourceUrl('any');
    expect(url).toBe('https://demotiles.maplibre.org/style.json');
  });

  it('uses the provided custom style URL', () => {
    const adapter = new MapLibreAdapter(maplibreCustomStyle);
    const url = adapter.buildSourceUrl('any');
    expect(url).toBe('https://tiles.example.com/style.json');
  });

  it('never has warnings (no key required)', () => {
    const adapter = new MapLibreAdapter(maplibreConfig);
    expect(adapter.warnings).toHaveLength(0);
  });

  it('providerName is maplibre', () => {
    const adapter = new MapLibreAdapter(maplibreConfig);
    expect(adapter.providerName).toBe('maplibre');
  });
});

describe('CustomAdapter', () => {
  it('passes through the style URL unchanged', () => {
    const adapter = new CustomAdapter(customConfig);
    const url = adapter.buildSourceUrl('any');
    expect(url).toBe('https://tiles.internal.co/style.json');
  });

  it('returns empty string when no style URL provided', () => {
    const adapter = new CustomAdapter(customNoStyle);
    expect(adapter.buildSourceUrl('any')).toBe('');
  });

  it('never has warnings (no key required)', () => {
    const adapter = new CustomAdapter(customConfig);
    expect(adapter.warnings).toHaveLength(0);
  });

  it('providerName is custom', () => {
    const adapter = new CustomAdapter(customConfig);
    expect(adapter.providerName).toBe('custom');
  });
});

describe('createAdapter factory', () => {
  it('creates a MapboxAdapter for mapbox provider', () => {
    const adapter = createAdapter(mapboxWithKey);
    expect(adapter).toBeInstanceOf(MapboxAdapter);
    expect(adapter.providerName).toBe('mapbox');
  });

  it('creates a GoogleAdapter for google provider', () => {
    const adapter = createAdapter(googleWithKey);
    expect(adapter).toBeInstanceOf(GoogleAdapter);
    expect(adapter.providerName).toBe('google');
  });

  it('creates a MapLibreAdapter for maplibre provider', () => {
    const adapter = createAdapter(maplibreConfig);
    expect(adapter).toBeInstanceOf(MapLibreAdapter);
    expect(adapter.providerName).toBe('maplibre');
  });

  it('creates a CustomAdapter for custom provider', () => {
    const adapter = createAdapter(customConfig);
    expect(adapter).toBeInstanceOf(CustomAdapter);
    expect(adapter.providerName).toBe('custom');
  });
});
