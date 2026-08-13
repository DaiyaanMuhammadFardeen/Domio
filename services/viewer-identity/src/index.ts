/**
 * Viewer-identity — barrel exports (Phase 17 W3).
 */

export { buildApp } from './server.js';
export { buildInMemoryStore, type IdentityStore } from './store/inmemory.js';
export { hashViewerId, hashEmail, classifyIp } from './identity/hash.js';
export { stitchViewer, type StitchInput, type StitchOutput } from './identity/stitch.js';
export {
  evaluateMode,
  defaultPolicyFor,
  CURRENT_POLICY_VERSION,
  ipClassFor,
} from './consent/policy.js';
export { eraseViewer, exportViewer, objectToTracking, GdprError } from './gdpr/handlers.js';
export {
  buildIdentityMirror,
  NullIdentityMirror,
  type IdentityMirror,
  type IdentityMirrorClient,
} from './mirror/index.js';
export type {
  PrivacyMode,
  Region,
  IdentityConfig,
  ViewerRecord,
  IdentityLink,
  ConsentEvent,
} from './types.js';
