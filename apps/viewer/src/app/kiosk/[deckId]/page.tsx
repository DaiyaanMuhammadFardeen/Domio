/**
 * `/kiosk/[deckId]` — kiosk mode for trade-show booths.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Server route: resolves the deck and hands it to a client-side
 * `KioskClient` that handles fullscreen, cursor-hide, idle-reset,
 * touch gestures, and the admin PIN exit flow.
 *
 * i18n strings are loaded on the server from the bundled `messages/en.json`
 * so the kiosk display is reachable without a network round-trip.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { fetchViewerDeck } from '../../../lib/deck-service';
import enMessages from '../../../../messages/en.json';
import { KioskClient } from './KioskClient';

export interface KioskPageProps {
  readonly params: Promise<{ deckId: string }>;
}

type KioskStrings = {
  readonly heading: string;
  readonly tapAdvance: string;
  readonly tapBack: string;
  readonly longPress: string;
  readonly idleReset: string;
  readonly paused: string;
  readonly exitHeading: string;
  readonly exitPrompt: string;
  readonly exitSubmit: string;
  readonly exitCancel: string;
  readonly exitInvalid: string;
  readonly exitSuccess: string;
};

function readKioskStrings(): KioskStrings {
  const m = enMessages as Record<string, string>;
  return {
    heading: m['viewer.kiosk.heading'] ?? 'Kiosk mode',
    tapAdvance: m['viewer.kiosk.tap.advance'] ?? 'Tap right to advance',
    tapBack: m['viewer.kiosk.tap.back'] ?? 'Tap left to go back',
    longPress: m['viewer.kiosk.longPress'] ?? 'Long-press to pause',
    idleReset: m['viewer.kiosk.idleReset'] ?? 'Resets in {sec}s',
    paused: m['viewer.kiosk.paused'] ?? 'Paused',
    exitHeading: m['viewer.kiosk.exitPin.heading'] ?? 'Exit kiosk mode',
    exitPrompt: m['viewer.kiosk.exitPin.prompt'] ?? 'Enter admin PIN',
    exitSubmit: m['viewer.kiosk.exitPin.submit'] ?? 'Submit',
    exitCancel: m['viewer.kiosk.exitPin.cancel'] ?? 'Cancel',
    exitInvalid: m['viewer.kiosk.exitPin.invalid'] ?? 'Invalid PIN',
    exitSuccess: m['viewer.kiosk.exitPin.success'] ?? 'PIN accepted — exiting kiosk mode',
  };
}

export async function generateMetadata({ params }: KioskPageProps): Promise<Metadata> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  return {
    title: `${deck.title} · Kiosk`,
    description: `Kiosk-mode playback for ${deck.title}.`,
    robots: 'noindex,nofollow',
  };
}

export default async function KioskDeckPage({ params }: KioskPageProps): Promise<ReactElement> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  const strings = readKioskStrings();
  return (
    <KioskClient
      deck={deck}
      heading={strings.heading}
      tapAdvance={strings.tapAdvance}
      tapBack={strings.tapBack}
      longPressLabel={strings.longPress}
      idleResetLabel={strings.idleReset}
      pausedLabel={strings.paused}
      exitHeading={strings.exitHeading}
      exitPrompt={strings.exitPrompt}
      exitSubmit={strings.exitSubmit}
      exitCancel={strings.exitCancel}
      exitInvalid={strings.exitInvalid}
      exitSuccess={strings.exitSuccess}
      dataTestId={`kiosk-${deckId}`}
    />
  );
}
