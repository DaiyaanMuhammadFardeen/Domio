/**
 * @domio/obs-control-plane — tracing coverage CI check (T-G2.6 / G2-F).
 *
 * Asserts that every tier-1 service in the catalogue:
 *
 *   1. declares `@domio/observability` as a dependency in its
 *      `package.json`.
 *   2. instantiates a `Tracer` somewhere in `src/` (typically in an
 *      `observability/tracer.ts` file — but we only require the
 *      symbol, not the path).
 *   3. emits at least one `tracer.startSpan(...)` call in its source
 *      tree (root-span coverage).
 *
 * Tier-2 and tier-3 services are warned but not failed. Rationale: the
 * Tier-1 set is the user-facing critical path; tier-2/3 traces are
 * best-effort until P23+.
 *
 * Output: `TracingCoverageReport { services, issues, pass, warn }`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

import type { SloEntry } from './types.js';

export interface TracingCoverageIssue {
  readonly service: string;
  readonly kind: 'missing-dependency' | 'no-tracer-instantiation' | 'no-root-span';
  readonly detail: string;
}

export interface TracingCoverageReport {
  readonly services: number;
  readonly issues: readonly TracingCoverageIssue[];
  readonly warn: readonly TracingCoverageIssue[];
  readonly pass: boolean;
}

interface ServiceTree {
  readonly rootDir: string;
  readonly packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

const OBSERVABILITY_PKG = '@domio/observability';
const TRACER_INSTANTIATION =
  /\bnew\s+Tracer\s*\(|\bTracer\.create\s*\(|\bcreateTracer\s*\(|\binit\s*\(\s*\{/;
const ROOT_SPAN = /\b(?:tracer\.startSpan|\bstartSpan|\bstartTracer)\s*\(/;

/**
 * Tier-1 services that don't have their own implementation yet — the
 * catalogue lists them as "inherited" (auth), "P22 stretch" (billing),
 * or as a placeholder (component). They have no `services/<x>/`
 * directory and therefore cannot ship their own tracer. Downgraded
 * from `issues` (which fails CI) to `warn` (advisory).
 */
const KNOWN_DEFERRED_TIER1 = new Set<string>(['@domio/auth', '@domio/billing', '@domio/component']);

