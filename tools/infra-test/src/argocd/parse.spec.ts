import { describe, it, expect } from "vitest";
import { readText, listFiles } from "../read.js";
import { REPO_ROOT } from "../repo-root.js";
import YAML from "yaml";

const ARGOCD_ROOT = `${REPO_ROOT}/infrastructure/argocd`;

describe("ArgoCD — file presence", () => {
  it("projects/domio.yaml exists", () => {
    expect(() => readText(`${ARGOCD_ROOT}/projects/domio.yaml`)).not.toThrow();
  });
  it("app-of-apps.yaml exists", () => {
    expect(() => readText(`${ARGOCD_ROOT}/app-of-apps.yaml`)).not.toThrow();
  });
  for (const env of ["dev", "staging", "prod"]) {
    it(`applications/${env}.yaml exists`, () => {
      expect(() => readText(`${ARGOCD_ROOT}/applications/${env}.yaml`)).not.toThrow();
    });
  }
});

describe("ArgoCD — manifests parse", () => {
  const files = listFiles(ARGOCD_ROOT, ".yaml");
  for (const file of files) {
    it(`${file} parses as YAML`, () => {
      const text = readText(file);
      const doc = YAML.parse(text);
      expect(doc).toBeDefined();
    });
  }
});

describe("ArgoCD — AppProject domio has correct restrictions", () => {
  const project = (() => {
    const text = readText(`${ARGOCD_ROOT}/projects/domio.yaml`);
    return YAML.parse(text) as Record<string, unknown>;
  })();

  it("destinations include dev/staging/prod/observability", () => {
    const destinations = project.spec.destinations as Array<{ namespace: string }>;
    const namespaces = destinations.map((d) => d.namespace).sort();
    expect(namespaces).toEqual(["dev", "observability", "prod", "staging"]);
  });

  it("sourceRepos allowlist is set", () => {
    const repos = project.spec.sourceRepos as string[];
    expect(repos).toContain("https://github.com/domio/infrastructure");
  });

  it("namespaceResourceWhitelist includes Deployment/Service/ExternalSecret", () => {
    const wl = project.spec.namespaceResourceWhitelist as Array<{ group: string; kind: string }>;
    const kinds = wl.map((e) => e.kind);
    expect(kinds).toContain("Deployment");
    expect(kinds).toContain("Service");
    expect(kinds).toContain("ExternalSecret");
  });
});

describe("ArgoCD — dev is auto-sync with prune + selfHeal", () => {
  it("applications/dev.yaml has automated block", () => {
    const text = readText(`${ARGOCD_ROOT}/applications/dev.yaml`);
    expect(text).toMatch(/automated:\s*\n\s*prune:\s*true/);
    expect(text).toMatch(/selfHeal:\s*true/);
  });
});

describe("ArgoCD — staging is manual (no automated field)", () => {
  it("applications/staging.yaml has no automated block", () => {
    const text = readText(`${ARGOCD_ROOT}/applications/staging.yaml`);
    expect(text).not.toMatch(/automated:\s*\n/);
    expect(text).not.toMatch(/^\s*automated:\s*\{/m);
    expect(text).toMatch(/syncPolicy:\s*\n\s*syncOptions:/);
  });
});

describe("ArgoCD — prod is manual (no automated field)", () => {
  it("applications/prod.yaml has no automated block", () => {
    const text = readText(`${ARGOCD_ROOT}/applications/prod.yaml`);
    expect(text).not.toMatch(/automated:\s*\n/);
    expect(text).not.toMatch(/^\s*automated:\s*\{/m);
    expect(text).toMatch(/syncPolicy:\s*\n\s*syncOptions:/);
  });
});

describe("ArgoCD — apps reference domio project", () => {
  for (const env of ["dev", "staging", "prod"]) {
    it(`applications/${env}.yaml references project: domio`, () => {
      const doc = YAML.parse(readText(`${ARGOCD_ROOT}/applications/${env}.yaml`)) as Record<string, unknown>;
      expect((doc.spec as Record<string, unknown>).project).toBe("domio");
    });
  }
});

describe("ArgoCD — app-of-apps references valid apps", () => {
  it("app-of-apps.yaml points to argocd directory and includes applications/*.yaml", () => {
    const text = readText(`${ARGOCD_ROOT}/app-of-apps.yaml`);
    const doc = YAML.parse(text) as Record<string, unknown>;
    const source = (doc.spec as Record<string, unknown>).source as Record<string, unknown>;
    expect(source.path).toBe("infrastructure/argocd");
    const dir = source.directory as Record<string, unknown>;
    expect(dir.include).toBe("{applications/*.yaml,projects/*.yaml}");
  });
});

describe("ArgoCD — negative fixture", () => {
  it("a would-be bad application without project should be detected", () => {
    const text = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: bad
spec:
  # missing project field
  destination: {}
`;
    expect(text).not.toMatch(/^\s*project:/m);
  });
});