/**
 * @domio/obs-control-plane — log redaction tests.
 */

import { describe, it, expect } from 'vitest';
import { checkLogRedaction, FORBIDDEN_LOG_TOKENS } from './log_redaction.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tmpTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'log-redact-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    const parentParts = path.split('/').slice(0, -1);
    if (parentParts.length > 0) {
      mkdirSync(join(dir, ...parentParts), { recursive: true });
    }
    writeFileSync(full, content);
  }
  return dir;
}

describe('checkLogRedaction', () => {
  it('passes on a clean tree', () => {
    const dir = tmpTree({
      'src/clean.ts': `
        logger.info('hello world');
        console.log('count', 42);
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(true);
      expect(report.issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags logging of a token variable', () => {
    const dir = tmpTree({
      'src/leak.ts': `
        const token = 'xyz';
        logger.info('user token', token);
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(false);
      expect(report.issues.some((i) => i.rule.includes('token'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags console.log of req.body', () => {
    const dir = tmpTree({
      'src/reqdump.ts': `
        app.post('/login', (req, res) => {
          console.log(req.body);
        });
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(false);
      expect(report.issues.some((i) => i.rule === 'console.log of req.body')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags JSON.stringify of req.body in console', () => {
    const dir = tmpTree({
      'src/reqdump2.ts': `
        console.log(JSON.stringify(req.body));
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips comments', () => {
    const dir = tmpTree({
      'src/commented.ts': `
        // console.log(token, password);
        /* logger.info('token', 'secret') */
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits the iteration early on first hit per line', () => {
    const dir = tmpTree({
      'src/multi.ts': `
        logger.error('password leaked:', password, token);
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      // We log at most one issue per line per file.
      const issuesInFile = report.issues.filter((i) => i.file.endsWith('multi.ts'));
      expect(issuesInFile).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules / dist / .turbo / coverage', () => {
    const dir = tmpTree({
      'node_modules/leak.ts': `
        logger.info('token', token);
      `,
      'dist/leak.ts': `
        logger.info('token', token);
      `,
      'src/clean.ts': `
        logger.info('hello');
      `,
    });
    try {
      const report = checkLogRedaction(dir);
      expect(report.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exported FORBIDDEN_LOG_TOKENS list is non-empty', () => {
    expect(FORBIDDEN_LOG_TOKENS.length).toBeGreaterThan(0);
    expect(FORBIDDEN_LOG_TOKENS).toContain('password');
    expect(FORBIDDEN_LOG_TOKENS).toContain('token');
  });
});