/** Run the tracing-coverage check on a monorepo root directory. */
export function checkTracingCoverage(
  repoRoot: string,
  slos: readonly SloEntry[],
  opts: { servicesDir?: string } = {},
): TracingCoverageReport {
  const servicesDir = opts.servicesDir ?? join(repoRoot, 'services');
  const tier1 = uniqueTier1Services(slos);

  const issues: TracingCoverageIssue[] = [];
  const warn: TracingCoverageIssue[] = [];

  for (const service of tier1) {
    const shortName = service.replace(/^@domio\//, '').replace(/-service$/, '');
    const serviceDir = join(servicesDir, shortName);
    const goModPath = join(serviceDir, 'go.mod');
    const pkgJsonPath = join(serviceDir, 'package.json');
    const hasPkg = existsSyncCompat(pkgJsonPath);
    const hasGoMod = existsSyncCompat(goModPath);
    // A Go service can also live without go.mod if it's part of the monorepo
    // root module — detect by presence of any *.go file under serviceDir.
    const goFiles = hasPkg ? [] : collectSourceFiles(serviceDir, /\.go$/);
    const isGoService = hasGoMod || goFiles.length > 0;
    if (!hasPkg && !isGoService) {
      if (KNOWN_DEFERRED_TIER1.has(service)) {
        warn.push({
          service,
          kind: 'missing-dependency',
          detail: `tier-1 service has no implementation yet (catalogue: inherited / P22 stretch / placeholder)`,
        });
      } else {
        issues.push({
          service,
          kind: 'missing-dependency',
          detail: `service directory not found at ${serviceDir}`,
        });
      }
      continue;
    }
    let tree: ServiceTree | null = null;
    if (hasPkg) {
      try {
        tree = readServiceTree(serviceDir);
      } catch {
        // fall through; will be handled below
      }
    }

    if (isGoService) {
      // Go service: tracer instrumentation lives in internal/*.go, not in
      // a package.json. We only assert that *some* tracing setup is
      // referenced (otel.Tracer / StartSpan / tracerProvider).
      const goSrcFiles = hasGoMod ? collectSourceFiles(serviceDir, /\.go$/) : goFiles;
      const allGo = goSrcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
      if (
        !/\b(?:otel\.Tracer|otelhttp\.New|otel\.GetTracerProvider|tracer\.Start|StartSpan)\b/.test(
          allGo,
        )
      ) {
        issues.push({
          service,
          kind: 'no-tracer-instantiation',
          detail: `Go service has no OTel tracer references under ${shortName}/`,
        });
      }
      continue;
    }

    if (tree === null) {
      issues.push({
        service,
        kind: 'missing-dependency',
        detail: `could not read ${basename(serviceDir)}/package.json`,
      });
      continue;
    }

    const hasDep =
      tree.packageJson.dependencies?.[OBSERVABILITY_PKG] !== undefined ||
      tree.packageJson.devDependencies?.[OBSERVABILITY_PKG] !== undefined;
    if (!hasDep) {
      issues.push({
        service,
        kind: 'missing-dependency',
        detail: `${OBSERVABILITY_PKG} not declared in ${basename(serviceDir)}/package.json`,
      });
    }

    const srcFiles = collectSourceFiles(join(serviceDir, 'src'));
    const allSrc = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

    if (!TRACER_INSTANTIATION.test(allSrc)) {
      issues.push({
        service,
        kind: 'no-tracer-instantiation',
        detail: `no Tracer instantiation found under ${basename(serviceDir)}/src`,
      });
    }
    if (!ROOT_SPAN.test(allSrc)) {
      issues.push({
        service,
        kind: 'no-root-span',
        detail: `no tracer.startSpan(...) call found under ${basename(serviceDir)}/src`,
      });
    }
  }

  // Tier-2/3 advisory: warn if observability is declared but no spans
  // (or vice versa) — incomplete adoption.
  const tier23 = uniqueServicesByTier(slos, ['tier-2', 'tier-3']);
  for (const service of tier23) {
    const shortName = service.replace(/^@domio\//, '').replace(/-service$/, '');
    const serviceDir = join(servicesDir, shortName);
    let pkg: ServiceTree['packageJson'];
    try {
      pkg = readServiceTree(serviceDir).packageJson;
    } catch {
      continue;
    }
    const hasDep =
      pkg.dependencies?.[OBSERVABILITY_PKG] !== undefined ||
      pkg.devDependencies?.[OBSERVABILITY_PKG] !== undefined;
    if (!hasDep) {
      warn.push({
        service,
        kind: 'missing-dependency',
        detail: `${OBSERVABILITY_PKG} not declared (tier-2/3 advisory)`,
      });
    }
  }

  return {
    services: tier1.length,
    issues,
    warn,
    pass: issues.length === 0,
  };
}

function readServiceTree(serviceDir: string): ServiceTree {
  const pkgPath = join(serviceDir, 'package.json');
  const pkgRaw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgRaw) as ServiceTree['packageJson'];
  return { rootDir: serviceDir, packageJson: pkg };
}

function collectSourceFiles(rootDir: string, filePattern: RegExp = /\.(ts|js|mjs|cjs)$/): string[] {
  const out: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === '.turbo' ||
          entry === 'coverage'
        )
          continue;
        stack.push(full);
        continue;
      }
      if (st.isFile() && filePattern.test(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function existsSyncCompat(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function uniqueTier1Services(slos: readonly SloEntry[]): string[] {
  return uniqueServicesByTier(slos, ['tier-1']);
}

function uniqueServicesByTier(
  slos: readonly SloEntry[],
  tiers: ReadonlyArray<'tier-1' | 'tier-2' | 'tier-3'>,
): string[] {
  const set = new Set<string>();
  for (const slo of slos) {
    if (tiers.includes(slo.tier)) set.add(slo.service);
  }
  return [...set].sort();
}
