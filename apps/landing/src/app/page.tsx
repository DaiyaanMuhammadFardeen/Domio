export default function LandingHomePage() {
  return (
    <main>
      <header>
        <h1>Domio</h1>
        <p>Interactive decks, shared sessions, and live presentations.</p>
      </header>
      <section>
        <h2>What you can do with Domio</h2>
        <ul>
          <li>
            <strong>Editor</strong> — Build reactive decks with live data sources,
            branching flows, and brand-aware copy.
          </li>
          <li>
            <strong>Presenter</strong> — Drive live sessions with audience prompts,
            hand-offs, and offline-friendly rehearsals.
          </li>
          <li>
            <strong>Viewer &amp; Join</strong> — Read-only playback and lightweight
            audience participation, embeddable anywhere.
          </li>
        </ul>
      </section>
      <section>
        <h2>For builders</h2>
        <p>
          See the repository README for setup instructions, the contracts/
          directory for the API surface, and the SDK packages under packages/
          for the typed clients apps consume.
        </p>
      </section>
    </main>
  );
}
