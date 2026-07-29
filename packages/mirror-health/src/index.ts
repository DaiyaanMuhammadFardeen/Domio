/**
 * Public API for @domio/mirror-health.
 *
 * Shell scripts in infrastructure/mirrors/ invoke this via `node --import tsx`
 * through a thin CLI wrapper. Tests use the API directly.
 */

export { UrlValidationError, validateMirrorUrl } from "./url.js";
export { probeEndpoint } from "./probe.js";
export { decideFailover, decideFromProbes } from "./decide.js";
export type {
  Ecosystem,
  HealthStatus,
  MirrorEndpoints,
  ProbeResult,
  FailoverDecision,
} from "./types.js";
