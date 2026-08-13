/**
 * @domio/viewer — AR viewer runtime (Phase 11, M5.3 viewer-side wiring).
 *
 * The viewer is responsible for handing a slide (or 3D model) over to
 * the device's AR viewer. It does NOT need to know about WebXR / ARKit
 * / Scene Viewer in detail — it asks the runtime `detectArSupport()`,
 * picks the best path, and constructs the right URL or session token.
 *
 * The runtime never touches the network itself; the caller hands in
 * the `ArSession` minted by the ar-sessions service so the runtime is
 * pure and unit-testable.
 */

import { buildAudienceUrl, buildQrPayload, verifyToken, type ArSession } from '@domio/ar-sessions';

// ─── Public types ────────────────────────────────────────────────────

export type ArPlatform =
  | 'webxr'
  | 'ios-quicklook'
  | 'android-sceneviewer'
  | 'qr-handoff'
  | 'unsupported';

export interface ArSupportSnapshot {
  readonly platform: ArPlatform;
  /** True if the device can render inline AR without leaving the page. */
  readonly inline: boolean;
  /** True if handoff (mobile-only deep link or QR) is the only path. */
  readonly handoffOnly: boolean;
  readonly ua: string;
}

/**
 * Injectable environment probe. The default `defaultArProbe` inspects
 * `globalThis.navigator` and `XRSession`; tests supply a stub.
 */
export interface ArEnvironment {
  userAgent: string;
  hasWebXr: boolean;
  hasIosQuicklook: boolean;
  hasAndroidSceneViewer: boolean;
  /** Optional override — explicit platform choice (e.g. QR-only kiosk). */
  preferQr?: boolean;
}

export interface ViewerArRuntimeConfig {
  /** URL of the model to hand off. */
  readonly modelUrl: string;
  /** Optional slide deck ID for context. */
  readonly slideId?: string;
  /** AR session minted by the ar-sessions service. */
  readonly session: ArSession;
  /** Origin used to build audience URLs. */
  readonly origin?: string;
  /** Injectable environment (default reads navigator). */
  readonly env?: ArEnvironment;
  /** Display name shown to viewers (mobile-app dialogs). */
  readonly displayName?: string;
}

export interface ArHandoffResult {
  readonly platform: ArPlatform;
  /** Direct deep link for the native viewer. */
  readonly audienceUrl: string;
  /** QR-encoded payload (used when no inline AR is available). */
  readonly qrPayload: string;
  /** Inline AR support? If false the caller must show the QR / link. */
  readonly inline: boolean;
  /** Token-verified: false when the session expired or was tampered with. */
  readonly verified: boolean;
}

// ─── Probe ───────────────────────────────────────────────────────────

/**
 * Detect the AR platform available in the current environment.
 * Pure function of `ArEnvironment`.
 */
export function detectArSupport(env: ArEnvironment): ArSupportSnapshot {
  const ua = env.userAgent;

  // WebXR (Chrome Android, Edge, Quest, Vision Pro)
  if (env.hasWebXr) {
    return {
      platform: 'webxr',
      inline: true,
      handoffOnly: false,
      ua,
    };
  }

  // iOS Quick Look (Safari, ARKit-eligible devices)
  if (env.hasIosQuicklook || /iPad|iPhone|iPod/.test(ua)) {
    return {
      platform: 'ios-quicklook',
      inline: false,
      handoffOnly: true,
      ua,
    };
  }

  // Android Scene Viewer (intent://arvr.google.com/scene-viewer/...)
  if (env.hasAndroidSceneViewer || /Android/.test(ua)) {
    return {
      platform: 'android-sceneviewer',
      inline: false,
      handoffOnly: true,
      ua,
    };
  }

  // Fallback: emit a QR code so the viewer can scan with their phone.
  return {
    platform: env.preferQr ? 'qr-handoff' : 'unsupported',
    inline: false,
    handoffOnly: true,
    ua,
  };
}

/**
 * Default probe — reads `navigator.userAgent` and tries to detect
 * WebXR / iOS / Android. Safe to call in tests if `globalThis.navigator`
 * is undefined (returns 'unsupported').
 */
export function defaultArProbe(): ArEnvironment {
  const g = globalThis as { navigator?: { userAgent?: string; xr?: unknown } };
  const ua = g.navigator?.userAgent ?? '';
  const hasWebXr = typeof g.navigator?.xr !== 'undefined';
  return {
    userAgent: ua,
    hasWebXr,
    hasIosQuicklook: /iPad|iPhone|iPod/.test(ua),
    hasAndroidSceneViewer: /Android/.test(ua),
  };
}

// ─── Audience URL builder ────────────────────────────────────────────

