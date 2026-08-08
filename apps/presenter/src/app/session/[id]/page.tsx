import { PresenterView } from '../../../components/PresenterView';
import type { PairingInfo, PresenterSessionState } from '../../../runtime/types';

interface RouteParams {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ display?: string }>;
}

const PRESENTER_API = process.env.PRESENTER_API_BASE_URL ?? '';
const PHONE_PAIRING_API = process.env.PHONE_PAIRING_API_BASE_URL ?? '';

async function fetchSession(id: string): Promise<PresenterSessionState | null> {
  try {
    const res = await fetch(`${PRESENTER_API}/api/v1/presenter/sessions/${id}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PresenterSessionState;
  } catch { return null; }
}

async function fetchPairing(id: string): Promise<PairingInfo> {
  try {
    const res = await fetch(`${PHONE_PAIRING_API}/api/v1/presenter/sessions/${id}/pairing`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) return (await res.json()) as PairingInfo;
  } catch { /* fall through */ }
  // Pairing might not be available yet (no presenter runtime running).
  // Return a placeholder; the client will refetch on mount.
  return {
    token: '',
    deep_link: 'domio://pair?token=…',
    epoch: 0,
    expires_at_ms: Date.now() + 60_000,
    paired_devices: 0,
  };
}

export default async function PresenterSessionPage({ params, searchParams }: RouteParams) {
  const { id: sessionId } = await params;
  const sp = await searchParams;
  const initial = await fetchSession(sessionId);
  const pairing = await fetchPairing(sessionId);

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