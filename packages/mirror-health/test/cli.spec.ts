import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const CLI = resolve(REPO_ROOT, "packages/mirror-health/src/cli.ts");
const TSX_LOADER = resolve(
  REPO_ROOT,
  "packages/mirror-health/node_modules/tsx/dist/loader.cjs",
);

function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "node",
      ["--disable-warning=DEP0205", "--import", TSX_LOADER, CLI, ...args],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    child.on("error", rejectRun);
    child.on("exit", (code) => resolveRun({ code: code ?? 0, stdout, stderr }));
  });
}

function makeServer(status: number): Promise<{ url: string; close: () => void }> {
  return new Promise((res) => {
    const s = http.createServer((_, r) => {
      r.writeHead(status, { "Content-Length": "0" });
      r.end();
    });
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      res({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}

// ---- POSITIVE --------------------------------------------------------------

test("CLI exits 0 with reason MIRROR_OK when both endpoints are 200", async () => {
  const mirror = await makeServer(200);
  const upstream = await makeServer(200);
  try {
    const r = await runCli([
      "--ecosystem",
      "npm",
      "--mirror-url",
      mirror.url,
      "--upstream-url",
      upstream.url,
      "--output",
      "json",
    ]);
    assert.equal(r.code, 0);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.reasonCode, "MIRROR_OK");
    assert.equal(payload.bothDown, false);
    assert.equal(payload.prefer, "mirror");
  } finally {
    mirror.close();
    upstream.close();
  }
});

test("CLI exits 0 with reason MIRROR_DOWN_UPSTREAM_OK when mirror 503", async () => {
  const mirror = await makeServer(503);
  const upstream = await makeServer(200);
  try {
    const r = await runCli([
      "--ecosystem",
      "pypi",
      "--mirror-url",
      mirror.url,
      "--upstream-url",
      upstream.url,
    ]);
    assert.equal(r.code, 0);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
    assert.equal(payload.prefer, "upstream");
    assert.equal(payload.mirrorStatus, "unhealthy");
    assert.equal(payload.upstreamStatus, "ok");
  } finally {
    mirror.close();
    upstream.close();
  }
});

test("CLI text output is human-readable", async () => {
  const mirror = await makeServer(200);
  const upstream = await makeServer(200);
  try {
    const r = await runCli([
      "--ecosystem",
      "docker",
      "--mirror-url",
      mirror.url,
      "--upstream-url",
      upstream.url,
      "--output",
      "text",
    ]);
    assert.equal(r.code, 0);
    assert.ok(r.stdout.includes("[OK]"));
    assert.ok(r.stdout.includes("docker"));
  } finally {
    mirror.close();
    upstream.close();
  }
});

// ---- NEGATIVE --------------------------------------------------------------

test("CLI exits 1 when both endpoints are 503", async () => {
  const mirror = await makeServer(503);
  const upstream = await makeServer(503);
  try {
    const r = await runCli([
      "--ecosystem",
      "go-modules",
      "--mirror-url",
      mirror.url,
      "--upstream-url",
      upstream.url,
    ]);
    assert.equal(r.code, 1);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.bothDown, true);
    assert.equal(payload.reasonCode, "BOTH_DOWN");
  } finally {
    mirror.close();
    upstream.close();
  }
});

test("CLI exits 2 on bad arguments", async () => {
  const r = await runCli(["--ecosystem", "bogus"]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes("invalid --ecosystem"));
});

test("CLI exits 2 when missing required flags", async () => {
  const r = await runCli(["--ecosystem", "npm"]);
  assert.equal(r.code, 2);
  assert.ok(r.stderr.includes("missing required"));
});

test("CLI exits 1 when both endpoints are unreachable (closed ports)", async () => {
  const r = await runCli([
    "--ecosystem",
    "npm",
    "--mirror-url",
    "http://127.0.0.1:1",
    "--upstream-url",
    "http://127.0.0.1:2",
    "--timeout-ms",
    "300",
  ]);
  assert.equal(r.code, 1);
  const payload = JSON.parse(r.stdout.trim());
  assert.equal(payload.bothDown, true);
});