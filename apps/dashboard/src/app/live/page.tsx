/**
 * /live — HUD-style page.
 *
 * Per Wave 7 §S7.7 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Full WS-driven HUD (LiveHUD) replaces the legacy static card.
 *   - Attendance / poll participation / question volume /
 *     current slide / time-in-slide / attention score.
 *   - Overlay toggle for the audience display.
 *   - SuspenseBoundary + WS subscription from
 *     `live-analytics-service`.
 */

'use client';

import { SuspenseBoundary } from '@domio/ui';
import { useState } from 'react';
import { LiveHUD } from '../../components/LiveHUD';
import { CrossLinksFooter } from '../../components/CrossLinksFooter';

export default function LivePage() {
  const [sessionId, setSessionId] = useState('session-demo');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Live HUD</h1>
        <p className="text-sm text-slate-500">
          Streaming concurrent viewers and reactions
        </p>
      </header>

      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const value = (form.elements.namedItem('sessionId') as HTMLInputElement).value;
          if (value) setSessionId(value);
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Session
          </span>
          <input
            name="sessionId"
            defaultValue={sessionId}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Subscribe
        </button>
      </form>

      <SuspenseBoundary>
        <LiveHUD sessionId={sessionId} />
      </SuspenseBoundary>
      <CrossLinksFooter nodeId="doc.dashboard.live" />
    </div>
  );
}