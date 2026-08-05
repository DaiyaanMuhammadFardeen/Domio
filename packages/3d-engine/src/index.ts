/**
 * @domio/3d-engine — public surface.
 *
 * Module barrels are added by the feature lanes (renderer/loaders/coords,
 * scene/viz/particles/shaders/keyframes) as they land. The shared renderer
 * contract is exported here so downstream consumers have a stable surface
 * from day one.
 */
export * from './contracts/renderer.v1.js';
