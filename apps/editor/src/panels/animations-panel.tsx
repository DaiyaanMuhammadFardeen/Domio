'use client';

/**
 * AnimationsPanel — left-side panel for configuring animations & transitions.
 * Contains four tabs: Timeline, Transition, Magic Move, and Accessibility.
 *
 * P09 — animation & transition UI.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { LayerTimeline, SlideTransition, TimelineTrack, TriggerConfig, ReducedMotionPolicy } from '@domio/canvas';
import { EasingPicker } from './easing-picker';

type AnimTab = 'timeline' | 'transition' | 'magicMove' | 'accessibility';

interface AnimationsPanelProps {
  /** Current timeline on the selected element (null = none configured) */
  timeline: LayerTimeline | null;
  onTimelineChange: (timeline: LayerTimeline | null) => void;

  /** Current slide transition */
  transition: SlideTransition | null;
  onTransitionChange: (transition: SlideTransition | null) => void;

  /** Element role for magic move */
  magicRole: string | null;
  onMagicRoleChange: (role: string | null) => void;

  /** Whether an adjacent slide also has this magic role (tween hint) */
  hasMatchingRole: boolean;

  /** Reduced motion policy at the deck level */
  reducedMotion: ReducedMotionPolicy | null;
  onReducedMotionChange: (policy: ReducedMotionPolicy | null) => void;

  /** Copy/paste animation */
  copiedAnimation: LayerTimeline | null;
  onCopy: () => void;
  onPaste: () => void;
}

const TRIGGER_OPTIONS: { value: TriggerConfig['kind']; label: string }[] = [
  { value: 'on_click', label: 'On click' },
  { value: 'on_enter', label: 'On enter' },
  { value: 'on_hover', label: 'On hover' },
  { value: 'on_data_change', label: 'On data change' },
  { value: 'on_timer', label: 'On timer' },
];

const TRANSITION_KINDS: { value: SlideTransition['kind']; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' },
  { value: 'bubble', label: 'Bubble' },
  { value: 'cube', label: 'Cube' },
  { value: 'shutter', label: 'Shutter' },
];

const DIRECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'in', label: 'In' },
  { value: 'out', label: 'Out' },
];

const REDUCED_MOTION_OPTIONS: { value: ReducedMotionPolicy; label: string }[] = [
  { value: 'follow_os', label: 'Follow system preference' },
  { value: 'always_reduced', label: 'Always reduced' },
  { value: 'always_full', label: 'Always full motion' },
];

