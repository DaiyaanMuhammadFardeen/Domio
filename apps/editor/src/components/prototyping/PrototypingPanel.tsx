/**
 * PrototypingPanel — Wave 2 §S2.12.
 *
 * Editor-side panel that hosts the four prototyping surfaces:
 *
 *   1. Voice triggers (VoiceTriggerEditor)
 *   2. Gesture picker (GesturePicker)
 *   3. Conditional logic builder (ConditionalLogicBuilder)
 *   4. Form palette (FormPalette)
 *
 * The device-frame picker lives in the preview chrome (S2.12 ⇄
 * `M12Entry`). Each surface emits change events upward so the host
 * can persist the configuration in the editor store.
 */

import { useState, type ReactElement } from 'react';
import { VoiceTriggerEditor } from './VoiceTriggerEditor';
import { GesturePicker, type GestureKind } from './GesturePicker';
import { ConditionalLogicBuilder, type CondGroup } from './ConditionalLogicBuilder';
import { FormPalette } from './FormPalette';

export type PrototypingTab = 'triggers' | 'logic' | 'forms';

export interface PrototypingPanelProps {
  readonly initialGestures?: readonly GestureKind[];
  readonly initialTrigger?: { label?: string; phrases?: readonly { phrase: string; wakeWord: boolean }[] };
  readonly onChangeGestures?: (gestures: readonly GestureKind[]) => void;
  readonly onChangeTrigger?: (config: { label: string; phrases: { id: string; phrase: string; wakeWord: boolean }[]; locale: string; confidence: number }) => void;
  readonly onChangeLogic?: (group: CondGroup) => void;
  readonly onInsertFormInput?: (type: string) => void;
}

export function PrototypingPanel(props: PrototypingPanelProps): ReactElement {
  const [tab, setTab] = useState<PrototypingTab>('triggers');

  return (
    <section className="data-panel" data-testid="prototyping-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Prototyping</h2>
      </header>

      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '4px',
          borderBottom: '1px solid var(--border, #333)',
        }}
        data-testid="prototyping-tabs"
      >
        {(['triggers', 'logic', 'forms'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 11,
              background: tab === t ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
              color: tab === t ? 'var(--accent, #58a6ff)' : 'var(--fg, #eee)',
              border: `1px solid ${tab === t ? 'var(--accent, #58a6ff)' : 'transparent'}`,
              borderRadius: 4,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
            data-testid={`prototyping-tab-${t}`}
          >
            {t === 'triggers' ? 'Triggers' : t === 'logic' ? 'Logic' : 'Forms'}
          </button>
        ))}
      </div>

      {tab === 'triggers' && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VoiceTriggerEditor
            initial={{
              ...(props.initialTrigger?.label !== undefined ? { label: props.initialTrigger.label } : {}),
              ...(props.initialTrigger?.phrases
                ? { phrases: props.initialTrigger.phrases.map((p) => ({ id: '', phrase: p.phrase, wakeWord: p.wakeWord })) }
                : {}),
            }}
            onChange={(config) =>
              props.onChangeTrigger?.({
                label: config.label,
                phrases: config.phrases.map((p) => ({ id: p.id, phrase: p.phrase, wakeWord: p.wakeWord })),
                locale: config.locale,
                confidence: config.confidence,
              })
            }
          />
          <GesturePicker value={props.initialGestures ?? []} onChange={(g) => props.onChangeGestures?.(g)} />
        </div>
      )}

      {tab === 'logic' && (
        <div style={{ padding: 8 }}>
          <ConditionalLogicBuilder onChange={(g) => props.onChangeLogic?.(g)} />
        </div>
      )}

      {tab === 'forms' && (
        <div style={{ padding: 8 }}>
          <FormPalette onInsert={(t) => props.onInsertFormInput?.(t)} />
        </div>
      )}
    </section>
  );
}