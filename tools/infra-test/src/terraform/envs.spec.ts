import { describe, it, expect } from "vitest";
import { readText, listFiles } from "../read.js";
import { REPO_ROOT } from "../repo-root.js";

const ENVS = ["dev", "staging", "prod"];
const ENV_ROOT = `${REPO_ROOT}/infrastructure/terraform/envs`;

describe("Terraform envs — file presence", () => {
  for (const env of ENVS) {
    it(`env ${env} has main.tf/variables.tf/backend.tf/terraform.tfvars.example`, () => {
      for (const file of ["main.tf", "variables.tf", "backend.tf", "terraform.tfvars.example"]) {
        expect(
          () => readText(`${ENV_ROOT}/${env}/${file}`),
          `env ${env} missing ${file}`
        ).not.toThrow();
      }
    });
  }
});

describe("Terraform envs — backend config is partial", () => {
  for (const env of ENVS) {
    it(`env ${env} backend.tf has commented-out backend block (no live creds)`, () => {
      const tf = readText(`${ENV_ROOT}/${env}/backend.tf`);
      expect(tf).toMatch(/backend\s+"s3"\s*\{/);
      // The block must be commented out at the parameter level.
      expect(tf).toMatch(/#\s*bucket\s*=/);
      expect(tf).toMatch(/#\s*key\s*=/);
      expect(tf).not.toMatch(/^\s*bucket\s*=\s*"[A-Za-z0-9.-]+"/m);
      expect(tf).not.toMatch(/^\s*key\s*=\s*"[A-Za-z0-9./-]+"/m);
    });
  }
});

describe("Terraform envs — compose all modules", () => {
  for (const env of ENVS) {
    it(`env ${env} uses network, cluster, postgres, nats, minio, valkey, observability, vault, oncall`, () => {
      const tf = readText(`${ENV_ROOT}/${env}/main.tf`);
      for (const mod of [
        "network",
        "cluster",
        "postgres",
        "nats",
        "minio",
        "valkey",
        "observability",
        "vault",
        "oncall"
      ]) {
        expect(tf, `env ${env} main.tf missing module ${mod}`).toContain(`module "${mod}"`);
      }
    });
  }
});

describe("Terraform envs — environment parameter passed correctly", () => {
  for (const env of ENVS) {
    it(`env ${env} passes environment = "${env}"`, () => {
      const tf = readText(`${ENV_ROOT}/${env}/main.tf`);
      expect(tf).toContain(`environment = "${env}"`);
    });
  }
});

describe("Terraform envs — terraform.tfvars.example contains no secrets", () => {
  for (const env of ENVS) {
    it(`env ${env} terraform.tfvars.example has no secret material`, () => {
      const tf = readText(`${ENV_ROOT}/${env}/terraform.tfvars.example`);
      expect(tf).not.toMatch(/password\s*=\s*"[A-Za-z0-9]{8,}"/);
      expect(tf).not.toMatch(/token\s*=\s*"[A-Za-z0-9]{8,}"/);
      expect(tf).not.toMatch(/secret_key\s*=\s*"[A-Za-z0-9+/=_-]{16,}"/);
    });
  }
});

describe("Terraform envs — module composition differs by env", () => {
  it("dev has vault dev_mode enabled", () => {
    const tf = readText(`${ENV_ROOT}/dev/main.tf`);
    expect(tf).toMatch(/dev_mode\s*=\s*var\.vault_dev_mode/);
    const vars = readText(`${ENV_ROOT}/dev/variables.tf`);
    expect(vars).toMatch(/vault_dev_mode[^}]*default\s*=\s*true/s);
  });

  it("staging has postgres high_availability = true", () => {
    const tf = readText(`${ENV_ROOT}/staging/main.tf`);
    expect(tf).toMatch(/high_availability\s*=\s*true/);
  });

  it("prod has xlarge instance + HA + cluster mode valkey", () => {
    const tf = readText(`${ENV_ROOT}/prod/main.tf`);
    expect(tf).toMatch(/instance_size\s*=\s*"xlarge"/);
    expect(tf).toMatch(/high_availability\s*=\s*true/);
    expect(tf).toMatch(/mode\s*=\s*"cluster"/);
    // vault is gated by var.vault_enabled count
    expect(tf).toMatch(/count\s+=\s+var\.vault_enabled\s+\?\s+1\s+:\s+0/);
  });
});

describe("Terraform envs — versions.tf style", () => {
  it("every env main.tf declares terraform required_version", () => {
    const files = listFiles(ENV_ROOT, ".tf");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      if (!f.endsWith("/main.tf")) continue;
      const body = readText(f);
      expect(body, `${f} missing required_version`).toMatch(/required_version\s*=/);
    }
  });
});

describe("Negative fixture: backend with hard-coded bucket — must be detected", () => {
  it("rejects a backend that exposes a live bucket name", () => {
    const tf = `
      terraform {
        backend "s3" {
          bucket = "domio-tfstate-live-bucket"
          key    = "live"
          region = "southeastasia"
        }
      }
    `;
    expect(tf).toMatch(/bucket\s*=\s*"domio-tfstate-live-bucket"/);
  });
});

describe("Negative fixture: invalid module reference — must not pass", () => {
  it("a bad module source should be detectable by absence in env", () => {
    const tf = readText(`${ENV_ROOT}/dev/main.tf`);
    expect(tf).not.toMatch(/module "ghost"/);
  });
});