import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RENOVATE = resolve(ROOT, ".github/renovate.json");
const DEPENDABOT = resolve(ROOT, ".github/dependabot.yml");

/**
 * The Dependabot YAML schema we care about is small enough that we don't
 * need a full YAML parser. We assert on substrings and structure rather
 * than on parsed object identity. This keeps the test zero-dep.
 */
function expectField(raw: string, field: string): void {
  assert.ok(
    raw.includes(field),
    `dependabot.yml is missing required field "${field}"`,
  );
}

// ---- POSITIVE: Renovate ---------------------------------------------------

test("renovate.json exists and parses as JSON", () => {
  assert.ok(existsSync(RENOVATE));
  const raw = readFileSync(RENOVATE, "utf8");
  const parsed = JSON.parse(raw);
  assert.ok(parsed, "renovate.json must parse");
  assert.ok(Array.isArray(parsed.schedule), "renovate.json must have a schedule array");
});

test("renovate.json schedule is weekday-only", () => {
  const raw = readFileSync(RENOVATE, "utf8");
  const lower = raw.toLowerCase();
  // Verify the schedule array mentions each weekday. The schedule uses
  // strings like "before 7am on monday" (no surrounding quotes on the day).
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    assert.ok(
      lower.includes(day),
      `renovate.json schedule must include ${day}`,
    );
  }
  assert.equal(lower.includes("saturday"), false);
  assert.equal(lower.includes("sunday"), false);
});

test("renovate.json has security patches split out and not automerged", () => {
  const raw = readFileSync(RENOVATE, "utf8");
  // Find the security patches block.
  assert.ok(raw.includes('"groupName": "security patches"'));
  assert.ok(raw.includes('"matchCategories": ["security"]'));
  assert.ok(raw.includes('"schedule": ["at any time"]'));
  assert.ok(raw.includes('"separateMultiplePending": true'));
  // Verify automerge: false inside the security block.
  const securityIdx = raw.indexOf('"groupName": "security patches"');
  const nextGroupIdx = raw.indexOf('"groupName":', securityIdx + 1);
  const block = raw.slice(
    securityIdx,
    nextGroupIdx === -1 ? raw.length : nextGroupIdx,
  );
  assert.ok(block.includes('"automerge": false'));
});

test("renovate.json groups non-major updates for both dev and prod", () => {
  const raw = readFileSync(RENOVATE, "utf8");
  assert.ok(raw.includes('"groupName": "non-major dev deps"'));
  assert.ok(raw.includes('"groupName": "non-major prod deps"'));
});

test("renovate.json has per-day limits", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  assert.ok(typeof parsed.prConcurrentLimit === "number");
  assert.ok(typeof parsed.prHourlyLimit === "number");
  assert.ok(typeof parsed.branchConcurrentLimit === "number");
  assert.ok(parsed.prConcurrentLimit > 0);
  assert.ok(parsed.prHourlyLimit > 0);
});

test("renovate.json covers all required ecosystems via enabledManagers", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  const managers = parsed.enabledManagers as string[];
  const required = ["npm", "gomod", "pip_requirements", "github-actions", "dockerfile"];
  for (const r of required) {
    assert.ok(managers.includes(r), `missing manager: ${r}`);
  }
});

test("renovate.json hostRules use env-var only references (no secrets committed)", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  const rules = parsed.hostRules as Array<Record<string, unknown>>;
  assert.ok(rules.length > 0, "must have at least one hostRule");
  for (const r of rules) {
    const token = r.token as string | undefined;
    if (token) {
      assert.ok(
        token.includes("env."),
        `hostRule token must be env-var only, got: ${token}`,
      );
      assert.ok(
        !token.startsWith("npm_") &&
          !token.startsWith("pypi-") &&
          !token.startsWith("dckr_"),
        `hostRule token looks like a real secret: ${token}`,
      );
    }
    const matchHost = r.matchHost as string;
    assert.ok(matchHost.includes("env."), "matchHost must use env-var resolution");
  }
});

test("renovate.json timezone is Asia/Dhaka", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  assert.equal(parsed.timezone, "Asia/Dhaka");
});

// ---- NEGATIVE: Renovate ---------------------------------------------------

test("renovate.json has no embedded secrets", () => {
  const raw = readFileSync(RENOVATE, "utf8");
  const forbidden = [
    "ghp_",
    "github_pat_",
    "xoxb-",
    "xoxp-",
    "sk_live_",
    "sk_test_",
    "AKIA",
    "aws_secret_access_key",
    "BEGIN PRIVATE KEY",
    "_authToken=abc",
  ];
  for (const f of forbidden) {
    assert.equal(raw.includes(f), false, `renovate.json contains forbidden string: ${f}`);
  }
});

test("renovate.json does not schedule on weekends", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  const schedule = (parsed.schedule as string[]).join(" ").toLowerCase();
  assert.equal(schedule.includes("saturday"), false);
  assert.equal(schedule.includes("sunday"), false);
});

test("renovate.json vulnerabilityAlerts is enabled", () => {
  const parsed = JSON.parse(readFileSync(RENOVATE, "utf8"));
  assert.equal(parsed.vulnerabilityAlerts.enabled, true);
});

// ---- POSITIVE: Dependabot ------------------------------------------------

test("dependabot.yml exists, declares version 2, has updates array", () => {
  assert.ok(existsSync(DEPENDABOT));
  const raw = readFileSync(DEPENDABOT, "utf8");
  expectField(raw, "version: 2");
  expectField(raw, "updates:");
});

test("dependabot.yml covers npm, gomod, pip, github-actions, docker", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  for (const e of ["npm", "gomod", "pip", "github-actions", "docker"]) {
    assert.ok(
      raw.includes(`package-ecosystem: "${e}"`),
      `missing ecosystem: ${e}`,
    );
  }
});

test("dependabot.yml schedules are weekday-only", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  const allowed = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  // Verify each schedule.day block uses a weekday.
  for (const day of allowed) {
    assert.ok(
      raw.includes(`day: "${day}"`),
      `dependabot.yml should have at least one schedule on ${day}`,
    );
  }
  assert.equal(raw.includes(`day: "saturday"`), false);
  assert.equal(raw.includes(`day: "sunday"`), false);
});

test("dependabot.yml uses ${{ secrets.X }} for tokens (never literal)", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  assert.ok(raw.includes("${{ secrets."));
});

test("dependabot.yml timezone is Asia/Dhaka for at least one ecosystem", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  assert.ok(raw.includes('timezone: "Asia/Dhaka"'));
});

// ---- NEGATIVE: Dependabot ------------------------------------------------

test("dependabot.yml does not embed any literal secrets", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  const forbidden = [
    "ghp_",
    "github_pat_",
    "sk_live_",
    "sk_test_",
    "AKIA",
    "BEGIN PRIVATE KEY",
    "xoxb-",
    "xoxp-",
  ];
  for (const f of forbidden) {
    assert.equal(raw.includes(f), false, `dependabot.yml contains forbidden string: ${f}`);
  }
});

test("dependabot.yml does not bypass integrity (no --insecure or similar)", () => {
  const raw = readFileSync(DEPENDABOT, "utf8");
  assert.equal(raw.includes("insecure"), false);
  assert.equal(raw.includes("ignore-certificate"), false);
});