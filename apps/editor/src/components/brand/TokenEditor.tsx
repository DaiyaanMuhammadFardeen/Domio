'use client';

/**
 * TokenEditor — full editor for color, type, spacing, radius, shadow.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Surfaces five scale sections. Each section is a small grid of swatch
 * editors. Designers can:
 *   - change a stop's value via color/text input
 *   - add a new stop
 *   - remove a stop
 *   - reset the scale
 *
 * All edits flow through `onChange` as a new `BrandKitDetail`. The
 * host persists the change via the engine bridge. A live preview
 * canvas (the second panel) re-renders representative shapes using
 * the kit's tokens so designers see the impact without leaving the
 * panel.
 */

import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import type {
  BrandKitDetail,
  ColorScale,
  DesignToken,
  RadiusScale,
  ShadowScale,
  SpacingScale,
  TypographyScale,
} from '../../lib/brand-service';
import { contrastFor, generateColorScale, kitToCssVars } from '../../lib/design-tokens';

export interface TokenEditorProps {
  kit: BrandKitDetail;
  onChange: (next: BrandKitDetail) => void;
  /** Optional id for testing. */
  id?: string | undefined;
  /** Read-only mode disables all inputs. */
  readOnly?: boolean | undefined;
}

export function TokenEditor(props: TokenEditorProps): ReactElement {
  const { kit, onChange, id } = props;

  const updateColors = useCallback(
    (colors: readonly ColorScale[]) => onChange({ ...kit, colors }),
    [kit, onChange],
  );
  const updateTypography = useCallback(
    (typography: readonly TypographyScale[]) => onChange({ ...kit, typography }),
    [kit, onChange],
  );
  const updateSpacing = useCallback(
    (spacing: readonly SpacingScale[]) => onChange({ ...kit, spacing }),
    [kit, onChange],
  );
  const updateRadius = useCallback(
    (radius: readonly RadiusScale[]) => onChange({ ...kit, radius }),
    [kit, onChange],
  );
  const updateShadows = useCallback(
    (shadows: readonly ShadowScale[]) => onChange({ ...kit, shadows }),
    [kit, onChange],
  );

  return (
    <div className="token-editor" data-testid={id ?? 'token-editor'}>
      <ColorSection scales={kit.colors} onChange={updateColors} readOnly={props.readOnly} />
      <TypographySection scales={kit.typography} onChange={updateTypography} readOnly={props.readOnly} />
      <SpacingSection scales={kit.spacing} onChange={updateSpacing} readOnly={props.readOnly} />
      <RadiusSection scales={kit.radius} onChange={updateRadius} readOnly={props.readOnly} />
      <ShadowSection scales={kit.shadows} onChange={updateShadows} readOnly={props.readOnly} />
      <TokenPreview kit={kit} />
    </div>
  );
}

// ─── Shared section header ──────────────────────────────────────────────────

