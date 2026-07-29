# Runbooks

Operational runbooks for the Domio platform. Runbooks are updated
after every incident or operational change. Each runbook lists:

- Service or component.
- Symptoms.
- Triage steps.
- Common fixes.
- Escalation path.

## Index

| ID | Title | Owner | Last updated |
|---:|---|---|---|
| RB-001 | Local dev stack reset | Platform | 2026-07-29 |

## Adding a runbook

1. Copy `template.md` to `RB-NNN-short-title.md`.
2. Open a PR with the runbook.
3. The relevant on-call rotation reviews.
4. After merge, link from `docs/release-notes/` if it changed operator behavior.