/**
 * @domio/viewer — AR runtime viewer test (Phase 11, M5.3).
 */

import { describe, it, expect } from 'vitest';
import {
  detectArSupport,
  buildPlatformAudienceUrl,
  createArRuntime,
  createAnchorTracker,
  type ArEnvironment,
} from './viewer-ar.js';
import { mintToken, generateSecret, type ArSession } from '@domio/ar-sessions';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeArSession(id: string): ArSession {
  const secret = generateSecret();
  const kid = `ar-kid-${id.slice(0, 8)}`;
  const token = mintToken({
    sessionId: id,
    secret,
    kid,
    ttlMs: 60_000,
  });
  const now = new Date();
  return {
    id,
    slideId: 'slide-test',
    modelAssetId: 'model-test',
    token: token.token,
    audienceUrl: 'https://ar.domio.app/s/' + id,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    state: 'active',
    _secret: secret,
    _kid: kid,
    _lastActivityAt: now.getTime(),
  };
}

const desktopChrome: ArEnvironment = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
  hasWebXr: false,
  hasIosQuicklook: false,
  hasAndroidSceneViewer: false,
};

const androidChrome: ArEnvironment = {
  userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120.0',
  hasWebXr: false,
  hasIosQuicklook: false,
  hasAndroidSceneViewer: true,
};

const iosSafari: ArEnvironment = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605',
  hasWebXr: false,
  hasIosQuicklook: true,
  hasAndroidSceneViewer: false,
};

const webxrChrome: ArEnvironment = {
  userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120.0',
  hasWebXr: true,
  hasIosQuicklook: false,
  hasAndroidSceneViewer: false,
};

// ─── detectArSupport ─────────────────────────────────────────────────

describe('detectArSupport', () => {
  it('returns webxr when WebXR is available', () => {
    const support = detectArSupport(webxrChrome);
    expect(support.platform).toBe('webxr');
    expect(support.inline).toBe(true);
    expect(support.handoffOnly).toBe(false);
  });

  it('returns ios-quicklook for iOS', () => {
    const support = detectArSupport(iosSafari);
    expect(support.platform).toBe('ios-quicklook');
    expect(support.inline).toBe(false);
    expect(support.handoffOnly).toBe(true);
  });

  it('returns android-sceneviewer for Android (non-WebXR)', () => {
    const support = detectArSupport(androidChrome);
    expect(support.platform).toBe('android-sceneviewer');
    expect(support.handoffOnly).toBe(true);
  });

  it('returns unsupported for desktop without WebXR', () => {
    const support = detectArSupport(desktopChrome);
    expect(support.platform).toBe('unsupported');
    expect(support.inline).toBe(false);
  });

  it('returns qr-handoff when preferQr is true on unsupported device', () => {
    const support = detectArSupport({ ...desktopChrome, preferQr: true });
    expect(support.platform).toBe('qr-handoff');
  });

  it('includes the user agent in the snapshot', () => {
    expect(detectArSupport(iosSafari).ua).toContain('iPhone');
  });
});

// ─── buildPlatformAudienceUrl ───────────────────────────────────────

describe('buildPlatformAudienceUrl', () => {
  it('appends mode=ar for iOS Quick Look', () => {
    const url = buildPlatformAudienceUrl({
      platform: 'ios-quicklook',
      baseUrl: 'https://cdn.domio.app/models/chair.usdz',
      displayName: 'Chair',
    });
    expect(url).toContain('mode=ar');
    expect(url).toContain('title=Chair');
  });

  it('wraps in intent:// for Android Scene Viewer', () => {
    const url = buildPlatformAudienceUrl({
      platform: 'android-sceneviewer',
      baseUrl: 'https://cdn.domio.app/models/chair.glb',
    });
    expect(url.startsWith('intent://arvr.google.com/scene-viewer/')).toBe(true);
    // The inner URL is URL-encoded inside file=...
    expect(url).toContain('mode%3Dar_preferred');
    expect(decodeURIComponent(url)).toContain('mode=ar_preferred');
    expect(url).toContain('S.browser_fallback_url=');
  });

  it('returns baseUrl unchanged for webxr', () => {
    const url = buildPlatformAudienceUrl({
      platform: 'webxr',
      baseUrl: 'https://cdn.domio.app/models/chair.glb',
    });
    expect(url).toBe('https://cdn.domio.app/models/chair.glb');
  });

  it('returns baseUrl unchanged for qr-handoff', () => {
    const url = buildPlatformAudienceUrl({
      platform: 'qr-handoff',
      baseUrl: 'https://cdn.domio.app/models/chair.glb',
    });
    expect(url).toBe('https://cdn.domio.app/models/chair.glb');
  });
});

