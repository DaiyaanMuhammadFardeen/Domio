/**
 * @domio/viewer — Tests for embed sandbox runtime (M8.1).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createViewerEmbedRuntime, type ViewerEmbedRuntimeConfig } from './sandbox.js';
import { EmbedPolicyService } from '@domio/embed-proxy';

function makeConfig(viewerOrigin = 'https://viewer.domio.app'): ViewerEmbedRuntimeConfig {
  const policyService = new EmbedPolicyService(() => new Date('2026-01-01'));
  policyService.create({
    workspaceId: 'ws_1',
    name: 'public',
    allowedOrigins: ['https://viewer.domio.app', 'https://partner.example.com'],
    sandboxFlags: 'allow-scripts allow-same-origin allow-forms',
    jwtRequired: true,
    trapFocus: false,
  });
  return { workspaceId: 'ws_1', policyService, viewerOrigin };
}

describe('createViewerEmbedRuntime', () => {
  let config: ViewerEmbedRuntimeConfig;

  beforeEach(() => {
    config = makeConfig();
  });

  it('builds the CSP header and focus-trap flag', () => {
    const rt = createViewerEmbedRuntime(config);
    const policy = rt.resolvePolicy('/deck/intro');
    const headers = rt.headersFor(policy);
    expect(headers.csp).toContain("frame-ancestors 'self'");
    expect(headers.csp).toContain('https://viewer.domio.app');
    expect(headers.focusTrap).toBeUndefined();
  });

  it('returns "enabled" for the focus-trap header when policy requires it', () => {
    config.policyService.update(config.policyService.listByWorkspace('ws_1')[0]!.id, {
      trapFocus: true,
    });
    const rt = createViewerEmbedRuntime(config);
    const headers = rt.headersFor(rt.resolvePolicy('/deck/intro'));
    expect(headers.focusTrap).toBe('enabled');
  });

  it('checks whether the viewer origin is allowed', () => {
    const rt = createViewerEmbedRuntime(config);
    const policy = rt.resolvePolicy('/deck/intro');
    expect(rt.isOriginAllowed(policy)).toBe(true);
    expect(rt.isOriginAllowed(policy, 'https://partner.example.com')).toBe(true);
    expect(rt.isOriginAllowed(policy, 'https://attacker.example.com')).toBe(false);
  });

  it('mounts an iframe with sandbox attributes and CSP data attribute', () => {
    const rt = createViewerEmbedRuntime(config);
    const target = document.createElement('div');
    const mount = rt.mount(target, 'https://cdn.domio.app/deck.html', '/deck/intro');
    const iframe = target.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(target.getAttribute('data-csp')).toContain('frame-ancestors');
    expect(mount.element).toBe(iframe);
    rt.unmount(mount);
  });

  it('unmount removes the iframe and data attributes', () => {
    const rt = createViewerEmbedRuntime(config);
    const target = document.createElement('div');
    const mount = rt.mount(target, 'https://cdn.domio.app/deck.html', '/deck/intro');
    rt.unmount(mount);
    expect(target.querySelector('iframe')).toBeNull();
    expect(target.getAttribute('data-csp')).toBeNull();
  });

  it('returns the default deny-all policy when no policy matches', () => {
    const rt = createViewerEmbedRuntime({ ...config, workspaceId: 'ws_unknown' });
    const policy = rt.resolvePolicy('/deck/intro');
    expect(policy.name).toBe('default-deny-all');
    expect(rt.isOriginAllowed(policy)).toBe(false);
  });
});
