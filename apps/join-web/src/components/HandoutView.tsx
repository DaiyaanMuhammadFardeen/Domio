/**
 * @domio/join-web — HandoutView.
 *
 * Per Wave 5 §S5.3 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Pure presentational component for a personalized handout descriptor:
 * session title, attended slide list, notes, CTA, and a PDF download
 * button when the handout-generator service exposed a PDF URL.
 */

'use client';

import type { ReactElement } from 'react';
import type { HandoutDescriptor } from '@/lib/handout-service';

export interface HandoutViewProps {
  readonly descriptor: HandoutDescriptor;
  readonly onDownloadPdf?: (() => void) | undefined;
  readonly dataTestId?: string;
}

export function HandoutView({
  descriptor,
  onDownloadPdf,
  dataTestId = 'handout-view',
}: HandoutViewProps): ReactElement {
  const slides = descriptor.attended_slides;
  const cta = descriptor.call_to_action;
  const hasPdf = Boolean(descriptor.pdf_url) || Boolean(onDownloadPdf);
  return (
    <article
      data-testid={dataTestId}
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">Your handout</p>
        <h2 className="text-xl font-semibold text-slate-900" data-testid="handout-title">
          {descriptor.session_title || 'Untitled session'}
        </h2>
        <p className="text-sm text-slate-600">
          Presented by{' '}
          <span className="font-medium" data-testid="handout-presenter">
            {descriptor.presenter_display_name || 'Unknown presenter'}
          </span>
        </p>
      </header>

      <section data-testid="handout-attended-slides" className="flex flex-col gap-2">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Slides you attended</h3>
          <span className="text-xs text-slate-500" data-testid="handout-attended-count">
            {slides.length}
          </span>
        </header>
        {slides.length === 0 ? (
          <p className="text-sm text-slate-500">No slide activity recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {slides.map((slide) => (
              <li
                key={slide.slide_id}
                className="flex items-baseline gap-2 border-b border-slate-100 pb-1"
                data-testid={`handout-slide-${slide.index}`}
              >
                <span className="text-xs font-mono text-slate-400 w-6">{slide.index}</span>
                <span className="text-sm text-slate-800">{slide.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="handout-notes" className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-slate-700">Personalized notes</h3>
        {descriptor.notes.trim().length > 0 ? (
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{descriptor.notes}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">No personal notes were captured.</p>
        )}
      </section>

      <footer className="flex flex-col gap-2">
        {cta ? (
          <a
            href={cta.href}
            data-testid="handout-cta"
            className={
              cta.variant === 'primary'
                ? 'bg-blue-600 text-white rounded p-3 text-center font-medium'
                : 'bg-slate-100 text-slate-800 rounded p-3 text-center font-medium border border-slate-300'
            }
          >
            {cta.label}
          </a>
        ) : null}
        {hasPdf ? (
          <button
            type="button"
            onClick={() => onDownloadPdf?.()}
            data-testid="handout-download-pdf"
            className="bg-slate-900 text-white rounded p-3 text-center font-medium disabled:opacity-50"
            disabled={!onDownloadPdf && !descriptor.pdf_url}
          >
            Download PDF
          </button>
        ) : null}
      </footer>
    </article>
  );
}
