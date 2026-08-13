/**
 * DemoTile — single card in the gallery grid (S12.6).
 *
 * Renders the demo's title, description, embed iframe, tag list, and
 * the "Open in editor" CTA. The CTA links to the editor URL with a
 * `target="_blank"` so existing tabs aren't lost mid-onboarding.
 */

import type { JSX } from 'react';
import type { DemoEntry } from '../../lib/demo-data';
import { DemoEmbed } from './DemoEmbed';

export interface DemoTileProps {
  readonly demo: DemoEntry;
  readonly openLabel: string;
}

export function DemoTile({ demo, openLabel }: DemoTileProps): JSX.Element {
  return (
    <article
      className="demo-tile"
      data-testid="demo-tile"
      data-demo-id={demo.id}
      aria-labelledby={`demo-tile-${demo.id}-title`}
    >
      <header className="demo-tile__header">
        <h3 id={`demo-tile-${demo.id}-title`} className="demo-tile__title">
          {demo.title}
        </h3>
        <ul className="demo-tile__tags" aria-label="Tags">
          {demo.tags.map((tag) => (
            <li key={tag} className="demo-tile__tag">
              {tag}
            </li>
          ))}
        </ul>
      </header>
      <p className="demo-tile__description">{demo.description}</p>
      <DemoEmbed viewerUrl={demo.viewer_url} title={demo.title} thumbnailAlt={demo.thumbnail_alt} />
      <footer className="demo-tile__footer">
        <a
          className="demo-tile__cta"
          data-testid="demo-tile-cta"
          href={demo.editor_url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {openLabel} ↗
        </a>
        <a
          className="demo-tile__viewer-link"
          href={demo.viewer_url}
          rel="noopener noreferrer"
          target="_blank"
          aria-label={`Open viewer for ${demo.title} in a new tab`}
        >
          {demo.viewer_url}
        </a>
      </footer>
    </article>
  );
}

export default DemoTile;
