import type { ReactElement } from 'react';

export type TimelineEntryKind =
  | 'local'
  | 'checkpoint'
  | 'branch-switch'
  | 'merge'
  | 'agent'
  | 'remote';
export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  timestamp: string;
  author: { id: string; name: string; avatarUrl?: string };
  label: string;
  thumbnailUrl?: string;
  revision?: number;
}
export interface TimelineProps {
  entries: TimelineEntry[];
  onGoToState?: (entry: TimelineEntry) => void;
}

export function Timeline({ entries, onGoToState }: TimelineProps): ReactElement {
  return (
    <section aria-label="History timeline" className="history-timeline">
      <h2>Timeline</h2>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id} data-kind={entry.kind}>
            <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
            <span className="history-timeline__author">
              {entry.author.avatarUrl ? (
                <img src={entry.author.avatarUrl} alt="" />
              ) : (
                <span aria-hidden="true">{entry.author.name.slice(0, 2).toUpperCase()}</span>
              )}{' '}
              {entry.author.name}
            </span>
            <strong>{entry.label}</strong>
            {entry.thumbnailUrl && <img src={entry.thumbnailUrl} alt={`${entry.label} preview`} />}
            {entry.revision != null && <small>r{entry.revision}</small>}
            <button type="button" onClick={() => onGoToState?.(entry)} disabled={!onGoToState}>
              Go to this state
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default Timeline;
