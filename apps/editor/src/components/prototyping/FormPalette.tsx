/**
 * FormPalette — Wave 2 §S2.12.
 *
 * Palette of all 20 form input types supported by the
 * prototype-runtime forms module. Authors drag/insert a type into a
 * slide and the FormDefinition is built up.
 *
 * Each card shows the type label, an icon, and a one-line description.
 * Clicking emits `onInsert(type)` and the host panel wires it into the
 * form definition (typically through the Connections panel's onAddEdge
 * or a dedicated FormEditorPanel, Phase 11 backlog).
 */

import type { ReactElement } from 'react';
import type { InputType } from '@domio/prototype-runtime';

interface FormInputMeta {
  readonly type: InputType;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

const FORM_INPUTS: readonly FormInputMeta[] = [
  { type: 'text', label: 'Text', description: 'Single-line text', icon: 'Aa' },
  { type: 'textarea', label: 'Textarea', description: 'Multi-line text', icon: '¶' },
  { type: 'number', label: 'Number', description: 'Numeric input', icon: '#' },
  { type: 'email', label: 'Email', description: 'Email address', icon: '@' },
  { type: 'url', label: 'URL', description: 'URL field', icon: '🔗' },
  { type: 'tel', label: 'Phone', description: 'Telephone number', icon: '☎' },
  { type: 'password', label: 'Password', description: 'Masked input', icon: '•••' },
  { type: 'select', label: 'Select', description: 'Dropdown', icon: '▼' },
  { type: 'multiselect', label: 'Multi-select', description: 'Multi-choice', icon: '⊞' },
  { type: 'checkbox', label: 'Checkbox', description: 'Boolean toggle', icon: '☑' },
  { type: 'radio', label: 'Radio', description: 'One-of group', icon: '◉' },
  { type: 'date', label: 'Date', description: 'Date picker', icon: '📅' },
  { type: 'time', label: 'Time', description: 'Time picker', icon: '⏰' },
  { type: 'datetime', label: 'DateTime', description: 'Date + time', icon: '🗓' },
  { type: 'range', label: 'Range', description: 'Slider input', icon: '⇆' },
  { type: 'slider', label: 'Slider', description: 'Stepped slider', icon: '⥤' },
  { type: 'file', label: 'File', description: 'File upload', icon: '📎' },
  { type: 'signature', label: 'Signature', description: 'Signature pad', icon: '✍' },
  { type: 'richtext', label: 'Rich text', description: 'Formatted text', icon: 'B' },
  { type: 'color', label: 'Color', description: 'Color picker', icon: '🎨' },
];

export interface FormPaletteProps {
  readonly onInsert: (type: InputType) => void;
  /** Optional categories to filter by (e.g. 'text', 'choice', 'datetime'). */
  readonly filter?: 'all' | 'text' | 'choice' | 'datetime' | 'media';
}

const CATEGORIES: Record<NonNullable<FormPaletteProps['filter']>, readonly InputType[]> = {
  all: FORM_INPUTS.map((i) => i.type),
  text: ['text', 'textarea', 'number', 'email', 'url', 'tel', 'password'],
  choice: ['select', 'multiselect', 'checkbox', 'radio'],
  datetime: ['date', 'time', 'datetime'],
  media: ['file', 'signature', 'richtext', 'color'],
};

export function FormPalette({ onInsert, filter = 'all' }: FormPaletteProps): ReactElement {
  const visible = FORM_INPUTS.filter((i) => CATEGORIES[filter].includes(i.type));

  return (
    <div className="prototyping-form-palette" data-testid="prototyping-form-palette">
      <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>Form inputs</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
        }}
      >
        {visible.map((m) => (
          <button
            key={m.type}
            type="button"
            onClick={() => onInsert(m.type)}
            style={{
              padding: '8px',
              background: 'var(--bg-secondary, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--fg, #eee)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            data-testid={`form-input-${m.type}`}
            title={m.description}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted, #888)',
                  padding: '2px 4px',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 3,
                  fontFamily: 'monospace',
                }}
              >
                {m.icon}
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted, #888)' }}>{m.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
