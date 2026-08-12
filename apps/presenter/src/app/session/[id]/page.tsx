import { PresenterView } from '../../../components/PresenterView';
import { fetchPairingForSsr, fetchSessionForSsr } from '../../../lib/session-loader';

interface RouteParams {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ display?: string }>;
}

const PRESENTER_API = process.env.PRESENTER_API_BASE_URL ?? '';

export default async function PresenterSessionPage({ params, searchParams }: RouteParams) {
  const { id: sessionId } = await params;
  const sp = await searchParams;
  const initial = await fetchSessionForSsr(sessionId);
  const pairing = await fetchPairingForSsr(sessionId);

  if (!initial) {
    return (
      <main className="boot">
        <section className="boot__panel">
          <h2>Session not found</h2>
          <p>
            Session <code>{sessionId}</code> could not be loaded. Make sure the
            presenter-session service is running and the id is correct.
          </p>
          {sp.display === 'secondary' && (
            <p style={{ marginTop: 12 }}>
              <em>Tip:</em> the <code>?display=secondary</code> flag is a hint
              to the runtime — when running on a dual-screen setup, open this
              URL on the secondary display.
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <PresenterView
      sessionId={sessionId}
      initialState={initial}
      initialPairing={pairing}
      apiBaseUrl={PRESENTER_API}
    />
  );
}
