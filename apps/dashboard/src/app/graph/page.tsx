/**
 * /graph — cross-deck knowledge graph (Wave 11 §S11.15).
 *
 * Per docs/frontend-roadmap/11-wave-novel-frontier.md §S11.15:
 * three-pane layout with a filter sidebar, force-directed graph
 * canvas, and selected-entity detail panel.
 *
 * The page prefetches the initial graph on the server so the
 * canvas is interactive on first paint. Filtering re-queries
 * the service via the client component.
 */

import { getGraph } from '../../lib/knowledge-graph-service';
import { GraphExperience } from './GraphExperience';
import { CrossLinksFooter } from '../../components/CrossLinksFooter';

export default async function GraphPage() {
  const initial = await getGraph();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Cross-deck knowledge graph
        </h1>
        <p className="text-sm text-slate-500">
          Discover connections across every deck.
        </p>
      </header>

      <GraphExperience initial={initial} />
      <CrossLinksFooter nodeId="doc.dashboard.graph" />
    </div>
  );
}