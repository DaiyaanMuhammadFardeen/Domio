import Link from 'next/link';

export default function HomePage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
  return (
    <main className="boot">
      <header className="boot__header">
        <div className="boot__logo" aria-hidden>
          ◉
        </div>
        <h1>Domio editor</h1>
        <p className="boot__phase">Phase 0 — Repository, contracts, dev environment</p>
      </header>

      <section className="boot__panel">
        <h2>Boot check</h2>
        <ul className="boot__checks">
          <li>
            <span aria-hidden>✓</span>
            Monorepo: pnpm workspaces + Turborepo
          </li>
          <li>
            <span aria-hidden>✓</span>
            Contracts: Protobuf, OpenAPI, JSON Schema committed
          </li>
          <li>
            <span aria-hidden>✓</span>
            Local infrastructure: Postgres, Redis, NATS, MinIO
          </li>
          <li>
            <span aria-hidden>✓</span>
            Observability: OTel, Prometheus, Grafana, Jaeger
          </li>
        </ul>
      </section>

      <section className="boot__panel">
        <h2>Verify the wire formats</h2>
        <p>
          The control plane is running at{' '}
          <a href={`${apiBase}/healthz`} target="_blank" rel="noreferrer">
            <code>{apiBase}/healthz</code>
          </a>{' '}
          and{' '}
          <a href={`${apiBase}/readyz`} target="_blank" rel="noreferrer">
            <code>{apiBase}/readyz</code>
          </a>
          . The placeholder deck endpoint is at{' '}
          <a
            href={`${apiBase}/v1/decks/local/local/demo-deck`}
            target="_blank"
            rel="noreferrer"
          >
            <code>{apiBase}/v1/decks/local/local/demo-deck</code>
          </a>
          .
        </p>
      </section>

      <section className="boot__panel">
        <h2>What ships in later phases</h2>
        <p>
          This page is the Phase 0 stub. The canvas editor, real deck
          schema, CRDT collab, theming, AI copilot, presenter, audience,
          sharing, analytics, and marketplace all land between Phase 02
          and Phase 22. See{' '}
          <Link href="/docs/development_phases/README.md">phase docs</Link>{' '}
          for the plan.
        </p>
      </section>

      <footer className="boot__footer">
        <small>
          Apache 2.0 ·{' '}
          <a
            href="https://github.com/DaiyaanMuhammadFardeen/Domio"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </small>
      </footer>
    </main>
  );
}