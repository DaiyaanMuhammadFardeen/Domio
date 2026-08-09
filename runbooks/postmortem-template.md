# Postmortem template

> Copy this file to `runbooks/postmortems/YYYY-MM-DD-<slug>.md` after any
> tier-1 incident. Tier-2 incidents are at the team's discretion. Tier-3
> is "ticket only" — no postmortem required.

## Header

- **Incident ID:** `INC-YYYYMMDD-XX` (linear ticket ID, if available)
- **Title:** <one-line summary>
- **Severity:** `SEV-1` / `SEV-2` / `SEV-3`
- **Status:** `draft` / `in-review` / `published`
- **Service(s):** `@domio/<service-name>`
- **SLO(s) impacted:** `avail-<short>`, `lat-<short>-p95`
- **Detection time:** `YYYY-MM-DD HH:MM UTC` (first alert fired / first user report)
- **Mitigation time:** `YYYY-MM-DD HH:MM UTC` (incident contained)
- **Resolution time:** `YYYY-MM-DD HH:MM UTC` (full traffic restored, all alerts clear)
- **Author:** <on-call engineer's name>
- **Reviewers:** <service owner + SRE on-call>

## Timeline

Use UTC. Reference minutes-relative-to-detection as `T+<minutes>`. Aim for
~10–20 entries. Keep the timeline short — it's the audit log, not the
story.

```
T+00:00   first alert fires (SLOBurnHighT1RealtimeGatewayAvailRtGateway1h)
T+00:02   on-call paged via PagerDuty primary
T+00:04   on-call acknowledges; opens #inc-<id> Slack channel
T+...     mitigation step
T+00:00   resolution
```

## Impact

- **User-visible:** <what users experienced — be specific, e.g. "editors
  in eu-west-1 saw 30s save delays; ~12% of sessions affected">
- **Duration:** <total minutes of degraded service>
- **Customers affected:** <number / percentage / segments>
- **SLO burn:** <how much of the 30-day error budget was consumed>

## Root cause

A 3–5 sentence technical root cause. State **what** changed, **why** it
caused the symptom, and **why** our defenses didn't catch it earlier.

## Contributing factors

Bullets. Distinguish "the proximate cause" from "the system that allowed
the proximate cause to happen". Example:

- Proximate: bad migration script dropped the `session_id` index.
- Contributing: migrations are not gated by a canary stage.
- Contributing: we have no alert on `pg_stat_user_indexes.idx_scan`.

## What went well

- <e.g. "On-call was paged within 60s of the first 5xx.">
- <e.g. "Runbook covered the rollback procedure end-to-end.">

## What went poorly

- <e.g. "Initial triage took 8 minutes because the runbook assumed
  knowledge of the new schema.">
- <e.g. "Two services shared a DB user; rollback affected both.">

## Action items

Each item: `AI-<n>: <title>` + `Owner:` + `Priority:` (`P0` / `P1` / `P2`)
+ `Due:`. P0 = within 1 week. P1 = within 1 month. P2 = within 1 quarter.
These items go into the linear backlog.

```
AI-1: Add a canary stage to migrations.  Owner: data-eng  Priority: P0  Due: YYYY-MM-DD
AI-2: Alert on pg_stat_user_indexes.idx_scan drops.  Owner: sre  Priority: P1
AI-3: ...
```

## Lessons learned

A single paragraph. "If we read this in 6 months, what's the one thing
we want to remember?" Should be forward-looking, not backward-looking.

## Appendix

- Slack incident channel transcript (paste at the bottom if relevant)
- Linked Grafana dashboard panel URLs
- Linked alertmanager silence / page screenshots
