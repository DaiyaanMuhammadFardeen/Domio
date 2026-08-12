'use client';

/**
 * DarkModeGenerator — toggle dark/light at the top of the brand panel.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Clicking the toggle calls `POST /v1/theme/generate-dark` to produce
 * a dark variant of the active light theme. The returned `ThemeDetail`
 * is handed to the host via `onGenerated` so the host can swap it in
 * via the engine bridge.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { ThemeDetail } from '../../lib/brand-service';
import { generateDarkTheme } from '../../lib/brand-service';
import { contrastFor } from '../../lib/design-tokens';

export interface DarkModeGeneratorProps {
  activeTheme: ThemeDetail;
  colorScheme: 'light' | 'dark';
  onSchemeToggle: (next: 'light' | 'dark') => void;
  /**
   * Called once a dark theme has been generated. Hosts persist this
   * and may install it as the deck's active theme.
   */
  onGenerated: (theme: ThemeDetail) => void;
  /** Optional injectable generator for tests. */
  generate?: typeof generateDarkTheme;
  /** Optional test id. */
  id?: string | undefined;
}

export function DarkModeGenerator(props: DarkModeGeneratorProps): ReactElement {
  const { activeTheme, colorScheme, onSchemeToggle, onGenerated, id } = props;
  const generateImpl = props.generate ?? generateDarkTheme;
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<ThemeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = useCallback(async () => {
    const next: 'light' | 'dark' = colorScheme === 'dark' ? 'light' : 'dark';
    onSchemeToggle(next);
    if (next === 'dark' && colorScheme !== 'dark') {
      setGenerating(true);
      setError(null);
      try {
        const generated = await generateImpl(activeTheme.id);
        setPreview(generated);
        onGenerated(generated);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setGenerating(false);
      }
    }
  }, [colorScheme, onSchemeToggle, generateImpl, activeTheme.id, onGenerated]);

  const bg = activeTheme.tokens['color.bg'] ?? '#ffffff';
  const fg = activeTheme.tokens['color.fg'] ?? '#0a0e14';

  return (
    <section className="dark-mode-generator" data-testid={id ?? 'dark-mode-generator'}>
      <header className="dark-mode-generator__head">
        <span className="dark-mode-generator__label">Color scheme</span>
        <button
          type="button"
          className={`dark-mode-generator__toggle${colorScheme === 'dark' ? ' is-dark' : ''}`}
          onClick={() => void handleToggle()}
          disabled={generating}
          role="switch"
          aria-checked={colorScheme === 'dark'}
          data-testid="dark-mode-toggle"
        >
          {generating ? '…' : colorScheme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </header>

      {error && (
        <div className="dark-mode-generator__error" data-testid="dark-mode-error">{error}</div>
      )}

      <div
        className="dark-mode-generator__preview"
        style={{ background: bg, color: fg, borderColor: activeTheme.tokens['color.border'] ?? '#d0d7de' }}
        data-testid="dark-mode-preview"
      >
        <p>
          <strong>{activeTheme.name}</strong>
        </p>
        <p style={{ opacity: 0.7 }}>Live preview of the active scheme.</p>
        <span
          className="dark-mode-generator__chip"
          style={{
            background: activeTheme.tokens['color.accent'] ?? '#58a6ff',
            color: contrastFor(activeTheme.tokens['color.accent'] ?? '#58a6ff'),
          }}
        >
          accent
        </span>
      </div>

      {preview && (
        <div className="dark-mode-generator__generated" data-testid="dark-mode-generated">
          <span>Generated dark theme: <code>{preview.id}</code></span>
          <span className="dark-mode-generator__generated-tokens">
            {Object.entries(preview.tokens).map(([k, v]) => (
              <span key={k}>
                <code>{k}</code>
                <span style={{ background: v, color: contrastFor(v) }}>{v}</span>
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  );
}
