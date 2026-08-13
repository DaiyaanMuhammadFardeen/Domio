/**
 * live-analytics-service — typed client for the live HUD.
 *
 * Per Wave 7 §S7.7 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps the WebSocket endpoint exposed by the live-analytics
 * service. The page subscribes to one session's stream and renders
 * attendance, poll participation, question volume, current slide,
 * time-in-slide, and attention score in real time. We never fall
 * back to a static card when the upstream is unavailable — the HUD
 * surfaces a connecting / closed / error indicator instead.
 */

export interface LiveAttendance {
  readonly current: number;
  readonly peak: number;
  readonly joinedLast30s: number;
  readonly leftLast30s: number;
}

export interface LivePollParticipation {
  readonly activePollId: string | null;
  readonly votes: number;
  readonly participants: number;
  /** 0..1 */
  readonly participationRate: number;
}

export interface LiveQuestionVolume {
  readonly openQuestions: number;
  readonly answered: number;
  readonly questionsPerMinute: number;
}

export interface LiveSlideState {
  readonly slideId: string | null;
  readonly slideIndex: number | null;
  readonly totalSlides: number | null;
  readonly timeInSlideMs: number;
  readonly attentionScore: number; // 0..1
}

export type LiveEvent =
  | {
      readonly type: 'attendance';
      readonly data: LiveAttendance;
    }
  | {
      readonly type: 'poll';
      readonly data: LivePollParticipation;
    }
  | {
      readonly type: 'question';
      readonly data: LiveQuestionVolume;
    }
  | {
      readonly type: 'slide';
      readonly data: LiveSlideState;
    }
  | {
      readonly type: 'snapshot';
      readonly data: {
        readonly attendance: LiveAttendance;
        readonly poll: LivePollParticipation;
        readonly question: LiveQuestionVolume;
        readonly slide: LiveSlideState;
      };
    };

export interface LiveSnapshot {
  readonly attendance: LiveAttendance;
  readonly poll: LivePollParticipation;
  readonly question: LiveQuestionVolume;
  readonly slide: LiveSlideState;
}

export interface LiveConnectionState {
  readonly status: 'connecting' | 'open' | 'closed' | 'error';
}

const EMPTY_ATTENDANCE: LiveAttendance = {
  current: 0,
  peak: 0,
  joinedLast30s: 0,
  leftLast30s: 0,
};

const EMPTY_POLL: LivePollParticipation = {
  activePollId: null,
  votes: 0,
  participants: 0,
  participationRate: 0,
};

const EMPTY_QUESTION: LiveQuestionVolume = {
  openQuestions: 0,
  answered: 0,
  questionsPerMinute: 0,
};

const EMPTY_SLIDE: LiveSlideState = {
  slideId: null,
  slideIndex: null,
  totalSlides: null,
  timeInSlideMs: 0,
  attentionScore: 0,
};

export const EMPTY_LIVE_SNAPSHOT: LiveSnapshot = {
  attendance: EMPTY_ATTENDANCE,
  poll: EMPTY_POLL,
  question: EMPTY_QUESTION,
  slide: EMPTY_SLIDE,
};

export type LiveEventListener = (event: LiveEvent) => void;
export type LiveStatusListener = (state: LiveConnectionState) => void;

export interface LiveSubscription {
  /** Push an event into the subscription (test seam). */
  push(event: LiveEvent): void;
  /** Force the status (test seam). */
  setStatus(status: LiveConnectionState['status']): void;
  close(): void;
}

interface WireEvent {
  type?: string;
  payload?: unknown;
}

function parseEvent(raw: WireEvent): LiveEvent | null {
  const payload = raw.payload as Record<string, unknown> | undefined;
  switch (raw.type) {
    case 'attendance': {
      const d = payload ?? {};
      return {
        type: 'attendance',
        data: {
          current: Number(d['current'] ?? 0),
          peak: Number(d['peak'] ?? 0),
          joinedLast30s: Number(d['joined_last_30s'] ?? d['joinedLast30s'] ?? 0),
          leftLast30s: Number(d['left_last_30s'] ?? d['leftLast30s'] ?? 0),
        },
      };
    }
    case 'poll': {
      const d = (payload ?? {}) as Record<string, unknown>;
      const votes = Number(d['votes'] ?? 0);
      const participants = Number(d['participants'] ?? 0);
      const rate =
        typeof d['participation_rate'] === 'number'
          ? Number(d['participation_rate'])
          : typeof d['participationRate'] === 'number'
            ? Number(d['participationRate'])
            : participants > 0
              ? votes / participants
              : 0;
      return {
        type: 'poll',
        data: {
          activePollId: d['active_poll_id'] != null ? String(d['active_poll_id']) : null,
          votes,
          participants,
          participationRate: rate,
        },
      };
    }
    case 'question': {
      const d = (payload ?? {}) as Record<string, unknown>;
      return {
        type: 'question',
        data: {
          openQuestions: Number(d['open_questions'] ?? d['openQuestions'] ?? 0),
          answered: Number(d['answered'] ?? 0),
          questionsPerMinute: Number(d['questions_per_minute'] ?? d['questionsPerMinute'] ?? 0),
        },
      };
    }
    case 'slide': {
      const d = (payload ?? {}) as Record<string, unknown>;
      return {
        type: 'slide',
        data: {
          slideId: d['slide_id'] != null ? String(d['slide_id']) : null,
          slideIndex:
            typeof d['slide_index'] === 'number'
              ? Number(d['slide_index'])
              : typeof d['slideIndex'] === 'number'
                ? Number(d['slideIndex'])
                : null,
          totalSlides:
            typeof d['total_slides'] === 'number'
              ? Number(d['total_slides'])
              : typeof d['totalSlides'] === 'number'
                ? Number(d['totalSlides'])
                : null,
          timeInSlideMs: Number(d['time_in_slide_ms'] ?? d['timeInSlideMs'] ?? 0),
          attentionScore: Number(d['attention_score'] ?? d['attentionScore'] ?? 0),
        },
      };
    }
    case 'snapshot': {
      const d = (payload ?? {}) as Record<string, unknown>;
      const attendance = (d['attendance'] as Record<string, unknown>) ?? {};
      const poll = (d['poll'] as Record<string, unknown>) ?? {};
      const question = (d['question'] as Record<string, unknown>) ?? {};
      const slide = (d['slide'] as Record<string, unknown>) ?? {};
      const attendanceEvent = parseEvent({ type: 'attendance', payload: attendance });
      const pollEvent = parseEvent({ type: 'poll', payload: poll });
      const questionEvent = parseEvent({ type: 'question', payload: question });
      const slideEvent = parseEvent({ type: 'slide', payload: slide });
      if (!attendanceEvent || !pollEvent || !questionEvent || !slideEvent) return null;
      if (
        attendanceEvent.type !== 'attendance' ||
        pollEvent.type !== 'poll' ||
        questionEvent.type !== 'question' ||
        slideEvent.type !== 'slide'
      ) {
        return null;
      }
      return {
        type: 'snapshot',
        data: {
          attendance: attendanceEvent.data,
          poll: pollEvent.data,
          question: questionEvent.data,
          slide: slideEvent.data,
        },
      };
    }
    default:
      return null;
  }
}

