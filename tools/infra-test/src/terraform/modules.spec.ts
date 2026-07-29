import { describe, it, expect } from "vitest";
import { readText, listFiles } from "../read.js";
import { REPO_ROOT } from "../repo-root.js";

const MODULES = [
  "network",
  "cluster",
  "postgres",
  "nats",
  "minio",
  "valkey",
  "observability",
  "vault",
  "oncall"
];

const MODULE_ROOT = `${REPO_ROOT}/infrastructure/terraform/modules`;

describe("Terraform modules — file presence", () => {
  for (const name of MODULES) {
    it(`module ${name} has main.tf/variables.tf/outputs.tf/versions.tf`, () => {
      for (const file of ["main.tf", "variables.tf", "outputs.tf", "versions.tf"]) {
        expect(
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          () => readText(`${MODULE_ROOT}/${name}/${file}`),
          `module ${name} missing ${file}`
        ).not.toThrow();
      }
    });
  }
});

describe("Terraform modules — versions.tf pinned", () => {
  for (const name of MODULES) {
    it(`module ${name} pins required_version >= 1.9.0`, () => {
      const tf = readText(`${MODULE_ROOT}/${name}/versions.tf`);
      expect(tf).toMatch(/required_version\s*=\s*">= 1\.9\.0"/);
    });
  }
});

describe("Terraform modules — variables use validation blocks", () => {
  for (const name of MODULES) {
    it(`module ${name} variables.tf contains a validation{} block`, () => {
      const tf = readText(`${MODULE_ROOT}/${name}/variables.tf`);
      expect(tf).toMatch(/validation\s*\{/);
      expect(tf).toMatch(/error_message\s*=/);
    });
  }
});

describe("Terraform modules — no plaintext secrets in tf", () => {
  for (const name of MODULES) {
    it(`module ${name} has no plaintext secrets`, () => {
      const files = listFiles(MODULE_ROOT, ".tf");
      const found = files.filter((f) => f.includes(`/${name}/`));
      for (const f of found) {
        const body = readText(f);
        // Block obvious secret materialization patterns.
        expect(body).not.toMatch(/(password|secret|token|api[_-]?key)\s*=\s*"[A-Za-z0-9+/=_-]{16,}"/);
        expect(body).not.toMatch(/(AWS_SECRET|GH_TOKEN|VAULT_TOKEN)\s*=\s*"/);
      }
    });
  }
});

describe("Terraform modules — sensitive outputs are marked", () => {
  for (const name of ["postgres", "minio", "cluster", "vault"]) {
    it(`module ${name} marks at least one output sensitive`, () => {
      const tf = readText(`${MODULE_ROOT}/${name}/outputs.tf`);
      expect(tf).toMatch(/sensitive\s*=\s*true/);
    });
  }
});

describe("Terraform modules — vendor-neutral providers", () => {
  for (const name of MODULES) {
    it(`module ${name} uses only null/local/random providers (no live cloud creds)`, () => {
      const tf = readText(`${MODULE_ROOT}/${name}/versions.tf`);
      const providers = [...tf.matchAll(/"hashicorp\/([a-z0-9-]+)"/g)].map((m) => m[1]);
      const allowed = ["null", "local", "random"];
      for (const p of providers) {
        expect(allowed).toContain(p);
      }
    });
  }
});

describe("Terraform modules — null/local resources only", () => {
  for (const name of MODULES) {
    it(`module ${name} main.tf only declares null_resource/local_file/random_*`, () => {
      const tf = readText(`${MODULE_ROOT}/${name}/main.tf`);
      const resources = [...tf.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)];
      const types = resources.map((m) => m[1]);
      for (const t of types) {
        expect([
          "null_resource",
          "local_file",
          "random_password",
          "random_id"
        ]).toContain(t);
      }
    });
  }
});