export function AnimationsPanel({
  timeline: timelineProp,
  onTimelineChange: commitTimelineChange,
  transition,
  onTransitionChange: commitTransitionChange,
  magicRole: magicRoleProp,
  onMagicRoleChange: commitMagicRoleChange,
  hasMatchingRole,
  reducedMotion,
  onReducedMotionChange,
  copiedAnimation,
  onCopy,
  onPaste,
}: AnimationsPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<AnimTab>('timeline');

  // ── Local optimistic state ──
  // When no element is selected the prop is always null, but the panel
  // should still reflect user edits until the prop catches up (source of
  // truth).  Local state fills the gap; it is cleared whenever the prop
  // becomes non-null (i.e. the doc has been updated).
  const [localDraft, setLocalDraft] = useState<LayerTimeline | null>(null);
  const [localMagicRole, setLocalMagicRole] = useState<string | null>(null);

  // Sync with prop (source of truth)
  useEffect(() => { if (timelineProp !== null) setLocalDraft(null); }, [timelineProp]);
  useEffect(() => { if (magicRoleProp !== null) setLocalMagicRole(null); }, [magicRoleProp]);

  // Effective values: prop wins, local fills the gap
  const timeline = timelineProp ?? localDraft;
  const magicRole = magicRoleProp ?? localMagicRole;

  // Wrapped callbacks that update local optimistic state AND commit via ops
  const onTimelineChange = useCallback(
    (tl: LayerTimeline | null) => {
      setLocalDraft(tl);
      commitTimelineChange(tl);
    },
    [commitTimelineChange],
  );

  const onTransitionChange = commitTransitionChange;

  const onMagicRoleChange = useCallback(
    (role: string | null) => {
      setLocalMagicRole(role);
      commitMagicRoleChange(role);
    },
    [commitMagicRoleChange],
  );

  // ── Timeline handlers ──

  const ensureTimeline = useCallback((): LayerTimeline => {
    if (timeline) return timeline;
    const fresh: LayerTimeline = {
      id: `tl-${Date.now()}`,
      durationMs: 1000,
      loop: false,
      playCount: 1,
      startOffsetMs: 0,
      tracks: [],
    };
    onTimelineChange(fresh);
    return fresh;
  }, [timeline, onTimelineChange]);

  const handleAddTrack = useCallback(() => {
    const tl = ensureTimeline();
    const track: TimelineTrack = {
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 1 },
        { timeMs: tl.durationMs, value: 0 },
      ],
    };
    onTimelineChange({
      ...tl,
      tracks: [...tl.tracks, { ...track, property: track.property }],
    });
  }, [ensureTimeline, onTimelineChange]);

  const handleRemoveTrack = useCallback(
    (trackIdx: number) => {
      if (!timeline) return;
      onTimelineChange({
        ...timeline,
        tracks: timeline.tracks.filter((_, i) => i !== trackIdx),
      });
    },
    [timeline, onTimelineChange],
  );

  const handleTrackPropertyChange = useCallback(
    (trackIdx: number, property: string) => {
      if (!timeline) return;
      const tracks = [...timeline.tracks];
      const existing = tracks[trackIdx];
      if (!existing) return;
      tracks[trackIdx] = { ...existing, property };
      onTimelineChange({ ...timeline, tracks });
    },
    [timeline, onTimelineChange],
  );

  const handleAddKeyframe = useCallback(
    (trackIdx: number) => {
      if (!timeline) return;
      const tracks = [...timeline.tracks];
      const existing = tracks[trackIdx];
      if (!existing) return;
      const keyframes = [...existing.keyframes, { timeMs: Math.min(timeline.durationMs, 500), value: 1 }];
      keyframes.sort((a, b) => a.timeMs - b.timeMs);
      tracks[trackIdx] = { ...existing, keyframes };
      onTimelineChange({ ...timeline, tracks });
    },
    [timeline, onTimelineChange],
  );

  const handleKeyframeChange = useCallback(
    (trackIdx: number, kfIdx: number, field: 'timeMs' | 'value' | 'easing', val: unknown) => {
      if (!timeline) return;
      const tracks = [...timeline.tracks];
      const existing = tracks[trackIdx];
      if (!existing) return;
      const keyframes = [...existing.keyframes];
      keyframes[kfIdx] = { ...keyframes[kfIdx]!, [field]: val };
      tracks[trackIdx] = { ...existing, keyframes };
      onTimelineChange({ ...timeline, tracks });
    },
    [timeline, onTimelineChange],
  );

  const handleRemoveKeyframe = useCallback(
    (trackIdx: number, kfIdx: number) => {
      if (!timeline) return;
      const tracks = [...timeline.tracks];
      const existing = tracks[trackIdx];
      if (!existing) return;
      tracks[trackIdx] = { ...existing, keyframes: existing.keyframes.filter((_, i) => i !== kfIdx) };
      onTimelineChange({ ...timeline, tracks });
    },
    [timeline, onTimelineChange],
  );

  const handleTimelineField = useCallback(
    (field: keyof LayerTimeline, value: unknown) => {
      const tl = ensureTimeline();
      onTimelineChange({ ...tl, [field]: value });
    },
    [ensureTimeline, onTimelineChange],
  );

  const handleTriggerChange = useCallback(
    (kind: TriggerConfig['kind']) => {
      const tl = ensureTimeline();
      if (kind === 'on_click' || kind === 'on_enter' || kind === 'on_hover') {
        onTimelineChange({ ...tl, trigger: { kind } });
      } else {
        onTimelineChange({ ...tl, trigger: { kind, seconds: 1, debounceMs: 0 } });
      }
    },
    [ensureTimeline, onTimelineChange],
  );

  const handleClearTimeline = useCallback(() => {
    onTimelineChange(null);
  }, [onTimelineChange]);

  // ── Transition handlers ──

  const handleTransitionField = useCallback(
    (field: keyof SlideTransition, value: unknown) => {
      const current: SlideTransition = transition ?? { kind: 'fade', durationMs: 300 };
      onTransitionChange({ ...current, [field]: value });
    },
    [transition, onTransitionChange],
  );

  const handleClearTransition = useCallback(() => {
    onTransitionChange(null);
  }, [onTransitionChange]);

  // ── Tab definitions ──
  const tabs: { id: AnimTab; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'transition', label: 'Transition' },
    { id: 'magicMove', label: 'Magic Move' },
    { id: 'accessibility', label: 'Accessibility' },
  ];

  return (
    <section className="data-panel" data-testid="p09-animations-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Animations</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="data-panel__add-btn"
            onClick={onCopy}
            data-testid="p09-copy-anim"
            title="Copy animation"
            disabled={!timeline}
            style={{ opacity: timeline ? 1 : 0.4, fontSize: 11, padding: '2px 6px' }}
          >
            Copy
          </button>
          <button
            type="button"
            className="data-panel__add-btn"
            onClick={onPaste}
            data-testid="p09-paste-anim"
            title="Paste animation"
            disabled={!copiedAnimation}
            style={{ opacity: copiedAnimation ? 1 : 0.4, fontSize: 11, padding: '2px 6px' }}
          >
            Paste
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="data-panel__section" style={{ display: 'flex', gap: 0, padding: 0, borderBottom: '1px solid var(--border, #333)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 11,
              background: activeTab === tab.id ? 'var(--bg-secondary, #1a1a1a)' : 'transparent',
              color: activeTab === tab.id ? 'var(--fg, #eee)' : 'var(--muted, #888)',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            data-testid={`p09-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="data-panel__section">
          {!timeline ? (
            <>
              <div className="data-panel__empty">No timeline configured</div>
              <button
                type="button"
                className="data-panel__add-btn"
                onClick={handleAddTrack}
                data-testid="p09-add-timeline"
                style={{ width: '100%', marginTop: 8 }}
              >
                Add timeline
              </button>
            </>
          ) : (
            <>
              {/* Duration + loop */}
              <div className="data-panel__add-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Duration (ms)</label>
                  <input
                    type="number"
                    className="data-panel__add-input"
                    value={timeline.durationMs}
                    min={50}
                    step={50}
                    onChange={(e) => handleTimelineField('durationMs', Math.max(50, Number(e.target.value)))}
                    data-testid="p09-timeline-duration"
                  />
                </div>
                <div style={{ flex: '1 1 80px' }}>
                  <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Start offset (ms)</label>
                  <input
                    type="number"
                    className="data-panel__add-input"
                    value={timeline.startOffsetMs}
                    min={0}
                    onChange={(e) => handleTimelineField('startOffsetMs', Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted, #888)', paddingBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={timeline.loop}
                      onChange={(e) => handleTimelineField('loop', e.target.checked)}
                      data-testid="p09-timeline-loop"
                    />
                    Loop
                  </label>
                  {!timeline.loop && (
                    <div style={{ width: 50 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Count</label>
                      <input
                        type="number"
                        className="data-panel__add-input"
                        value={timeline.playCount ?? 1}
                        min={1}
                        onChange={(e) => handleTimelineField('playCount', Math.max(1, Number(e.target.value)))}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Trigger */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Trigger</label>
                <select
                  className="data-panel__add-input"
                  value={timeline.trigger?.kind ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      handleTimelineField('trigger', undefined);
                    } else {
                      handleTriggerChange(e.target.value as TriggerConfig['kind']);
                    }
                  }}
                  data-testid="p09-trigger-kind"
                >
                  <option value="">None (manual)</option>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {timeline.trigger?.kind === 'on_timer' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Seconds</label>
                      <input
                        type="number"
                        className="data-panel__add-input"
                        value={timeline.trigger.seconds ?? 1}
                        min={0.1}
                        step={0.1}
                        onChange={(e) => {
                          const secs = Math.max(0.1, Number(e.target.value));
                          onTimelineChange({
                            ...timeline,
                            trigger: { ...timeline.trigger!, seconds: secs },
                          });
                        }}
                        data-testid="p09-trigger-timer-seconds"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Debounce (ms)</label>
                      <input
                        type="number"
                        className="data-panel__add-input"
                        value={timeline.trigger.debounceMs ?? 0}
                        min={0}
                        onChange={(e) => {
                          onTimelineChange({
                            ...timeline,
                            trigger: { ...timeline.trigger!, debounceMs: Math.max(0, Number(e.target.value)) },
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
                {timeline.trigger?.kind === 'on_data_change' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Data source</label>
                      <input
                        className="data-panel__add-input"
                        value={timeline.trigger.sourceId ?? ''}
                        placeholder="Source ID"
                        onChange={(e) => {
                          onTimelineChange({
                            ...timeline,
                            trigger: { ...timeline.trigger!, sourceId: e.target.value },
                          });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Field path</label>
                      <input
                        className="data-panel__add-input"
                        value={timeline.trigger.fieldPath ?? ''}
                        placeholder="e.g. revenue"
                        onChange={(e) => {
                          onTimelineChange({
                            ...timeline,
                            trigger: { ...timeline.trigger!, fieldPath: e.target.value },
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tracks */}
              <div style={{ marginTop: 10 }}>
                <div className="data-panel__section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tracks ({timeline.tracks.length})</span>
                  <button
                    type="button"
                    className="data-panel__add-btn"
                    onClick={handleAddTrack}
                    data-testid="p09-add-track"
                    style={{ fontSize: 11, padding: '2px 6px' }}
                  >
                    + Add track
                  </button>
                </div>

                {timeline.tracks.length === 0 ? (
                  <div className="data-panel__empty" style={{ fontSize: 11 }}>No tracks yet</div>
                ) : (
                  timeline.tracks.map((track, tIdx) => (
                    <div
                      key={track.property + tIdx}
                      style={{
                        marginTop: 8,
                        padding: 8,
                        background: 'var(--bg-secondary, #111)',
                        borderRadius: 4,
                        border: '1px solid var(--border, #333)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                        <input
                          className="data-panel__add-input"
                          value={track.property}
                          placeholder="Property (e.g. opacity)"
                          onChange={(e) => handleTrackPropertyChange(tIdx, e.target.value)}
                          data-testid={`p09-track-property-${tIdx}`}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTrack(tIdx)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted, #888)', cursor: 'pointer', fontSize: 14 }}
                          title="Remove track"
                          data-testid={`p09-remove-track-${tIdx}`}
                        >
                          ×
                        </button>
                      </div>

                      {/* Keyframes */}
                      {track.keyframes.map((kf, kIdx) => (
                        <div
                          key={kIdx}
                          style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}
                          data-testid={`p09-keyframe-${tIdx}-${kIdx}`}
                        >
                          <input
                            type="number"
                            className="data-panel__add-input"
                            value={kf.timeMs}
                            min={0}
                            max={timeline.durationMs}
                            style={{ width: 60 }}
                            onChange={(e) => handleKeyframeChange(tIdx, kIdx, 'timeMs', Math.max(0, Number(e.target.value)))}
                            title="Time (ms)"
                          />
                          <input
                            className="data-panel__add-input"
                            value={String(kf.value)}
                            style={{ flex: 1 }}
                            onChange={(e) => handleKeyframeChange(tIdx, kIdx, 'value', e.target.value)}
                            title="Value"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyframe(tIdx, kIdx)}
                            style={{ background: 'none', border: 'none', color: 'var(--muted, #888)', cursor: 'pointer', fontSize: 12 }}
                            title="Remove keyframe"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="data-panel__add-btn"
                        onClick={() => handleAddKeyframe(tIdx)}
                        style={{ fontSize: 11, padding: '2px 6px', marginTop: 4 }}
                        data-testid={`p09-add-keyframe-${tIdx}`}
                      >
                        + Keyframe
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={handleClearTimeline}
                style={{
                  marginTop: 10,
                  width: '100%',
                  padding: '6px 0',
                  fontSize: 11,
                  background: 'transparent',
                  color: 'var(--muted, #888)',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                data-testid="p09-clear-timeline"
              >
                Remove timeline
              </button>
            </>
          )}
        </div>
      )}

      {/* Transition Tab */}
      {activeTab === 'transition' && (
        <div className="data-panel__section">
          <div className="data-panel__section-title">Slide Transition</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Type</label>
              <select
                className="data-panel__add-input"
                value={transition?.kind ?? ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    handleClearTransition();
                  } else {
                    handleTransitionField('kind', e.target.value);
                  }
                }}
                data-testid="p09-transition-kind"
              >
                <option value="">None</option>
                {TRANSITION_KINDS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {transition && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Duration (ms)</label>
                  <input
                    type="number"
                    className="data-panel__add-input"
                    value={transition.durationMs}
                    min={50}
                    step={50}
                    onChange={(e) => handleTransitionField('durationMs', Math.max(50, Number(e.target.value)))}
                    data-testid="p09-transition-duration"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Easing</label>
                  <EasingPicker
                    value={transition.easing ?? 'ease-in-out'}
                    onChange={(v) => handleTransitionField('easing', v)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Direction</label>
                  <select
                    className="data-panel__add-input"
                    value={transition.direction ?? ''}
                    onChange={(e) => handleTransitionField('direction', e.target.value || undefined)}
                    data-testid="p09-transition-direction"
                  >
                    <option value="">Default</option>
                    {DIRECTION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleClearTransition}
                  style={{
                    width: '100%',
                    padding: '6px 0',
                    fontSize: 11,
                    background: 'transparent',
                    color: 'var(--muted, #888)',
                    border: '1px solid var(--border, #333)',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  data-testid="p09-clear-transition"
                >
                  Remove transition
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Magic Move Tab */}
      {activeTab === 'magicMove' && (
        <div className="data-panel__section">
          <div className="data-panel__section-title">Magic Move</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>Element role</label>
              <input
                className="data-panel__add-input"
                value={magicRole ?? ''}
                placeholder="e.g. hero, heading, chart"
                onChange={(e) => onMagicRoleChange(e.target.value || null)}
                data-testid="p09-magic-role"
              />
            </div>
            {hasMatchingRole && (
              <div
                style={{
                  padding: '6px 8px',
                  fontSize: 11,
                  background: 'rgba(88, 166, 255, 0.1)',
                  border: '1px solid rgba(88, 166, 255, 0.3)',
                  borderRadius: 4,
                  color: 'var(--accent, #58a6ff)',
                }}
                data-testid="p09-magic-match-note"
              >
                Elements with the same role on adjacent slides will be automatically tweened.
              </div>
            )}
            {!magicRole && (
              <div style={{ fontSize: 11, color: 'var(--muted, #888)' }}>
                No role assigned
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accessibility Tab */}
      {activeTab === 'accessibility' && (
        <div className="data-panel__section">
          <div className="data-panel__section-title">Reduced Motion</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REDUCED_MOTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 4,
                  background: reducedMotion === opt.value ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                  border: `1px solid ${reducedMotion === opt.value ? 'rgba(88, 166, 255, 0.3)' : 'var(--border, #333)'}`,
                  transition: 'all 0.15s ease',
                }}
                data-testid={`p09-reduced-motion-${opt.value}`}
              >
                <input
                  type="radio"
                  name="reduced-motion"
                  checked={reducedMotion === opt.value}
                  onChange={() => onReducedMotionChange(opt.value)}
                  style={{ margin: 0 }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
