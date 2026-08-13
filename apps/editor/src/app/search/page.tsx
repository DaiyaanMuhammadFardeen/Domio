import type { ReactElement } from 'react';
import { SemanticSearch } from '../../components/search/SemanticSearch';

/**
 * /search — semantic slide search across the workspace.
 *
 * Per Wave 6 §S6.10 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 * Renders the SemanticSearch component inside a simple page shell so
 * the route is reachable from the editor's command palette + top bar.
 */
export default function SearchPage(): ReactElement {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8"
      data-testid="p6-search-page"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-slate-100">Search</h1>
        <p className="text-xs text-slate-500">
          Find slides across your workspace by meaning, not just keywords.
        </p>
      </header>
      <SemanticSearch />
    </main>
  );
}