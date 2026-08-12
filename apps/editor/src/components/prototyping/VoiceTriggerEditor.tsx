/**
 * VoiceTriggerEditor — Wave 2 §S2.12.
 *
 * Configures voice-phrase triggers for a hotspot or branching edge.
 * Authors enter one or more phrases (e.g. "next slide", "go back"),
 * pick a locale, and optionally mark the trigger as a wake-word
 * (handled with priority over other voice commands).
 *
 * This is the editor-side surface. The runtime side lives in
 * `@domio/prototype-runtime` (WebSpeechAPIBridge, Phase 11 backlog).
 */

import { useState, useEffect, type ReactElement } from 'react';

export type VoiceTriggerLocale = 'en-US' | 'en-GB' | 'de-DE' | 'fr-FR' | 'es-ES' | 'ja-JP';

export interface VoiceTriggerPhrase {
  readonly id: string;
  readonly phrase: string;
  readonly wakeWord: boolean;
}

export interface VoiceTriggerConfig {
  readonly id: string;
  readonly label: string;
  readonly locale: VoiceTriggerLocale;
  readonly phrases: readonly VoiceTriggerPhrase[];
  /** Soft confidence cutoff (0..1). Phrases below are ignored. */
  readonly confidence: number;
}

export interface VoiceTriggerEditorProps {
  readonly initial?: Partial<VoiceTriggerConfig>;
  readonly onChange?: (config: VoiceTriggerConfig) => void;
}

const DEFAULT_LOCALES: readonly VoiceTriggerLocale[] = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'ja-JP'];

let _phraseCounter = 0;
function nextPhraseId(): string {
  _phraseCounter += 1;
  return `phrase-${Date.now()}-${_phraseCounter}`;
}

export function VoiceTriggerEditor({
  initial,
  onChange,
}: VoiceTriggerEditorProps): ReactElement {
  const [label, setLabel] = useState(initial?.label ?? 'Voice trigger');
  const [locale, setLocale] = useState<VoiceTriggerLocale>(initial?.locale ?? 'en-US');
  const [confidence, setConfidence] = useState(initial?.confidence ?? 0.7);
  const [phrases, setPhrases] = useState<VoiceTriggerPhrase[]>(
    initial?.phrases ? [...initial.phrases] : [{ id: nextPhraseId(), phrase: 'next slide', wakeWord: false }],
  );

  // Emit onChange whenever config changes.
  useEffect(() => {
    if (!onChange) return;
    onChange({
      id: initial?.id ?? 'voice-trigger',
      label,
      locale,
      phrases,
      confidence,
    });
  }, [label, locale, phrases, confidence, initial?.id, onChange]);

  const addPhrase = (): void => {
    setPhrases((prev) => [...prev, { id: nextPhraseId(), phrase: '', wakeWord: false }]);
  };

  const updatePhrase = (id: string, patch: Partial<VoiceTriggerPhrase>): void => {
    setPhrases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePhrase = (id: string): void => {
    setPhrases((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="prototyping-voice-trigger" data-testid="prototyping-voice-trigger">
      <div className="data-panel__section-title">Voice trigger</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Voice trigger"
            data-testid="voice-trigger-label"
            style={{
              display: 'block',
              width: '100%',
              padding: '4px 8px',
              border: '1px solid var(--border, #333)',
              background: 'var(--bg-secondary, #111)',
              color: 'var(--fg, #eee)',
              borderRadius: 4,
              fontSize: 12,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Locale</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as VoiceTriggerLocale)}
            data-testid="voice-trigger-locale"
            style={{
              display: 'block',
              width: '100%',
              padding: '4px 8px',
              border: '1px solid var(--border, #333)',
              background: 'var(--bg-secondary, #111)',
              color: 'var(--fg, #eee)',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {DEFAULT_LOCALES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>
            Confidence cutoff: {(confidence * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            data-testid="voice-trigger-confidence"
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginBottom: 4 }}>Phrases</div>
          {phrases.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                padding: '4px 0',
                borderTop: '1px solid var(--border, #222)',
              }}
              data-testid={`voice-trigger-phrase-${p.id}`}
            >
              <input
                value={p.phrase}
                onChange={(e) => updatePhrase(p.id, { phrase: e.target.value })}
                placeholder="e.g. next slide"
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '1px solid var(--border, #333)',
                  background: 'var(--bg-secondary, #111)',
                  color: 'var(--fg, #eee)',
                  borderRadius: 4,
                  fontSize: 12,
                }}
                data-testid={`voice-trigger-phrase-input-${p.id}`}
              />
              <label
                title="Wake word (priority)"
                style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--muted, #888)' }}
              >
                <input
                  type="checkbox"
                  checked={p.wakeWord}
                  onChange={(e) => updatePhrase(p.id, { wakeWord: e.target.checked })}
                  data-testid={`voice-trigger-wake-${p.id}`}
                />
                ⭐
              </label>
              <button
                type="button"
                onClick={() => removePhrase(p.id)}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border, #333)',
                  background: 'transparent',
                  color: 'var(--fg, #eee)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
                data-testid={`voice-trigger-remove-${p.id}`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPhrase}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '4px 8px',
              border: '1px dashed var(--border, #444)',
              background: 'transparent',
              color: 'var(--muted, #888)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
            data-testid="voice-trigger-add"
          >
            + Add phrase
          </button>
        </div>
      </div>
    </div>
  );
}