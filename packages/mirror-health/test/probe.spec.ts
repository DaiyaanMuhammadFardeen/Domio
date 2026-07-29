import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { probeEndpoint } from "../src/probe.js";
import { decideFailover } from "../src/decide.js";
import type { MirrorEndpoints } from "../src/types.js";

// ---- test fixtures ---------------------------------------------------------

/**
 * Tiny HTTP fixture server. Returns a configurable status for HEAD requests.
 * Tracks request count so we can assert probe behaviour.
 */
function makeFixtureServer(handler: (req: http.IncomingMessage) => number): Promise<{
  url: string;
  close: () => Promise<void>;
  hits: () => number;
}> {
  return new Promise((resolve) => {
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits++;
      const status = handler(req);
      res.writeHead(status, { "Content-Length": "0" });
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        hits: () => hits,
      });
    });
  });
}

// ---- POSITIVE --------------------------------------------------------------

test("probe returns ok on 200", async () => {
  const fx = await makeFixtureServer(() => 200);
  try {
    const result = await probeEndpoint(fx.url);
    assert.equal(result.status, "ok");
    assert.equal(result.httpStatus, 200);
    assert.ok((result.latencyMs ?? 0) >= 0);
  } finally {
    await fx.close();
  }
});

test("probe returns ok on 301 redirect (no auto-follow)", async () => {
  // registry:2 returns 301 for some path patterns; we still treat it as ok
  // because the cache control on the response is what matters for mirrors.
  const fx = await makeFixtureServer(() => 301);
  try {
    const result = await probeEndpoint(fx.url);
    assert.equal(result.status, "ok");
    assert.equal(result.httpStatus, 301);
  } finally {
    await fx.close();
  }
});

test("decideFailover picks mirror when both 200", async () => {
  const mirror = await makeFixtureServer(() => 200);
  const upstream = await makeFixtureServer(() => 200);
  try {
    const endpoints: MirrorEndpoints = {
      ecosystem: "npm",
      mirrorName: "test",
      mirrorUrl: mirror.url,
      upstreamUrl: upstream.url,
    };
    const d = await decideFailover(endpoints);
    assert.equal(d.prefer, "mirror");
    assert.equal(d.reasonCode, "MIRROR_OK");
    assert.equal(d.bothDown, false);
    assert.equal(mirror.hits(), 1);
    assert.equal(upstream.hits(), 1);
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

test("decideFailover falls through to upstream when mirror 503", async () => {
  const mirror = await makeFixtureServer(() => 503);
  const upstream = await makeFixtureServer(() => 200);
  try {
    const endpoints: MirrorEndpoints = {
      ecosystem: "pypi",
      mirrorName: "test",
      mirrorUrl: mirror.url,
      upstreamUrl: upstream.url,
    };
    const d = await decideFailover(endpoints);
    assert.equal(d.prefer, "upstream");
    assert.equal(d.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
    assert.equal(d.bothDown, false);
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

// ---- NEGATIVE --------------------------------------------------------------

test("probe returns unhealthy on 5xx", async () => {
  const fx = await makeFixtureServer(() => 502);
  try {
    const result = await probeEndpoint(fx.url);
    assert.equal(result.status, "unhealthy");
    assert.equal(result.httpStatus, 502);
  } finally {
    await fx.close();
  }
});

test("probe returns unhealthy on 4xx", async () => {
  const fx = await makeFixtureServer(() => 404);
  try {
    const result = await probeEndpoint(fx.url);
    assert.equal(result.status, "unhealthy");
    assert.equal(result.httpStatus, 404);
  } finally {
    await fx.close();
  }
});

test("probe returns unreachable on connection refused", async () => {
  // Port 1 is reserved and not bound; any connect attempt will fail.
  const result = await probeEndpoint("http://127.0.0.1:1", { timeoutMs: 500 });
  assert.equal(result.status, "unreachable");
});

test("probe respects timeoutMs", async () => {
  // A server that hangs forever. Use a small timeout to keep the test fast.
  const slow = (): Promise<http.Server> =>
    new Promise((resolve) => {
      const server = http.createServer(() => {
        // never respond
      });
      server.listen(0, "127.0.0.1", () => resolve(server));
    });

  const server = await slow();
  try {
    const { port } = server.address() as AddressInfo;
    const start = Date.now();
    const result = await probeEndpoint(`http://127.0.0.1:${port}`, { timeoutMs: 200 });
    const elapsed = Date.now() - start;
    assert.equal(result.status, "unreachable");
    // Allow generous slack; we only care the timeout fired in time.
    assert.ok(elapsed < 2000, `expected to abort by 2000ms, took ${elapsed}ms`);
  } finally {
    server.close();
  }
});

test("decideFailover reports bothDown when mirror 503 and upstream 502", async () => {
  const mirror = await makeFixtureServer(() => 503);
  const upstream = await makeFixtureServer(() => 502);
  try {
    const endpoints: MirrorEndpoints = {
      ecosystem: "docker",
      mirrorName: "test",
      mirrorUrl: mirror.url,
      upstreamUrl: upstream.url,
    };
    const d = await decideFailover(endpoints);
    assert.equal(d.bothDown, true);
    assert.equal(d.reasonCode, "BOTH_DOWN");
  } finally {
    await mirror.close();
    await upstream.close();
  }
});

test("decideFailover reports bothDown when both unreachable", async () => {
  const endpoints: MirrorEndpoints = {
    ecosystem: "go-modules",
    mirrorName: "test",
    mirrorUrl: "http://127.0.0.1:1",
    upstreamUrl: "http://127.0.0.1:2",
  };
  const d = await decideFailover(endpoints, { timeoutMs: 300 });
  assert.equal(d.bothDown, true);
  assert.equal(d.mirror.status, "unreachable");
  assert.equal(d.upstream.status, "unreachable");
});

test("probe returns invalid-url without making network call", async () => {
  const result = await probeEndpoint("not-a-url");
  assert.equal(result.status, "invalid-url");
  assert.ok(!result.latencyMs, "should not have measured latency on invalid URL");
});

test("probe refuses to embed credentials", async () => {
  const result = await probeEndpoint("https://user:pass@example.com/");
  assert.equal(result.status, "invalid-url");
});