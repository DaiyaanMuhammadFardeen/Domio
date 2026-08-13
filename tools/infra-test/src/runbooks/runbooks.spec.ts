import { describe, it, expect } from 'vitest';
import { readText } from '../read.js';
import { REPO_ROOT } from '../repo-root.js';

const ENV_DOC = `${REPO_ROOT}/docs/runbooks/environments.md`;
const PARITY_DOC = `${REPO_ROOT}/docs/runbooks/environment-parity-checklist.md`;

const ENV_REQUIRED_SECTIONS = [
  'Environment matrix',
  'What is the same across environments',
  'What is intentionally different',
  'State management',
  'Required status checks on `main`',
  'GitOps promotion rules',
  'Disaster recovery posture',
  'Owner matrix',
  'How to roll a change',
  'References',
];

const PARITY_REQUIRED_SECTIONS = [
  'Pre-flight',
  'Terraform parity',
  'Helm parity',
  'ArgoCD parity',
  'Secrets parity',
  'Observability parity',
  'Capacity / cost',
  'Documentation',
  'Sign-off',
];

describe('Runbooks — environments.md has all required sections', () => {
  const text = readText(ENV_DOC);
  for (const section of ENV_REQUIRED_SECTIONS) {
    it(`environments.md contains section: ${section}`, () => {
      expect(text).toContain(section);
    });
  }
});

describe('Runbooks — environment-parity-checklist.md has all required sections', () => {
  const text = readText(PARITY_DOC);
  for (const section of PARITY_REQUIRED_SECTIONS) {
    it(`environment-parity-checklist.md contains section: ${section}`, () => {
      expect(text).toContain(section);
    });
  }
});

describe('Runbooks — quarterly checklist structure', () => {
  it('checklist contains checkable items', () => {
    const text = readText(PARITY_DOC);
    const matches = text.match(/^- \[[ x]\]/gm) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(20);
  });

  it('checklist includes Terraform, Helm, ArgoCD, Secrets, Observability', () => {
    const text = readText(PARITY_DOC);
    expect(text).toContain('Terraform');
    expect(text).toContain('Helm');
    expect(text).toContain('ArgoCD');
    expect(text).toContain('Secrets');
    expect(text).toContain('Observability');
  });
});

describe('Runbooks — environments.md covers three envs', () => {
  it('environments.md mentions dev, staging, prod', () => {
    const text = readText(ENV_DOC);
    expect(text).toMatch(/\| dev \|/);
    expect(text).toMatch(/\| staging \|/);
    expect(text).toMatch(/\| prod \|/);
  });

  it('environments.md codifies GHCR image registry default', () => {
    const text = readText(ENV_DOC);
    expect(text).toContain('ghcr.io/domio');
  });
});

describe('Negative fixture — a runbook missing required sections', () => {
  it("a bad runbook without 'Sign-off' should be detectable", () => {
    const bad = `# Some runbook\n\n## Pre-flight\n- [ ] foo\n`;
    expect(bad).not.toContain('Sign-off');
  });
});
