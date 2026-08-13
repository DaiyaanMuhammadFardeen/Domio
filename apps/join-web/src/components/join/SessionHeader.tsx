/**
 * @domio/join-web — SessionHeader.
 *
 * Wave 5 §S5.1: once a user has joined, the join surface collapses into
 * a session header that surfaces the joined code, the user's display
 * name, the active slide title, and a placeholder thumb. The actual
 * widgets render below in the parent screen.
 */

'use client';

import type { ReactNode } from 'react';

export interface SessionHeaderProps {
  readonly sessionCode: string;
  readonly displayName: string;
  readonly slideTitle: string;
  readonly slideIndex: number;
  readonly totalSlides: number;
  readonly children?: ReactNode;
}

export function SessionHeader(props: SessionHeaderProps) {
  return (
    <section
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-3"
      data-testid="session-header"
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Joined as
          </span>
          <span
            className="text-base font-medium text-slate-900"
            data-testid="session-header-display-name"
          >
            {props.displayName}
          </span>
        </div>
        <div
          className="font-mono text-2xl tracking-widest text-slate-900"
          data-testid="session-header-code"
        >
          {props.sessionCode}
        </div>
      </div>
      <div
        className="slide-thumb bg-slate-100 rounded-md flex items-center justify-center h-32 text-slate-400 text-sm"
        data-testid="session-header-slide-thumb"
      >
        Slide preview
      </div>
      <div className="flex items-baseline justify-between">
        <h2
          className="text-lg font-semibold truncate"
          data-testid="session-header-slide-title"
        >
          {props.slideTitle}
        </h2>
        <span
          className="text-sm text-slate-500 ml-2 shrink-0"
          data-testid="session-header-slide-index"
        >
          {props.slideIndex} / {props.totalSlides}
        </span>
      </div>
      {props.children ? (
        <div className="widget-area pt-2" data-testid="session-header-widget-area">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}