/**
 * Plugin SDK portal landing page (Wave 10 §S10.5).
 *
 * Composes the Quickstart, Tutorials, SamplePlugin, and PublishFlow
 * components with the deeper tutorial anchor sections and the final
 * CTA. Strings are hardcoded to match the existing landing-site
 * pattern; the canonical catalogue lives in
 * `apps/landing/messages/en.json`.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import {
  PublishFlow,
  Quickstart,
  SamplePlugin,
  Tutorials,
  type QuickstartStep,
} from '../../components/plugins-sdk';
import {
  PUBLISH_STEPS,
  QUICKSTART_SNIPPETS,
  SAMPLE_PLUGIN_REPO_URL,
  TUTORIALS,
  type PluginTutorial,
} from '../../lib/plugin-sdk-data';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Domio Plugin SDK',
  description: 'Extend the canvas, the editor, and the data layer.',
};

const QUICKSTART_STEPS: ReadonlyArray<QuickstartStep> = [
  {
    step: 1,
    title: 'Install the CLI',
    body: 'Install the Domio plugin CLI from npm. The CLI ships with a local dev server and the publish command.',
    code: QUICKSTART_SNIPPETS.install,
    language: 'bash',
  },
  {
    step: 2,
    title: 'Scaffold a plugin',
    body: 'Pick a template — canvas node, data connector, or export format — and the CLI writes the project skeleton for you.',
    code: QUICKSTART_SNIPPETS.scaffold,
    language: 'bash',
  },
  {
    step: 3,
    title: 'Implement the plugin interface',
    body: 'Fill in `definePlugin(...)` with the canvas registrations, data bindings, or export pipelines you need.',
    code: QUICKSTART_SNIPPETS.implement,
    language: 'ts',
  },
  {
    step: 4,
    title: 'Test locally',
    body: 'Run the dev server against the real editor; your node types, bindings, and exports hot-reload as you iterate.',
    code: QUICKSTART_SNIPPETS.test,
    language: 'bash',
  },
  {
    step: 5,
    title: 'Publish to marketplace',
    body: 'Cut a release, run the review checklist, and submit. Approved plugins go live on the public marketplace.',
    code: QUICKSTART_SNIPPETS.publish,
    language: 'bash',
  },
];

const SAMPLE_README = `# domio/plugin-template

Reference scaffold for building a Domio plugin.

## Scripts

- \`domio plugin dev\` — boot the editor with this plugin hot-loaded
- \`domio plugin test\` — run the SDK test harness in jsdom
- \`domio plugin publish --review\` — submit a tagged release to the marketplace

## Layout

\`\`\`
src/
  index.ts        # plugin entry — calls definePlugin(...)
  geometry.ts     # canvas geometry implementation
  controls.ts     # inspector / toolbar controls
  preview.tsx     # canvas node thumbnail
\`\`\`
`;

const SAMPLE_FILE_TREE: ReadonlyArray<string> = [
  'package.json',
  'tsconfig.json',
  'src/index.ts',
  'src/geometry.ts',
  'src/controls.ts',
  'src/preview.tsx',
  'src/__tests__/plugin.test.ts',
  'README.md',
];

const MARKETPLACE_PATH = '/marketplace';
const SCAFFOLD_ANCHOR = `${SAMPLE_PLUGIN_REPO_URL}#scaffold`;

const TUTORIAL_BODY: Record<PluginTutorial['slug'], string> = {
  'canvas-plugin':
    'You will register a custom node type with the canvas runtime, wire geometry + controls, and produce a preview thumbnail. The end result is a node you can drop into any deck.',
  'data-connector':
    'Build a streaming data connector that pulls rows from an external source and exposes them as reactive bindings for tables, charts, and tokens.',
  'export-format':
    'Define a new export format using the streaming encoder pipeline. The tutorial walks through PDF, SCORM, and a custom blob format so you can pick the closest reference.',
};

function formatMinutes(n: number): string {
  return `${n} min`;
}

export default function PluginsSdkPage(): ReactElement {
  return (
    <PageShell currentId="plugins-sdk" relatedTitle="Go deeper">
      <main className="psdk">
        <header className="psdk-hero">
          <h1>Domio Plugin SDK</h1>
          <p>Extend the canvas, the editor, and the data layer.</p>
        </header>

        <Quickstart heading="Quickstart — scaffold in 5 minutes" steps={QUICKSTART_STEPS} />

        <Tutorials
          heading="Tutorials"
          startLabel="Start tutorial"
          minutesLabel={formatMinutes}
          tutorials={TUTORIALS}
        />

        {/* Deeper tutorial anchor sections — reachable via the card links. */}
        <section className="psdk-section" aria-label="Tutorial deep dives">
          <h2 className="visually-hidden">Tutorial deep dives</h2>
          {TUTORIALS.map((tutorial) => (
            <article
              key={tutorial.slug}
              id={`tutorial-${tutorial.slug}`}
              className="psdk-tutorial-detail"
            >
              <header>
                <h3>{tutorial.title}</h3>
                <p>
                  <span>{formatMinutes(tutorial.time_estimate_min)}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{tutorial.difficulty}</span>
                </p>
              </header>
              <p>{TUTORIAL_BODY[tutorial.slug]}</p>
              <p>
                <a
                  href={`${SAMPLE_PLUGIN_REPO_URL}#${tutorial.slug}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open the full guide on GitHub ↗
                </a>
              </p>
            </article>
          ))}
        </section>

        <SamplePlugin
          heading="Sample plugin"
          downloadLabel="Download ZIP"
          repoLabel="View on GitHub"
          readmeExcerpt={SAMPLE_README}
          fileTree={SAMPLE_FILE_TREE}
        />

        <PublishFlow heading="Publish flow" steps={PUBLISH_STEPS} />

        <section className="psdk-cta" aria-label="Next steps">
          <a className="psdk-button psdk-button--primary" href={MARKETPLACE_PATH}>
            Browse marketplace →
          </a>
          <a className="psdk-button psdk-button--secondary" href={SCAFFOLD_ANCHOR}>
            Build a plugin →
          </a>
        </section>
      </main>
    </PageShell>
  );
}
