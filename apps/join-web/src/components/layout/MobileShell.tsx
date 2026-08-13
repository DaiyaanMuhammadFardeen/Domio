/**
 * @domio/join-web — mobile shell.
 *
 * Phase 16 W1. Constrains the layout to phone widths, exposes a
 * status bar, and reserves space for the WebSocket connection
 * indicator.
 */

'use client';

import type { ReactNode } from 'react';

export interface MobileShellProps {
  readonly title: string;
  readonly connectionStatus: 'connecting' | 'open' | 'closed';
  readonly children: ReactNode;
}

export function MobileShell(props: MobileShellProps) {
  const dotColor =
    props.connectionStatus === 'open'
      ? 'bg-green-500'
      : props.connectionStatus === 'connecting'
        ? 'bg-yellow-500'
        : 'bg-red-500';
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white shadow-sm p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold truncate">{props.title}</h1>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
          {props.connectionStatus}
        </span>
      </header>
      <div className="p-4">{props.children}</div>
    </main>
  );
}
