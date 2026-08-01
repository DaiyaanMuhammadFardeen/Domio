import type { ReactElement } from 'react';
import type { TimelineEntry } from './timeline.js';

export interface RemoteEntryProps {
  entry: TimelineEntry;
  onGoToState?: (entry: TimelineEntry) => void;
}

/** A timeline row for an operation authored by another collaborator or agent. */
export function RemoteEntry({ entry, onGoToState }: RemoteEntryProps): ReactElement {
  return <article aria-label={`Remote history entry: ${entry.label}`} className="remote-entry"><span>{entry.author.avatarUrl ? <img src={entry.author.avatarUrl} alt="" /> : entry.author.name.slice(0, 2).toUpperCase()}</span><div><strong>{entry.label}</strong><p>{entry.author.name} · <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></p></div>{entry.thumbnailUrl && <img src={entry.thumbnailUrl} alt="Remote change preview" />}<button type="button" onClick={() => onGoToState?.(entry)} disabled={!onGoToState}>Go to state</button></article>;
}

export default RemoteEntry;
