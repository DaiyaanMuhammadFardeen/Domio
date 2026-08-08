/**
 * /live — HUD-style page.
 *
 * Subscribes to the live-analytics graphql-ws endpoint and renders
 * concurrent viewers, current slide, and recent reactions in real
 * time. Client component because of the WebSocket.
 */

'use client';

import { useEffect, useState } from 'react';
import { createClient } from 'graphql-ws';
import { Activity, Eye, MessageSquare } from 'lucide-react';

const LIVE_URL =
  typeof window !== 'undefined'
    ? window.location.protocol === 'https:'
      ? `wss://${process.env['NEXT_PUBLIC_LIVE_HOST'] ?? 'localhost:8094'}/v1/live`
      : `ws://${process.env['NEXT_PUBLIC_LIVE_HOST'] ?? 'localhost:8094'}/v1/live`
    : 'ws://localhost:8094/v1/live';

interface PulseData {
  sessionId: string;
  concurrentViewers: number;
  currentSlide: string | null;
  recentReactions: string[];
  lastEventMs: number;
}

const SUBSCRIPTION = /* GraphQL */ `
  subscription LivePulse($sessionId: String!) {
    livePulse(sessionId: $sessionId) {
      sessionId
      concurrentViewers
      currentSlide
      recentReactions
      lastEventMs
    }
  }
`;

export default function LivePage() {
  const [sessionId, setSessionId] = useState('session-demo');
  const [data, setData] = useState<PulseData | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>(
    'connecting',
  );

  useEffect(() => {
    const client = createClient({
      url: LIVE_URL,
      lazy: true,
      retryAttempts: 0,
    });

    const dispose = client.subscribe(
      { query: SUBSCRIPTION, variables: { sessionId } },
      {
        next: ({ data: payload }) => {
          if (payload?.livePulse) {
            setData(payload.livePulse as PulseData);
            setStatus('open');
          }
        },
        error: () => setStatus('error'),
        complete: () => setStatus('closed'),
      },
    );

    return () => {
      dispose();
    };
  }, [sessionId]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Live HUD</h1>
        <p className="text-sm text-slate-500">
          Streaming concurrent viewers and reactions
        </p>
      </header>

      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const value = (form.elements.namedItem('sessionId') as HTMLInputElement).value;
          if (value) setSessionId(value);
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Session
          </span>
          <input
            name="sessionId"
            defaultValue={sessionId}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Subscribe
        </button>
        <span
          className={`ml-2 inline-flex items-center gap-1 text-xs ${
            status === 'open' ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          <Activity className="h-3 w-3" /> {status}
        </span>
      </form>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          icon={<Eye className="h-4 w-4" />}
          label="Concurrent viewers"
          value={data?.concurrentViewers?.toLocaleString() ?? '—'}
        />
        <Tile
          icon={<Activity className="h-4 w-4" />}
          label="Current slide"
          value={data?.currentSlide ?? '—'}
        />
        <Tile
          icon={<MessageSquare className="h-4 w-4" />}
          label="Recent reactions"
          value={(data?.recentReactions ?? []).slice(-5).join(' · ') || '—'}
        />
      </section>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}