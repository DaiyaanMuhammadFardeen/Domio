/**
 * HandoutLayoutPicker — share-dialog handout layout selector.
 *
 * Per Wave 3 §S3.10 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Editors pick a handout layout (notes / 4-up / 6-up / 9-up), include
 * speaker notes, and pre-header (deck title, page number, date). When
 * the user confirms, the parent (ShareDialog) fires
 * `POST /v1/export` with `format: pdf, layout: handout-{kind}`.
 *
 * Also surfaces a tiny print-CSS preview so editors can eyeball what
 * the handout will look like before queueing the export.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export type HandoutLayout = 'notes' | 'grid-4' | 'grid-6' | 'grid-9';

export interface HandoutConfig {
  readonly layout: HandoutLayout;
  readonly includeNotes: boolean;
  readonly includeTitle: boolean;
  readonly includePageNumbers: boolean;
  readonly includeDate: boolean;
}

export interface HandoutLayoutPickerProps {
  readonly slideCount: number;
  readonly value: HandoutConfig | undefined;
  readonly onChange: (next: HandoutConfig) => void;
  readonly dataTestId?: string;
}

export const DEFAULT_HANDOUT: HandoutConfig = {
  layout: 'notes',
  includeNotes: true,
  includeTitle: true,
  includePageNumbers: true,
  includeDate: false,
};

const LAYOUT_LABEL_IDS: Readonly<Record<HandoutLayout, string>> = {
  notes: 'editor.share.handout.layout.notes',
  'grid-4': 'editor.share.handout.layout.grid4',
  'grid-6': 'editor.share.handout.layout.grid6',
  'grid-9': 'editor.share.handout.layout.grid9',
};

export function buildHandoutRequest(cfg: HandoutConfig, deckId: string): {
  format: 'pdf';
  layout: `handout-${HandoutLayout}`;
  include_notes: boolean;
  include_title: boolean;
  include_page_numbers: boolean;
  include_date: boolean;
  deck_id: string;
} {
  return {
    format: 'pdf',
    layout: `handout-${cfg.layout}`,
    include_notes: cfg.includeNotes,
    include_title: cfg.includeTitle,
    include_page_numbers: cfg.includePageNumbers,
    include_date: cfg.includeDate,
    deck_id: deckId,
  };
}

const PRINT_CSS: Readonly<Record<HandoutLayout, string>> = {
  notes: '@page { size: letter; margin: 1in; } .slide { page-break-after: always; padding: 24px; border: 1px solid #ddd; }',
  'grid-4': '@page { size: letter; margin: 0.5in; } .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; } .slide { padding: 8px; border: 1px solid #ddd; }',
  'grid-6': '@page { size: letter; margin: 0.5in; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .slide { padding: 6px; border: 1px solid #ddd; }',
  'grid-9': '@page { size: letter; margin: 0.5in; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .slide { padding: 4px; border: 1px solid #ddd; font-size: 10px; }',
};

export function HandoutLayoutPicker({
  slideCount,
  value,
  onChange,
  dataTestId = 'handout-layout-picker',
}: HandoutLayoutPickerProps): ReactElement {
  const cfg: HandoutConfig = value ?? DEFAULT_HANDOUT;

  const onPatch = useCallback(
    (patch: Partial<HandoutConfig>) => {
      onChange({ ...cfg, ...patch });
    },
    [cfg, onChange],
  );

  const layouts = useMemo<readonly HandoutLayout[]>(
    () => ['notes', 'grid-4', 'grid-6', 'grid-9'],
    [],
  );

  const css = PRINT_CSS[cfg.layout];

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header>
        <strong>
          <FormattedMessage id="editor.share.handout.title" />
        </strong>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: '4px 0 0' }}>
          <FormattedMessage id="editor.share.handout.help" />
        </p>
      </header>

      <div
        data-testid={`${dataTestId}-layouts`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}
      >
        {layouts.map((layout) => {
          const active = cfg.layout === layout;
          return (
            <button
              key={layout}
              type="button"
              onClick={() => onPatch({ layout })}
              data-testid={`${dataTestId}-${layout}`}
              style={{
                padding: '8px 4px',
                border: `1px solid ${active ? '#3b82f6' : 'rgba(0,0,0,0.2)'}`,
                borderRadius: 4,
                background: active ? '#eff6ff' : 'transparent',
                color: active ? '#1d4ed8' : '#111',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              <FormattedMessage id={LAYOUT_LABEL_IDS[layout]} />
            </button>
          );
        })}
      </div>

      <fieldset style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 4, padding: 8 }}>
        <legend style={{ fontSize: 12, padding: '0 4px' }}>
          <FormattedMessage id="editor.share.handout.options" />
        </legend>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={cfg.includeNotes}
            onChange={(e) => onPatch({ includeNotes: e.target.checked })}
            data-testid={`${dataTestId}-opt-notes`}
          />{' '}
          <FormattedMessage id="editor.share.handout.includeNotes" />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={cfg.includeTitle}
            onChange={(e) => onPatch({ includeTitle: e.target.checked })}
            data-testid={`${dataTestId}-opt-title`}
          />{' '}
          <FormattedMessage id="editor.share.handout.includeTitle" />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={cfg.includePageNumbers}
            onChange={(e) => onPatch({ includePageNumbers: e.target.checked })}
            data-testid={`${dataTestId}-page-numbers`}
          />{' '}
          <FormattedMessage id="editor.share.handout.includePageNumbers" />
        </label>
        <label style={{ display: 'block', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={cfg.includeDate}
            onChange={(e) => onPatch({ includeDate: e.target.checked })}
            data-testid={`${dataTestId}-date`}
          />{' '}
          <FormattedMessage id="editor.share.handout.includeDate" />
        </label>
      </fieldset>

      <div>
        <strong style={{ fontSize: 12 }}>
          <FormattedMessage id="editor.share.handout.preview" />
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
          <style>{`@media print { ${css} }`}</style>
          <div style={{ display: 'grid', gridTemplateColumns: cfg.layout === 'notes' ? '1fr' : 'repeat(2, 1fr)', gap: 6 }}>
            {Array.from({ length: Math.min(slideCount, cfg.layout === 'notes' ? 2 : 6) }).map((_, i) => (
              <div key={i} style={{ padding: 6, border: '1px solid #ddd', fontSize: 10 }}>
                <strong>Slide {i + 1}</strong>
                {cfg.includeNotes ? <p style={{ margin: '4px 0 0' }}>Speaker notes preview.</p> : null}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 6 }}>
            <FormattedMessage id="editor.share.handout.previewHint" />
          </p>
        </div>
      </div>
    </section>
  );
}
