/**
 * @domio/participant-session — presenter lookup adapter.
 *
 * Phase 16 W1. Wraps the cross-service call from audience to
 * presenter. In production this calls the presenter-session service
 * over the in-process bus; in tests it's stubbed via
 * {@link ParticipantSessionServiceOptions.presenterLookup}.
 *
 * `AudienceSnapshot` is the minimal projection the audience needs —
 * current slide id, ended-at, presenter display name, title.
 */

import type { AudienceSnapshot, SessionCode } from '@domio/audience-service';

export type { AudienceSnapshot };

export class AudienceSessionNotFoundError extends Error {
  readonly status = 404;
  constructor(public readonly code: string) {
    super(`audience session not found: ${code}`);
    this.name = 'AudienceSessionNotFoundError';
  }
}

export class AudienceSessionEndedError extends Error {
  readonly status = 410;
  constructor(public readonly code: string) {
    super(`audience session has ended: ${code}`);
    this.name = 'AudienceSessionEndedError';
  }
}

/** Resolve a snapshot from a presenter-session record. The presenter
 *  service is expected to export a row with the same shape as
 *  `PresenterSession`; we only read the public fields here. */
export function snapshotFromPresenter(row: {
  id: string;
  ended_at: string | null;
  state: { slide_id: string | null };
  presenter_id: string;
  workspace_id: string;
  deck_id: string;
  started_at: string;
}, code: SessionCode): AudienceSnapshot {
  if (row.ended_at) {
    throw new AudienceSessionEndedError(code);
  }
  return {
    session_id: row.id,
    ended_at: row.ended_at,
    current_slide_id: row.state.slide_id,
    presenter_display_name: row.presenter_id, // presenter_id is opaque; UI substitutes display name from a separate join.
    title: row.deck_id,
  };
}