# Wave 8 — Enterprise & Governance

**Intent.** Complete the `apps/admin-console` trust & safety surface and add the missing enterprise pages: SSO/SCIM, DLP, audit log viewer, data residency, legal hold, encryption-at-rest key management, plugin administration, seat analytics, and the consent banner editor.

**Why it matters.** Every enterprise sale requires SSO, audit logs, and DLP. Without these pages, Domio is not sellable to a Fortune 500.

---

## 1. Scope

- **§14 Enterprise, Governance & Platform:** #193–204 (every feature).

---

## 2. Sub-phase map

### S8.1 — SSO / SCIM

**Features:** #193.

**Files to create:**
- `apps/admin-console/src/app/sso/page.tsx`
- `apps/admin-console/src/app/scim/page.tsx`
- `apps/admin-console/src/components/sso/{ProviderConfig,MetadataImport,TestLogin}.tsx`

**Build instructions:**
1. SSO provider list: SAML (Okta, Azure AD, OneLogin, custom), OIDC (Google, Microsoft, GitHub, custom).
2. Provider config form: metadata URL or XML upload; ACS URL + Entity ID auto-generated; role mapping rules.
3. SCIM token generation + endpoint URL; copy button.
4. "Test login" button runs an end-to-end login round-trip and surfaces the resolved identity + roles.
5. Per-provider status: connected, last sync, error count.

**SOLID notes:**
- **O:** adding a new SSO provider is one entry in `ssoProviders` registry + one metadata parser.

**Acceptance:**
- Test login completes in <5 s.
- SCIM token works for provision + de-provision round-trips.

---

### S8.2 — Brand governance dashboard

**Features:** #194.

**Files to modify:**
- `apps/admin-console/src/app/brand-locks/page.tsx` (already exists; harden)

**Build instructions:**
1. Org-wide on-brand score (0–100), with trend chart.
2. Violation report: decks + slides + elements that violate brand rules; click to open.
3. CSV bulk import (real endpoint) + per-deck brand-lock enforcement status.

---

### S8.3 — DLP rules

**Features:** #195.

**Files to create:**
- `apps/admin-console/src/app/dlp/page.tsx`
- `apps/admin-console/src/components/dlp/{RuleBuilder,RuleList,TestRule}.tsx`

**Build instructions:**
1. Rule builder: pattern (regex / dictionary / entity), scope (deck title, slide content, comment, asset), action (block share, redact, notify).
2. Test rule: input text → see which rules fire.
3. Rule list: enable/disable, edit, delete.

**Acceptance:**
- Test rule returns match within 100 ms.

---

### S8.4 — Audit log viewer

**Features:** #196.

**Files to create:**
- `apps/admin-console/src/app/audit/page.tsx`
- `apps/admin-console/src/components/audit/{LogTable,FilterBar,DetailDrawer}.tsx`

**Build instructions:**
1. Log table: timestamp, actor, action, target, trace id.
2. Filter by actor, action type, time range, target type.
3. Detail drawer: full event JSON + diff if applicable.
4. CSV export of filtered logs.

---

### S8.5 — Data residency selector

**Features:** #197.

**Files to create:**
- `apps/admin-console/src/app/residency/page.tsx`
- `apps/admin-console/src/components/residency/{RegionSelector,MigrationPlanner}.tsx`

**Build instructions:**
1. Region selector: pick a region per workspace.
2. Migration planner: simulate moving data; preview cost + downtime.
3. Run migration with progress tracker.

---

### S8.6 — Legal hold + retention policies

**Features:** #198.

**Files to create:**
- `apps/admin-console/src/app/legal-hold/page.tsx`
- `apps/admin-console/src/app/retention/page.tsx`

**Build instructions:**
1. Legal hold: apply hold to a deck or workspace; immutable until released.
2. Retention: configure time-based retention per content type; preview affected decks before applying.

---

### S8.7 — Seat analytics

**Features:** #199.

**Files to modify:**
- `apps/admin-console/src/app/seats/page.tsx` (new)

**Build instructions:**
1. Seat usage chart over time.
2. Per-user activity (last active, decks created, shares).
3. License tier summary.

---

### S8.8 — Public API + SDK + webhooks admin

**Features:** #200, #201.

**Files to create:**
- `apps/admin-console/src/app/api-keys/page.tsx`
- `apps/admin-console/src/app/webhooks/page.tsx`
- `apps/admin-console/src/app/sdk/page.tsx`

**Build instructions:**
1. API key minting with scope (read-only, write, agent-only, etc.).
2. Webhook subscriptions: per-event selection, retry policy, secret rotation.
3. SDK download page (link to npm/maven/etc.).

---

### S8.9 — Plugin administration

**Features:** #202, #235.

**Files to create:**
- `apps/admin-console/src/app/plugins/page.tsx`
- `apps/admin-console/src/app/plugins/[id]/page.tsx`

**Build instructions:**
1. Plugin list: installed, available, deprecated.
2. Per-plugin: scopes, permissions requested, audit log, version, enable/disable.
3. Approve/reject plugin publish requests (links to marketplace).

---

### S8.10 — Custom component development kit landing

**Features:** #203.

**Files to create:**
- `apps/admin-console/src/app/component-sdk/page.tsx`

**Build instructions:**
1. Quickstart, docs link, sample component template (download as zip).
2. Build + test pipeline links.
3. Publish flow to org library.

---

### S8.11 — Headless rendering control

**Features:** #204.

**Files to create:**
- `apps/admin-console/src/app/rendering/page.tsx`

**Build instructions:**
1. Queue status, throughput, error rate, sample renders.
2. Configure max parallelism, retention.
3. Per-tenant rate limits.

---

## 3. SOLID injection

### Admin-console module map
```
apps/admin-console/src/
├── app/
│   ├── page.tsx                          # dashboard
│   ├── brand-locks/page.tsx
│   ├── takedowns/page.tsx
│   ├── trust/page.tsx
│   ├── payouts/page.tsx
│   ├── sso/page.tsx
│   ├── scim/page.tsx
│   ├── dlp/page.tsx
│   ├── audit/page.tsx
│   ├── residency/page.tsx
│   ├── legal-hold/page.tsx
│   ├── retention/page.tsx
│   ├── seats/page.tsx
│   ├── api-keys/page.tsx
│   ├── webhooks/page.tsx
│   ├── sdk/page.tsx
│   ├── plugins/page.tsx
│   ├── plugins/[id]/page.tsx
│   ├── component-sdk/page.tsx
│   └── rendering/page.tsx
├── components/
└── lib/  (services)
```

### Rule: every admin page is a CRUD page with audit
Each page is `List + Create + Edit + Delete` (or `View + Action`). Every destructive action goes through an audit log entry that admins can review.

---

## 4. Out of scope

- Frontend agentic configuration (Wave 10).
- Marketing/admin sales tooling (out of product surface).

---

## 5. DoD checklist

- [ ] Every §14 feature reachable from `apps/admin-console`.
- [ ] SSO test login works for at least 2 providers.
- [ ] Audit log query <500 ms for 100k events.
- [ ] DLP test runs in <100 ms.
- [ ] API keys + webhook subscriptions persist.
- [ ] Plugin admin can disable a plugin and the change takes effect immediately.
- [ ] All admin actions audit-logged.
