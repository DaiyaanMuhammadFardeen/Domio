# Runbook: billing

> **Owner:** FIN (Finance squad)
> **On-call:** `@finance-oncall` (PagerDuty: `pagerduty-platform-business-hours`)
> **Tier:** 1
> **Last reviewed:** 2026-08-09

## At a glance

`@domio/billing` owns subscription state, invoice generation, and the
billing webhook receivers (Stripe, etc.).

- **Source:** `services/billing/`
- **Deployment:** rolling, 3 replicas minimum
- **Health endpoint:** `https://billing.domio.app/healthz`
- **Dashboard:** `domio-billing`
- **SLOs:**
  - `avail-billing` — 99.9% over 30d (page, business hours)

## Health checks

| Signal | Threshold |
|--------|-----------|
| 5xx rate | < 0.1% |
| Stripe webhook ingestion lag | < 5 min |
| Failed-invoice-job count | < 5 over 1h |
| Subscription-state-sync lag | < 30 s |

## Common failure modes

1. **Stripe webhook backpressure.** Symptom: stripe events queued, not
   processed.
   *Mitigation:* scale billing; check `billing_stripe_webhook_queue_depth`.
2. **Invoice generation job stuck.** Symptom: customers complain "no
   invoice for last month".
   *Mitigation:* manually re-trigger via `./scripts/billing-rebuild-invoices.sh`.
3. **Subscription state drift.** Symptom: customer has paid but
   access-flag is wrong.
   *Mitigation:* run the reconciliation job; do NOT manually edit the
   DB.
4. **Currency / FX rate feed stale.** Symptom: invoices show wrong
   totals for non-USD customers.
   *Mitigation:* check the FX provider; force-refresh from admin tool.
5. **PCI scope creep.** Suspect: a new dependency introduced card data
   into a system not in PCI scope.
   *Mitigation:* STOP. Page CISO + FinSec immediately.

## Rollback

```sh
kubectl -n realtime rollout undo deploy billing
```

Note: subscription state is durable in Postgres; rolling back the API
does not roll back billing state.

## Escalation

- FIN on-call (primary, business hours)
- Stripe support (for Stripe-side issues): contact via FIN

## Dependencies

**Depends on:** Stripe, Postgres, internal user-account-service
**Depended on by:** access-control, sales-reporting, finance dashboards