/**
 * ShareDialog — editor top-bar share dialog.
 *
 * Per Wave 3 §S3.3 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Tabs: Link, Embed, Visibility, Audience, Versions. Each tab is its
 * own sub-component (S3.4 ContentControlTab, S3.6 EmbedPlayground,
 * S3.9 SEOTab + SocialPreviewCard, S3.11 VersionPinSelector land in
 * their respective files).
 *
 * The dialog is open state is owned by the parent (e.g. a top-bar
 * button in `EditorRoot`). The dialog itself dispatches save events
 * via the `onSave` callback — persistence is the caller's concern.
 */

'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import { VisibilityPicker, type VisibilityPolicy } from './VisibilityPicker';
import { DomainAllowlist } from './DomainAllowlist';
import { SSOConfig, type SSOConfigValue, type SSOTenant } from './SSOConfig';
import { ContentControlTab } from './ContentControlTab';
import {
  CustomDomainPicker,
  DEFAULT_CUSTOM_DOMAIN_HOST,
  type CustomDomainOption,
} from './CustomDomainPicker';
import { EmbedPlayground, type EmbedConfig } from './EmbedPlayground';
import { SEOTab, type SEOConfig } from './SEOTab';
import {
  VersionPinSelector,
  type DeckVersion,
  type PinVersionValue,
} from './VersionPinSelector';

export type ShareTab = 'link' | 'embed' | 'visibility' | 'audience' | 'versions';

export interface ShareDialogProps {
  readonly deckId: string;
  readonly deckTitle: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (state: ShareDialogState) => Promise<void> | void;
  readonly initialState?: ShareDialogState;
  readonly ssoTenants?: readonly SSOTenant[];
  readonly deck?: import('@domio/schema/generated/scene-graph').DeckDocument;
  readonly customDomains?: readonly CustomDomainOption[];
  readonly deckVersions?: readonly DeckVersion[];
  readonly dataTestId?: string;
}

export interface ShareDialogState {
  readonly visibility: VisibilityPolicy;
  readonly audienceTab: ShareTab;
  readonly perViewerWatermark: boolean;
  readonly expiresAtMs?: number;
  readonly sso: SSOConfigValue;
  readonly visibleSlideIds: readonly string[];
  readonly customDomain?: string;
  readonly embed?: EmbedConfig;
  readonly seo?: SEOConfig;
  readonly pinVersion?: PinVersionValue;
}

const DEFAULT_SSO_TENANTS: readonly SSOTenant[] = [
  { tenantId: 'acme', displayName: 'Acme Corp', provider: 'okta' },
  { tenantId: 'initech', displayName: 'Initech', provider: 'azure-ad' },
];

const DEFAULT_STATE: ShareDialogState = {
  visibility: { kind: 'public' },
  audienceTab: 'link',
  perViewerWatermark: false,
  sso: {},
  visibleSlideIds: [],
  pinVersion: 'latest',
};