export interface SubscribeOptions {
  baseUrl?: string;
  sessionId: string;
  /** Test seam: provide a fake transport instead of opening a WebSocket. */
  transport?: EventTarget & { send?: (data: string) => void };
}

/**
 * Open a subscription to live analytics for the given session.
 *
 * Returns a `LiveSubscription` whose `push` / `setStatus` methods are
 * test seams used by the Vitest suite. The production implementation
 * opens a WebSocket to `${baseUrl}/v1/live/${sessionId}` and forwards
 * the server's JSON events into the registered listeners.
 *
 * The subscription is fully reactive — the caller registers an
 * event listener and a status listener; both fire when the
 * upstream emits.
 */
export function subscribeLive(
  listeners: {
    onEvent: LiveEventListener;
    onStatus: LiveStatusListener;
  },
  options: SubscribeOptions,
): LiveSubscription {
  const transport = options.transport ?? openTransport(options);
  let closed = false;

  function handle(event: Event) {
    if (closed) return;
    const messageEvent = event as MessageEvent;
    try {
      const text = String(messageEvent.data ?? '');
      const json = JSON.parse(text) as WireEvent;
      const parsed = parseEvent(json);
      if (parsed) listeners.onEvent(parsed);
    } catch {
      // ignore malformed messages
    }
  }

  function handleOpen() {
    if (closed) return;
    listeners.onStatus({ status: 'open' });
  }
  function handleClose() {
    if (closed) return;
    listeners.onStatus({ status: 'closed' });
  }
  function handleError() {
    if (closed) return;
    listeners.onStatus({ status: 'error' });
  }

  transport.addEventListener('message', handle);
  transport.addEventListener('open', handleOpen);
  transport.addEventListener('close', handleClose);
  transport.addEventListener('error', handleError);

  listeners.onStatus({ status: 'connecting' });

  return {
    push(event) {
      if (closed) return;
      listeners.onEvent(event);
    },
    setStatus(status) {
      if (closed) return;
      listeners.onStatus({ status });
    },
    close() {
      if (closed) return;
      closed = true;
      transport.removeEventListener('message', handle);
      transport.removeEventListener('open', handleOpen);
      transport.removeEventListener('close', handleClose);
      transport.removeEventListener('error', handleError);
      // Test transport may expose close(); the production WebSocket
      // also exposes close. Either is acceptable here.
      const t = transport as unknown as { close?: () => void };
      t.close?.();
    },
  };
}

function openTransport(options: SubscribeOptions): EventTarget & { close?: () => void } {
  if (typeof WebSocket === 'undefined') {
    return new EventTarget();
  }
  const baseUrl = options.baseUrl ?? resolveDefaultBase();
  const url = `${baseUrl}/v1/live/${encodeURIComponent(options.sessionId)}`;
  const ws = new WebSocket(url);
  return ws;
}

function resolveDefaultBase(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8094';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env['NEXT_PUBLIC_LIVE_HOST'] ?? 'localhost:8094';
  return `${protocol}//${host}`;
}

/** Reduce a sequence of events into the latest snapshot. */
export function reduceLiveEvents(
  events: ReadonlyArray<LiveEvent>,
  initial: LiveSnapshot = EMPTY_LIVE_SNAPSHOT,
): LiveSnapshot {
  return events.reduce<LiveSnapshot>((acc, event) => {
    switch (event.type) {
      case 'attendance':
        return { ...acc, attendance: event.data };
      case 'poll':
        return { ...acc, poll: event.data };
      case 'question':
        return { ...acc, question: event.data };
      case 'slide':
        return { ...acc, slide: event.data };
      case 'snapshot':
        return event.data;
    }
  }, initial);
}
