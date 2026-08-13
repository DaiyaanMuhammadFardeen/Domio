# SLO: editor

Owner: `editor-platform@example.com`
Reviewers: SRE on-call
Window: 28-day rolling

## User journeys

| ID   | Journey                                   | Mechanism                   |
| ---- | ----------------------------------------- | --------------------------- |
| ED-1 | Open a collaborative document             | Initial CRDT sync           |
| ED-2 | Persist a local edit                      | Auto-save (1 write / 800ms) |
| ED-3 | Resolve a merge conflict in collaboration | CRDT conflict-free write    |

## SLIs and SLOs

| SLI                                 | SLO target | Ticket threshold | Page threshold |
| ----------------------------------- | ---------- | ---------------- | -------------- |
| ED-1 initial sync success           | 99.5%      | < 99% / 6h       | < 95% / 5m     |
| ED-2 auto-save success              | 99.9%      | < 99% / 6h       | < 98% / 5m     |
| ED-2 auto-save latency p95          | 250 ms     | > 500 ms / 6h    | > 1.5 s / 5m   |
| ED-3 merge conflict resolution rate | 99%        | < 95% / 6h       | < 80% / 5m     |

## Burn-rate alerts

| ALERT ID               | Burn-rate | Window | Action |
| ---------------------- | --------- | ------ | ------ |
| EditorSyncBurnFast     | 14.4×     | 5m     | page   |
| EditorAutoSaveBurnFast | 14.4×     | 5m     | page   |

## Measurement details

- **Source**: `editor_doc_open_total`, `editor_autosave_total`,
  `editor_autosave_duration_seconds_bucket`, `editor_merge_conflict_total`.
- **Auto-save**: hard-throttled client-side; the SLI covers the
  _network round-trip_, not the local keystroke rate. This means a
  saturated disk on the user's laptop doesn't burn our budget.
- **Tenant isolation**: snapshot exports gate `creator` exposure by ACL;
  any cross-tenant leak trips `ED-3` automatically.

## Notes

The CRDT layer (Yjs) keeps us honest — silent data loss is impossible
_by construction_. As a result the **R** STRIDE category score for
editor is 2 (low), and the SLO budget is correspondingly generous.
