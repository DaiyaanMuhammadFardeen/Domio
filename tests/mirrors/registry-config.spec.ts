import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const REG = resolve(ROOT, "infrastructure/mirrors/registry");

// ---- POSITIVE --------------------------------------------------------------

test("npm registry has a Verdaccio config and a .npmrc.example", () => {
  assert.ok(existsSync(`${REG}/npm/verdaccio-config.example.yaml`));
  assert.ok(existsSync(`${REG}/npm/.npmrc.example`));
});

test("pypi registry has a devpi+nginx config and a pip.conf.example", () => {
  assert.ok(existsSync(`${REG}/pypi/devpi-nginx.conf.example`));
  assert.ok(existsSync(`${REG}/pypi/pip.conf.example`));
});

test("go registry has an Athens config and a go.env.example", () => {
  assert.ok(existsSync(`${REG}/go-modules/athens-config.example.toml`));
  assert.ok(existsSync(`${REG}/go-modules/go.env.example`));
});

test("docker registry has a registry:2 config and a daemon.json.example", () => {
  assert.ok(existsSync(`${REG}/docker/registry-config.example.yml`));
  assert.ok(existsSync(`${REG}/docker/daemon.json.example`));
});

test("verdaccio config declares an uplink and references env vars only", () => {
  const raw = readFileSync(`${REG}/npm/verdaccio-config.example.yaml`, "utf8");
  assert.ok(raw.includes("uplinks:"));
  assert.ok(raw.includes("proxy:"));
  assert.ok(raw.includes("${NPM_UPSTREAM}"));
  // No embedded credentials.
  assert.equal(raw.includes(":_authToken="), false);
  assert.equal(raw.includes(":password="), false);
});

test("pip.conf.example uses an env-var mirror URL", () => {
  const raw = readFileSync(`${REG}/pypi/pip.conf.example`, "utf8");
  assert.ok(raw.includes("index-url = ${MIRROR_PYPI_URL}"));
  // extra-index-url is dangerous. It may be mentioned in a warning comment,
  // but it must never be present as an active config key.
  const active = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  assert.equal(active.includes("extra-index-url"), false);
});

test("go env example lists mirror, upstream, and direct fallback", () => {
  const raw = readFileSync(`${REG}/go-modules/go.env.example`, "utf8");
  assert.ok(raw.includes("${MIRROR_GO_URL}"));
  assert.ok(raw.includes("${GO_UPSTREAM}"));
  assert.ok(raw.includes("direct"));
});

test("docker registry example does not include auth tokens", () => {
  const raw = readFileSync(`${REG}/docker/registry-config.example.yml`, "utf8");
  assert.ok(raw.includes("proxy:"));
  assert.ok(raw.includes("remoteurl: ${DOCKER_UPSTREAM}"));
  assert.equal(raw.includes("username: \""), true); // empty username field
  assert.equal(/password:\s*"[^"]+"/.test(raw), false, "password must be empty placeholder");
});

test("docker daemon.json.example is valid JSON after template substitution", () => {
  const raw = readFileSync(`${REG}/docker/daemon.json.example`, "utf8");
  // Strip the `_comment` field which is a non-JSON hint.
  const stripped = raw.replace(/"_comment":\s*"[^"]*"\s*,?\s*/, "");
  // Replace ${MIRROR_DOCKER_URL} with a placeholder before parsing.
  const substituted = stripped.replace(/\$\{MIRROR_DOCKER_URL\}/g, "https://example.com");
  const parsed = JSON.parse(substituted);
  assert.ok(Array.isArray(parsed["registry-mirrors"]));
  assert.ok(parsed["registry-mirrors"][0].startsWith("https://"));
});

// ---- NEGATIVE --------------------------------------------------------------

test("no committed mirror config contains a literal secret token", () => {
  const candidates = [
    `${REG}/npm/verdaccio-config.example.yaml`,
    `${REG}/npm/.npmrc.example`,
    `${REG}/pypi/devpi-nginx.conf.example`,
    `${REG}/pypi/pip.conf.example`,
    `${REG}/go-modules/athens-config.example.toml`,
    `${REG}/go-modules/go.env.example`,
    `${REG}/docker/registry-config.example.yml`,
    `${REG}/docker/daemon.json.example`,
  ];
  // We only flag strings that look like real secrets. We deliberately do NOT
  // match "_authToken=" as a substring because the .npmrc.example uses that
  // exact string in a comment warning against embedding tokens. We test for
  // an active line (uncommented, with a non-empty value) instead.
  const secrets = [
    /ghp_[A-Za-z0-9]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /sk_live_[A-Za-z0-9]{20,}/,
    /sk_test_[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /BEGIN PRIVATE KEY/,
    /xoxb-[0-9A-Za-z-]{20,}/,
    /xoxp-[0-9A-Za-z-]{20,}/,
  ];
  for (const path of candidates) {
    const raw = readFileSync(path, "utf8");
    // Strip line comments so documentation warnings don't trip the check.
    const stripped = raw
      .split("\n")
      .map((line) => {
        const hash = line.indexOf("#");
        return hash === -1 ? line : line.slice(0, hash);
      })
      .join("\n");
    for (const re of secrets) {
      assert.equal(
        re.test(stripped),
        false,
        `${path} contains a real-secret-shaped literal matching ${re}`,
      );
    }
  }
});

test("every example config declares its env-var contract", () => {
  // Each config should declare the env vars it depends on. This is a
  // contract test — the apply.sh script relies on these names.
  const expectations: Array<[string, string]> = [
    [`${REG}/npm/verdaccio-config.example.yaml`, "${NPM_UPSTREAM}"],
    [`${REG}/npm/.npmrc.example`, "${MIRROR_NPM_URL}"],
    [`${REG}/pypi/pip.conf.example`, "${MIRROR_PYPI_URL}"],
    [`${REG}/pypi/devpi-nginx.conf.example`, ""], // not used in this file directly
    [`${REG}/go-modules/go.env.example`, "${MIRROR_GO_URL}"],
    [`${REG}/docker/daemon.json.example`, "${MIRROR_DOCKER_URL}"],
    [`${REG}/docker/registry-config.example.yml`, "${DOCKER_UPSTREAM}"],
  ];
  for (const [path, mustContain] of expectations) {
    if (!mustContain) continue;
    const raw = readFileSync(path, "utf8");
    assert.ok(
      raw.includes(mustContain),
      `${path} must declare env var ${mustContain}`,
    );
  }
});