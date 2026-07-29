/**
 * Domio schema — placeholder for Phase 0. The real deck schema lands
 * in Phase 02. The shape is informed by:
 *   - contracts/schema/v1/common.schema.json
 *   - contracts/schema/v1/deck-placeholder.schema.json
 */

export interface DeckSummary {
  id: {
    kind: string;
    org_id: string;
    tenant_id: string;
    id: string;
  };
  title: string;
  status: 'draft' | 'published' | 'archived' | 'deleted';
  slide_count: number;
  owner_user_id: string;
  last_modified_ms: number;
  schema_version: string;
}
