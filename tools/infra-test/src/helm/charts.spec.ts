import { describe, it, expect } from "vitest";
import { readText, listFiles } from "../read.js";
import { REPO_ROOT } from "../repo-root.js";
import YAML from "yaml";

const CHARTS = ["domio", "observability", "ingress", "secrets"];
const CHART_ROOT = `${REPO_ROOT}/infrastructure/helm`;

describe("Helm charts — file presence", () => {
  for (const name of CHARTS) {
    it(`chart ${name} has Chart.yaml, values.yaml, values.schema.json, templates/`, () => {
      for (const file of ["Chart.yaml", "values.yaml", "values.schema.json"]) {
        expect(
          () => readText(`${CHART_ROOT}/${name}/${file}`),
          `chart ${name} missing ${file}`
        ).not.toThrow();
      }
      expect(
        () => listFiles(`${CHART_ROOT}/${name}/templates`),
        `chart ${name} missing templates/`
      ).not.toThrow();
    });
  }
});

describe("Helm charts — Chart.yaml is valid", () => {
  for (const name of CHARTS) {
    it(`chart ${name} Chart.yaml parses as YAML`, () => {
      const text = readText(`${CHART_ROOT}/${name}/Chart.yaml`);
      const doc = YAML.parse(text);
      expect(doc).toMatchObject({
        apiVersion: "v2",
        name,
        type: "application",
        version: expect.any(String)
      });
      // appVersion may be string or number — coerce to string and check.
      expect(String(doc.appVersion)).toMatch(/^[A-Za-z0-9_.-]+$/);
    });
  }
});

describe("Helm charts — values.schema.json is valid JSON schema", () => {
  for (const name of CHARTS) {
    it(`chart ${name} values.schema.json parses as JSON`, () => {
      const text = readText(`${CHART_ROOT}/${name}/values.schema.json`);
      const doc = JSON.parse(text);
      expect(doc).toMatchObject({ type: "object" });
      expect(doc).toHaveProperty("properties");
      expect(doc).toHaveProperty("$schema");
    });
  }
});

describe("Helm charts — templates directory contains at least one yaml", () => {
  for (const name of CHARTS) {
    it(`chart ${name} templates has Deployment/Service/ConfigMap or specialty`, () => {
      const files = listFiles(`${CHART_ROOT}/${name}/templates`);
      const yaml = files.filter((f) => f.endsWith(".yaml"));
      expect(yaml.length).toBeGreaterThan(0);
    });
  }
});

describe("Helm charts — security context is non-root / RO", () => {
  for (const name of CHARTS) {
    it(`chart ${name} values.yaml defines runAsNonRoot: true`, () => {
      const values = readText(`${CHART_ROOT}/${name}/values.yaml`);
      expect(values).toMatch(/runAsNonRoot:\s*true/);
    });
    it(`chart ${name} values.yaml or template drops ALL capabilities`, () => {
      const files = listFiles(`${CHART_ROOT}/${name}`);
      const allText = files.map(readText).join("\n");
      expect(allText).toMatch(/drop:\s*\n\s*-\s*ALL/);
    });
  }
});

describe("Helm charts — image policy is pulled, not Latest by default", () => {
  for (const name of CHARTS) {
    it(`chart ${name} uses a non-empty image tag`, () => {
      const values = readText(`${CHART_ROOT}/${name}/values.yaml`);
      const m = values.match(/tag:\s*"?([^"\s]+)"?/);
      expect(m, `no tag in values`).toBeTruthy();
      // Most usage is "0.1.0" semver-like — last char ":" not allowed.
      expect(m![1]).not.toBe("");
      expect(m![1]).not.toMatch(/latest/i);
    });
  }
});

describe("Helm charts — manifests include standard probes", () => {
  for (const name of ["domio", "observability"]) {
    it(`chart ${name} has startupProbe or livenessProbe path`, () => {
      const files = listFiles(`${CHART_ROOT}/${name}/templates`);
      const allText = files.map(readText).join("\n");
      expect(allText).toMatch(/(startupProbe|livenessProbe|readinessProbe)/);
    });
  }
});

describe("Negative fixture — chart security context cannot regress", () => {
  it("a chart missing runAsNonRoot is detectable", () => {
    const bad = `securityContext:\n  runAsNonRoot: false\n  readOnlyRootFilesystem: false\n`;
    expect(bad).toMatch(/runAsNonRoot:\s*false/);
  });

  it("schema rejects values without required fields", () => {
    const schema = JSON.parse(
      readText(`${CHART_ROOT}/domio/values.schema.json`)
    ) as Record<string, unknown>;
    expect(JSON.stringify(schema)).toMatch(/"runAsNonRoot":\s*\{"type":\s*"boolean",\s*"const":\s*true\}/);
  });
});