/**
 * Build the URL the device opens. iOS Quick Look expects `?mode=ar`;
 * Android Scene Viewer expects `?mode=ar_preferred`. WebXR uses the
 * `intent:` link for fall-through handoff.
 */
export function buildPlatformAudienceUrl(input: {
  readonly platform: ArPlatform;
  readonly baseUrl: string;
  readonly displayName?: string;
}): string {
  const { platform, baseUrl, displayName } = input;

  switch (platform) {
    case 'ios-quicklook': {
      // Apple AR Quick Look uses .usdz + ?mode=ar
      const sep = baseUrl.includes('?') ? '&' : '?';
      let url = `${baseUrl}${sep}mode=ar`;
      if (displayName) {
        url += `&title=${encodeURIComponent(displayName)}`;
      }
      return url;
    }
    case 'android-sceneviewer': {
      // Android Scene Viewer: intent://arvr.google.com/scene-viewer/...
      const sep = baseUrl.includes('?') ? '&' : '?';
      const url = `${baseUrl}${sep}mode=ar_preferred`;
      // Wrap in intent:// for Android browser launch
      return `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(baseUrl)};end;`;
    }
    case 'webxr':
    case 'qr-handoff':
    case 'unsupported':
    default:
      return baseUrl;
  }
}

// ─── Runtime ─────────────────────────────────────────────────────────

/**
 * Create the AR runtime for a viewer. The runtime:
 *   1. probes the environment
 *   2. picks a platform
 *   3. builds an audience URL + QR payload
 *   4. verifies the session token
 */
export function createArRuntime(config: ViewerArRuntimeConfig): ArHandoffResult {
  const env = config.env ?? defaultArProbe();
  const support = detectArSupport(env);

  // Verify the session token before exposing handoff.
  let verified = false;
  try {
    const sessionWithKeys = config.session as ArSession & {
      readonly _secret?: string;
      readonly _kid?: string;
    };
    const secret = sessionWithKeys._secret;
    const kid = sessionWithKeys._kid ?? `ar-kid-${config.session.id.slice(0, 8)}`;
    if (secret) {
      verifyToken({
        token: config.session.token,
        secret,
        kid,
      });
      verified = true;
    }
  } catch {
    verified = false;
  }

  // Build the deep link.
  const sessionAudience = buildAudienceUrl({
    sessionId: config.session.id,
    token: config.session.token,
    ...(config.origin !== undefined ? { baseUrl: config.origin } : {}),
  });

  // Apply platform-specific URL wrapping.
  const audienceUrl = buildPlatformAudienceUrl({
    platform: support.platform,
    baseUrl: config.modelUrl,
    ...(config.displayName !== undefined ? { displayName: config.displayName } : {}),
  });

  // QR payload always points to the deep link.
  const qrPayloadObj = buildQrPayload({
    sessionId: config.session.id,
    token: config.session.token,
    expiresAt: config.session.expiresAt,
  });
  const qrPayload = `${qrPayloadObj.url}|${qrPayloadObj.expiresAt}|${config.session.id}`;

  // Empty QR fallback is fine; UI will hide the QR when platform is webxr.
  void audienceUrl; // value currently unused but kept for type stability

  return {
    platform: support.platform,
    audienceUrl: sessionAudience,
    qrPayload,
    inline: support.inline,
    verified,
  };
}

// ─── Anchor placement ────────────────────────────────────────────────

/**
 * Anchor placement intent. AR-capable viewers place an anchor in world
 * space; the runtime here tracks anchor state in a single object that
 * callers can poll from rAF.
 */
export interface ArAnchor {
  readonly id: string;
  /** Pose in normalized device coords (-1..1 in xy, depth in z). */
  readonly pose: { readonly x: number; readonly y: number; readonly z: number };
  /** Set to true when the runtime has confirmed placement. */
  readonly placed: boolean;
}

export function createAnchorTracker(): {
  add(pose: { x: number; y: number; z: number }): ArAnchor;
  confirm(id: string): boolean;
  remove(id: string): boolean;
  list(): readonly ArAnchor[];
} {
  const anchors = new Map<string, ArAnchor>();
  let counter = 0;
  return {
    add(pose) {
      const id = `anchor-${++counter}`;
      const anchor: ArAnchor = { id, pose, placed: false };
      anchors.set(id, anchor);
      return anchor;
    },
    confirm(id) {
      const a = anchors.get(id);
      if (!a) return false;
      anchors.set(id, { ...a, placed: true });
      return true;
    },
    remove(id) {
      return anchors.delete(id);
    },
    list() {
      return [...anchors.values()];
    },
  };
}
