/**
 * @domio/join-web — low-bandwidth transport fallback.
 *
 * Per Wave 5 §S5.9 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Tries a WebSocket first. If the socket isn't `open` within
 * `fallbackAfterMs` (default 3_000), the transport falls back to
 * long-polling `pollUrl` every `pollIntervalMs` (default 5_000).
 *
 * The caller is exposed:
 *   - state: 'connecting' | 'ws' | 'longpoll' | 'offline'
 *   - close(): shut everything down
 *   - onMessage: register a listener for incoming frames
 *
 * Inject WebSocket + fetch so tests can simulate a failing WS endpoint.
 */

export type TransportState = 'connecting' | 'ws' | 'longpoll' | 'offline';

export interface TransportMessage {
  readonly data: unknown;
  readonly ts: number;
}

export type TransportListener = (msg: TransportMessage) => void;
export type StateListener = (state: TransportState) => void;

export interface ConnectOptions {
  readonly wsUrl: string;
  readonly pollUrl: string;
  readonly fallbackAfterMs?: number;
  readonly pollIntervalMs?: number;
  /** Inject WebSocket constructor (for tests / SSR). */
  readonly WebSocketCtor?: typeof WebSocket;
  /** Inject fetch (for tests). */
  readonly fetchFn?: typeof fetch;
  /** Inject setTimeout (for tests). */
  readonly setTimeoutFn?: typeof setTimeout;
  /** Inject clearTimeout (for tests). */
  readonly clearTimeoutFn?: typeof clearTimeout;
  /** Inject setInterval (for tests). */
  readonly setIntervalFn?: typeof setInterval;
  /** Inject clearInterval (for tests). */
  readonly clearIntervalFn?: typeof clearInterval;
  /** AbortSignal for graceful shutdown. */
  readonly signal?: AbortSignal;
}

export interface Transport {
  readonly state: TransportState;
  close(): void;
  onMessage(cb: TransportListener): () => void;
  onStateChange(cb: StateListener): () => void;
}

const DEFAULT_FALLBACK_AFTER_MS = 3_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function connect(opts: ConnectOptions): Transport {
  const fallbackAfterMs = opts.fallbackAfterMs ?? DEFAULT_FALLBACK_AFTER_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const WS = opts.WebSocketCtor ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
  const fetchImpl = opts.fetchFn ?? fetch;
  const setT = opts.setTimeoutFn ?? setTimeout;
  const clearT = opts.clearTimeoutFn ?? clearTimeout;
  const setI = opts.setIntervalFn ?? setInterval;
  const clearI = opts.clearIntervalFn ?? clearInterval;

  let state: TransportState = 'connecting';
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const messageListeners = new Set<TransportListener>();
  const stateListeners = new Set<StateListener>();

  const setState = (next: TransportState): void => {
    if (state === next) return;
    state = next;
    for (const cb of stateListeners) {
      try {
        cb(state);
      } catch {
        /* swallow */
      }
    }
  };

  const deliver = (data: unknown): void => {
    const msg: TransportMessage = { data, ts: Date.now() };
    for (const cb of messageListeners) {
      try {
        cb(msg);
      } catch {
        /* swallow */
      }
    }
  };

  const clearFallbackTimer = (): void => {
    if (fallbackTimer !== null) {
      clearT(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) {
      clearI(pollTimer);
      pollTimer = null;
    }
  };

  const tryParse = async (res: Response): Promise<unknown> => {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
  };

  const startPolling = (): void => {
    if (closed) return;
    setState('longpoll');
    const tick = async (): Promise<void> => {
      if (closed) return;
      try {
        const res = await fetchImpl(opts.pollUrl, {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await tryParse(res);
          deliver(data);
        }
      } catch {
        // Network blip — try again on the next tick.
      }
    };
    // Fire one immediate poll, then interval.
    void tick();
    pollTimer = setI(() => {
      void tick();
    }, pollIntervalMs);
  };

  const tryWebSocket = (): void => {
    if (closed || WS === undefined) {
      startPolling();
      return;
    }
    try {
      ws = new WS(opts.wsUrl);
    } catch {
      startPolling();
      return;
    }
    fallbackTimer = setT(() => {
      if (state === 'connecting' && !closed) {
        // WS never opened in time — abandon it and start polling.
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = null;
        startPolling();
      }
    }, fallbackAfterMs);

    ws.onopen = () => {
      if (closed) return;
      clearFallbackTimer();
      setState('ws');
    };
    ws.onmessage = (ev: MessageEvent) => {
      let data: unknown = ev.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          /* leave as string */
        }
      }
      deliver(data);
    };
    ws.onerror = () => {
      // onclose will follow; handled there.
    };
    ws.onclose = () => {
      if (closed) return;
      clearFallbackTimer();
      // If we never made it to 'ws', assume unreachable and poll.
      if (state === 'connecting' || state === 'ws') {
        if (state === 'connecting') {
          startPolling();
        } else {
          setState('offline');
        }
      }
    };
  };

  // Honor external abort.
  if (opts.signal) {
    if (opts.signal.aborted) {
      closed = true;
      setState('offline');
    } else {
      opts.signal.addEventListener('abort', () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        stopPolling();
        clearFallbackTimer();
        if (!closed) setState('offline');
        closed = true;
      });
    }
  }

  tryWebSocket();

  return {
    get state(): TransportState {
      return state;
    },
    close(): void {
      if (closed) return;
      closed = true;
      clearFallbackTimer();
      stopPolling();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      setState('offline');
    },
    onMessage(cb: TransportListener): () => void {
      messageListeners.add(cb);
      return () => {
        messageListeners.delete(cb);
      };
    },
    onStateChange(cb: StateListener): () => void {
      stateListeners.add(cb);
      cb(state);
      return () => {
        stateListeners.delete(cb);
      };
    },
  };
}
