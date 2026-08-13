'use client';

/**
 * WhisperPanel — presenter-only overlay (W15).
 *
 * Shows a stack of whisper messages (text the presenter can read but
 * the audience never sees) plus a composer. The panel is fixed to the
 * right edge and dismissable. The whisper channel is gated by the
 * `presenter_only` display profile (W14) — Recording profile suppresses
 * it; Standard + Stage show it.
 */

import { useEffect, useRef, useState } from 'react';
import { WhisperClient, type WhisperMessage } from '../../runtime/whisper/whisper-client';

export interface WhisperPanelProps {
  sessionId: string;
  presenterId: string;
  client?: WhisperClient;
}

export function WhisperPanel({ sessionId, presenterId, client }: WhisperPanelProps) {
  const c = useRef<WhisperClient>(client ?? new WhisperClient()).current;
  const [messages, setMessages] = useState<WhisperMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = c.subscribe(() => setMessages(c.snapshot()));
    setMessages(c.snapshot());
    return unsub;
  }, [c]);

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    const now = Date.now();
    c.publish({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      session_id: sessionId,
      author_id: presenterId,
      author_display_name: 'Presenter',
      text,
      expires_at_ms: now + 5 * 60_000,
      ts_ms: now,
    });
    setDraft('');
  };

  if (!open) {
    return (
      <button
        type="button"
        className="whisper-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open whisper panel"
      >
        🤫 Whisper
      </button>
    );
  }

  return (
    <aside className="whisper-panel" aria-label="Whisper channel">
      <header className="whisper-panel__header">
        <span className="whisper-panel__title">Whisper</span>
        <button
          type="button"
          className="whisper-panel__close"
          onClick={() => setOpen(false)}
          aria-label="Close whisper"
        >
          ✕
        </button>
      </header>
      <ul className="whisper-panel__list">
        {messages.length === 0 && <li className="whisper-panel__empty">No whispers yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className="whisper-panel__row">
            <span className="whisper-panel__author">{m.author_display_name ?? m.author_id}</span>
            <span className="whisper-panel__text">{m.text}</span>
            <span className="whisper-panel__time">{new Date(m.ts_ms).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
      <div className="whisper-panel__composer">
        <input
          type="text"
          className="whisper-panel__input"
          placeholder="Whisper to the presenter view…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button type="button" className="whisper-panel__send" onClick={onSend}>
          Send
        </button>
      </div>
    </aside>
  );
}
