'use client';

/**
 * ConnectionsPanel — left-side panel for prototyping hotspots, branching
 * edges, overlays, and interaction-state placeholders.
 *
 * P10 M1 — drives the `x-domio:hotspots`, `x-domio:overlays`, and
 * `x-domio:branching-edges` slide-level slots via the canvas history ops.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  BranchingGraph,
  DEFAULT_MAX_HOPS,
  type GraphValidation,
} from '@domio/prototype-runtime';
import type { Slide } from '@domio/schema';

export interface ConnectionsPanelHotspot {
  id: string;
  name: string;
  geometry: { kind: 'rect'; x: number; y: number; w: number; h: number };
  gestureMask: readonly string[];
  targetType: 'slide' | 'url' | 'overlay' | 'action';
  targetRef: Record<string, unknown>;
  status: 'ok' | 'dangling';
}

export interface ConnectionsPanelOverlay {
  id: string;
  name: string;
  type: 'modal' | 'tooltip' | 'drawer' | 'popover' | 'sheet';
  sizeStrategy: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto';
  persistent: boolean;
}

export interface ConnectionsPanelEdge {
  id: string;
  fromSlideId: string;
  toSlideId: string;
  name: string;
  ruleId: string | null;
  priority: number;
}

interface ConnectionsPanelProps {
  readonly slides: readonly Slide[];
  readonly activeSlideId: string;
  readonly hotspots: readonly ConnectionsPanelHotspot[];
  readonly overlays: readonly ConnectionsPanelOverlay[];
  readonly edges: readonly ConnectionsPanelEdge[];
  readonly onAddHotspot: (slideId: string, hotspot: Omit<ConnectionsPanelHotspot, 'id'>) => void;
  readonly onRemoveHotspot: (id: string) => void;
  readonly onAddEdge: (edge: Omit<ConnectionsPanelEdge, 'id'>) => void;
  readonly onRemoveEdge: (id: string) => void;
  readonly onAddOverlay: (slideId: string, overlay: Omit<ConnectionsPanelOverlay, 'id'>) => void;
  readonly onRemoveOverlay: (id: string) => void;
}

type Tab = 'hotspots' | 'edges' | 'overlays' | 'graph';

export function ConnectionsPanel({
  slides,
  activeSlideId,
  hotspots,
  overlays,
  edges,
  onAddHotspot,
  onRemoveHotspot,
  onAddEdge,
  onRemoveEdge,
  onAddOverlay,
  onRemoveOverlay,
}: ConnectionsPanelProps): ReactElement {
  const [tab, setTab] = useState<Tab>('hotspots');
  const [target, setTarget] = useState<string>(slides[0]?.id ?? '');
  const [ruleId, setRuleId] = useState<string>('');
  const [cycleReport, setCycleReport] = useState<GraphValidation | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  const slideById = useMemo(() => {
    const map = new Map<string, Slide>();
    for (const s of slides) map.set(s.id, s);
    return map;
  }, [slides]);

  const visibleHotspots = useMemo(
    () => (slideById.has(activeSlideId) ? hotspots.slice() : []),
    [hotspots, slideById, activeSlideId],
  );

  const handleValidateGraph = useCallback(() => {
    setGraphError(null);
    try {
      const g = new BranchingGraph();
      for (const s of slides) {
        g.addNode({
          id: s.id,
          isStart: s.id === slides[0]?.id,
          defaultStart: s.id === slides[0]?.id,
        });
      }
      for (const e of edges) g.addEdge({
        id: e.id,
        tenantId: '',
        deckId: '',
        fromSlideId: e.fromSlideId,
        toSlideId: e.toSlideId,
        name: e.name,
        ruleId: e.ruleId,
        priority: e.priority,
        createdAt: 0,
      });
      setCycleReport(g.validate());
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : String(err));
    }
  }, [slides, edges]);

  const handleAddHotspot = useCallback(() => {
    onAddHotspot(activeSlideId, {
      name: 'Hotspot',
      geometry: { kind: 'rect', x: 0.6, y: 0.0, w: 0.3, h: 0.1 },
      gestureMask: ['click'],
      targetType: 'slide',
      targetRef: { slideId: target },
      status: 'ok',
    });
  }, [onAddHotspot, activeSlideId, target]);

  const handleAddEdge = useCallback(() => {
    if (!target) return;
    onAddEdge({
      fromSlideId: activeSlideId,
      toSlideId: target,
      name: 'Continue',
      ruleId: ruleId || null,
      priority: 0,
    });
  }, [onAddEdge, activeSlideId, target, ruleId]);

  const handleAddOverlay = useCallback(() => {
    onAddOverlay(activeSlideId, {
      name: 'Overlay',
      type: 'modal',
      sizeStrategy: 'small',
      persistent: false,
    });
  }, [onAddOverlay, activeSlideId]);

  return (
    <section className="connections-panel" data-testid="p10-connections-panel">
      <header className="connections-panel__header">
        <h2>Connections</h2>
      </header>
      <nav className="connections-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'hotspots'}
          data-testid="p10-tab-hotspots"
          className={`connections-panel__tab${tab === 'hotspots' ? ' is-active' : ''}`}
          onClick={() => setTab('hotspots')}
        >
          Hotspots
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'edges'}
          data-testid="p10-tab-edges"
          className={`connections-panel__tab${tab === 'edges' ? ' is-active' : ''}`}
          onClick={() => setTab('edges')}
        >
          Branching
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overlays'}
          data-testid="p10-tab-overlays"
          className={`connections-panel__tab${tab === 'overlays' ? ' is-active' : ''}`}
          onClick={() => setTab('overlays')}
        >
          Overlays
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'graph'}
          data-testid="p10-tab-graph"
          className={`connections-panel__tab${tab === 'graph' ? ' is-active' : ''}`}
          onClick={() => setTab('graph')}
        >
          Graph
        </button>
      </nav>

      {tab === 'hotspots' && (
        <div className="connections-panel__body" data-testid="p10-hotspot-list">
          <div className="connections-panel__controls">
            <label htmlFor="p10-hotspot-target">Target slide</label>
            <select
              id="p10-hotspot-target"
              data-testid="p10-hotspot-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {slides.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(-6)}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="p10-hotspot-add"
              onClick={handleAddHotspot}
            >
              Add hotspot
            </button>
          </div>
          {visibleHotspots.length === 0 ? (
            <p className="connections-panel__empty">No hotspots on this slide.</p>
          ) : (
            <ul className="connections-panel__items">
              {visibleHotspots.map((h) => (
                <li key={h.id} className="connections-panel__item" data-testid="p10-hotspot-row">
                  <span>{h.name}</span>
                  <small>{h.targetType}</small>
                  <button
                    type="button"
                    data-testid="p10-hotspot-remove"
                    onClick={() => onRemoveHotspot(h.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'edges' && (
        <div className="connections-panel__body" data-testid="p10-edge-list">
          <div className="connections-panel__controls">
            <label htmlFor="p10-edge-target">To slide</label>
            <select
              id="p10-edge-target"
              data-testid="p10-edge-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {slides.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(-6)}
                </option>
              ))}
            </select>
            <label htmlFor="p10-edge-rule">Rule id (optional)</label>
            <input
              id="p10-edge-rule"
              data-testid="p10-edge-rule"
              type="text"
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
            />
            <button type="button" data-testid="p10-edge-add" onClick={handleAddEdge}>
              Add edge
            </button>
          </div>
          {edges.length === 0 ? (
            <p className="connections-panel__empty">No branching edges yet.</p>
          ) : (
            <ul className="connections-panel__items">
              {edges.map((e) => (
                <li key={e.id} className="connections-panel__item" data-testid="p10-edge-row">
                  <span>{e.name}</span>
                  <small>{e.fromSlideId.slice(-6)} → {e.toSlideId.slice(-6)}</small>
                  <button
                    type="button"
                    data-testid="p10-edge-remove"
                    onClick={() => onRemoveEdge(e.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'overlays' && (
        <div className="connections-panel__body" data-testid="p10-overlay-list">
          <div className="connections-panel__controls">
            <button type="button" data-testid="p10-overlay-add" onClick={handleAddOverlay}>
              Add overlay
            </button>
          </div>
          {overlays.length === 0 ? (
            <p className="connections-panel__empty">No overlays yet.</p>
          ) : (
            <ul className="connections-panel__items">
              {overlays.map((o) => (
                <li key={o.id} className="connections-panel__item" data-testid="p10-overlay-row">
                  <span>{o.name}</span>
                  <small>{o.type}</small>
                  <button
                    type="button"
                    data-testid="p10-overlay-remove"
                    onClick={() => onRemoveOverlay(o.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'graph' && (
        <div className="connections-panel__body" data-testid="p10-graph-panel">
          <p className="connections-panel__hint">
            Default max hops per session: {DEFAULT_MAX_HOPS}.
          </p>
          <button
            type="button"
            data-testid="p10-graph-validate"
            onClick={handleValidateGraph}
          >
            Validate graph
          </button>
          {graphError && (
            <p className="connections-panel__error" data-testid="p10-graph-error">
              {graphError}
            </p>
          )}
          {cycleReport && (
            <div className="connections-panel__report" data-testid="p10-graph-report">
              <p>Has cycle: {cycleReport.hasCycle ? 'yes' : 'no'}</p>
              <p>Unreachable: {cycleReport.unreachable.length}</p>
              <p>Islands: {cycleReport.islands.length}</p>
              <p>Multi-start: {cycleReport.multiStart.length}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
