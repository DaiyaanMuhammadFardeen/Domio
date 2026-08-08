import Link from 'next/link';

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
          The presenter runtime renders the current slide, next slide, speaker
          notes, an elapsed/remaining timer, an audience preview, and a QR
          pairing code on the secondary display. Enter a session id to
          hydrate the view.
        </p>
        <ul className="boot__list">
          <li>
            <Link href="/session/demo">Open demo session</Link>
          </li>
          <li>
            <Link href="/session/demo?display=secondary">
              Open on secondary display
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}