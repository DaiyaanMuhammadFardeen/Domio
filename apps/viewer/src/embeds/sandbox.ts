/**
 * @domio/viewer — Embed iframe sandbox + CSP runtime (Phase 11 M8.1).
 *
 * Browser-side companion to the server-side `@domio/embed-proxy`.
 * The viewer receives an `EmbedPolicy` (fetched from the proxy) and
 * uses it to:
 *   - set the iframe `sandbox` attribute to the policy's flags
 *   - assert the parent origin against the policy's allowedOrigins
 *   - compute the `frame-ancestors` CSP directive
 *   - enable / disable the focus-trap header value
 *
 * The viewer never *forges* CSP headers — the proxy is authoritative.
 * This module is a small client-side mirror so the viewer can refuse
 * to mount an iframe if the parent origin is not in the allowlist.
 */

import {
  buildCspHeader,
  buildFocusTrapHeader,
  isAllowedOrigin,
  DEFAULT_POLICY,
  type EmbedPolicy,
  type EmbedPolicyService,
} from '@domio/embed-proxy';

// ─── Public types ────────────────────────────────────────────────────

export interface ViewerEmbedMount {
  readonly element: HTMLIFrameElement;
  readonly src: string;
  readonly policy: EmbedPolicy;
}

export interface ViewerEmbedRuntimeConfig {
  /** Workspace ID — used to resolve policies for the active deck. */
  readonly workspaceId: string;
  /** Injectable embed-policy service (server proxy). */
  readonly policyService: EmbedPolicyService;
  /** Origin where the viewer is hosted (used for parent checks). */
  readonly viewerOrigin: string;
}

export interface ViewerEmbedRuntime {
  /** Build the CSP and focus-trap headers for the active policy. */
  headersFor(policy: EmbedPolicy): {
    readonly csp: string;
    readonly focusTrap: string | undefined;
  };
  /** Whether the viewer origin is allowed to embed this policy. */
  isOriginAllowed(policy: EmbedPolicy, origin?: string): boolean;
  /** Resolve the policy for a given workspace + deck path. */
  resolvePolicy(deckPath: string): EmbedPolicy;
  /** Mount an iframe with the policy's sandbox + allow attributes. */
  mount(target: HTMLElement, src: string, deckPath: string): ViewerEmbedMount;
  /** Tear down a mounted iframe. */
  unmount(mount: ViewerEmbedMount): void;
  /** Destroy runtime state. */
  destroy(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createViewerEmbedRuntime(config: ViewerEmbedRuntimeConfig): ViewerEmbedRuntime {
  const { policyService, viewerOrigin } = config;

  return {
    headersFor(policy: EmbedPolicy) {
      return {
        csp: buildCspHeader(policy),
        focusTrap: buildFocusTrapHeader(policy),
      };
    },

    isOriginAllowed(policy: EmbedPolicy, origin?: string): boolean {
      return isAllowedOrigin(policy, origin ?? viewerOrigin);
    },

    resolvePolicy(deckPath: string): EmbedPolicy {
      return policyService.resolveForPath(config.workspaceId, deckPath) ?? DEFAULT_POLICY;
    },

    mount(target: HTMLElement, src: string, deckPath: string): ViewerEmbedMount {
      const policy = this.resolvePolicy(deckPath);
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.setAttribute('sandbox', policy.sandboxFlags);
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('allow', 'fullscreen');
      iframe.title = `Embedded deck ${deckPath}`;
      // Mirror the policy's frame-ancestors directive on the host.
      target.setAttribute('data-csp', buildCspHeader(policy));
      if (policy.trapFocus) {
        target.setAttribute('data-focus-trap', 'enabled');
      }
      target.appendChild(iframe);
      return { element: iframe, src, policy };
    },

    unmount(mount: ViewerEmbedMount): void {
      const { element } = mount;
      const parent = element.parentElement;
      if (parent) {
        parent.removeChild(element);
        parent.removeAttribute('data-csp');
        parent.removeAttribute('data-focus-trap');
      }
    },

    destroy(): void {
      // No state to tear down beyond what callers pass.
    },
  };
}
