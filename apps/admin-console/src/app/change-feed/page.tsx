/**
 * Change feed inspector — Wave 10 §S10.7.
 *
 * Subscribes to a deck's server-sent CRDT op feed (with a deterministic
 * seed fallback) and renders the ops as a live auto-scrolling list.
 * Supports pause / resume / replay and per-op-kind filtering via chips.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { OpKindFilter, OpStream } from '../../components/change-feed';
import {
  listChangeFeed,
  replayChangeFeed,
  type ChangeFeedOp,
  type ChangeFeedOpKind,
} from '../../lib/change-feed-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

type Status = 'disconnected' | 'live' | 'paused';

const REFRESH_INTERVAL_MS = 5_000;

export default function ChangeFeedPage() {
  const [deckId, setDeckId] = useState('deck-demo');
  const [input, setInput] = useState('deck-demo');
  const [status, setStatus] = useState<Status>('disconnected');
  const [paused, setPaused] = useState(false);
  const [ops, setOps] = useState<ReadonlyArray<ChangeFeedOp>>([]);
  const [filters, setFilters] = useState<Set<ChangeFeedOpKind>>(new Set());
  const [replayToast, setReplayToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchInitial = useCallback(async (id: string) => {
    setError(null);
    try {
      const list = await listChangeFeed({ deckId: id });
      setOps(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load change feed');
    }
  }, []);

  const subscribe = useCallback(
    (id: string) => {
      stopPolling();
      if (!id) return;
      setStatus('live');
      void fetchInitial(id);
      pollingRef.current = setInterval(() => {
        if (pausedRef.current) return;
        void fetchInitial(id);
      }, REFRESH_INTERVAL_MS);
    },
    [fetchInitial, stopPolling],
  );

  // Keep a ref so the polling closure always sees the current paused value.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const unsubscribe = useCallback(() => {
    stopPolling();
    setStatus('disconnected');
  }, [stopPolling]);

  // Initial load: auto-subscribe to the demo deck so the page is alive
  // on first render. Users can still swap deck ids afterwards.
  useEffect(() => {
    subscribe(deckId);
    return () => {
      stopPolling();
    };
    // subscribe is stable via useCallback, and we only want the initial mount.
  }, []);

  // Whenever the pause state changes, refresh the status pill.
  useEffect(() => {
    if (status === 'live' && paused) setStatus('paused');
    else if (status === 'paused' && !paused) setStatus('live');
  }, [paused, status]);

  function onSubscribe() {
    const next = input.trim();
    if (!next) return;
    setDeckId(next);
    setOps([]);
    subscribe(next);
  }

  function onUnsubscribe() {
    unsubscribe();
  }

  function onTogglePause() {
    setPaused((p) => !p);
  }

  function onClear() {
    setOps([]);
  }

  async function onReplay() {
    if (!deckId) return;
    setReplayBusy(true);
    setReplayToast(null);
    try {
      const end = Date.now();
      const start = end - 5 * 60_000;
      const replayed = await replayChangeFeed(deckId, start, end);
      if (replayed.length === 0) {
        setReplayToast('Replay returned 0 ops in the last 5 minutes.');
      } else {
        // Merge replayed ops into the stream (newest first), dedup by id.
        const seen = new Set(ops.map((o) => o.id));
        const merged = [
          ...replayed.filter((o) => !seen.has(o.id)),
          ...ops,
        ];
        setOps(merged);
        setReplayToast(`Replayed ${replayed.length} op(s).`);
      }
    } catch (e) {
      setReplayToast(
        `Replay failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    } finally {
      setReplayBusy(false);
    }
  }

  const statusLabelId = useMemo(() => {
    if (status === 'live' && paused) return 'admin.changeFeed.status.paused';
    if (status === 'live') return 'admin.changeFeed.status.live';
    return 'admin.changeFeed.status.disconnected';
  }, [status, paused]);

  const statusTone = useMemo(() => {
    if (status === 'disconnected') return 'disconnected';
    if (paused) return 'paused';
    return 'live';
  }, [status, paused]);

  return (
    <div data-testid="change-feed-page" className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.changeFeed.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="text-sm text-slate-500">
          Live stream of CRDT ops for a deck. Use the deck id to switch
          subscriptions; the toolbar controls pause / resume / replay and
          per-kind filtering.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 min-w-[16rem] flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FormattedMessage
                id="admin.changeFeed.deckId"
                catalogue={CATALOGUE}
              />
            </span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="deck-demo"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              data-testid="deck-id-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubscribe();
              }}
            />
          </label>
          {status === 'disconnected' ? (
            <button
              type="button"
              onClick={onSubscribe}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              data-testid="subscribe-button"
            >
              <FormattedMessage
                id="admin.changeFeed.subscribe"
                catalogue={CATALOGUE}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={onUnsubscribe}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              data-testid="unsubscribe-button"
            >
              <FormattedMessage
                id="admin.changeFeed.unsubscribe"
                catalogue={CATALOGUE}
              />
            </button>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {replayToast && (
        <div
          role="status"
          data-testid="replay-toast"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {replayToast}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div
            data-testid="status-pill"
            data-status={statusTone}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor:
                statusTone === 'live'
                  ? 'rgb(16 185 129)'
                  : statusTone === 'paused'
                    ? 'rgb(217 119 6)'
                    : 'rgb(203 213 225)',
              color:
                statusTone === 'live'
                  ? 'rgb(6 95 70)'
                  : statusTone === 'paused'
                    ? 'rgb(180 83 9)'
                    : 'rgb(71 85 105)',
              backgroundColor:
                statusTone === 'live'
                  ? 'rgb(236 253 245)'
                  : statusTone === 'paused'
                    ? 'rgb(255 251 235)'
                    : 'rgb(248 250 252)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              aria-hidden
              style={{
                backgroundColor:
                  statusTone === 'live'
                    ? 'rgb(16 185 129)'
                    : statusTone === 'paused'
                      ? 'rgb(217 119 6)'
                      : 'rgb(148 163 184)',
              }}
            />
            <FormattedMessage id={statusLabelId} catalogue={CATALOGUE} />
          </div>

          <div className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

          <button
            type="button"
            onClick={onTogglePause}
            disabled={status === 'disconnected'}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="pause-resume-button"
          >
            <FormattedMessage
              id={paused ? 'admin.changeFeed.resume' : 'admin.changeFeed.pause'}
              catalogue={CATALOGUE}
            />
          </button>

          <button
            type="button"
            onClick={onReplay}
            disabled={status === 'disconnected' || replayBusy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="replay-button"
          >
            <FormattedMessage
              id="admin.changeFeed.replay"
              catalogue={CATALOGUE}
            />
          </button>

          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            data-testid="clear-button"
          >
            <FormattedMessage
              id="admin.changeFeed.clear"
              catalogue={CATALOGUE}
            />
          </button>
        </div>

        <div className="mt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FormattedMessage
              id="admin.changeFeed.filter.heading"
              catalogue={CATALOGUE}
            />
          </h2>
          <OpKindFilter
            selected={filters}
            onChange={setFilters}
            labelOf={(kind) =>
              CATALOGUE[`admin.changeFeed.op.${kind}`] ?? kind
            }
          />
        </div>

        <div className="mt-4">
          <OpStream
            ops={ops}
            paused={paused}
            filters={filters}
            labelOf={(kind) =>
              CATALOGUE[`admin.changeFeed.op.${kind}`] ?? kind
            }
            emptyLabel={CATALOGUE['admin.changeFeed.empty'] ?? 'No ops yet.'}
            pausedLabel={
              CATALOGUE['admin.changeFeed.status.paused'] ?? 'Paused'
            }
            liveLabel={CATALOGUE['admin.changeFeed.status.live'] ?? 'Live'}
          />
        </div>
      </section>
    </div>
  );
}
