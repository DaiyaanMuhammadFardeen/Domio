import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const HEALTHCHECK = resolve(ROOT, "infrastructure/mirrors/healthcheck.sh");

function makeServer(status: number): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((res) => {
    const s = http.createServer((_, r) => {
      r.writeHead(status, { "Content-Length": "0" });
      r.end();
    });
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      res({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => s.close(() => r())),
      });
    });
  });
}

function runHealthcheck(env: NodeJS.ProcessEnv): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((res, rej) => {
    const c = spawn(HEALTHCHECK, ["--ecosystem", "npm", "--output", "json", "--timeout-ms", "1000"], {
      env: { ...process.env, ...env },
      cwd: ROOT,
    });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    c.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    c.on("error", rej);
    c.on("exit", (code) => res({ code: code ?? 0, stdout, stderr }));
  });
}

// POSITIVE: primary path
test("healthcheck: healthy mirror and upstream exits 0 and prefers mirror", async () => {
  const mirror = await makeServer(200);
  const upstream = await makeServer(200);
  try {
    const r = await runHealthcheck({
      MIRROR_NPM_URL: mirror.url,
      NPM_UPSTREAM: upstream.url,
    });
    assert.equal(r.code, 0, r.stderr);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.prefer, "mirror");
    assert.equal(payload.reasonCode, "MIRROR_OK");
    assert.equal(payload.bothDown, false);
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

// POSITIVE: failover path
test("healthcheck: mirror 503, upstream 200 exits 0 and prefers upstream", async () => {
  const mirror = await makeServer(503);
  const upstream = await makeServer(200);
  try {
    const r = await runHealthcheck({
      MIRROR_NPM_URL: mirror.url,
      NPM_UPSTREAM: upstream.url,
    });
    assert.equal(r.code, 0, r.stderr);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.prefer, "upstream");
    assert.equal(payload.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
    assert.equal(payload.bothDown, false);
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

// POSITIVE: upstream may be down while mirror remains useful
test("healthcheck: mirror 200, upstream 503 exits 0 and explicitly reports upstream down", async () => {
  const mirror = await makeServer(200);
  const upstream = await makeServer(503);
  try {
    const r = await runHealthcheck({
      MIRROR_NPM_URL: mirror.url,
      NPM_UPSTREAM: upstream.url,
    });
    assert.equal(r.code, 0, r.stderr);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.prefer, "mirror");
    assert.equal(payload.reasonCode, "MIRROR_OK_UPSTREAM_DOWN");
    assert.equal(payload.upstreamStatus, "unhealthy");
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

// NEGATIVE: both endpoints down must never silently succeed
test("healthcheck: both 503 exits 1 and reports bothDown", async () => {
  const mirror = await makeServer(503);
  const upstream = await makeServer(503);
  try {
    const r = await runHealthcheck({
      MIRROR_NPM_URL: mirror.url,
      NPM_UPSTREAM: upstream.url,
    });
    assert.equal(r.code, 1, `stdout=${r.stdout} stderr=${r.stderr}`);
    const payload = JSON.parse(r.stdout.trim());
    assert.equal(payload.bothDown, true);
    assert.equal(payload.reasonCode, "BOTH_DOWN");
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

// NEGATIVE: closed ports must exit 1
test("healthcheck: both connection-refused endpoints exit 1", async () => {
  const r = await runHealthcheck({
    MIRROR_NPM_URL: "http://127.0.0.1:1",
    NPM_UPSTREAM: "http://127.0.0.1:2",
  });
  assert.equal(r.code, 1, `stdout=${r.stdout} stderr=${r.stderr}`);
  const payload = JSON.parse(r.stdout.trim());
  assert.equal(payload.mirrorStatus, "unreachable");
  assert.equal(payload.upstreamStatus, "unreachable");
});

// NEGATIVE: invalid protocol must be rejected before network I/O
test("healthcheck: invalid protocols exit 1 and report invalid-url", async () => {
  const r = await runHealthcheck({
    MIRROR_NPM_URL: "ftp://example.com/",
    NPM_UPSTREAM: "file:///tmp/upstream",
  });
  assert.equal(r.code, 1);
  const payload = JSON.parse(r.stdout.trim());
  assert.equal(payload.mirrorStatus, "invalid-url");
  assert.equal(payload.upstreamStatus, "invalid-url");
});