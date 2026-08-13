import Link from 'next/link';
import { presenter, dashboard } from '@domio/ui/routing';

export default function PresenterHomePage() {
  return (
    <main className="boot">
      <header className="boot__header">
        <h1>Domio presenter</h1>
        <p className="boot__phase">Phase 15 W2 — Presenter view shell</p>
      </header>
      <section className="boot__panel">
        <h2>Open a session</h2>
        <p>
          The presenter runtime renders the current slide, next slide, speaker notes, an
          elapsed/remaining timer, an audience preview, and a QR pairing code on the secondary
          display. Enter a session id to hydrate the view.
        </p>
        <ul className="boot__list">
          <li>
            <Link href={presenter('demo')}>Open demo session</Link>
          </li>
          <li>
            <Link href={`${presenter('demo')}?display=secondary`}>Open on secondary display</Link>
          </li>
        </ul>
      </section>
      <section className="boot__panel">
        <h2>Share a session</h2>
        <p>
          Generate presenter share links and pair codes from the dashboard — every session lives
          there.
        </p>
        <p>
          <Link href={dashboard('deck')}>Get a share link from the dashboard →</Link>
        </p>
      </section>
    </main>
  );
}
