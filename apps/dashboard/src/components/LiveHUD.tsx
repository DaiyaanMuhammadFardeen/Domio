'use client';

/**
 * LiveHUD — composed HUD shell.
 *
 * Per Wave 7 §S7.7 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Subscribes to the live-analytics WS for the current session and
 * renders the metric tiles + current slide view. The HUD replaces
 * the static card that used to live at /live.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { clsx } from 'clsx';
import { Activity, EyeOff, Maximize2, Minimize2 } from 'lucide-react';
import { LiveMetrics } from './LiveMetrics';
import { LiveSlideView } from './LiveSlideView';
import {
  EMPTY_LIVE_SNAPSHOT,
  reduceLiveEvents,
  subscribeLive,
  type LiveConnectionState,
  type LiveEvent,
  type LiveSnapshot,
} from '../lib/live-analytics-service';

export interface LiveHUDProps {
  workspaceId?: string;
  sessionId: string;
  pollIntervalMs?: number;
  /** Test seam: provide a custom transport that emits events. */
  transport?: Parameters<typeof subscribeLive>[1]['transport'];
  /** Test seam: replace the subscribe helper. */
  subscribe?: (
    listeners: {
      onEvent: (event: LiveEvent) => void;
      onStatus: (state: LiveConnectionState) => void;
    },
    options: Parameters<typeof subscribeLive>[1],
  ) => ReturnType<typeof subscribeLive>;
  initial?: LiveSnapshot;
}

function statusTone(status: LiveConnectionState['status']): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-100 text-emerald-700';
    case 'connecting':
      return 'bg-slate-100 text-slate-700';
    case 'closed':
      return 'bg-slate-100 text-slate-500';
    case 'error':
      return 'bg-rose-100 text-rose-700';
  }
}

export function LiveHUD({
  workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo',
  sessionId,
  transport,
  subscribe = subscribeLive,
  initial = EMPTY_LIVE_SNAPSHOT,
}: LiveHUDProps): ReactElement {
  void workspaceId;
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(initial);
  const [status, setStatus] = useState<LiveConnectionState['status']>('connecting');
  const [overlay, setOverlay] = useState<boolean>(false);

  const onEvent = useCallback((event: LiveEvent) => {
    setSnapshot((prev) => reduceLiveEvents([event], prev));
  }, []);

  const onStatus = useCallback((next: LiveConnectionState) => {
    setStatus(next.status);
  }, []);

  useEffect(() => {
    const options: Parameters<typeof subscribeLive>[1] = { sessionId };
    if (transport) options.transport = transport;
    const sub = subscribe(
      { onEvent, onStatus },
      options,
    );
    return () => {
      sub.close();
    };
  }, [sessionId, onEvent, onStatus, subscribe, transport]);

  return (
    <div
      className={clsx(
        'space-y-4',
        overlay &&
          'fixed inset-4 z-50 overflow-auto rounded-2xl border border-brand-300 bg-slate-50 p-6 shadow-2xl',
      )}
      data-testid="live-hud"
      data-overlay={overlay ? 'true' : 'false'}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-600" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Live delivery
          </h2>
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
              statusTone(status),
            )}
            data-testid="live-status"
          >
            {status}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOverlay((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-brand-300"
          data-testid="live-overlay-toggle"
        >
          {overlay ? (
            <>
              <Minimize2 className="h-3 w-3" aria-hidden /> Exit overlay
            </>
          ) : (
            <>
              <Maximize2 className="h-3 w-3" aria-hidden /> Overlay
            </>
          )}
        </button>
      </header>

      {status === 'error' ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          role="status"
          data-testid="live-error"
        >
          Live stream dropped. The HUD will retry on the next connection.
        </p>
      ) : null}

      <LiveMetrics
        attendance={snapshot.attendance}
        poll={snapshot.poll}
        question={snapshot.question}
        slide={snapshot.slide}
      />

      <LiveSlideView slide={snapshot.slide} sessionId={sessionId} />

      <footer className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Workspace <code className="font-mono">{workspaceId}</code>
        </span>
        <span className="inline-flex items-center gap-1">
          <EyeOff className="h-3 w-3" aria-hidden /> Overlay toggles the
          audience-display HUD.
        </span>
      </footer>
    </div>
  );
}