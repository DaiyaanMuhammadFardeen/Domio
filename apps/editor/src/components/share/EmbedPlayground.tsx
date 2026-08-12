/**
 * EmbedPlayground — share-dialog "Embed" tab for an embeddable iframe.
 *
 * Per Wave 3 §S3.6 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Lets editors:
 *   - pick a starting slide
 *   - choose dimensions (width / height / aspect)
 *   - toggle allow-interactivity, allow-fullscreen, lazy-load, theme sync
 *   - see a live iframe preview (sandboxed)
 *   - copy the generated HTML snippet
 *
 * In production the iframe URL is signed by `services/embed-proxy`
 * (POST /v1/embed/tokens → JWT) — the editor surface calls that endpoint
 * and gets back `{ token, expires_at_ms }`. Here we render a deterministic
 * snippet so the editor is usable before the proxy is wired end-to-end.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface EmbedPlaygroundDeck {
  readonly id: string;
  /** Used for the iframe URL — defaults to `deck.domio.app`. */
  readonly host: string | undefined;
  readonly slides: readonly { readonly id: string; readonly title: string }[];
}

export interface EmbedConfig {
  /** Slide to land on first (0-based; undefined = slide 0). */
  readonly startSlide: number | undefined;
  readonly width: number;
  readonly height: number;
  readonly allowInteractivity: boolean;
  readonly allowFullscreen: boolean;
  readonly lazyLoad: boolean;
  /** Mirror the host page's light/dark color scheme onto the embed. */
  readonly themeSync: boolean;
}

export interface EmbedPlaygroundProps {
  readonly deck: EmbedPlaygroundDeck;
  readonly value?: EmbedConfig | undefined;
  readonly onChange?: (config: EmbedConfig) => void;
  readonly dataTestId?: string;
}

const DEFAULTS: EmbedConfig = {
  startSlide: 0,
  width: 960,
  height: 540,
  allowInteractivity: true,
  allowFullscreen: true,
  lazyLoad: true,
  themeSync: false,
} as const;

const ASPECT_PRESETS: ReadonlyArray<{ label: string; w: number; h: number }> = [
  { label: '16:9', w: 960, h: 540 },
  { label: '4:3', w: 800, h: 600 },
  { label: '1:1', w: 540, h: 540 },
  { label: '9:16', w: 360, h: 640 },
];

function buildSandboxAttr(allowInteractivity: boolean): string {
  // Iframe sandbox: never allow top-navigation / same-origin on the parent
  // page; optionally allow scripts and forms for interactivity.
  const flags = ['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox'];
  if (allowInteractivity) {
    flags.push('allow-forms', 'allow-modals');
  }
  return flags.join(' ');
}

function buildAllowAttr(config: EmbedConfig): string {
  const flags = ['clipboard-read', 'clipboard-write'];
  if (config.allowFullscreen) flags.push('fullscreen');
  if (config.allowInteractivity) flags.push('accelerometer', 'gyroscope', 'autoplay');
  return flags.join('; ');
}

function buildIframeSrc(config: EmbedConfig, deck: EmbedPlaygroundDeck): string {
  const host = deck.host ?? 'deck.domio.app';
  const params = new URLSearchParams();
  if (typeof config.startSlide === 'number' && config.startSlide > 0) {
    params.set('slide', String(config.startSlide));
  }
  if (config.lazyLoad) params.set('lazy', '1');
  if (config.themeSync) params.set('theme', 'sync');
  const qs = params.toString();
  return `https://embed.${host}/${encodeURIComponent(deck.id)}${qs ? `?${qs}` : ''}`;
}

export function buildEmbedSnippet(config: EmbedConfig, deck: EmbedPlaygroundDeck): string {
  const src = buildIframeSrc(config, deck);
  const sandbox = buildSandboxAttr(config.allowInteractivity);
  const allow = buildAllowAttr(config);
  const loading = config.lazyLoad ? 'lazy' : 'eager';
  return [
    `<iframe`,
    `  src="${src}"`,
    `  width="${config.width}"`,
    `  height="${config.height}"`,
    `  loading="${loading}"`,
    `  allow="${allow}"`,
    `  sandbox="${sandbox}"`,
    `  title="${deck.id}"`,
    `  referrerpolicy="strict-origin-when-cross-origin"`,
    `  style="border:0;max-width:100%;height:auto;"`,
    `></iframe>`,
  ].join('\n');
}

