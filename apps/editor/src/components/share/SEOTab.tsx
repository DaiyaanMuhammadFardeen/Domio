/**
 * SEOTab — share-dialog "Versions" sibling tab for SEO + social metadata.
 *
 * Per Wave 3 §S3.9 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Editors set title, description, canonical URL, robots directives, and
 * a per-platform social card override. The live social card preview is
 * delegated to `SocialPreviewCard`.
 *
 * Persistence: `POST /v1/publish/[deckId]/seo` is called by the parent
 * share-dialog flow when Save is pressed (we don't fire it here — the
 * parent owns the save handler so a single network round-trip covers
 * visibility + content control + SEO).
 */

'use client';

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import {
  SocialPreviewCard,
  type SocialPlatform,
  type SocialCardInput,
} from './SocialPreviewCard';

export interface SEOConfig {
  /** <title> and og:title. */
  readonly title: string;
  /** <meta name="description"> and og:description. */
  readonly description: string;
  /** <link rel="canonical"> and og:url. */
  readonly canonicalUrl: string;
  /** Robots meta (`index,follow`, `noindex,nofollow`, …). */
  readonly robots: 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow';
  /** Optional og:image / twitter:image override URL. */
  readonly socialImageUrl: string | undefined;
  /** Per-platform overrides (twitter:card, etc.). */
  readonly socialOverrides: Readonly<Partial<Record<SocialPlatform, SocialCardInput>>>;
}

export interface SEOTabProps {
  readonly value: SEOConfig | undefined;
  readonly deckTitle: string;
  readonly deckId: string;
  readonly previewImageUrl: string | undefined;
  readonly onChange: (next: SEOConfig) => void;
  readonly dataTestId?: string;
}

export const DEFAULT_SEO: SEOConfig = {
  title: '',
  description: '',
  canonicalUrl: '',
  robots: 'index,follow',
  socialImageUrl: undefined,
  socialOverrides: {},
};

const ROBOTS_OPTIONS: readonly SEOConfig['robots'][] = [
  'index,follow',
  'noindex,follow',
  'index,nofollow',
  'noindex,nofollow',
];

const TITLE_MAX = 70;
const DESC_MAX = 200;

export function SEOTab({
  value,
  deckTitle,
  deckId,
  previewImageUrl,
  onChange,
  dataTestId = 'seo-tab',
}: SEOTabProps): ReactElement {
  const cfg: SEOConfig = value ?? DEFAULT_SEO;

  const onPatch = useCallback(
    (patch: Partial<SEOConfig>) => {
      onChange({ ...cfg, ...patch });
    },
    [cfg, onChange],
  );

  const titleTooLong = cfg.title.length > TITLE_MAX;
  const descTooLong = cfg.description.length > DESC_MAX;

  return (
    <section
      data-testid={dataTestId}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <header>
        <strong>
          <FormattedMessage id="editor.share.seo.title" />
        </strong>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: '4px 0 0' }}>
          <FormattedMessage id="editor.share.seo.help" />
        </p>
      </header>

      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.seo.metaTitle" />
        <input
          type="text"
          value={cfg.title || deckTitle}
          onChange={(e) => onPatch({ title: e.target.value })}
          maxLength={TITLE_MAX + 20}
          data-testid={`${dataTestId}-title`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        />
        <span
          style={{
            fontSize: 11,
            color: titleTooLong ? '#dc2626' : 'rgba(0,0,0,0.5)',
          }}
        >
          {cfg.title.length || deckTitle.length}/{TITLE_MAX}
        </span>
      </label>

      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.seo.metaDescription" />
        <textarea
          value={cfg.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          maxLength={DESC_MAX + 40}
          rows={3}
          data-testid={`${dataTestId}-description`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        />
        <span
          style={{
            fontSize: 11,
            color: descTooLong ? '#dc2626' : 'rgba(0,0,0,0.5)',
          }}
        >
          {cfg.description.length}/{DESC_MAX}
        </span>
      </label>

      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.seo.canonical" />
        <input
          type="url"
          value={cfg.canonicalUrl}
          placeholder={`https://deck.domio.app/${deckId}`}
          onChange={(e) => onPatch({ canonicalUrl: e.target.value })}
          data-testid={`${dataTestId}-canonical`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        />
      </label>

      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.seo.robots" />
        <select
          value={cfg.robots}
          onChange={(e) =>
            onPatch({ robots: e.target.value as SEOConfig['robots'] })
          }
          data-testid={`${dataTestId}-robots`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        >
          {ROBOTS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.seo.socialImage" />
        <input
          type="url"
          value={cfg.socialImageUrl ?? ''}
          placeholder="https://cdn.domio.app/social/deck-1234.png"
          onChange={(e) =>
            onPatch({
              socialImageUrl: e.target.value === '' ? undefined : e.target.value,
            })
          }
          data-testid={`${dataTestId}-image`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        />
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
          <FormattedMessage id="editor.share.seo.socialImageHint" />
        </span>
      </label>

      <div>
        <strong style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.seo.preview" />
        </strong>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginTop: 6,
          }}
        >
          <SocialPreviewCard
            platform="twitter"
            deckTitle={deckTitle}
            previewImageUrl={cfg.socialImageUrl ?? previewImageUrl}
            override={cfg.socialOverrides.twitter}
            onOverride={(next) =>
              onPatch({
                socialOverrides: { ...cfg.socialOverrides, twitter: next },
              })
            }
            dataTestId={`${dataTestId}-twitter`}
          />
          <SocialPreviewCard
            platform="linkedin"
            deckTitle={deckTitle}
            previewImageUrl={cfg.socialImageUrl ?? previewImageUrl}
            override={cfg.socialOverrides.linkedin}
            onOverride={(next) =>
              onPatch({
                socialOverrides: { ...cfg.socialOverrides, linkedin: next },
              })
            }
            dataTestId={`${dataTestId}-linkedin`}
          />
        </div>
      </div>
    </section>
  );
}