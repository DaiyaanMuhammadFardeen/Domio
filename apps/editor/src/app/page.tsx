import Link from 'next/link';
import { editor } from '@domio/ui/routing';
import { fetchDeckList } from '../lib/deck-service';

/**
 * Editor home — replaces the Phase 0 boot stub.
 *
 * Renders three sections:
 *   1. Workspace header
 *   2. Deck list (live from the control plane; falls back to a single
 *      "Demo deck" entry if the API is unreachable)
 *   3. Feature catalogue — one card per editor panel that exists today,
 *      each linking to /editor/demo?panel=<id>
 *
 * Server component so the deck list is fetched at request time, never
 * cached. Unknown `panel` ids are simply ignored by EditorRoot, so this
 * catalogue never 404s.
 */

const WORKSPACE_ID = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';

/** Catalog of every panel currently mounted in EditorRoot. */
const FEATURE_CATALOGUE: Array<{ id: string; label: string; group: string }> = [
  // Core editing
  { id: 'layers', label: 'Layers', group: 'Core' },
  { id: 'insert', label: 'Insert', group: 'Core' },
  { id: 'theme-brand', label: 'Theme & brand', group: 'Core' },
  { id: 'library', label: 'Library', group: 'Core' },
  { id: 'stickers', label: 'Stickers', group: 'Core' },

  // Data
  { id: 'data-sources', label: 'Data sources', group: 'Data' },
  { id: 'filters', label: 'Filters', group: 'Data' },
  { id: 'variables', label: 'Variables', group: 'Data' },
  { id: 'state-inspector', label: 'State inspector', group: 'Data' },

  // Interaction
  { id: 'animations', label: 'Animations', group: 'Interaction' },
  { id: 'connections', label: 'Connections / hotspots', group: 'Interaction' },
  { id: 'deep-links', label: 'Deep links', group: 'Interaction' },

  // Audience
  { id: 'm6-quizzes', label: 'Quizzes', group: 'Audience' },
  { id: 'm6-leaderboard', label: 'Leaderboard', group: 'Audience' },
  { id: 'm6-sequence', label: 'Sequence inspector', group: 'Audience' },
  { id: 'm11-media', label: 'Media', group: 'Audience' },
  { id: 'm11-recording', label: 'Recording', group: 'Audience' },

  // Collaboration & sharing
  { id: 'm11-licenses', label: 'License dashboard', group: 'Collaboration' },
  { id: 'marketplace', label: 'Marketplace', group: 'Collaboration' },
  { id: 'p12-copilot', label: 'Outline approval (copilot)', group: 'Collaboration' },

  // Agentic / debug
  { id: 'm8-audit', label: 'Audit trail', group: 'Agentic' },
  { id: 'm8-nl-patch', label: 'NL patch', group: 'Agentic' },
  { id: 'm8-deck-diff', label: 'Deck diff', group: 'Agentic' },
];

function formatTimestamp(ms: number | null): string {
  if (ms === null) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export default async function EditorHomePage() {
  const { decks, live } = await fetchDeckList(WORKSPACE_ID);

  // Group features by their section label.
  const groups = new Map<string, Array<{ id: string; label: string; group: string }>>();
  for (const f of FEATURE_CATALOGUE) {
    const arr = groups.get(f.group) ?? [];
    arr.push(f);
    groups.set(f.group, arr);
  }

  return (
    <main className="editor-home">
      <header className="editor-home__header">
        <h1>Domio editor</h1>
        <p className="editor-home__workspace">
          Workspace <code>{WORKSPACE_ID}</code>
          {!live && (
            <span className="editor-home__badge" title="API unreachable; showing fallback deck list">
              offline
            </span>
          )}
        </p>
      </header>

      <section className="editor-home__section">
        <div className="editor-home__section-header">
          <h2>Your decks</h2>
          <Link href={editor('demo')} className="editor-home__demo-btn">
            Open demo deck →
          </Link>
        </div>
        {decks.length === 0 ? (
          <p className="editor-home__empty">No decks yet.</p>
        ) : (
          <ul className="editor-home__deck-list">
            {decks.map((d) => (
              <li key={d.id} className="editor-home__deck-card">
                <Link href={editor(d.id)} className="editor-home__deck-link">
                  <div className="editor-home__deck-thumb" aria-hidden>
                    {d.thumbnail ? (
                      <img src={d.thumbnail} alt="" />
                    ) : (
                      <span>{d.title.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="editor-home__deck-meta">
                    <span className="editor-home__deck-title">{d.title}</span>
                    <span className="editor-home__deck-id">{d.id}</span>
                    <span className="editor-home__deck-time">
                      Last modified {formatTimestamp(d.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="editor-home__section">
        <h2>Open the editor with a panel pre-selected</h2>
        <p className="editor-home__hint">
          Each card opens the demo deck with that panel already active on the left rail.
        </p>
        {[...groups.entries()].map(([groupName, items]) => (
          <div key={groupName} className="editor-home__group">
            <h3>{groupName}</h3>
            <div className="editor-home__feature-grid">
              {items.map((f) => (
                <Link
                  key={f.id}
                  href={editor('demo', { panel: f.id })}
                  className="editor-home__feature"
                >
                  <span className="editor-home__feature-label">{f.label}</span>
                  <code className="editor-home__feature-id">{f.id}</code>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}