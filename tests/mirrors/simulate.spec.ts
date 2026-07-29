import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SIMULATE = resolve(ROOT, "scripts/mirrors/simulate-downstream-down.sh");

function runSimulate(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res, rej) => {
    const c = spawn(SIMULATE, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    c.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    c.on("error", rej);
    c.on("exit", (code) => res({ code: code ?? 0, stdout, stderr }));
  });
}

// ---- POSITIVE --------------------------------------------------------------

test("simulate-downstream-down: mirror 503 + upstream 200 exits 0 and prefers upstream", async () => {
  const r = await runSimulate(["--ecosystem", "npm"], {
    NPM_UPSTREAM: "https://registry.npmjs.org",
  });
  assert.equal(r.code, 0, r.stderr);
  // The output must contain a JSON line with reason MIRROR_DOWN_UPSTREAM_OK.
  const jsonLine = r.stdout
    .split("\n")
    .find((l) => l.trim().startsWith("{") && l.includes("reasonCode"));
  assert.ok(jsonLine, "expected a JSON reasonCode line in stdout");
  const payload = JSON.parse(jsonLine!);
  assert.equal(payload.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
  assert.equal(payload.bothDown, false);
  assert.equal(payload.prefer, "upstream");
  assert.equal(payload.mirrorStatus, "unhealthy");
  assert.equal(payload.upstreamStatus, "ok");
});

// ---- NEGATIVE --------------------------------------------------------------

test("simulate-downstream-down: --dry-run does not start the local 503 server", async () => {
  const r = await runSimulate(["--dry-run", "--ecosystem", "npm"], {
    NPM_UPSTREAM: "https://registry.npmjs.org",
  });
  // The script may exit 0 (just printed the dry-run plan) or non-zero
  // (it lacks the actual healthcheck invocation under --dry-run). Either
  // way, it must not report PASS and must not invoke node.
  assert.equal(
    r.stdout.includes("[simulate] PASS"),
    false,
    "dry-run must not print PASS",
  );
  assert.equal(
    r.stdout.includes("healthcheck exit code"),
    false,
    "dry-run must not run the healthcheck",
  );
});

test("simulate-downstream-down: refuses an unknown ecosystem", async () => {
  const r = await runSimulate(["--ecosystem", "bogus"], {});
  assert.notEqual(r.code, 0);
  assert.ok(r.stderr.toLowerCase().includes("unknown ecosystem"));
});
