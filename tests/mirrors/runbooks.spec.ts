import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const BD = resolve(ROOT, 'docs/runbooks/bangladesh-mirror-fallback.md');
const DEP = resolve(ROOT, 'docs/runbooks/dependency-update.md');

// ---- POSITIVE --------------------------------------------------------------

test('bangladesh-mirror-fallback.md exists with required sections', () => {
  assert.ok(existsSync(BD));
  const raw = readFileSync(BD, 'utf8');
  for (const heading of [
    'Symptoms',
    'Decision tree',
    'Upstream fallback',
    'Rollback',
    'Bandwidth-saving',
    'Security warning',
    'Escalation',
  ]) {
    assert.ok(
      raw.includes(heading),
      `bangladesh-mirror-fallback.md must contain section "${heading}"`,
    );
  }
});

test('bangladesh-mirror-fallback.md has frontmatter with required fields', () => {
  const raw = readFileSync(BD, 'utf8');
  assert.ok(raw.startsWith('---'));
  assert.ok(raw.includes('title:'));
  assert.ok(raw.includes('phase:'));
  assert.ok(raw.includes('last_reviewed:'));
});

test('dependency-update.md exists with required sections', () => {
  assert.ok(existsSync(DEP));
  const raw = readFileSync(DEP, 'utf8');
  for (const heading of [
    'Sources of dependency PRs',
    'Decision tree',
    'Normal weekly updates',
    'Emergency security patches',
    'When an update fails CI',
    'Upstream fallback',
    'Rollback',
    'Bandwidth-saving',
  ]) {
    assert.ok(raw.includes(heading), `dependency-update.md must contain section "${heading}"`);
  }
});

// ---- NEGATIVE --------------------------------------------------------------

test('bangladesh-mirror-fallback.md has the security warning on untrusted mirrors', () => {
  const raw = readFileSync(BD, 'utf8');
  // The security-warning section must be present and must call out the
  // supply-chain risk explicitly.
  assert.ok(raw.includes('Security warning'));
  assert.ok(raw.includes('untrusted mirror'));
  assert.ok(raw.includes('tampered package'));
});

test('dependency-update.md calls out checksum verification on every ecosystem', () => {
  const raw = readFileSync(DEP, 'utf8');
  assert.ok(raw.includes('integrity'));
  assert.ok(raw.includes('go.sum'));
  assert.ok(raw.includes('digest'));
});

test('neither runbook recommends disabling checksum verification', () => {
  for (const path of [BD, DEP]) {
    const raw = readFileSync(path, 'utf8');
    assert.equal(
      raw.includes('disable checksum'),
      false,
      `${path} must not recommend disabling checksum verification`,
    );
    assert.equal(
      raw.includes('GOSUMDB=off'),
      false,
      `${path} must not recommend disabling GOSUMDB`,
    );
  }
});
