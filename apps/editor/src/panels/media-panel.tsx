'use client';

/**
 * MediaPanel — Phase 11 left-side panel for 3D, Motion & Rich Media.
 * Contains tabs: 3D Model, Video, Audio, Lottie, Embed, Code, LaTeX, Map.
 *
 * P11 — 3D, motion & rich media UI.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactElement, DragEvent } from 'react';
import { useT } from '../lib/locale';
import {
  getModels, getVideos, getAudio, getLottie,
  getMapStyles, getCodeLanguages,
} from '../lib/p11-store';
import {
  Model3DEditor,
  CadImportDialog,
  ARPreviewButton,
  VideoTrimmer,
  AudioVoiceoverPanel,
  CodeBlockEditor,
  LatexEditor,
  MapPicker,
  LiveAppEmbed,
  AIImageGenerator,
} from '../components/media';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaTab =
  | 'model3d'
  | 'video'
  | 'audio'
  | 'lottie'
  | 'embed'
  | 'codeBlock'
  | 'latex'
  | 'map'
  | 'aiGenerate';

/** Callback shape: fires an insert-element op for the given layer kind + props. */
export interface MediaPanelProps {
  /** Currently selected layer kind (if any) for property editing */
  selectedKind: string | null;
  /** Selected layer's kind-specific props (null if nothing selected) */
  selectedProps: Record<string, unknown> | null;
  /** Commit a property edit on the selected layer */
  onPropEdit: (key: string, from: unknown, to: unknown) => void;
  /** Insert a new layer into the current slide */
  onInsert: (kind: string, props: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const MEDIA_TABS: { id: MediaTab; icon: string; labelKey: string }[] = [
  { id: 'model3d', icon: '🎲', labelKey: 'p11.tab.3d' },
  { id: 'video', icon: '🎬', labelKey: 'p11.tab.video' },
  { id: 'audio', icon: '🎵', labelKey: 'p11.tab.audio' },
  { id: 'lottie', icon: '✨', labelKey: 'p11.tab.lottie' },
  { id: 'embed', icon: '🔗', labelKey: 'p11.tab.embed' },
  { id: 'codeBlock', icon: '💻', labelKey: 'p11.tab.code' },
  { id: 'latex', icon: '📐', labelKey: 'p11.tab.latex' },
  { id: 'map', icon: '🗺️', labelKey: 'p11.tab.map' },
  { id: 'aiGenerate', icon: '🪄', labelKey: 'p6.copilot.aiImage.tab' },
];

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function Model3DTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const [dragOver, setDragOver] = useState(false);
  const [cadOpen, setCadOpen] = useState(false);
  const [hotspots, setHotspots] = useState<readonly { id: string; x: number; y: number; action: string }[]>([]);
  const [keyframes, setKeyframes] = useState<readonly { id: string; t: number; orbit: number; distance: number }[]>([]);
  const models = getModels();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    const file = files[0]!;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf' && ext !== 'usdz') return;
    onInsert('model3d', { modelAssetId: `local:${file.name}`, name: file.name });
  }, [onInsert]);

  const handleCadImport = useCallback((glbUrl: string, fileName: string) => {
    onInsert('model3d', { modelAssetId: glbUrl, name: fileName, fromCad: true });
    setCadOpen(false);
  }, [onInsert]);

  return (
    <div className="data-panel__section" data-testid="p11-3d-tab">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '24px 16px',
          border: `2px dashed ${dragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          background: dragOver ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
          marginBottom: 12,
        }}
        data-testid="p11-3d-dropzone"
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
        <div style={{ fontSize: 12, color: 'var(--muted, #888)' }}>
          {t('p11.3d.dropHint')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted, #666)', marginTop: 4 }}>
          GLB / GLTF / USDZ
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf,.usdz"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onInsert('model3d', { modelAssetId: `local:${file.name}`, name: file.name });
          }}
          data-testid="p11-3d-file-input"
        />
      </div>

      {/* Model picker */}
      <div className="data-panel__section-title">{t('p11.3d.library')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onInsert('model3d', { modelAssetId: m.url, name: m.name })}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 6px',
              background: 'var(--bg-secondary, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              fontSize: 11,
              color: 'var(--fg, #eee)',
            }}
            data-testid={`p11-3d-model-${m.id}`}
          >
            <span style={{ fontSize: 22 }}>{m.thumbnail}</span>
            <span style={{ lineHeight: 1.2, textAlign: 'center' }}>{m.name}</span>
          </button>
        ))}
      </div>

      {/* 3D settings (shown when a model3d layer is selected) */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">{t('p11.3d.settings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" data-testid="p11-3d-auto-rotate" />
            {t('p11.3d.autoRotate')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" data-testid="p11-3d-paused" />
            {t('p11.3d.paused')}
          </label>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.3d.upAxis')}</label>
            <select className="data-panel__add-input" data-testid="p11-3d-up-axis" defaultValue="y-up">
              <option value="y-up">Y-Up</option>
              <option value="z-up">Z-Up</option>
            </select>
          </div>
        </div>
      </div>

      {/* Wave 2 §S2.10 — CAD import + 3D viewport + hotspots + keyframes */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">CAD Import</div>
        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => setCadOpen(true)}
          data-testid="p11-3d-cad-btn"
        >
          Import STEP / FBX / IGES
        </button>
        <CadImportDialog open={cadOpen} onClose={() => setCadOpen(false)} onImport={handleCadImport} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">3D Editor</div>
        <Model3DEditor
          src=""
          hotspots={hotspots}
          keyframes={keyframes}
          onHotspotsChange={setHotspots}
          onKeyframesChange={setKeyframes}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ARPreviewButton slideId="active-slide" />
      </div>
    </div>
  );
}

function VideoTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const videos = getVideos();
  const [trim, setTrim] = useState<{ startMs: number; endMs: number }>({ startMs: 0, endMs: 10000 });
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    onInsert('video', { assetId: `local:${file.name}`, name: file.name });
  }, [onInsert]);

  return (
    <div className="data-panel__section" data-testid="p11-video-tab">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '24px 16px',
          border: `2px dashed ${dragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          background: dragOver ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
          marginBottom: 12,
        }}
        data-testid="p11-video-dropzone"
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>🎬</div>
        <div style={{ fontSize: 12, color: 'var(--muted, #888)' }}>
          {t('p11.video.dropHint')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted, #666)', marginTop: 4 }}>
          MP4 / WebM / OGG
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onInsert('video', { assetId: `local:${file.name}`, name: file.name });
          }}
          data-testid="p11-video-file-input"
        />
      </div>

      {/* Video picker */}
      <div className="data-panel__section-title">{t('p11.video.library')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onInsert('video', { assetId: v.url, name: v.name })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--bg-secondary, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              fontSize: 11,
              color: 'var(--fg, #eee)',
              textAlign: 'left',
            }}
            data-testid={`p11-video-asset-${v.id}`}
          >
            <span style={{ fontSize: 18 }}>{v.thumbnail}</span>
            <div>
              <div>{v.name}</div>
              <div style={{ fontSize: 9, color: 'var(--muted, #666)' }}>{v.ext?.toUpperCase()}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Video settings */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">{t('p11.video.settings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.video.speed')}</label>
            <input type="number" className="data-panel__add-input" defaultValue={1} min={0.25} max={4} step={0.25} data-testid="p11-video-speed" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" data-testid="p11-video-muted" />
            {t('p11.video.muted')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" data-testid="p11-video-loop" />
            {t('p11.video.loop')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" defaultChecked data-testid="p11-video-captions" />
            {t('p11.video.captions')}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.video.trimIn')}</label>
              <input type="number" className="data-panel__add-input" defaultValue={0} min={0} data-testid="p11-video-trim-in" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.video.trimOut')}</label>
              <input type="number" className="data-panel__add-input" min={0} data-testid="p11-video-trim-out" />
            </div>
          </div>
        </div>
      </div>

      {/* Wave 2 §S2.10 — non-destructive clip mask */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Clip trim</div>
        <VideoTrimmer
          durationMs={Math.max(trim.endMs, 10000)}
          value={trim}
          onChange={setTrim}
        />
      </div>
    </div>
  );
}

function AudioTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const audioTracks = getAudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    onInsert('audio', { assetId: `local:${file.name}`, name: file.name });
  }, [onInsert]);

  return (
    <div className="data-panel__section" data-testid="p11-audio-tab">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '24px 16px',
          border: `2px dashed ${dragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          background: dragOver ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
          marginBottom: 12,
        }}
        data-testid="p11-audio-dropzone"
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>🎵</div>
        <div style={{ fontSize: 12, color: 'var(--muted, #888)' }}>
          {t('p11.audio.dropHint')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted, #666)', marginTop: 4 }}>
          MP3 / WAV / OGG / AAC
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onInsert('audio', { assetId: `local:${file.name}`, name: file.name });
          }}
          data-testid="p11-audio-file-input"
        />
      </div>

      {/* Audio picker */}
      <div className="data-panel__section-title">{t('p11.audio.library')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {audioTracks.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onInsert('audio', { assetId: a.url, name: a.name })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--bg-secondary, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              fontSize: 11,
              color: 'var(--fg, #eee)',
              textAlign: 'left',
            }}
            data-testid={`p11-audio-asset-${a.id}`}
          >
            <span style={{ fontSize: 18 }}>{a.thumbnail}</span>
            <div>
              <div>{a.name}</div>
              <div style={{ fontSize: 9, color: 'var(--muted, #666)' }}>{a.ext?.toUpperCase()}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Audio settings */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">{t('p11.audio.settings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.audio.volume')}</label>
            <input type="range" className="data-panel__add-input" defaultValue={1} min={0} max={1} step={0.05} data-testid="p11-audio-volume" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.audio.pan')}</label>
            <input type="range" className="data-panel__add-input" defaultValue={0} min={-1} max={1} step={0.1} data-testid="p11-audio-pan" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.audio.fadeIn')}</label>
              <input type="number" className="data-panel__add-input" defaultValue={0} min={0} data-testid="p11-audio-fade-in" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.audio.fadeOut')}</label>
              <input type="number" className="data-panel__add-input" defaultValue={0} min={0} data-testid="p11-audio-fade-out" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" data-testid="p11-audio-loop" />
            {t('p11.audio.loop')}
          </label>
        </div>
      </div>

      {/* Wave 2 §S2.10 — voiceover */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Voiceover</div>
        <AudioVoiceoverPanel
          slideId="active-slide"
          onUploaded={(info) => onInsert('audio', { assetId: info.url, name: info.id, durationMs: info.durationMs })}
        />
      </div>
    </div>
  );
}

function LottieTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const lottieAssets = getLottie();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    onInsert('lottie', { assetId: `local:${file.name}`, name: file.name });
  }, [onInsert]);

  return (
    <div className="data-panel__section" data-testid="p11-lottie-tab">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '24px 16px',
          border: `2px dashed ${dragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          background: dragOver ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
          marginBottom: 12,
        }}
        data-testid="p11-lottie-dropzone"
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>✨</div>
        <div style={{ fontSize: 12, color: 'var(--muted, #888)' }}>
          {t('p11.lottie.dropHint')}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted, #666)', marginTop: 4 }}>
          JSON (Lottie) / RIV (Rive)
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.riv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onInsert('lottie', { assetId: `local:${file.name}`, name: file.name });
          }}
          data-testid="p11-lottie-file-input"
        />
      </div>

      {/* Lottie picker */}
      <div className="data-panel__section-title">{t('p11.lottie.library')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {lottieAssets.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onInsert('lottie', { assetId: l.url, name: l.name })}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 4px',
              background: 'var(--bg-secondary, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              fontSize: 11,
              color: 'var(--fg, #eee)',
            }}
            data-testid={`p11-lottie-asset-${l.id}`}
          >
            <span style={{ fontSize: 20 }}>{l.thumbnail}</span>
            <span style={{ lineHeight: 1.2, textAlign: 'center', fontSize: 10 }}>{l.name}</span>
          </button>
        ))}
      </div>

      {/* Lottie settings */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">{t('p11.lottie.settings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" defaultChecked data-testid="p11-lottie-autoplay" />
            {t('p11.lottie.autoplay')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
            <input type="checkbox" defaultChecked data-testid="p11-lottie-loop" />
            {t('p11.lottie.loop')}
          </label>
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.lottie.speed')}</label>
            <input type="number" className="data-panel__add-input" defaultValue={1} min={0} step={0.1} data-testid="p11-lottie-speed" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmbedTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  return (
    <div className="data-panel__section" data-testid="p11-embed-tab">
      <div className="data-panel__section-title">{t('p11.embed.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.embed.url')}</label>
          <input
            className="data-panel__add-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            data-testid="p11-embed-url"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.embed.title')}</label>
          <input
            className="data-panel__add-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('p11.embed.titlePlaceholder')}
            data-testid="p11-embed-title"
          />
        </div>
        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => {
            if (!url) return;
            onInsert('embed', { url, ...(title ? { title } : {}) });
            setUrl('');
            setTitle('');
          }}
          disabled={!url}
          style={{ width: '100%', opacity: url ? 1 : 0.5 }}
          data-testid="p11-embed-insert"
        >
          {t('p11.embed.insert')}
        </button>
      </div>

      {/* Wave 2 §S2.10 — live app embed config */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Embed config (origins, permissions, JWT)</div>
        <LiveAppEmbed
          initialUrl={url || 'https://example.com'}
          onChange={(config) => {
            // Wire frame config through to onInsert payload later — for now surface it.
            // eslint-disable-next-line no-console
            console.debug('LiveAppEmbed config changed', config);
          }}
        />
      </div>
    </div>
  );
}

function CodeBlockTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const languages = getCodeLanguages();
  const [code, setCode] = useState('');
  const [lang, setLang] = useState('javascript');
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [stepReveal, setStepReveal] = useState(false);

  return (
    <div className="data-panel__section" data-testid="p11-code-tab">
      <div className="data-panel__section-title">{t('p11.code.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.code.language')}</label>
          <select
            className="data-panel__add-input"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            data-testid="p11-code-language"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.code.source')}</label>
          <textarea
            className="data-panel__add-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('p11.code.placeholder')}
            rows={8}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, minHeight: 120 }}
            data-testid="p11-code-source"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
          <input
            type="checkbox"
            checked={showLineNumbers}
            onChange={(e) => setShowLineNumbers(e.target.checked)}
            data-testid="p11-code-line-numbers"
          />
          {t('p11.code.lineNumbers')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
          <input
            type="checkbox"
            checked={stepReveal}
            onChange={(e) => setStepReveal(e.target.checked)}
            data-testid="p11-code-step-reveal"
          />
          {t('p11.code.stepReveal')}
        </label>
        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => {
            if (!code.trim()) return;
            onInsert('codeBlock', {
              code,
              language: lang,
              showLineNumbers,
              stepReveal,
            });
            setCode('');
          }}
          disabled={!code.trim()}
          style={{ width: '100%', opacity: code.trim() ? 1 : 0.5 }}
          data-testid="p11-code-insert"
        >
          {t('p11.code.insert')}
        </button>
      </div>

      {/* Wave 2 §S2.10 — sandbox runner preview */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Run &amp; preview</div>
        <CodeBlockEditor initialSource={code || 'console.log("Hello from Domio")'} language={lang === 'python' ? 'python' : lang === 'typescript' ? 'ts' : 'js'} />
      </div>
    </div>
  );
}

function LatexTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const [source, setSource] = useState('');
  const [displayMode, setDisplayMode] = useState<'inline' | 'block'>('inline');

  return (
    <div className="data-panel__section" data-testid="p11-latex-tab">
      <div className="data-panel__section-title">{t('p11.latex.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.latex.source')}</label>
          <textarea
            className="data-panel__add-input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t('p11.latex.placeholder')}
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, minHeight: 80 }}
            data-testid="p11-latex-source"
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.latex.displayMode')}</label>
          <select
            className="data-panel__add-input"
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as 'inline' | 'block')}
            data-testid="p11-latex-display-mode"
          >
            <option value="inline">{t('p11.latex.inline')}</option>
            <option value="block">{t('p11.latex.block')}</option>
          </select>
        </div>
        {/* Live preview placeholder */}
        <div
          style={{
            padding: '12px',
            background: 'var(--bg-secondary, #111)',
            border: '1px solid var(--border, #333)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--fg, #eee)',
            minHeight: 40,
            fontStyle: 'italic',
          }}
          data-testid="p11-latex-preview"
        >
          {source || t('p11.latex.previewEmpty')}
        </div>
        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => {
            if (!source.trim()) return;
            onInsert('latex', { source, displayMode });
            setSource('');
          }}
          disabled={!source.trim()}
          style={{ width: '100%', opacity: source.trim() ? 1 : 0.5 }}
          data-testid="p11-latex-insert"
        >
          {t('p11.latex.insert')}
        </button>
      </div>

      {/* Wave 2 §S2.10 — live preview */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Live preview</div>
        <LatexEditor initialSource={source || 'E = mc^2'} />
      </div>
    </div>
  );
}

function MapTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  const t = useT();
  const mapStyles = getMapStyles();
  const [selectedStyle, setSelectedStyle] = useState(mapStyles[0]?.id ?? '');
  const [zoom, setZoom] = useState(10);
  const [lat, setLat] = useState(40.7128);
  const [lng, setLng] = useState(-74.006);
  const [choropleth, setChoropleth] = useState(false);

  return (
    <div className="data-panel__section" data-testid="p11-map-tab">
      <div className="data-panel__section-title">{t('p11.map.title')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Style picker */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.map.style')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {mapStyles.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStyle(s.id)}
                style={{
                  padding: '6px 8px',
                  fontSize: 11,
                  background: selectedStyle === s.id ? 'rgba(88, 166, 255, 0.15)' : 'var(--bg-secondary, #111)',
                  color: selectedStyle === s.id ? 'var(--accent, #58a6ff)' : 'var(--fg, #eee)',
                  border: `1px solid ${selectedStyle === s.id ? 'var(--accent, #58a6ff)' : 'var(--border, #333)'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'center',
                }}
                data-testid={`p11-map-style-${s.id}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.map.zoom')}</label>
          <input
            type="range"
            className="data-panel__add-input"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            min={1}
            max={20}
            step={1}
            data-testid="p11-map-zoom"
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 10, color: 'var(--muted, #666)', textAlign: 'right' }}>{zoom}</div>
        </div>

        {/* Center */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.map.lat')}</label>
            <input
              type="number"
              className="data-panel__add-input"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              step={0.001}
              data-testid="p11-map-lat"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--muted, #888)' }}>{t('p11.map.lng')}</label>
            <input
              type="number"
              className="data-panel__add-input"
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              step={0.001}
              data-testid="p11-map-lng"
            />
          </div>
        </div>

        {/* Choropleth */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted, #888)' }}>
          <input
            type="checkbox"
            checked={choropleth}
            onChange={(e) => setChoropleth(e.target.checked)}
            data-testid="p11-map-choropleth"
          />
          {t('p11.map.choropleth')}
        </label>

        <button
          type="button"
          className="data-panel__add-btn"
          onClick={() => onInsert('map', { styleId: selectedStyle, zoom, center: { lat, lng }, choropleth })}
          style={{ width: '100%' }}
          data-testid="p11-map-insert"
        >
          {t('p11.map.insert')}
        </button>
      </div>

      {/* Wave 2 §S2.10 — visual marker picker */}
      <div style={{ marginTop: 12 }}>
        <div className="data-panel__section-title">Marker picker</div>
        <MapPicker
          value={{ lat, lng, label: selectedStyle }}
          onChange={(next) => {
            if (typeof next.lat === 'number') setLat(next.lat);
            if (typeof next.lng === 'number') setLng(next.lng);
          }}
        />
      </div>
    </div>
  );
}

function AiGenerateTab({ onInsert }: { onInsert: (kind: string, props: Record<string, unknown>) => void }): ReactElement {
  return (
    <div className="data-panel__section" data-testid="p11-ai-generate-tab">
      <div className="data-panel__section-title">AI Generate</div>
      <AIImageGenerator
        onInsert={(kind, props) => onInsert(kind, props)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function MediaPanel({
  selectedKind: _selectedKind,
  selectedProps: _selectedProps,
  onPropEdit: _onPropEdit,
  onInsert,
}: MediaPanelProps): ReactElement {
  const t = useT();
  const [activeTab, setActiveTab] = useState<MediaTab>('model3d');

  const renderTab = (): ReactElement => {
    switch (activeTab) {
      case 'model3d': return <Model3DTab onInsert={onInsert} />;
      case 'video': return <VideoTab onInsert={onInsert} />;
      case 'audio': return <AudioTab onInsert={onInsert} />;
      case 'lottie': return <LottieTab onInsert={onInsert} />;
      case 'embed': return <EmbedTab onInsert={onInsert} />;
      case 'codeBlock': return <CodeBlockTab onInsert={onInsert} />;
      case 'latex': return <LatexTab onInsert={onInsert} />;
      case 'map': return <MapTab onInsert={onInsert} />;
      case 'aiGenerate': return <AiGenerateTab onInsert={onInsert} />;
    }
  };

  return (
    <section className="data-panel" data-testid="p11-media-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">{t('p11.title')}</h2>
      </header>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          padding: 0,
          borderBottom: '1px solid var(--border, #333)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
        role="tablist"
        aria-label={t('p11.title')}
      >
        {MEDIA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={t(tab.labelKey)}
            style={{
              flex: '0 0 auto',
              padding: '6px 8px',
              fontSize: 14,
              background: activeTab === tab.id ? 'var(--bg-secondary, #1a1a1a)' : 'transparent',
              color: activeTab === tab.id ? 'var(--fg, #eee)' : 'var(--muted, #888)',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              lineHeight: 1,
            }}
            data-testid={`p11-tab-${tab.id}`}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Tab labels row */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          padding: '0 0 4px',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border, #333)',
          flexShrink: 0,
        }}
      >
        {MEDIA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '0 0 auto',
              padding: '2px 8px',
              fontSize: 10,
              background: 'transparent',
              color: activeTab === tab.id ? 'var(--accent, #58a6ff)' : 'var(--muted, #666)',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {renderTab()}
      </div>
    </section>
  );
}