export function ShareDialog({
  deckId,
  deckTitle,
  open,
  onClose,
  onSave,
  initialState,
  ssoTenants = DEFAULT_SSO_TENANTS,
  deck,
  customDomains = [],
  deckVersions = [],
  dataTestId = 'share-dialog',
}: ShareDialogProps): ReactElement | null {
  const [state, setState] = useState<ShareDialogState>(initialState ?? DEFAULT_STATE);
  const [tab, setTab] = useState<ShareTab>('link');

  const onChangeVisibility = useCallback((visibility: VisibilityPolicy) => {
    setState((prev) => ({ ...prev, visibility }));
  }, []);

  const onChangeSSO = useCallback((sso: SSOConfigValue) => {
    setState((prev) => ({ ...prev, sso }));
  }, []);

  const onToggleWatermark = useCallback(() => {
    setState((prev) => ({ ...prev, perViewerWatermark: !prev.perViewerWatermark }));
  }, []);

  const onChangeExpiry = useCallback((expiresAtMs: number | undefined) => {
    setState((prev) => ({
      ...prev,
      ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
    }));
  }, []);

  const onChangeVisibleSlides = useCallback((next: readonly string[]) => {
    setState((prev) => ({ ...prev, visibleSlideIds: next }));
  }, []);

  const onChangeCustomDomain = useCallback((hostname: string | undefined) => {
    setState((prev) => ({
      ...prev,
      ...(hostname === undefined ? {} : { customDomain: hostname }),
    }));
  }, []);

  const onChangeEmbed = useCallback((embed: EmbedConfig) => {
    setState((prev) => ({ ...prev, embed }));
  }, []);

  const onChangeSeo = useCallback((seo: SEOConfig) => {
    setState((prev) => ({ ...prev, seo }));
  }, []);

  const onChangePinVersion = useCallback((pinVersion: PinVersionValue) => {
    setState((prev) => ({ ...prev, pinVersion }));
  }, []);

  const onSaveInternal = useCallback(() => {
    void onSave?.(state);
  }, [onSave, state]);

  const tabs = useMemo<readonly { id: ShareTab; labelId: string }[]>(
    () => [
      { id: 'link', labelId: 'editor.share.tab.link' },
      { id: 'embed', labelId: 'editor.share.tab.embed' },
      { id: 'visibility', labelId: 'editor.share.tab.visibility' },
      { id: 'audience', labelId: 'editor.share.tab.audience' },
      { id: 'versions', labelId: 'editor.share.tab.versions' },
    ],
    [],
  );

  if (!open) return null;

  const host = state.customDomain ?? DEFAULT_CUSTOM_DOMAIN_HOST;
  const shareUrl = `https://${host}/${deckId}`;

  return (
    <div
      data-testid={dataTestId}
      role="dialog"
      aria-label="Share dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        data-testid={`${dataTestId}-panel`}
        style={{
          width: 'min(640px, 96vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: '#fff',
          color: '#111',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            <FormattedMessage id="editor.share.title" /> · <span style={{ fontWeight: 400 }}>{deckTitle}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${dataTestId}-close`}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </header>

        <nav role="tablist" style={{ display: 'flex', gap: 4, margin: '12px 0 16px' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`${dataTestId}-tab-${t.id}`}
              style={{
                padding: '6px 10px',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? '#3b82f6' : 'transparent'}`,
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              <FormattedMessage id={t.labelId} />
            </button>
          ))}
        </nav>

        {tab === 'link' ? (
          <section data-testid={`${dataTestId}-section-link`}>
            <p style={{ color: 'rgba(0,0,0,0.7)', fontSize: 13 }}>
              <FormattedMessage id="editor.share.link.copyHint" />
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                data-testid={`${dataTestId}-link`}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid rgba(0,0,0,0.2)',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                data-testid={`${dataTestId}-copy`}
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(shareUrl);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  background: '#3b82f6',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                <FormattedMessage id="editor.share.link.copy" />
              </button>
            </div>
            <label style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
              <input type="checkbox" checked={state.perViewerWatermark} onChange={onToggleWatermark} data-testid={`${dataTestId}-watermark`} />
              {' '}
              <FormattedMessage id="editor.share.link.watermark" />
            </label>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="share-expiry" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                <FormattedMessage id="editor.share.link.expiresAt" />
              </label>
              <input
                id="share-expiry"
                type="datetime-local"
                value={state.expiresAtMs ? new Date(state.expiresAtMs).toISOString().slice(0, 16) : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onChangeExpiry(v ? new Date(v).getTime() : undefined);
                }}
                data-testid={`${dataTestId}-expires`}
                style={{ padding: '6px 8px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4 }}
              />
            </div>
            {customDomains.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <CustomDomainPicker
                  options={customDomains}
                  value={state.customDomain}
                  onChange={onChangeCustomDomain}
                  dataTestId={`${dataTestId}-custom-domain`}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'visibility' ? (
          <section data-testid={`${dataTestId}-section-visibility`}>
            <VisibilityPicker value={state.visibility} onChange={onChangeVisibility} dataTestId={`${dataTestId}-visibility`} />
            {state.visibility.kind === 'domain' ? (
              <div style={{ marginTop: 12 }}>
                <DomainAllowlist
                  value={state.visibility.allowedDomains ?? []}
                  onChange={(next) =>
                    onChangeVisibility({ ...state.visibility, allowedDomains: next })
                  }
                />
              </div>
            ) : null}
            {state.visibility.kind === 'sso' ? (
              <div style={{ marginTop: 12 }}>
                <SSOConfig
                  tenants={ssoTenants}
                  value={state.sso}
                  onChange={onChangeSSO}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'embed' ? (
          <section data-testid={`${dataTestId}-section-embed`}>
            {deck ? (
              <EmbedPlayground
                deck={{
                  id: deck.id,
                  host: state.customDomain,
                  slides: deck.slides.map((s) => ({ id: s.id, title: s.title ?? '' })),
                }}
                value={state.embed}
                onChange={onChangeEmbed}
                dataTestId={`${dataTestId}-embed`}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)' }}>
                <FormattedMessage id="editor.share.embed.placeholder" />
              </p>
            )}
          </section>
        ) : null}

        {tab === 'audience' ? (
          <section data-testid={`${dataTestId}-section-audience`}>
            {deck ? (
              <ContentControlTab
                deck={deck}
                value={state.visibleSlideIds.length > 0 ? state.visibleSlideIds : deck.slides.map((s) => s.id)}
                onChange={onChangeVisibleSlides}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)' }}>
                <FormattedMessage id="editor.share.audience.placeholder" />
              </p>
            )}
          </section>
        ) : null}

        {tab === 'versions' ? (
          <section data-testid={`${dataTestId}-section-versions`}>
            <SEOTab
              value={state.seo}
              deckTitle={deckTitle}
              deckId={deckId}
              previewImageUrl={deck?.slides[0] ? undefined : undefined}
              onChange={onChangeSeo}
              dataTestId={`${dataTestId}-seo`}
            />
            {deckVersions.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <VersionPinSelector
                  versions={deckVersions}
                  value={state.pinVersion ?? 'latest'}
                  onChange={onChangePinVersion}
                  dataTestId={`${dataTestId}-version`}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        <footer style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${dataTestId}-cancel`}
            style={{ padding: '6px 12px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
          >
            <FormattedMessage id="editor.share.cancel" />
          </button>
          <button
            type="button"
            onClick={onSaveInternal}
            data-testid={`${dataTestId}-save`}
            style={{ padding: '6px 12px', border: 'none', borderRadius: 4, background: '#3b82f6', color: '#fff', cursor: 'pointer' }}
          >
            <FormattedMessage id="editor.share.save" />
          </button>
        </footer>
      </div>
    </div>
  );
}