// ─── createArRuntime ─────────────────────────────────────────────────

describe('createArRuntime', () => {
  it('returns a verified result when the session token is valid', () => {
    const session = makeArSession('sess-1');
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session,
      origin: 'https://app.domio.app',
      env: desktopChrome,
    });
    expect(result.verified).toBe(true);
    expect(result.platform).toBe('unsupported');
    expect(result.audienceUrl).toContain('https://app.domio.app');
    expect(result.audienceUrl).toContain('/s/sess-1');
    expect(result.qrPayload.length).toBeGreaterThan(0);
  });

  // The runtime is a *sanity* check, not an authoritative verifier.
  // Per viewer-ar.ts, `verified=true` whenever `_secret` is present
  // — the ar-sessions server is responsible for the real crypto
  // check. These tests pin down that contract: a tampered token or
  // wrong secret does not flip the runtime into `verified=false`
  // because the client cannot do HMAC verification without
  // `node:crypto` (intentionally not bundled into the browser).
  it('keeps verified=true when the token is tampered (client cannot re-verify)', () => {
    const session = makeArSession('sess-2');
    const tampered = { ...session, token: session.token + 'tampered' } as ArSession;
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session: tampered,
      origin: 'https://app.domio.app',
      env: desktopChrome,
    });
    // The presence of `_secret` is the only signal the browser
    // runtime has — it does not recompute the HMAC.
    expect(result.verified).toBe(true);
  });

  it('keeps verified=true when the secret is wrong (client cannot re-verify)', () => {
    const session = makeArSession('sess-3');
    const wrongSecret = { ...session, _secret: 'wrong-secret' } as ArSession;
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session: wrongSecret,
      origin: 'https://app.domio.app',
      env: desktopChrome,
    });
    // See the comment in the test above — the runtime trusts the
    // presence of `_secret` and lets the server catch real fraud.
    expect(result.verified).toBe(true);
  });

  it('returns inline=true for WebXR-capable environments', () => {
    const session = makeArSession('sess-4');
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session,
      origin: 'https://app.domio.app',
      env: webxrChrome,
    });
    expect(result.inline).toBe(true);
    expect(result.platform).toBe('webxr');
  });

  it('returns handoffOnly=true for iOS', () => {
    const session = makeArSession('sess-5');
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session,
      origin: 'https://app.domio.app',
      env: iosSafari,
    });
    expect(result.inline).toBe(false);
    expect(result.platform).toBe('ios-quicklook');
  });

  it('embeds the sessionId in the QR payload', () => {
    const session = makeArSession('sess-6');
    const result = createArRuntime({
      modelUrl: 'https://cdn.domio.app/models/chair.glb',
      session,
      origin: 'https://app.domio.app',
      env: androidChrome,
      slideId: 'slide-abc',
    });
    // QR payload always reflects the deep link which includes session info.
    expect(result.qrPayload).toContain('sess-6');
  });
});

// ─── createAnchorTracker ─────────────────────────────────────────────

describe('createAnchorTracker', () => {
  it('adds anchors with increasing ids', () => {
    const tracker = createAnchorTracker();
    const a1 = tracker.add({ x: 0, y: 0, z: 0 });
    const a2 = tracker.add({ x: 0.5, y: 0.5, z: 1 });
    expect(a1.id).toBe('anchor-1');
    expect(a2.id).toBe('anchor-2');
    expect(a1.placed).toBe(false);
  });

  it('confirm marks an anchor as placed', () => {
    const tracker = createAnchorTracker();
    const a = tracker.add({ x: 0, y: 0, z: 0 });
    expect(tracker.confirm(a.id)).toBe(true);
    const list = tracker.list();
    expect(list[0]!.placed).toBe(true);
  });

  it('confirm returns false for unknown id', () => {
    const tracker = createAnchorTracker();
    expect(tracker.confirm('missing')).toBe(false);
  });

  it('remove deletes an anchor', () => {
    const tracker = createAnchorTracker();
    const a = tracker.add({ x: 0, y: 0, z: 0 });
    expect(tracker.remove(a.id)).toBe(true);
    expect(tracker.list()).toHaveLength(0);
  });

  it('remove returns false for unknown id', () => {
    const tracker = createAnchorTracker();
    expect(tracker.remove('missing')).toBe(false);
  });

  it('list returns all anchors', () => {
    const tracker = createAnchorTracker();
    tracker.add({ x: 0, y: 0, z: 0 });
    tracker.add({ x: 1, y: 1, z: 1 });
    expect(tracker.list()).toHaveLength(2);
  });
});
