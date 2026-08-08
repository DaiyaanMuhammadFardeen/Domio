import { describe, expect, it } from 'vitest';
import { ScormPackager } from './index.js';

describe('scorm-packager', () => {
  it('produces imsmanifest with 2004 4th Ed conformance', () => {
    const p = new ScormPackager();
    const pkg = p.build({
      workspace_id: 'w1', session_id: 's1',
      title: 'Keynote',
      duration_ms: 3600000,
      unique_participants: 25,
      attendance_chain_intact: true,
      organization_id: 'ORG-1',
      resource_id: 'RES-1',
      item_id: 'ITEM-1',
      launch_url: 'https://join.domio.example/h/abc.123',
    });
    expect(pkg.imsmanifest).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(pkg.imsmanifest).toContain('scormType="sco"');
    expect(pkg.imsxml).toContain('attendance unique="25"');
    expect(pkg.imsxml).toContain('scorm version="2004 4th Edition"');
  });

  it('escapes XML in title and identifiers', () => {
    const p = new ScormPackager();
    const pkg = p.build({
      workspace_id: 'w1', session_id: 's1',
      title: '<script>alert("x")</script>',
      duration_ms: 0, unique_participants: 0,
      attendance_chain_intact: false,
      organization_id: 'ORG&<>',
      resource_id: 'R', item_id: 'I',
      launch_url: 'https://example.com',
    });
    expect(pkg.imsmanifest).toContain('&lt;script&gt;');
    expect(pkg.imsmanifest).not.toContain('<script>');
    expect(pkg.organization_id).toBe('ORG&<>');
  });
});