function SectionHead({ label, hint, onAdd, addLabel, readOnly }: {
  label: string;
  hint?: string;
  onAdd?: () => void;
  addLabel?: string;
  readOnly?: boolean | undefined;
}): ReactElement {
  return (
    <header className="token-editor__head">
      <h3 className="token-editor__head-title">{label}</h3>
      <div className="token-editor__head-actions">
        {hint && <span className="token-editor__head-hint">{hint}</span>}
        {onAdd && (
          <button
            type="button"
            className="token-editor__head-add"
            onClick={onAdd}
            disabled={readOnly}
            data-testid={`token-editor-add-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {addLabel ?? '+ Add'}
          </button>
        )}
      </div>
    </header>
  );
}

// ─── Color section ──────────────────────────────────────────────────────────

function ColorSection({
  scales,
  onChange,
  readOnly,
}: {
  scales: readonly ColorScale[];
  onChange: (next: readonly ColorScale[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const updateStop = useCallback(
    (scaleId: string, stopId: string, value: string) => {
      onChange(
        scales.map((s) =>
          s.id !== scaleId
            ? s
            : { ...s, stops: s.stops.map((t) => (t.id === stopId ? { ...t, value } : t)) },
        ),
      );
    },
    [scales, onChange],
  );

  const removeStop = useCallback(
    (scaleId: string, stopId: string) => {
      onChange(
        scales.map((s) =>
          s.id !== scaleId ? s : { ...s, stops: s.stops.filter((t) => t.id !== stopId) },
        ),
      );
    },
    [scales, onChange],
  );

  const addStop = useCallback(
    (scaleId: string) => {
      onChange(
        scales.map((s) => {
          if (s.id !== scaleId) return s;
          const nextId = String((s.stops.length + 1) * 100);
          return { ...s, stops: [...s.stops, { id: nextId, label: nextId, value: '#888888' }] };
        }),
      );
    },
    [scales, onChange],
  );

  return (
    <section className="token-editor__section" data-testid="token-editor-section-colors">
      <SectionHead label="Colors" hint={`${scales.length} scales`} readOnly={readOnly} />
      {scales.map((scale) => (
        <div key={scale.id} className="token-editor__scale">
          <header className="token-editor__scale-head">
            <span className="token-editor__scale-label">{scale.label}</span>
            <code className="token-editor__scale-id">{scale.id}</code>
            <button
              type="button"
              className="token-editor__stop-add"
              onClick={() => addStop(scale.id)}
              disabled={readOnly}
              data-testid={`token-editor-color-add-${scale.id}`}
            >
              +
            </button>
          </header>
          <div className="token-editor__color-grid">
            {scale.stops.map((stop) => (
              <div key={stop.id} className="token-editor__color-stop">
                <input
                  type="color"
                  className="token-editor__color-swatch"
                  value={normalizeHex(stop.value)}
                  onChange={(e) => updateStop(scale.id, stop.id, e.target.value)}
                  disabled={readOnly}
                  data-testid={`token-editor-color-${scale.id}-${stop.id}`}
                  aria-label={`${scale.label} ${stop.label}`}
                />
                <span
                  className="token-editor__color-value"
                  style={{ background: stop.value, color: contrastFor(stop.value) }}
                >
                  {stop.value}
                </span>
                <button
                  type="button"
                  className="token-editor__stop-remove"
                  onClick={() => removeStop(scale.id, stop.id)}
                  disabled={readOnly || scale.stops.length <= 1}
                  aria-label={`Remove ${scale.label} ${stop.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ─── Typography section ─────────────────────────────────────────────────────

function TypographySection({
  scales,
  onChange,
  readOnly,
}: {
  scales: readonly TypographyScale[];
  onChange: (next: readonly TypographyScale[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const update = useCallback(
    (id: string, patch: Partial<TypographyScale>) => {
      onChange(scales.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [scales, onChange],
  );
  const add = useCallback(() => {
    onChange([
      ...scales,
      {
        id: `type.${scales.length + 1}`,
        label: `New ${scales.length + 1}`,
        fontFamily: 'Inter',
        fontSizePx: 16,
        lineHeight: 1.4,
        fontWeight: 400,
        letterSpacingEm: 0,
      },
    ]);
  }, [scales, onChange]);
  const remove = useCallback(
    (id: string) => onChange(scales.filter((t) => t.id !== id)),
    [scales, onChange],
  );

  return (
    <section className="token-editor__section" data-testid="token-editor-section-typography">
      <SectionHead label="Typography" hint={`${scales.length} styles`} onAdd={add} addLabel="+ Add style" readOnly={readOnly} />
      <div className="token-editor__type-grid">
        {scales.map((t) => (
          <article key={t.id} className="token-editor__type-card">
            <header className="token-editor__type-head">
              <input
                type="text"
                className="token-editor__type-label"
                value={t.label}
                onChange={(e) => update(t.id, { label: e.target.value })}
                disabled={readOnly}
                data-testid={`token-editor-type-label-${t.id}`}
              />
              <button
                type="button"
                className="token-editor__stop-remove"
                onClick={() => remove(t.id)}
                disabled={readOnly || scales.length <= 1}
                aria-label={`Remove ${t.label}`}
              >
                ×
              </button>
            </header>
            <p
              className="token-editor__type-preview"
              style={{
                fontFamily: t.fontFamily,
                fontSize: Math.min(t.fontSizePx, 32),
                lineHeight: t.lineHeight,
                fontWeight: t.fontWeight,
                letterSpacing: `${t.letterSpacingEm}em`,
              }}
            >
              The quick brown fox
            </p>
            <div className="token-editor__type-fields">
              <label>
                <span>Family</span>
                <input
                  type="text"
                  value={t.fontFamily}
                  onChange={(e) => update(t.id, { fontFamily: e.target.value })}
                  disabled={readOnly}
                />
              </label>
              <label>
                <span>Size</span>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={t.fontSizePx}
                  onChange={(e) => update(t.id, { fontSizePx: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </label>
              <label>
                <span>Line</span>
                <input
                  type="number"
                  min={0.8}
                  max={3}
                  step={0.05}
                  value={t.lineHeight}
                  onChange={(e) => update(t.id, { lineHeight: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </label>
              <label>
                <span>Weight</span>
                <select
                  value={t.fontWeight}
                  onChange={(e) => update(t.id, { fontWeight: Number(e.target.value) })}
                  disabled={readOnly}
                >
                  {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tracking</span>
                <input
                  type="number"
                  step={0.01}
                  value={t.letterSpacingEm}
                  onChange={(e) => update(t.id, { letterSpacingEm: Number(e.target.value) })}
                  disabled={readOnly}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── Spacing section ────────────────────────────────────────────────────────

function SpacingSection({
  scales,
  onChange,
  readOnly,
}: {
  scales: readonly SpacingScale[];
  onChange: (next: readonly SpacingScale[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const update = useCallback(
    (id: string, value: string) =>
      onChange(
        scales.map((s) => ({
          ...s,
          stops: s.stops.map((t) => (t.id === id ? { ...t, value } : t)),
        })),
      ),
    [scales, onChange],
  );
  const remove = useCallback(
    (id: string) =>
      onChange(
        scales.map((s) => ({ ...s, stops: s.stops.filter((t) => t.id !== id) })),
      ),
    [scales, onChange],
  );

  return (
    <section className="token-editor__section" data-testid="token-editor-section-spacing">
      <SectionHead label="Spacing" hint={`${scales[0]?.stops.length ?? 0} steps`} readOnly={readOnly} />
      {scales.map((scale) => (
        <div key={scale.id} className="token-editor__ramp">
          {scale.stops.map((stop) => (
            <div key={stop.id} className="token-editor__ramp-row">
              <code className="token-editor__ramp-id">{stop.id}</code>
              <input
                type="text"
                className="token-editor__ramp-input"
                value={stop.value}
                onChange={(e) => update(stop.id, e.target.value)}
                disabled={readOnly}
                data-testid={`token-editor-space-${stop.id}`}
              />
              <span
                className="token-editor__ramp-preview"
                style={{ width: stop.value }}
                aria-hidden
              />
              <button
                type="button"
                className="token-editor__stop-remove"
                onClick={() => remove(stop.id)}
                disabled={readOnly || scale.stops.length <= 1}
                aria-label={`Remove spacing step ${stop.id}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

// ─── Radius section ────────────────────────────────────────────────────────

function RadiusSection({
  scales,
  onChange,
  readOnly,
}: {
  scales: readonly RadiusScale[];
  onChange: (next: readonly RadiusScale[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const update = useCallback(
    (id: string, value: string) =>
      onChange(
        scales.map((s) => ({
          ...s,
          stops: s.stops.map((t) => (t.id === id ? { ...t, value } : t)),
        })),
      ),
    [scales, onChange],
  );

  return (
    <section className="token-editor__section" data-testid="token-editor-section-radius">
      <SectionHead label="Radius" readOnly={readOnly} />
      <div className="token-editor__radius-grid">
        {scales.flatMap((scale) =>
          scale.stops.map((stop) => (
            <div key={`${scale.id}-${stop.id}`} className="token-editor__radius-cell">
              <div
                className="token-editor__radius-box"
                style={{ borderRadius: stop.value }}
                aria-hidden
              />
              <code>{stop.id}</code>
              <input
                type="text"
                value={stop.value}
                onChange={(e) => update(stop.id, e.target.value)}
                disabled={readOnly}
                data-testid={`token-editor-radius-${stop.id}`}
              />
            </div>
          )),
        )}
      </div>
    </section>
  );
}

// ─── Shadow section ────────────────────────────────────────────────────────

function ShadowSection({
  scales,
  onChange,
  readOnly,
}: {
  scales: readonly ShadowScale[];
  onChange: (next: readonly ShadowScale[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const update = useCallback(
    (id: string, value: string) =>
      onChange(
        scales.map((s) => ({
          ...s,
          stops: s.stops.map((t) => (t.id === id ? { ...t, value } : t)),
        })),
      ),
    [scales, onChange],
  );

  return (
    <section className="token-editor__section" data-testid="token-editor-section-shadow">
      <SectionHead label="Shadow" readOnly={readOnly} />
      <div className="token-editor__shadow-grid">
        {scales.flatMap((scale) =>
          scale.stops.map((stop) => (
            <div key={`${scale.id}-${stop.id}`} className="token-editor__shadow-cell">
              <div
                className="token-editor__shadow-box"
                style={{ boxShadow: stop.value }}
                aria-hidden
              />
              <code>{stop.id}</code>
              <input
                type="text"
                value={stop.value}
                onChange={(e) => update(stop.id, e.target.value)}
                disabled={readOnly}
                data-testid={`token-editor-shadow-${stop.id}`}
              />
            </div>
          )),
        )}
      </div>
    </section>
  );
}

// ─── Live preview tile ──────────────────────────────────────────────────────

function TokenPreview({ kit }: { kit: BrandKitDetail }): ReactElement {
  const vars = useMemo(() => kitToCssVars(kit), [kit]);
  const bodyType = kit.typography.find((t) => t.id === 'type.body');
  const headingType = kit.typography.find((t) => t.id === 'type.heading');
  const radius = kit.radius[0]?.stops.find((s) => s.id === 'md')?.value ?? '8px';
  const shadow = kit.shadows[0]?.stops.find((s) => s.id === 'md')?.value ?? 'none';
  const pad = kit.spacing[0]?.stops.find((s) => s.id === '4')?.value ?? '16px';

  return (
    <section
      className="token-editor__preview"
      data-testid="token-editor-preview"
      style={vars as Record<string, string | number>}
    >
      <h4
        className="token-editor__preview-title"
        style={
          headingType
            ? {
                fontFamily: headingType.fontFamily,
                fontWeight: headingType.fontWeight,
                fontSize: headingType.fontSizePx,
                lineHeight: headingType.lineHeight,
                letterSpacing: `${headingType.letterSpacingEm}em`,
              }
            : undefined
        }
      >
        {kit.name}
      </h4>
      <p
        className="token-editor__preview-body"
        style={
          bodyType
            ? {
                fontFamily: bodyType.fontFamily,
                fontWeight: bodyType.fontWeight,
                fontSize: bodyType.fontSizePx,
                lineHeight: bodyType.lineHeight,
                letterSpacing: `${bodyType.letterSpacingEm}em`,
              }
            : undefined
        }
      >
        Live preview of the brand kit. Tokens drive every element on the canvas; any edit above is reflected here instantly.
      </p>
      <button
        type="button"
        className="token-editor__preview-cta"
        style={{
          background: kit.primaryHex,
          color: contrastFor(kit.primaryHex),
          borderRadius: radius,
          boxShadow: shadow,
          padding: pad,
        }}
      >
        Primary CTA
      </button>
      <button
        type="button"
        className="token-editor__preview-cta"
        style={{
          background: kit.accentHex,
          color: contrastFor(kit.accentHex),
          borderRadius: radius,
          padding: pad,
        }}
      >
        Accent CTA
      </button>
    </section>
  );
}

// ─── Utility ────────────────────────────────────────────────────────────────

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const m = /^#([0-9a-fA-F]{3})$/.exec(value);
  if (m && m[1]) return '#' + m[1].split('').map((c) => c + c).join('');
  return '#888888';
}

// Re-export generate so callers can pre-fill scales.
export { generateColorScale };

// Re-export helper for tests.
export type { DesignToken };