export function EmbedPlayground({
  deck,
  value,
  onChange,
  dataTestId = 'embed-playground',
}: EmbedPlaygroundProps): ReactElement {
  const config: EmbedConfig = value ?? (DEFAULTS as EmbedConfig);
  const set = useCallback(
    (patch: Partial<EmbedConfig>) => {
      onChange?.({ ...config, ...patch });
    },
    [config, onChange],
  );

  const snippet = useMemo(() => buildEmbedSnippet(config, deck), [config, deck]);
  const previewSrc = useMemo(() => buildIframeSrc(config, deck), [config, deck]);

  const onCopy = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(snippet);
    }
  }, [snippet]);

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header>
        <strong>
          <FormattedMessage id="editor.share.embed.title" />
        </strong>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: '4px 0 0' }}>
          <FormattedMessage id="editor.share.embed.help" />
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.startSlide" />
          <select
            value={config.startSlide ?? 0}
            onChange={(e) => set({ startSlide: Number(e.target.value) })}
            data-testid={`${dataTestId}-slide`}
            style={{ display: 'block', width: '100%', padding: 4, marginTop: 2 }}
          >
            {deck.slides.map((s, idx) => (
              <option key={s.id} value={idx}>
                {idx + 1}. {s.title}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.aspect" />
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {ASPECT_PRESETS.map((p) => {
              const active = config.width === p.w && config.height === p.h;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({ width: p.w, height: p.h })}
                  data-testid={`${dataTestId}-aspect-${p.label}`}
                  style={{
                    padding: '3px 8px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    borderRadius: 4,
                    background: active ? '#3b82f6' : 'transparent',
                    color: active ? '#fff' : '#111',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.width" />
          <input
            type="number"
            value={config.width}
            min={120}
            max={3840}
            onChange={(e) => set({ width: Math.max(120, Number(e.target.value) || 120) })}
            data-testid={`${dataTestId}-width`}
            style={{ display: 'block', width: '100%', padding: 4, marginTop: 2 }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.height" />
          <input
            type="number"
            value={config.height}
            min={120}
            max={3840}
            onChange={(e) => set({ height: Math.max(120, Number(e.target.value) || 120) })}
            data-testid={`${dataTestId}-height`}
            style={{ display: 'block', width: '100%', padding: 4, marginTop: 2 }}
          />
        </label>
      </div>

      <fieldset style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 4, padding: 8 }}>
        <legend style={{ fontSize: 12, padding: '0 4px' }}>
          <FormattedMessage id="editor.share.embed.permissions" />
        </legend>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={config.allowInteractivity}
            onChange={(e) => set({ allowInteractivity: e.target.checked })}
            data-testid={`${dataTestId}-interactivity`}
          />{' '}
          <FormattedMessage id="editor.share.embed.allowInteractivity" />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={config.allowFullscreen}
            onChange={(e) => set({ allowFullscreen: e.target.checked })}
            data-testid={`${dataTestId}-fullscreen`}
          />{' '}
          <FormattedMessage id="editor.share.embed.allowFullscreen" />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={config.lazyLoad}
            onChange={(e) => set({ lazyLoad: e.target.checked })}
            data-testid={`${dataTestId}-lazy`}
          />{' '}
          <FormattedMessage id="editor.share.embed.lazyLoad" />
        </label>
        <label style={{ display: 'block', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={config.themeSync}
            onChange={(e) => set({ themeSync: e.target.checked })}
            data-testid={`${dataTestId}-theme`}
          />{' '}
          <FormattedMessage id="editor.share.embed.themeSync" />
        </label>
      </fieldset>

      <div>
        <strong style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.preview" />
        </strong>
        <div
          data-testid={`${dataTestId}-preview`}
          style={{
            marginTop: 4,
            padding: 8,
            border: '1px dashed rgba(0,0,0,0.2)',
            borderRadius: 4,
            background: '#fafafa',
          }}
        >
          <iframe
            src={previewSrc}
            width={config.width}
            height={config.height}
            sandbox={buildSandboxAttr(config.allowInteractivity)}
            title={`Embed preview — ${deck.id}`}
            style={{ maxWidth: '100%', border: 0 }}
          />
        </div>
      </div>

      <div>
        <strong style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.embed.snippet" />
        </strong>
        <pre
          data-testid={`${dataTestId}-snippet`}
          style={{
            marginTop: 4,
            padding: 8,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          {snippet}
        </pre>
        <button
          type="button"
          onClick={onCopy}
          data-testid={`${dataTestId}-copy`}
          style={{
            marginTop: 4,
            padding: '4px 10px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <FormattedMessage id="editor.share.embed.copy" />
        </button>
      </div>
    </section>
  );
}
