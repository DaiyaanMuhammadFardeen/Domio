'use client';

/**
 * StudyConfigPanel — Phase 10 M5.3.
 *
 * Lets editors configure a user-testing study: sampling rate, retention
 * window, redaction fields, and A/B variant weighting. The values flow
 * into the prototype-recorder viewer at runtime.
 *
 * data-testid prefix: `m5-study-`.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export type ConsentTier = 'opt_in' | 'opt_out' | 'anonymous';

export interface StudyConfig {
  readonly samplingRate: number; // 0..1
  readonly retentionDays: number;
  readonly consent: ConsentTier;
  readonly redactionFields: readonly string[];
  readonly abVariants: readonly { name: string; weight: number }[];
  readonly anonymousIps: boolean;
}

interface StudyConfigPanelProps {
  readonly config: StudyConfig;
  readonly onChange: (next: StudyConfig) => void;
}

export function StudyConfigPanel({ config, onChange }: StudyConfigPanelProps): ReactElement {
  const [draftField, setDraftField] = useState<string>('email');

  const handleSampling = useCallback(
    (value: number) => {
      onChange({ ...config, samplingRate: Math.min(1, Math.max(0, value)) });
    },
    [config, onChange],
  );

  const handleRetention = useCallback(
    (value: number) => {
      onChange({ ...config, retentionDays: Math.max(1, Math.min(365, value)) });
    },
    [config, onChange],
  );

  const handleConsent = useCallback(
    (value: ConsentTier) => {
      onChange({ ...config, consent: value });
    },
    [config, onChange],
  );

  const handleAddField = useCallback(() => {
    const trimmed = draftField.trim();
    if (!trimmed) return;
    if (config.redactionFields.includes(trimmed)) return;
    onChange({ ...config, redactionFields: [...config.redactionFields, trimmed] });
    setDraftField('');
  }, [config, draftField, onChange]);

  const handleRemoveField = useCallback(
    (field: string) => {
      onChange({
        ...config,
        redactionFields: config.redactionFields.filter((f) => f !== field),
      });
    },
    [config, onChange],
  );

  const handleAddVariant = useCallback(() => {
    const variants = [
      ...config.abVariants,
      { name: `variant-${config.abVariants.length + 1}`, weight: 0.5 },
    ];
    onChange({ ...config, abVariants: variants });
  }, [config, onChange]);

  const handleVariantChange = useCallback(
    (idx: number, patch: Partial<{ name: string; weight: number }>) => {
      const variants = config.abVariants.map((v, i) => (i === idx ? { ...v, ...patch } : v));
      onChange({ ...config, abVariants: variants });
    },
    [config, onChange],
  );

  const handleRemoveVariant = useCallback(
    (idx: number) => {
      onChange({
        ...config,
        abVariants: config.abVariants.filter((_, i) => i !== idx),
      });
    },
    [config, onChange],
  );

  const handleAnonymousIps = useCallback(
    (value: boolean) => {
      onChange({ ...config, anonymousIps: value });
    },
    [config, onChange],
  );

  const samplingPct = Math.round(config.samplingRate * 100);
  const totalWeight = config.abVariants.reduce((s, v) => s + v.weight, 0);

  return (
    <section className="study-config-panel" data-testid="m5-study-panel">
      <header className="study-config-panel__header">
        <h2>Study configuration</h2>
      </header>

      <div className="study-config-panel__body" data-testid="m5-study-sampling">
        <label htmlFor="m5-study-sampling-input">Sampling rate ({samplingPct}%)</label>
        <input
          id="m5-study-sampling-input"
          data-testid="m5-study-sampling-input"
          type="range"
          min={0}
          max={100}
          value={samplingPct}
          onChange={(e) => handleSampling(Number(e.target.value) / 100)}
        />
      </div>

      <div className="study-config-panel__body" data-testid="m5-study-retention">
        <label htmlFor="m5-study-retention-input">Retention (days)</label>
        <input
          id="m5-study-retention-input"
          data-testid="m5-study-retention-input"
          type="number"
          min={1}
          max={365}
          value={config.retentionDays}
          onChange={(e) => handleRetention(Number(e.target.value))}
        />
      </div>

      <div className="study-config-panel__body" data-testid="m5-study-consent">
        <label htmlFor="m5-study-consent-select">Default consent</label>
        <select
          id="m5-study-consent-select"
          data-testid="m5-study-consent-select"
          value={config.consent}
          onChange={(e) => handleConsent(e.target.value as ConsentTier)}
        >
          <option value="opt_in">opt-in</option>
          <option value="opt_out">opt-out</option>
          <option value="anonymous">anonymous</option>
        </select>
      </div>

      <div className="study-config-panel__body" data-testid="m5-study-redaction">
        <label htmlFor="m5-study-redaction-input">Redaction fields</label>
        <div>
          <input
            id="m5-study-redaction-input"
            data-testid="m5-study-redaction-input"
            type="text"
            value={draftField}
            onChange={(e) => setDraftField(e.target.value)}
            placeholder="email"
          />
          <button
            type="button"
            data-testid="m5-study-redaction-add"
            onClick={handleAddField}
          >
            Add
          </button>
        </div>
        <ul className="study-config-panel__fields" data-testid="m5-study-redaction-list">
          {config.redactionFields.map((f) => (
            <li key={f} data-testid="m5-study-redaction-row">
              <code>{f}</code>
              <button
                type="button"
                data-testid="m5-study-redaction-remove"
                onClick={() => handleRemoveField(f)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="study-config-panel__body" data-testid="m5-study-anonymous-ips">
        <label>
          <input
            type="checkbox"
            data-testid="m5-study-anonymous-ips-toggle"
            checked={config.anonymousIps}
            onChange={(e) => handleAnonymousIps(e.target.checked)}
          />
          {' '}Anonymise IP addresses
        </label>
      </div>

      <div className="study-config-panel__body" data-testid="m5-study-ab">
        <h3>A/B variants</h3>
        <p>Total weight: {totalWeight.toFixed(2)}</p>
        <ul data-testid="m5-study-ab-list">
          {config.abVariants.map((v, i) => (
            <li key={i} data-testid="m5-study-ab-row">
              <input
                type="text"
                data-testid="m5-study-ab-name"
                value={v.name}
                onChange={(e) => handleVariantChange(i, { name: e.target.value })}
              />
              <input
                type="number"
                data-testid="m5-study-ab-weight"
                min={0}
                max={1}
                step={0.05}
                value={v.weight}
                onChange={(e) => handleVariantChange(i, { weight: Number(e.target.value) })}
              />
              <button
                type="button"
                data-testid="m5-study-ab-remove"
                onClick={() => handleRemoveVariant(i)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" data-testid="m5-study-ab-add" onClick={handleAddVariant}>
          Add variant
        </button>
      </div>
    </section>
  );
}