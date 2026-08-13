/**
 * /graph — cross-deck knowledge graph preview.
 *
 * Per Wave 7 §S7.12 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Renders the SVG node-link diagram from `KnowledgeGraph`. The
 * server prefetches the initial graph so the page is interactive on
 * first paint; the client component also re-queries on search input.
 */

import { KnowledgeGraph } from '../../components/KnowledgeGraph';
import { fetchKnowledgeGraph } from '../../lib/knowledge-graph-service';

export default async function GraphPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const initial = await fetchKnowledgeGraph(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
        <p className="text-sm text-slate-500">
          Claims, source slides, and citations across every deck in this workspace
        </p>
      </header>

      <KnowledgeGraph workspaceId={workspaceId} initial={initial} />
    </div>
  );
}