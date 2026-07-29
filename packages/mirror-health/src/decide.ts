/**
 * The core failover decision logic.
 *
 * Decision matrix (mirror status × upstream status):
 *
 *   mirror=ok             → prefer mirror, reasonCode=MIRROR_OK
 *   mirror=unhealthy      → prefer upstream if upstream=ok, else BOTH_DOWN
 *   mirror=unreachable    → prefer upstream if upstream=ok, else BOTH_DOWN
 *   mirror=invalid-url    → same as unreachable
 *   mirror=ok, upstream=down → still prefer mirror (don't punish availability
 *                              for upstream being slow — that's not our fault)
 *
 * This is intentionally simple and deterministic so it's trivially testable
 * without HTTP servers. See tests/mirrors/decide.spec.ts for the matrix.
 */

import { FailoverDecision, MirrorEndpoints, ProbeResult } from "./types.js";

function classify(probe: ProbeResult): "ok" | "bad" | "invalid" {
  if (probe.status === "ok") return "ok";
  if (probe.status === "invalid-url") return "invalid";
  return "bad";
}

export function decideFromProbes(
  mirrorProbe: ProbeResult,
  upstreamProbe: ProbeResult,
): Omit<FailoverDecision, "mirror" | "upstream"> & {
  mirror: ProbeResult;
  upstream: ProbeResult;
} {
  const m = classify(mirrorProbe);
  const u = classify(upstreamProbe);

  if (m === "ok" && u === "ok") {
    return {
      prefer: "mirror",
      mirror: mirrorProbe,
      upstream: upstreamProbe,
      bothDown: false,
      reasonCode: "MIRROR_OK",
    };
  }
  if (m === "ok" && u !== "ok") {
    return {
      prefer: "mirror",
      mirror: mirrorProbe,
      upstream: upstreamProbe,
      bothDown: false,
      reasonCode: "MIRROR_OK_UPSTREAM_DOWN",
    };
  }
  if (m !== "ok" && u === "ok") {
    return {
      prefer: "upstream",
      mirror: mirrorProbe,
      upstream: upstreamProbe,
      bothDown: false,
      reasonCode: "MIRROR_DOWN_UPSTREAM_OK",
    };
  }
  // Both non-ok. Distinguish invalid vs. down for diagnostics.
  if (m === "invalid" || u === "invalid") {
    return {
      prefer: "upstream",
      mirror: mirrorProbe,
      upstream: upstreamProbe,
      bothDown: true,
      reasonCode: "BOTH_INVALID",
    };
  }
  return {
    prefer: "upstream",
    mirror: mirrorProbe,
    upstream: upstreamProbe,
    bothDown: true,
    reasonCode: "BOTH_DOWN",
  };
}

export interface DecideOptions {
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * End-to-end: validate endpoints, probe both in parallel, return decision.
 * Will throw only on programmer errors (e.g. malformed endpoint struct).
 */
export async function decideFailover(
  endpoints: MirrorEndpoints,
  options: DecideOptions = {},
): Promise<FailoverDecision> {
  const [mirrorProbe, upstreamProbe] = await Promise.all([
    probeWithValidation(endpoints.mirrorUrl, endpoints, options),
    probeWithValidation(endpoints.upstreamUrl, endpoints, options),
  ]);
  return {
    ...decideFromProbes(mirrorProbe, upstreamProbe),
    mirror: mirrorProbe,
    upstream: upstreamProbe,
  };
}

async function probeWithValidation(
  url: string,
  _endpoints: MirrorEndpoints,
  options: DecideOptions,
): Promise<ProbeResult> {
  // Defer to probe.ts for actual I/O; pass fetchImpl through for testing.
  const probeModule = await import("./probe.js");
  const opts: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {};
  if (options.timeoutMs !== undefined) opts.timeoutMs = options.timeoutMs;
  if (options.fetchImpl !== undefined) opts.fetchImpl = options.fetchImpl;
  if (options.signal !== undefined) opts.signal = options.signal;
  return probeModule.probeEndpoint(url, opts);
}