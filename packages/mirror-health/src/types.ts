/**
 * Public types for the mirror-health library.
 *
 * A "mirror" is a regional cache that fronts an upstream registry. The library
 * is intentionally vendor-neutral: it does not know about npm, PyPI, Go, or
 * Docker semantics — those are caller concerns. The library provides:
 *
 *   1. URL validation
 *   2. Mirror vs. upstream health probing
 *   3. A failover decision (which URL should the caller use right now)
 *
 * All decisions are deterministic given the same input — the library has no
 * global mutable state, no caches across calls.
 */

export type Ecosystem = "npm" | "pypi" | "go-modules" | "docker";

export interface MirrorEndpoints {
  /** Display label for the mirror (e.g. "bd-npm"). */
  readonly mirrorName: string;
  /** Full URL to the mirror endpoint (must be https:// or http://). */
  readonly mirrorUrl: string;
  /** Full URL to the upstream (must be https://). */
  readonly upstreamUrl: string;
  /** Ecosystem for logging/decision context. */
  readonly ecosystem: Ecosystem;
}

export type HealthStatus =
  /** Endpoint responded with 2xx within the timeout. */
  | "ok"
  /** Endpoint responded but returned a non-2xx status code. */
  | "unhealthy"
  /** Network/timeout error, DNS failure, connection refused. */
  | "unreachable"
  /** URL failed validation before any network I/O. */
  | "invalid-url";

export interface ProbeResult {
  readonly status: HealthStatus;
  /** HTTP status code if a response was received. */
  readonly httpStatus?: number;
  /** Round-trip time in milliseconds (undefined on invalid-url). */
  readonly latencyMs?: number;
  /** Human-readable error message if status != ok. */
  readonly error?: string;
}

export interface FailoverDecision {
  /** Which endpoint the caller should use right now. */
  readonly prefer: "mirror" | "upstream";
  /** Mirror probe result. */
  readonly mirror: ProbeResult;
  /** Upstream probe result. */
  readonly upstream: ProbeResult;
  /** True only if BOTH endpoints are non-ok. Callers must treat this as hard failure. */
  readonly bothDown: boolean;
  /** Stable, machine-readable reason code (suitable for telemetry/alerting). */
  readonly reasonCode:
    | "MIRROR_OK"
    | "MIRROR_DOWN_UPSTREAM_OK"
    | "MIRROR_OK_UPSTREAM_DOWN"
    | "BOTH_DOWN"
    | "BOTH_INVALID"
    | "INVALID_URL";
}