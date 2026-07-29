/**
 * CLI wrapper used by infrastructure/mirrors/healthcheck.sh.
 *
 * Usage:
 *   node --import tsx packages/mirror-health/src/cli.ts \
 *     --ecosystem npm \
 *     --mirror-url https://mirror.example/npm \
 *     --upstream-url https://registry.npmjs.org \
 *     [--timeout-ms 5000] \
 *     [--output json|text]
 *
 * Exit codes:
 *   0  — mirror is healthy (or upstream is healthy as fallback)
 *   1  — both endpoints are unavailable
 *   2  — usage / validation error
 *
 * The CLI never silently reports "healthy". If the mirror is down it exits 0
 * only when the upstream is reachable; that is, the developer can keep working.
 * If both are down it exits 1 so alerts/CI can catch it.
 */

import { decideFailover } from "./decide.js";
import { MirrorEndpoints } from "./types.js";

interface CliArgs {
  ecosystem: string;
  mirrorUrl: string;
  upstreamUrl: string;
  mirrorName: string;
  timeoutMs: number;
  output: "json" | "text";
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) {
        // boolean flag, treated as "true"
        args[key] = "true";
      } else {
        args[key] = val;
        i++;
      }
    }
  }
  const ecosystem = args["ecosystem"];
  const mirrorUrl = args["mirror-url"];
  const upstreamUrl = args["upstream-url"];
  if (ecosystem && !["npm", "pypi", "go-modules", "docker"].includes(ecosystem)) {
    throw new Error(`invalid --ecosystem: ${ecosystem}`);
  }
  if (!ecosystem || !mirrorUrl || !upstreamUrl) {
    throw new Error(
      "missing required flags: --ecosystem --mirror-url --upstream-url",
    );
  }
  const output = (args["output"] ?? "json") as "json" | "text";
  if (output !== "json" && output !== "text") {
    throw new Error(`invalid --output: ${output} (must be json or text)`);
  }
  return {
    ecosystem,
    mirrorUrl,
    upstreamUrl,
    mirrorName: args["mirror-name"] ?? "default",
    timeoutMs: Number(args["timeout-ms"] ?? 5000),
    output,
  };
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 2;
  }

  const endpoints: MirrorEndpoints = {
    ecosystem: args.ecosystem as MirrorEndpoints["ecosystem"],
    mirrorName: args.mirrorName,
    mirrorUrl: args.mirrorUrl,
    upstreamUrl: args.upstreamUrl,
  };

  let decision;
  try {
    decision = await decideFailover(endpoints, { timeoutMs: args.timeoutMs });
  } catch (err) {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    return 2;
  }

  const payload = {
    mirror: endpoints.mirrorName,
    ecosystem: endpoints.ecosystem,
    prefer: decision.prefer,
    reasonCode: decision.reasonCode,
    bothDown: decision.bothDown,
    mirrorStatus: decision.mirror.status,
    upstreamStatus: decision.upstream.status,
    mirrorHttpStatus: decision.mirror.httpStatus ?? null,
    upstreamHttpStatus: decision.upstream.httpStatus ?? null,
    mirrorLatencyMs: decision.mirror.latencyMs ?? null,
    upstreamLatencyMs: decision.upstream.latencyMs ?? null,
    mirrorError: decision.mirror.error ?? null,
    upstreamError: decision.upstream.error ?? null,
  };

  if (args.output === "json") {
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    const status = decision.bothDown ? "FAIL" : "OK";
    process.stdout.write(
      `[${status}] ${endpoints.ecosystem}/${endpoints.mirrorName} prefer=${decision.prefer} reason=${decision.reasonCode}\n`,
    );
    if (decision.mirror.error) {
      process.stdout.write(`  mirror: ${decision.mirror.error}\n`);
    }
    if (decision.upstream.error) {
      process.stdout.write(`  upstream: ${decision.upstream.error}\n`);
    }
  }

  return decision.bothDown ? 1 : 0;
}

main().then(
  (code) => {
    // Do not call process.exit(code) here: it can truncate stdout before the
    // JSON payload is flushed. Setting exitCode lets Node drain stdio first.
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exitCode = 2;
  },
);
