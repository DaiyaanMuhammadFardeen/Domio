/**
 * SamplePlugin — surfaces the public `domio/plugin-template`
 * repository. Renders the README excerpt, the GitHub link, and a
 * one-click ZIP download button.
 *
 * The ZIP URL is derived from the same `SAMPLE_PLUGIN_REPO_URL`
 * exported by the data module so the buttons stay in sync.
 */

import type { ReactElement } from 'react';
import { SAMPLE_PLUGIN_REPO_URL, SAMPLE_PLUGIN_ZIP_URL } from '../../lib/plugin-sdk-data';

export interface SamplePluginProps {
  heading: string;
  downloadLabel: string;
  repoLabel: string;
  readmeExcerpt: string;
  fileTree: ReadonlyArray<string>;
}

export function SamplePlugin({
  heading,
  downloadLabel,
  repoLabel,
  readmeExcerpt,
  fileTree,
}: SamplePluginProps): ReactElement {
  return (
    <section className="psdk-section" aria-labelledby="psdk-sample-heading">
      <h2 id="psdk-sample-heading">{heading}</h2>
      <div className="psdk-sample">
        <div className="psdk-sample__actions">
          <a
            className="psdk-button psdk-button--primary"
            href={SAMPLE_PLUGIN_ZIP_URL}
            download
            aria-label={downloadLabel}
          >
            {downloadLabel}
          </a>
          <a
            className="psdk-button psdk-button--ghost"
            href={SAMPLE_PLUGIN_REPO_URL}
            rel="noopener noreferrer"
            target="_blank"
            aria-label={repoLabel}
          >
            {repoLabel} ↗
          </a>
        </div>
        <p className="psdk-sample__repo">
          <code>{SAMPLE_PLUGIN_REPO_URL}</code>
        </p>
        <div className="psdk-sample__layout">
          <article className="psdk-sample__readme">
            <h3>README excerpt</h3>
            <pre className="psdk-codeblock" data-language="markdown">
              <code>{readmeExcerpt}</code>
            </pre>
          </article>
          <aside className="psdk-sample__tree" aria-label="Sample plugin file tree">
            <h3>File tree</h3>
            <ul>
              {fileTree.map((entry) => (
                <li key={entry}>
                  <code>{entry}</code>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}