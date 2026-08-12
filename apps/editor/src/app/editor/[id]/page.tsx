import type { ReactElement } from 'react';
import { EditorRoot, type EditorLeftTab } from '../../../components/EditorRoot';
import { createDocumentLoader } from '../../../lib/deck-service';

export const dynamic = 'force-dynamic';

/**
 * Valid panel ids — must match the `leftTab` union in EditorRoot.
 * Unknown ids are simply ignored by EditorRoot, so this server component
 * does not need to validate them; it just forwards whatever the user
 * provided via the `?panel=` query.
 */
const VALID_PANELS: ReadonlySet<EditorLeftTab> = new Set<EditorLeftTab>([
  'layers',
  'insert',
  'library',
  'stickers',
  'icons',
  'theme-brand',
  'data-sources',
  'filters',
  'animations',
  'connections',
  'variables',
  'deep-links',
  'm6-quizzes',
  'm6-leaderboard',
  'm6-sequence',
  'm8-audit',
  'm8-nl-patch',
  'm8-deck-diff',
  'state-inspector',
  'm11-media',
  'm11-licenses',
  'm11-recording',
  'p12-copilot',
  'marketplace',
]);

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { id } = await params;
  const sp = await searchParams;
  const rawPanel = typeof sp['panel'] === 'string' ? sp['panel'] : undefined;
  const initialPanel =
    rawPanel && VALID_PANELS.has(rawPanel as EditorLeftTab)
      ? (rawPanel as EditorLeftTab)
      : undefined;

  const loader = createDocumentLoader();
  let doc;
  try {
    doc = await loader.fetch(id);
  } catch {
    doc = loader.example();
  }
  return <EditorRoot doc={doc} {...(initialPanel ? { initialPanel } : {})} />;
}