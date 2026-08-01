import type { ReactElement } from 'react';
import { EditorRoot } from '../../../components/EditorRoot';
import { createDocumentLoader } from '../../../lib/document-loader-client';

export const dynamic = 'force-dynamic';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const loader = createDocumentLoader();
  let doc;
  try {
    doc = await loader.fetch(id);
  } catch {
    doc = loader.example();
  }
  return <EditorRoot doc={doc} />;
}