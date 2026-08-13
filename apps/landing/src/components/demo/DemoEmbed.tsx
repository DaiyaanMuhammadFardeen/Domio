/**
 * DemoEmbed — responsive iframe wrapper around a viewer URL.
 *
 * S12.6. Renders the demo's `viewer_url` inside a sandboxed iframe sized
 * with a 16:9 aspect ratio so the gallery stays tidy regardless of the
 * viewer's natural dimensions. The thumbnail_alt text surfaces as the
 * iframe title so screen readers and accessibility tooling have a
 * meaningful label.
 */

import type { JSX } from 'react';

export interface DemoEmbedProps {
  readonly viewerUrl: string;
  readonly title: string;
  readonly thumbnailAlt: string;
}

export function DemoEmbed({
  viewerUrl,
  title,
  thumbnailAlt,
}: DemoEmbedProps): JSX.Element {
  return (
    <div className="demo-embed" data-testid="demo-embed">
      <iframe
        className="demo-embed__frame"
        src={viewerUrl}
        title={`${title} — ${thumbnailAlt}`}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        allow="fullscreen; clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default DemoEmbed;