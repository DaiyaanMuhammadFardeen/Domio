/**
 * Probe a single endpoint with a timeout. Returns a structured ProbeResult.
 *
 * The probe is intentionally generic:
 *   - We always send a HEAD request (treating 405/501 as "endpoint reachable
 *     but does not support HEAD" which still counts as ok for health-check
 *     purposes; some registries return 405 for HEAD on /).
 *   - We categorize 2xx, 3xx as ok; 4xx, 5xx as unhealthy.
 *   - Any network failure → unreachable.
 *   - Invalid URL → invalid-url (no I/O).
 *
 * The fetch is AbortController-driven so the timeout is hard. We never hang
 * past it.
 */

import { ProbeResult } from "./types.js";
import { UrlValidationError, validateMirrorUrl } from "./url.js";

export interface ProbeOptions {
  /** Total timeout in milliseconds (connect + headers). Default 5000. */
  readonly timeoutMs?: number;
  /** AbortSignal to compose with internal timeout (optional). */
  readonly signal?: AbortSignal;
  /** Custom fetch implementation (for tests). Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Probe a single URL. Returns a ProbeResult; never throws.
 * URL validation is performed first; invalid URLs short-circuit with invalid-url.
 */
export async function probeEndpoint(
  url: string,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  try {
    validateMirrorUrl(url);
  } catch (err) {
    if (err instanceof UrlValidationError) {
      return {
        status: "invalid-url",
        error: err.message,
      };
    }
    throw err;
  }

  const timeoutMs = options.timeoutMs ?? 5000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // If the caller passed their own signal, forward its abort
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
    });
    const latencyMs = Date.now() - started;
    const httpStatus = res.status;
    if (httpStatus >= 200 && httpStatus < 400) {
      return { status: "ok", httpStatus, latencyMs };
    }
    return {
      status: "unhealthy",
      httpStatus,
      latencyMs,
      error: `HTTP ${httpStatus}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    if (
      controller.signal.aborted &&
      !externalSignal?.aborted &&
      Date.now() - started >= timeoutMs
    ) {
      return {
        status: "unreachable",
        latencyMs,
        error: `timeout after ${timeoutMs}ms`,
      };
    }
    return {
      status: "unreachable",
      latencyMs,
      error: message,
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}