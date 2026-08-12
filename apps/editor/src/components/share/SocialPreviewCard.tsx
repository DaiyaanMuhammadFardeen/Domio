/**
 * SocialPreviewCard — per-platform social-share preview.
 *
 * Per Wave 3 §S3.9 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Renders a visually-accurate preview of how the deck link will appear
 * when shared on Twitter, LinkedIn, or Slack. Editors can override the
 * auto-generated title and description per platform; the image is
 * either the deck's first-slide snapshot or a manual override URL.
 */

'use client';

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export type SocialPlatform = 'twitter' | 'linkedin' | 'slack';

export interface SocialCardInput {
  readonly title: string;
  readonly description: string;
  readonly imageUrl: string | undefined;
}

export interface SocialPreviewCardProps {
  readonly platform: SocialPlatform;
  readonly deckTitle: string;
  readonly previewImageUrl: string | undefined;
  /** Per-platform override; falls back to deck defaults. */
  readonly override?: SocialCardInput | undefined;
  readonly onOverride?: (next: SocialCardInput) => void;
  readonly dataTestId?: string;
}

const PLATFORM_LABEL_IDS: Readonly<Record<SocialPlatform, string>> = {
  twitter: 'editor.share.seo.platform.twitter',
  linkedin: 'editor.share.seo.platform.linkedin',
  slack: 'editor.share.seo.platform.slack',
};

const PLATFORM_THEMES: Readonly<Record<SocialPlatform, { bg: string; text: string; accent: string }>> = {
  twitter: { bg: '#15202b', text: '#ffffff', accent: '#1d9bf0' },
  linkedin: { bg: '#1d2226', text: '#f3f2ef', accent: '#0a66c2' },
  slack: { bg: '#1a1d21', text: '#d1d2d3', accent: '#ecb22e' },
};

export function SocialPreviewCard({
  platform,
  deckTitle,
  previewImageUrl,
  override,
  onOverride,
  dataTestId,
}: SocialPreviewCardProps): ReactElement {
  const theme = PLATFORM_THEMES[platform];
  const title = override?.title || deckTitle;
  const description =
    override?.description || `${deckTitle} — open in Domio viewer`;
  const imageUrl = override?.imageUrl ?? previewImageUrl;
  const testId = dataTestId ?? `social-preview-${platform}`;

  const onPatchTitle = useCallback(
    (next: string) => {
      onOverride?.({ title: next, description: override?.description ?? '', imageUrl });
    },
    [onOverride, override?.description, imageUrl],
  );

  const onPatchDescription = useCallback(
    (next: string) => {
      onOverride?.({ title: override?.title ?? deckTitle, description: next, imageUrl });
    },
    [onOverride, override?.title, deckTitle, imageUrl],
  );

  return (
    <div
      data-testid={testId}
      style={{
        background: theme.bg,
        color: theme.text,
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        border: `1px solid ${theme.accent}`,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: theme.accent,
          }}
        >
          <FormattedMessage id={PLATFORM_LABEL_IDS[platform]} />
        </span>
      </header>

      <div
        data-testid={`${testId}-preview`}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="social preview"
            data-testid={`${testId}-image`}
            style={{
              width: '100%',
              height: 100,
              objectFit: 'cover',
              display: 'block',
              background: '#222',
            }}
          />
        ) : (
          <div
            data-testid={`${testId}-placeholder`}
            style={{
              width: '100%',
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 8px, transparent 8px 16px)',
            }}
          >
            <FormattedMessage id="editor.share.seo.imageAuto" />
          </div>
        )}
        <div style={{ padding: 8 }}>
          <div
            data-testid={`${testId}-title`}
            style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}
          >
            {title}
          </div>
          <div
            data-testid={`${testId}-description`}
            style={{
              fontSize: 11,
              opacity: 0.85,
              maxHeight: 36,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </div>
        </div>
      </div>

      {onOverride ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="text"
            value={override?.title ?? ''}
            placeholder={`Override title for ${platform}`}
            onChange={(e) => onPatchTitle(e.target.value)}
            data-testid={`${testId}-override-title`}
            style={{ width: '100%', padding: 4, fontSize: 11, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)' }}
          />
          <textarea
            value={override?.description ?? ''}
            placeholder="Override description"
            rows={2}
            onChange={(e) => onPatchDescription(e.target.value)}
            data-testid={`${testId}-override-description`}
            style={{
              width: '100%',
              padding: 4,
              fontSize: 11,
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.2)',
              resize: 'vertical',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
