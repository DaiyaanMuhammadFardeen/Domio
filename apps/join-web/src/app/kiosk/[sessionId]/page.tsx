/**
 * Kiosk route — `apps/join-web` venue-side entry.
 *
 * Per Wave 5 §S5.8 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * The route is intentionally minimal — `KioskSurface` is a client
 * component that owns the fullscreen / idle / auto-reset state. This
 * server component just resolves the dynamic `sessionId` param and
 * forwards it.
 *
 * The admin PIN defaults to `0000` for the kiosk surface in
 * dev/demo. Real deployments should plumb the PIN through a server
 * route that resolves it against the workspace's kiosk settings.
 */

import { KioskSurface } from '@/components/kiosk/KioskSurface';

interface KioskPageProps {
  readonly params: Promise<{ sessionId: string }>;
}

export default async function KioskPage({ params }: KioskPageProps) {
  const { sessionId } = await params;
  return <KioskSurface sessionId={sessionId} adminPin="0000" />;
}
