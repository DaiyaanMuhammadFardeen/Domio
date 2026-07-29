import { test } from "node:test";
import assert from "node:assert/strict";
import { decideFromProbes } from "../src/decide.js";
import type { ProbeResult } from "../src/types.js";

const ok = (): ProbeResult => ({ status: "ok", httpStatus: 200, latencyMs: 1 });
const unhealthy = (): ProbeResult => ({
  status: "unhealthy",
  httpStatus: 503,
  latencyMs: 1,
  error: "HTTP 503",
});
const unreachable = (): ProbeResult => ({
  status: "unreachable",
  latencyMs: 100,
  error: "connection refused",
});
const invalid = (): ProbeResult => ({
  status: "invalid-url",
  error: "bad URL",
});

// ---- POSITIVE (availability) -----------------------------------------------

test("mirror ok + upstream ok -> prefer mirror", () => {
  const d = decideFromProbes(ok(), ok());
  assert.equal(d.prefer, "mirror");
  assert.equal(d.bothDown, false);
  assert.equal(d.reasonCode, "MIRROR_OK");
});

test("mirror down + upstream ok -> prefer upstream", () => {
  const d = decideFromProbes(unhealthy(), ok());
  assert.equal(d.prefer, "upstream");
  assert.equal(d.bothDown, false);
  assert.equal(d.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
});

test("mirror unreachable + upstream ok -> prefer upstream", () => {
  const d = decideFromProbes(unreachable(), ok());
  assert.equal(d.prefer, "upstream");
  assert.equal(d.bothDown, false);
  assert.equal(d.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
});

test("mirror ok + upstream down -> prefer mirror", () => {
  const d = decideFromProbes(ok(), unhealthy());
  assert.equal(d.prefer, "mirror");
  assert.equal(d.bothDown, false);
  assert.equal(d.reasonCode, "MIRROR_OK_UPSTREAM_DOWN");
});

// ---- NEGATIVE (no availability) -------------------------------------------

test("mirror down + upstream down -> bothDown", () => {
  const d = decideFromProbes(unhealthy(), unhealthy());
  assert.equal(d.prefer, "upstream");
  assert.equal(d.bothDown, true);
  assert.equal(d.reasonCode, "BOTH_DOWN");
});

test("mirror unreachable + upstream unreachable -> bothDown", () => {
  const d = decideFromProbes(unreachable(), unreachable());
  assert.equal(d.bothDown, true);
  assert.equal(d.reasonCode, "BOTH_DOWN");
});

test("invalid mirror + upstream ok -> upstream still available", () => {
  const d = decideFromProbes(invalid(), ok());
  assert.equal(d.prefer, "upstream");
  assert.equal(d.bothDown, false);
  assert.equal(d.reasonCode, "MIRROR_DOWN_UPSTREAM_OK");
});

test("both invalid -> bothDown with diagnostic code", () => {
  const d = decideFromProbes(invalid(), invalid());
  assert.equal(d.bothDown, true);
  assert.equal(d.reasonCode, "BOTH_INVALID");
});

test("invalid mirror + unreachable upstream -> bothDown", () => {
  const d = decideFromProbes(invalid(), unreachable());
  assert.equal(d.bothDown, true);
  assert.equal(d.reasonCode, "BOTH_INVALID");
});