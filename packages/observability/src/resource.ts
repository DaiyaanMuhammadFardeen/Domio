/**
 * Resource attributes — the OTel "Resource" is the immutable description
 * of the entity producing telemetry. Every exporter carries it.
 *
 * Per phase-01 §5.B.3 we emit:
 *   - service.name
 *   - service.version
 *   - deployment.environment
 *   - git.sha
 *
 * Plus the optional `service.namespace` and `host.name` for multi-tenant
 * readouts in Grafana.
 *
 * The values come from a precedence chain: explicit arg > env var >
 * derived default. The explicit args let services like `apps/web` and
 * `services/realtime-gateway` override the namespace cleanly.
 */

export interface ResourceAttributes {
  'service.name': string;
  'service.version': string;
  'service.namespace'?: string;
  'deployment.environment': string;
  'git.sha': string;
  'host.name'?: string;
  [key: string]: string | undefined;
}

export interface ResourceOptions {
  serviceName: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  environment?: string;
  gitSha?: string;
  hostName?: string;
  extra?: Record<string, string>;
}

const SHA_RE = /^[0-9a-f]{7,64}$/i;
const MAX_KEY_LEN = 256;
const MAX_VAL_LEN = 1024;
// Allow service.name-style identifiers: letters, digits, underscores,
// dots, and hyphens. Matches the OTel spec subset.
const SAFE_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const SAFE_VAL_RE = /^[a-zA-Z0-9._:/@=+-,]*$/;

function safeEnv(value: string | undefined, fallback: string): string {
  if (value === undefined || value.length === 0) return fallback;
  return value;
}

function readDefault(opts: ResourceOptions): ResourceAttributes {
  const serviceName = opts.serviceName;
  if (!SAFE_KEY_RE.test(serviceName) || serviceName.length > MAX_KEY_LEN) {
    throw new ResourceError(
      `service.name must match /^[a-zA-Z_][a-zA-Z0-9_.]*$/ and be <= ${MAX_KEY_LEN} chars; got ${JSON.stringify(serviceName)}`,
    );
  }

  const version = safeEnv(opts.serviceVersion, process.env['DOMIO_SERVICE_VERSION'] ?? '0.0.0+unknown');
  const env = safeEnv(opts.environment, process.env['DOMIO_ENV'] ?? process.env['NODE_ENV'] ?? 'development');
  const gitSha = safeEnv(opts.gitSha, process.env['GIT_SHA'] ?? process.env['GITHUB_SHA'] ?? 'unknown');

  if (!SHA_RE.test(gitSha) && gitSha !== 'unknown') {
    throw new ResourceError(
      `git.sha must be a hex string of 7..64 chars (or "unknown"); got ${JSON.stringify(gitSha)}`,
    );
  }

  const attrs: ResourceAttributes = {
    'service.name': serviceName,
    'service.version': version,
    'deployment.environment': env,
    'git.sha': gitSha,
  };
  if (opts.serviceNamespace) attrs['service.namespace'] = opts.serviceNamespace;
  if (opts.hostName) attrs['host.name'] = opts.hostName;
  if (opts.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (!SAFE_KEY_RE.test(k) || k.length > MAX_KEY_LEN) {
        throw new ResourceError(`resource attribute key ${JSON.stringify(k)} is invalid`);
      }
      if (v.length > MAX_VAL_LEN || !SAFE_VAL_RE.test(v)) {
        throw new ResourceError(`resource attribute value for ${k} is invalid`);
      }
      attrs[k] = v;
    }
  }
  return attrs;
}

export class ResourceError extends Error {
  override readonly name = 'ResourceError';
}

/**
 * Build a `Resource` (the OTLP wire-shape subset Domio needs). The same
 * shape is reused across traces, metrics, and logs.
 */
export function buildResource(opts: ResourceOptions): ResourceAttributes {
  return readDefault(opts);
}

/**
 * Validates an OTLP HTTP endpoint string. Returns the parsed URL on
 * success, throws an `EndpointError` on failure. Empty string is NOT a
 * valid endpoint — callers should pre-check for the no-op case.
 */
export function parseOtlpEndpoint(raw: string): URL {
  if (raw.trim().length === 0) {
    throw new EndpointError('OTLP endpoint must not be empty');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EndpointError(`OTLP endpoint is not a valid URL: ${JSON.stringify(raw)}`);
  }
  const proto = url.protocol;
  if (proto !== 'http:' && proto !== 'https:') {
    throw new EndpointError(`OTLP endpoint must use http(s); got ${proto}`);
  }
  if (url.host.length === 0) {
    throw new EndpointError('OTLP endpoint is missing host');
  }
  return url;
}

export class EndpointError extends Error {
  override readonly name = 'EndpointError';
}
