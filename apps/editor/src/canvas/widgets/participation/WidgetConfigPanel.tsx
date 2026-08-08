'use client';

import type { AudienceWidgetDescriptor, AudienceWidgetType } from '@domio/audience-service';

export interface WidgetConfigPanelProps {
  readonly descriptor: AudienceWidgetDescriptor;
  readonly onChange: (next: Record<string, unknown>) => void;
}

export function WidgetConfigPanel(props: WidgetConfigPanelProps) {
  switch (props.descriptor.type) {
    case 'poll':
      return <PollConfig descriptor={props.descriptor} onChange={props.onChange} />;
    case 'word_cloud':
      return <WordCloudConfig descriptor={props.descriptor} onChange={props.onChange} />;
    case 'qa':
      return <QAConfig descriptor={props.descriptor} onChange={props.onChange} />;
    case 'quiz':
      return <QuizConfig descriptor={props.descriptor} onChange={props.onChange} />;
    default:
      return <GenericConfig descriptor={props.descriptor} onChange={props.onChange} />;
  }
}

function GenericConfig(props: WidgetConfigPanelProps) {
  return (
    <div className="p-3 border rounded bg-slate-50 text-sm text-slate-600" data-testid="widget-config">
      No configuration options for {props.descriptor.type}.
    </div>
  );
}

interface ConfigProps extends WidgetConfigPanelProps {}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
    ? (v as string[])
    : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function update(props: ConfigProps, key: string, value: unknown): void {
  const next = { ...(props.descriptor.payload as Record<string, unknown>), [key]: value };
  props.onChange(next);
}

function PollConfig(props: ConfigProps) {
  const p = props.descriptor.payload as { question?: string; options?: string[]; allow_multiple?: boolean };
  return (
    <div className="flex flex-col gap-2 p-3 border rounded bg-white" data-testid="widget-config-poll">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Question</span>
        <input
          className="border rounded p-2"
          value={asString(p.question, '')}
          onChange={(e) => update(props, 'question', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Options (one per line)</span>
        <textarea
          className="border rounded p-2 font-mono"
          rows={4}
          value={asStringArray(p.options, []).join('\n')}
          onChange={(e) => update(props, 'options', e.target.value.split('\n').filter((s) => s.length > 0))}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={asBool(p.allow_multiple, false)}
          onChange={(e) => update(props, 'allow_multiple', e.target.checked)}
        />
        Allow multiple selections
      </label>
    </div>
  );
}

function WordCloudConfig(props: ConfigProps) {
  const p = props.descriptor.payload as { prompt?: string; max_chars?: number; min_chars?: number };
  return (
    <div className="flex flex-col gap-2 p-3 border rounded bg-white" data-testid="widget-config-word-cloud">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Prompt</span>
        <input
          className="border rounded p-2"
          value={asString(p.prompt, '')}
          onChange={(e) => update(props, 'prompt', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Max chars per submission</span>
        <input
          type="number"
          className="border rounded p-2"
          min={1}
          max={120}
          value={asNumber(p.max_chars, 40)}
          onChange={(e) => update(props, 'max_chars', Number(e.target.value))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Min chars</span>
        <input
          type="number"
          className="border rounded p-2"
          min={1}
          max={20}
          value={asNumber(p.min_chars, 1)}
          onChange={(e) => update(props, 'min_chars', Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function QAConfig(props: ConfigProps) {
  const p = props.descriptor.payload as { anonymous?: boolean; max_question_length?: number; upvote_enabled?: boolean };
  return (
    <div className="flex flex-col gap-2 p-3 border rounded bg-white" data-testid="widget-config-qa">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={asBool(p.anonymous, false)}
          onChange={(e) => update(props, 'anonymous', e.target.checked)}
        />
        Anonymous
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={asBool(p.upvote_enabled, true)}
          onChange={(e) => update(props, 'upvote_enabled', e.target.checked)}
        />
        Allow upvotes
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Max question length</span>
        <input
          type="number"
          className="border rounded p-2"
          min={50}
          max={1000}
          value={asNumber(p.max_question_length, 280)}
          onChange={(e) => update(props, 'max_question_length', Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function QuizConfig(props: ConfigProps) {
  const p = props.descriptor.payload as { question?: string; choices?: string[]; correct_index?: number; time_limit_ms?: number };
  return (
    <div className="flex flex-col gap-2 p-3 border rounded bg-white" data-testid="widget-config-quiz">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Question</span>
        <input
          className="border rounded p-2"
          value={asString(p.question, '')}
          onChange={(e) => update(props, 'question', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Choices (one per line)</span>
        <textarea
          className="border rounded p-2 font-mono"
          rows={4}
          value={asStringArray(p.choices, []).join('\n')}
          onChange={(e) => update(props, 'choices', e.target.value.split('\n').filter((s) => s.length > 0))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Correct choice index (0-based)</span>
        <input
          type="number"
          className="border rounded p-2"
          min={0}
          max={10}
          value={asNumber(p.correct_index, 0)}
          onChange={(e) => update(props, 'correct_index', Number(e.target.value))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Time limit (ms)</span>
        <input
          type="number"
          className="border rounded p-2"
          min={5_000}
          max={300_000}
          step={5_000}
          value={asNumber(p.time_limit_ms, 30_000)}
          onChange={(e) => update(props, 'time_limit_ms', Number(e.target.value))}
        />
      </label>
    </div>
  );
}

export type { AudienceWidgetType };