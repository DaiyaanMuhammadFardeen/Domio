'use client';

/**
 * EditorRoot — client-side shell that mounts the layers panel, history
 * panel, command palette, context menu, sync indicator, and presence
 * ping for the example deck. See docs/development_phases/phase-03 §F.
 *
 * The actual canvas renderer is a thin wrapper that renders an SVG
 * stand-in: the full WebGL2/WebGPU stack is loaded dynamically inside
 * the canvas package. This keeps the boot page deterministic so the
 * editor panels can be tested headlessly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { DeckDocument, Element, Slide, ULID } from '@domio/schema';
import {
  HistoryEngine,
  LocalPingAdapter,
  ShortcutRegistry,
  toggleFlag,
  reorderOp,
} from '@domio/canvas';
import { LayersPanel } from '../panels/LayersPanel';
import { HistoryPanel } from '../panels/HistoryPanel';
import { CommandPalette } from '../panels/CommandPalette';
import { ContextMenu, contextMenuFor, type ContextMenuItem } from '../panels/ContextMenu';
import { SyncIndicator } from '../components/SyncIndicator';
import { LocalPing } from '../components/LocalPing';
import { createAutosaveFacade, type AutosaveFacade } from '../lib/autosave';

export interface EditorRootProps {
  doc: DeckDocument;
}

interface CommandDescriptor {
  id: string;
  label: string;
  description?: string;
  category?: string;
  chord: string;
  run: () => void;
}

export function EditorRoot({ doc }: EditorRootProps): ReactElement {
  const [deck, setDeck] = useState<DeckDocument>(doc);
  const [selectedIds, setSelectedIds] = useState<Set<ULID>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<ULID>(
    doc.slides[0]?.id ?? ('' as ULID),
  );

  const pingRef = useRef<HTMLDivElement>(null);
  const pingAdapter = useMemo(() => new LocalPingAdapter(), []);

  const engine = useMemo(() => new HistoryEngine(deck), [deck]);
  const [historyEntries, setHistoryEntries] = useState<{
    past: ReadonlyArray<import('@domio/canvas').HistoryEntry>;
    future: ReadonlyArray<import('@domio/canvas').HistoryEntry>;
  }>({ past: [], future: [] });

  const [autosave] = useState<AutosaveFacade>(() => createAutosaveFacade());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        pingAdapter.emit({ x: 400, y: 300 });
      } else if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const next = engine.undo();
        if (next) setDeck(next);
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const next = engine.redo();
        if (next) setDeck(next);
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    globalThis.document.addEventListener('keydown', onKey);
    return () => globalThis.document.removeEventListener('keydown', onKey);
  }, [engine, pingAdapter]);

  useEffect(() => {
    const listener = () => {
      setHistoryEntries({
        past: engine.pastEntries(),
        future: engine.futureEntries(),
      });
    };
    engine.onEvent(listener);
    listener();
    return () => {
      // engine does not currently expose off(); noop cleanup.
    };
  }, [engine]);

  const commands = useMemo<CommandDescriptor[]>(() => {
    return [
      {
        id: 'undo',
        label: 'Undo',
        chord: 'Cmd+Z',
        category: 'Edit',
        run: () => {
          const next = engine.undo();
          if (next) setDeck(next);
        },
      },
      {
        id: 'redo',
        label: 'Redo',
        chord: 'Cmd+Shift+Z',
        category: 'Edit',
        run: () => {
          const next = engine.redo();
          if (next) setDeck(next);
        },
      },
      {
        id: 'open-palette',
        label: 'Open Command Palette',
        chord: 'Cmd+K',
        category: 'View',
        run: () => setPaletteOpen(true),
      },
      {
        id: 'send-ping',
        label: 'Send Ping',
        chord: 'Cmd+Shift+P',
        category: 'Presence',
        run: () => pingAdapter.emit({ x: 400, y: 300 }),
      },
    ];
  }, [engine, pingAdapter]);

  const shortcuts = useMemo(() => {
    const reg = new ShortcutRegistry();
    const out: {
      id: string;
      label: string;
      chord: string;
      category?: string;
      description?: string;
    }[] = [];
    for (const cmd of commands) {
      const regResult = reg.register({
        id: cmd.id,
        label: cmd.label,
        chord: cmd.chord,
        ...(cmd.category ? { category: cmd.category } : {}),
        ...(cmd.description ? { description: cmd.description } : {}),
      });
      if (regResult.ok) {
        out.push({
          id: cmd.id,
          label: cmd.label,
          chord: cmd.chord,
          ...(cmd.category ? { category: cmd.category } : {}),
          ...(cmd.description ? { description: cmd.description } : {}),
        });
      }
    }
    return out;
  }, [commands]);

  const activeSlide = deck.slides.find((s) => s.id === activeSlideId);

  const handleSelect = useCallback(
    (id: ULID, modifiers: { shift: boolean; alt: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (modifiers.shift) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else if (modifiers.alt) {
          next.delete(id);
        } else {
          next.clear();
          next.add(id);
        }
        return next;
      });
    },
    [],
  );

  const handleToggleFlag = useCallback(
    (id: ULID, flag: 'locked' | 'hidden') => {
      const next = toggleFlag(deck, id, flag);
      setDeck(next);
      autosave.enqueue(`flag-${id}-${flag}`, { id, flag });
    },
    [deck, autosave],
  );

  const handleReorder = useCallback(
    (sourceId: ULID, targetId: ULID, place: 'before' | 'after') => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      if (!slide) return;
      const targetEl = slide.elements.find((el) => el.id === targetId);
      const sourceEl = slide.elements.find((el) => el.id === sourceId);
      if (!targetEl || !sourceEl) return;
      const targetZ = (targetEl.z ?? 0) + (place === 'after' ? 1 : -1);
      const op = reorderOp(
        [{ id: sourceId, fromZ: sourceEl.z ?? 0, toZ: targetZ, fromParent: sourceEl.parentId, toParent: sourceEl.parentId }],
        Date.now(),
      );
      setDeck(engine.apply(op));
      autosave.enqueue(`reorder-${sourceId}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const kind = selectedIds.size === 0 ? 'selection' : 'frame';
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: contextMenuFor(kind),
      });
    },
    [selectedIds],
  );

  return (
    <div className="editor-root">
      <header className="editor-toolbar" onContextMenu={onContextMenu}>
        <div className="editor-toolbar__brand">Domio · {deck.title}</div>
        <nav className="editor-toolbar__slides">
          {deck.slides.map((slide) => (
            <button
              key={slide.id}
              type="button"
              className={`slide-tab${slide.id === activeSlideId ? ' is-active' : ''}`}
              onClick={() => setActiveSlideId(slide.id)}
            >
              {slide.title ?? `Slide ${slide.position + 1}`}
            </button>
          ))}
        </nav>
        <div className="editor-toolbar__right">
          <SyncIndicator facade={autosave} />
        </div>
      </header>
      <main className="editor-body">
        <aside className="editor-side editor-side--left">
          {activeSlide ? (
            <LayersPanel
              slide={activeSlide}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onReorder={handleReorder}
              onToggleFlag={handleToggleFlag}
            />
          ) : null}
        </aside>
        <section className="editor-canvas" ref={pingRef as React.RefObject<HTMLDivElement>}>
          <LocalPing adapter={pingAdapter} container={pingRef as React.RefObject<HTMLElement>} />
          {activeSlide ? <SlidePreview slide={activeSlide} /> : null}
        </section>
        <aside className="editor-side editor-side--right">
          <HistoryPanel
            past={historyEntries.past}
            future={historyEntries.future}
            onUndo={() => {
              const next = engine.undo();
              if (next) setDeck(next);
            }}
            onRedo={() => {
              const next = engine.redo();
              if (next) setDeck(next);
            }}
            onScrub={(idx) => {
              const next = engine.previewAt(idx);
              if (next) setDeck(next);
            }}
          />
        </aside>
      </main>
      <CommandPalette
        open={paletteOpen}
        shortcuts={shortcuts}
        onInvoke={(s) => {
          const cmd = commands.find((c) => c.id === s.id);
          cmd?.run();
          setPaletteOpen(false);
        }}
        onClose={() => setPaletteOpen(false)}
      />
      {contextMenu ? (
        <ContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onSelect={() => {
            /* wire to actions in P03.1 */
          }}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

interface SlidePreviewProps {
  slide: Slide;
}

function SlidePreview({ slide }: SlidePreviewProps): ReactElement {
  const sorted = [...slide.elements]
    .filter(
      (el): el is Element & { transform: NonNullable<Element['transform']> } =>
        Boolean(el.transform),
    )
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return (
    <svg
      className="slide-preview"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={slide.title ?? 'Slide'}
    >
      <rect width="1600" height="900" fill="var(--bg)" />
      {sorted.map((el) => {
        const t = el.transform;
        return (
          <g key={el.id} transform={`translate(${t.x} ${t.y})`}>
            {el.type === 'frame' ? (
              <rect width={t.w} height={t.h} fill="var(--frame)" />
            ) : el.type === 'text' ? (
              <text x={0} y={t.h / 2} fill="var(--text)">
                {el.name}
              </text>
            ) : (
              <rect width={t.w} height={t.h} fill="var(--accent)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}