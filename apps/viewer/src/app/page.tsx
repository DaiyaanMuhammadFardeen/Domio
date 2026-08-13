/**
 * Viewer home — production landing.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Replaces the stubbed "Coming soon" page with a working entry point.
 * Author pastes a share token / deck id, hits open, and is routed to
 * `/{deckId}`. The recent-decks section is wired to localStorage so
 * authors get a deterministic, offline-friendly recent list.
 */

'use client';

import { useEffect, useState, type ReactElement } from 'react';

const RECENT_KEY = 'domio-viewer-recent';
const MAX_RECENT = 8;

interface RecentEntry {
  readonly deckId: string;
  readonly openedAt: number;
  readonly title?: string;
}

function readRecent(): readonly RecentEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentEntry =>
        typeof r === 'object' &&
        r !== null &&
        'deckId' in r &&
        typeof (r as RecentEntry).deckId === 'string',
    );
  } catch {
    return [];
  }
}

function writeRecent(entries: readonly RecentEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
  } catch {
    // ignore quota / serialization failures
  }
}

export default function ViewerHomePage(): ReactElement {
  const [deckId, setDeckId] = useState('');
  const [recent, setRecent] = useState<readonly RecentEntry[]>([]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  const open = (id: string): void => {
    const trimmed = id.trim();
    if (!trimmed) return;
    const next: RecentEntry[] = [
      { deckId: trimmed, openedAt: Date.now() },
      ...recent.filter((r) => r.deckId !== trimmed),
    ].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecent(next);
    window.location.href = `/${trimmed}`;
  };

  const clearRecent = (): void => {
    setRecent([]);
    writeRecent([]);
  };

  return (
    <main
      data-testid="viewer-home"
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        color: '#fff',
        background: '#000',
        minHeight: '100vh',
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Domio viewer</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          Read-only playback for shared decks, live sessions, and embedded presentations.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Open a deck</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            open(deckId);
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            placeholder="deck id or share token"
            aria-label="Deck id"
            data-testid="viewer-home-input"
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={!deckId.trim()}
            data-testid="viewer-home-open"
            style={{
              padding: '10px 20px',
              background: deckId.trim() ? '#1f6feb' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: deckId.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Open
          </button>
        </form>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Recent decks</h2>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={clearRecent}
              data-testid="viewer-home-clear-recent"
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Clear
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}
            data-testid="viewer-home-empty"
          >
            No recent decks yet. Open one above to populate this list.
          </p>
        ) : (
          <ul
            data-testid="viewer-home-recent"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {recent.map((r) => (
              <li key={r.deckId}>
                <button
                  type="button"
                  onClick={() => open(r.deckId)}
                  data-testid={`viewer-home-recent-${r.deckId}`}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.deckId}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {new Date(r.openedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
