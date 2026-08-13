'use client';

/**
 * ScriptSegmentRow — single row in the podcast script editor.
 *
 * Per Wave 11 §S11.12 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * One row = one segment. Lets the user pick:
 *   - Voice (Host / Guest)
 *   - Text (the line that will be read aloud)
 *   - Slide reference (None | slide-1 | slide-2 | …)
 *
 * The row is controlled — `onChange` fires with the next segment
 * snapshot after every edit, and `onRemove` is called when the user
 * clicks the trash button.
 */

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import type { ScriptSegment, Voice } from '../../lib/podcast-export-service.js';

export interface ScriptSegmentRowProps {
  readonly segment: ScriptSegment;
  readonly slideOptions: ReadonlyArray<{ id: string; label: string }>;
  readonly onChange: (next: ScriptSegment) => void;
  readonly onRemove: () => void;
  readonly dataTestId?: string;
}

export function ScriptSegmentRow({
  segment,
  slideOptions,
  onChange,
  onRemove,
  dataTestId = 'podcast-segment-row',
}: ScriptSegmentRowProps): ReactElement {
  const handleVoice = useCallback(
    (voice: Voice) => {
      onChange({ ...segment, voice });
    },
    [onChange, segment],
  );

  const handleText = useCallback(
    (text: string) => {
      onChange({ ...segment, text });
    },
    [onChange, segment],
  );

  const handleSlide = useCallback(
    (value: string) => {
      if (value === '') {
        const { slide_id: _drop, ...rest } = segment;
        void _drop;
        onChange({ ...rest });
      } else {
        onChange({ ...segment, slide_id: value });
      }
    },
    [onChange, segment],
  );

  return (
    <div
      data-testid={dataTestId}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 180px auto',
        gap: 8,
        alignItems: 'start',
        padding: 8,
        borderRadius: 6,
        background: 'rgba(0,0,0,0.03)',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span>
          <FormattedMessage id="editor.podcast.segment.voice" />
        </span>
        <select
          data-testid={`${dataTestId}-voice`}
          value={segment.voice}
          onChange={(e) => handleVoice(e.target.value as Voice)}
          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
        >
          <option value="host">
            <FormattedMessage id="editor.podcast.voice.host" />
          </option>
          <option value="guest">
            <FormattedMessage id="editor.podcast.voice.guest" />
          </option>
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span>
          <FormattedMessage id="editor.podcast.segment.text" />
        </span>
        <textarea
          data-testid={`${dataTestId}-text`}
          value={segment.text}
          onChange={(e) => handleText(e.target.value)}
          rows={2}
          style={{
            padding: '4px 6px',
            borderRadius: 4,
            border: '1px solid rgba(0,0,0,0.2)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span>
          <FormattedMessage id="editor.podcast.segment.slide" />
        </span>
        <select
          data-testid={`${dataTestId}-slide`}
          value={segment.slide_id ?? ''}
          onChange={(e) => handleSlide(e.target.value)}
          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
        >
          <option value="">
            <FormattedMessage id="editor.podcast.segment.slideNone" />
          </option>
          {slideOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onRemove}
        data-testid={`${dataTestId}-remove`}
        style={{
          padding: '4px 10px',
          borderRadius: 4,
          border: '1px solid rgba(220,38,38,0.4)',
          background: '#fff',
          color: '#dc2626',
          fontSize: 12,
          cursor: 'pointer',
          alignSelf: 'end',
        }}
      >
        <FormattedMessage id="editor.podcast.segment.remove" />
      </button>
    </div>
  );
}
