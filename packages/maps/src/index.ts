/**
 * @domio/maps — Interactive map provider adapters, choropleth joins,
 * TopoJSON/GeoJSON data binding, and quota fallback.
 *
 * Phase 11 · Feature #84
 */

export {
  // Types
  type Provider,
  type DefaultViewport,
  type StyleConfig,
  type AdapterWarning,
  type ProviderAdapter,
  // Implementations
  MapboxAdapter,
  GoogleAdapter,
  MapLibreAdapter,
  CustomAdapter,
  // Factory
  createAdapter,
} from './adapters.js';

export {
  // Constants
  ZOOM_MIN,
  ZOOM_MAX,
  LNG_MIN,
  LNG_MAX,
  LAT_MIN,
  LAT_MAX,
  // Types
  type Viewport,
  type Bounds,
  type ViewportSize,
  // Functions
  clampZoom,
  clampLng,
  clampLat,
  clampViewport,
  fitToBounds,
  boundsCentre,
} from './viewport.js';

export {
  // Types
  type Feature,
  type DataRecord,
  type JoinConfig,
  type JoinResult,
  // Functions
  joinChoropleth,
  aggregateCategories,
} from './choropleth.js';

export {
  // Types
  type FallbackMode,
  type QuotaState,
  type QuotaFallbackResult,
  // Functions
  getQuotaFallback,
  incrementUsage,
} from './quota.js';
