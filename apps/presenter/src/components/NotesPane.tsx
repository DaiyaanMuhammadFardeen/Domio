'use client';

/**
 * NotesPane — speaker notes for the active slide.
 *
 * Notes are 200 ms-budget: the presenter-runtime subscribes to advance
 * events on the realtime channel and patches the notes here within the
 * budget. For the static (HTTP-only) path used here, the notes update
 * synchronously when the active slide changes.
 */

import type { SlideSnapshot } from '../runtime/types';

export interface NotesPaneProps {
  slide: SlideSnapshot | null;
  /** Optional streaming notes — appended live during presenter mode. */
  stream?: string;
}

export function NotesPane({ slide, stream }: NotesPaneProps) {
  if (!slide) {
    return (
      <div className="panel">
        <p className="panel__title">Notes</p>
        <p className="notes notes--empty">No slide selected.</p>
      </div>
    );
  }
  const notes = (slide.notes ?? '').trim();
  const live = (stream ?? '').trim();
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <p className="panel__title">Notes — slide {slide.slide_index + 1}</p>
      <div className="notes">
        {notes ? (
          <p style={{ margin: 0 }}>{notes}</p>
        ) : (
          <p className="notes--empty" style={{ margin: 0 }}>
            No notes for this slide.
          </p>
        )}
        {live && (
          <p style={{ marginTop: 12, color: 'var(--accent)', fontStyle: 'italic' }}>{live}</p>
        )}
      </div>
    </div>
  );
}
