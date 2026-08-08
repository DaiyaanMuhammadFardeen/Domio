/**
 * @domio/join-web — widget renderer.
 *
 * Phase 16 W1. Renders any of the 8 widget types polymorphically.
 * Real implementations land in W4-W8; the renderer is the dispatch
 * surface.
 */

'use client';

import type { AudienceWidgetDescriptor } from '@domio/audience-service';

export interface WidgetRendererProps {
  readonly descriptor: AudienceWidgetDescriptor;
  readonly onSubmit?: ((payload: Record<string, unknown>) => void) | undefined;
  readonly disabled?: boolean | undefined;
}

export function WidgetRenderer(props: WidgetRendererProps) {
  const d = props.descriptor;
  switch (d.type) {
    case 'poll':
      return <PollWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'word_cloud':
      return <WordCloudWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'qa':
      return <QAWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'quiz':
      return <QuizWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'reaction':
      return <ReactionWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'nav_vote':
      return <NavVoteWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'sentiment':
      return <SentimentWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'raise_hand':
      return <RaiseHandWidget descriptor={d} onSubmit={props.onSubmit} disabled={props.disabled} />;
    default:
      return null;
  }
}

function GenericCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow p-4 mb-3" data-testid="widget-card">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{label}</h2>
      {children}
    </section>
  );
}

function PollWidget(props: WidgetRendererProps) {
  const opts = Array.isArray((props.descriptor.payload as { options?: unknown })?.options)
    ? ((props.descriptor.payload as { options: string[] }).options)
    : ['Yes', 'No'];
  return (
    <GenericCard label="Poll">
      <ul className="flex flex-col gap-2">
        {opts.map((opt) => (
          <li key={opt}>
            <button
              type="button"
              className="w-full text-left p-3 rounded border bg-white hover:bg-blue-50 disabled:opacity-50"
              disabled={props.disabled}
              onClick={() => props.onSubmit?.({ option: opt })}
              data-testid={`poll-option-${opt}`}
            >
              {opt}
            </button>
          </li>
        ))}
      </ul>
    </GenericCard>
  );
}

function WordCloudWidget(props: WidgetRendererProps) {
  return (
    <GenericCard label="Word cloud">
      <p className="text-sm text-slate-600">Type one or two words.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const fd = new FormData(form);
          const text = String(fd.get('text') || '').trim();
          if (text.length > 0 && text.length <= 40) {
            props.onSubmit?.({ text });
            form.reset();
          }
        }}
        className="mt-2 flex gap-2"
      >
        <input
          name="text"
          disabled={props.disabled}
          maxLength={40}
          className="flex-1 border rounded p-2"
          placeholder="word"
          data-testid="word-cloud-input"
        />
        <button type="submit" className="bg-blue-600 text-white rounded px-4" disabled={props.disabled}>
          Send
        </button>
      </form>
    </GenericCard>
  );
}

function QAWidget(props: WidgetRendererProps) {
  return (
    <GenericCard label="Ask a question">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const fd = new FormData(form);
          const q = String(fd.get('q') || '').trim();
          if (q.length > 0 && q.length <= 280) {
            props.onSubmit?.({ question: q });
            form.reset();
          }
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          name="q"
          maxLength={280}
          disabled={props.disabled}
          className="border rounded p-2"
          rows={3}
          placeholder="Your question"
          data-testid="qa-input"
        />
        <button type="submit" className="bg-blue-600 text-white rounded p-2" disabled={props.disabled}>
          Submit
        </button>
      </form>
    </GenericCard>
  );
}

function QuizWidget(props: WidgetRendererProps) {
  const choices = Array.isArray((props.descriptor.payload as { choices?: unknown })?.choices)
    ? ((props.descriptor.payload as { choices: string[] }).choices)
    : ['A', 'B', 'C', 'D'];
  return (
    <GenericCard label="Quiz">
      <ul className="grid grid-cols-2 gap-2">
        {choices.map((c) => (
          <li key={c}>
            <button
              type="button"
              className="w-full p-3 rounded border bg-white hover:bg-blue-50 disabled:opacity-50"
              disabled={props.disabled}
              onClick={() => props.onSubmit?.({ choice: c })}
              data-testid={`quiz-choice-${c}`}
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
    </GenericCard>
  );
}

function ReactionWidget(props: WidgetRendererProps) {
  return (
    <GenericCard label="React">
      <div className="flex gap-2 text-3xl">
        {['👍', '❤️', '👏', '🎉', '🤔', '👀'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="hover:scale-125 transition-transform disabled:opacity-50"
            disabled={props.disabled}
            onClick={() => props.onSubmit?.({ emoji })}
            data-testid={`reaction-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </GenericCard>
  );
}

function NavVoteWidget(props: WidgetRendererProps) {
  const targets = Array.isArray((props.descriptor.payload as { targets?: unknown })?.targets)
    ? ((props.descriptor.payload as { targets: string[] }).targets)
    : ['Back', 'Forward'];
  return (
    <GenericCard label="Where to next?">
      <div className="flex gap-2">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            className="flex-1 p-3 rounded border bg-white disabled:opacity-50"
            disabled={props.disabled}
            onClick={() => props.onSubmit?.({ target: t })}
            data-testid={`nav-${t}`}
          >
            {t}
          </button>
        ))}
      </div>
    </GenericCard>
  );
}

function SentimentWidget(props: WidgetRendererProps) {
  return (
    <GenericCard label="How is it going?">
      <div className="flex justify-between">
        {['😀', '🙂', '😐', '😕', '😟'].map((face) => (
          <button
            key={face}
            type="button"
            className="text-3xl hover:scale-125 transition-transform disabled:opacity-50"
            disabled={props.disabled}
            onClick={() => props.onSubmit?.({ face })}
            data-testid={`sentiment-${face}`}
          >
            {face}
          </button>
        ))}
      </div>
    </GenericCard>
  );
}

function RaiseHandWidget(props: WidgetRendererProps) {
  return (
    <GenericCard label="Raise hand">
      <button
        type="button"
        className="w-full p-4 rounded border bg-yellow-50 hover:bg-yellow-100 disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => props.onSubmit?.({ raised: true })}
        data-testid="raise-hand"
      >
        ✋ I have something to say
      </button>
    </GenericCard>
  );
}