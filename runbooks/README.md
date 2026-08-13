# runbooks/

This directory is the home for service-level runbooks, incident
postmortems, and tabletop test plans.

## Layout

```
runbooks/
├── README.md                       ← this file
├── postmortem-template.md          ← template; copy for each incident
├── postmortems/
│   └── YYYY-MM-DD-<slug>.md        ← one file per incident
├── service-runbooks/
│   └── <service-name>.md           ← per-service runbook
└── tabletop-tests/
    └── YYYY-Q<n>-<scenario>.md     ← quarterly tabletop scenarios
```

## Per-service runbook

Every tier-1 service must have a runbook at
`service-runbooks/<service-name>.md`. Required sections:

1. **At a glance** — what the service does, who owns it, on-call contact
2. **Health checks** — Prometheus metrics that indicate health;
   Alertmanager alert names; dashboards; SLOs
3. **Common failure modes** — at least 5 known failure modes with
   diagnosis + mitigation steps
4. **Rollback procedure** — exact commands, expected time-to-rollback
5. **Escalation** — who to page when the on-call is stuck; how to
   engage vendor support; how to engage SRE leadership
6. **Dependencies** — what this service depends on; what depends on
   this service

Tier-2 services are encouraged but not required. Tier-3 are not
required.

## Tabletop tests

Quarterly tabletop scenarios live in `tabletop-tests/`. A tabletop test
is a written-out incident that the on-call team walks through
together, **without** actually executing anything in production. The
goal is to validate that runbooks work and to surface unknown
unknowns.

## Postmortems

`postmortems/` holds one file per SEV-1 or SEV-2 incident. SEV-3
incidents are optional. Use `postmortem-template.md` as the starting
point.

## See also

- [`docs/slos/catalogue.md`](../docs/slos/catalogue.md) — SLO source of truth
- [`docs/slos/error-budget-policy.md`](../docs/slos/error-budget-policy.md) — when to file a postmortem
