export default function ViewerHomePage() {
  return (
    <main>
      <header>
        <h1>Domio viewer</h1>
        <p>Read-only playback for shared decks and live sessions.</p>
      </header>
      <section>
        <h2>Open a deck</h2>
        <p>
          Paste a public deck link or open a share token to start playback.
          Embedded decks render in-place; live shared sessions subscribe to
          the presenter&apos;s current slide and follow audience prompts.
        </p>
        <p>
          The viewer never exposes the editing surface; it&apos;s the same
          playback engine the embed proxy serves to third-party sites.
        </p>
      </section>
      <section>
        <h2>Recent decks</h2>
        <p>No recent decks yet. Open one from a share link to populate this list.</p>
      </section>
    </main>
  );
}
