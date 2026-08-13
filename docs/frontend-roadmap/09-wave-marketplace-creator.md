# Wave 9 — Marketplace & Creator Console

**Intent.** Complete the marketplace storefront (`apps/marketplace-web`) and the creator console (`apps/creator-console`) so the entire marketplace loop — discover → preview → purchase → install → creator earnings — is reachable. Pair with Wave 8 (admin takedowns/payouts) for the trust & safety rails.

**Why it matters.** Marketplace is a revenue line and the network-effect differentiator. Creators need a real workflow; buyers need a real storefront.

---

## 1. Scope

- **§2 Components & templates:** #28, #29, #33 (marketplace facets).
- **§19 Marketplace phase:** every marketplace feature.

---

## 2. Sub-phase map

### S9.1 — Marketplace storefront completion

**Features:** #28, #29, #45, #235.

**Files to modify:**

- `apps/marketplace-web/src/app/page.tsx`
- `apps/marketplace-web/src/app/listing/[slug]/page.tsx`
- `apps/marketplace-web/src/app/search/page.tsx`
- `apps/marketplace-web/src/app/checkout/page.tsx`
- `apps/marketplace-web/src/app/checkout/success/page.tsx`
- `apps/marketplace-web/src/app/library/page.tsx`

**Build instructions:**

1. Home page: featured, top-rated, recently added, by category.
2. Faceted search: type, theme, color, language, price, rating.
3. Listing detail: gallery, video preview, reviews, changelog, related listings, "Add to library" CTA.
4. Checkout flow: payment (Stripe / bKash / Nagad), billing address, tax, receipt.
5. Success page: download links + library entry.
6. Library page: purchased listings, available updates, license terms.

**SOLID notes:**

- **S:** each page owns one concern; checkout is a separate flow from browse.

**Acceptance:**

- Full purchase → install → install-in-editor → render in deck round-trip <30 s.

---

### S9.2 — Creator console: listing creation wizard (real)

**Features:** #28, #29.

**Files to modify:**

- `apps/creator-console/src/app/listings/create/page.tsx`

**Build instructions:**

1. 4-step wizard: **Details** (title, description, tags, category), **Media** (cover, gallery, video), **Files** (upload component/template + sample deck), **Pricing** (free, one-time, subscription, royalty).
2. Real upload via `POST /v1/marketplace/listings/{id}/assets` (presigned URLs); progress per file.
3. Preview tab: how the listing looks in the marketplace.
4. Submit for review.

**Acceptance:**

- Upload handles 100 MB files without crashing the browser.
- Preview matches live storefront.

---

### S9.3 — Creator analytics

**Features:** #174.

**Files to modify:**

- `apps/creator-console/src/app/analytics/page.tsx`
- `apps/creator-console/src/components/analytics/{RevenueChart,GeoDistribution,ConversionFunnel}.tsx`

**Build instructions:**

1. Revenue chart per day/month.
2. Top-selling listings.
3. Geographic distribution.
4. Conversion funnel: views → trial → purchase.

---

### S9.4 — Statements + payouts

**Features:** #28, #198.

**Files to modify:**

- `apps/creator-console/src/app/statements/page.tsx`
- `apps/creator-console/src/app/payouts/page.tsx`

**Build instructions:**

1. Generate monthly statement: `POST /v1/marketplace/statements/generate`.
2. Statement detail: gross, fees, refunds, net.
3. Payout settings: bank account, schedule.

---

### S9.5 — Reviews + ratings

**Features:** #28.

**Files to create:**

- `apps/marketplace-web/src/components/reviews/{ReviewList,ReviewForm,ReplyForm}.tsx`
- `apps/creator-console/src/app/reviews/page.tsx`

**Build instructions:**

1. Buyers leave 1–5 stars + review.
2. Creator can reply once.
3. Moderation-aware: spam filter via `services/moderation-ml`.

---

### S9.6 — Takedowns + disputes

**Features:** #28.

**Files to create:**

- `apps/admin-console/src/app/takedowns/[id]/page.tsx` (new — detail)

**Build instructions:**

1. Dispute list with status (open / under review / resolved).
2. Detail view: filing party, respondent, evidence, decision.

---

### S9.7 — Theme marketplace preview

**Features:** #45.

**Files to modify:**

- `apps/marketplace-web/src/app/theme/[slug]/page.tsx` (new)

**Build instructions:**

1. Theme preview shows a sample deck rendered with the theme.
2. "Use this theme" CTA → opens the editor with the theme applied to a new deck.

---

### S9.8 — Creator onboarding + KYC

**Features:** #28.

**Files to create:**

- `apps/creator-console/src/app/onboarding/page.tsx`

**Build instructions:**

1. Step 1: identity verification (Persona).
2. Step 2: payout setup (Stripe Connect).
3. Step 3: tax info.
4. Step 4: first listing.

---

### S9.9 — Marketing pages for marketplace

**Features:** #28.

**Files to create:**

- `apps/marketplace-web/src/app/sellers/page.tsx`
- `apps/marketplace-web/src/app/creators/[handle]/page.tsx`

**Build instructions:**

1. "Become a creator" landing page.
2. Per-creator profile: bio, listings, reviews, ratings.

---

## 3. SOLID injection

### Module map

```
apps/marketplace-web/src/
├── app/
│   ├── page.tsx
│   ├── search/page.tsx
│   ├── listing/[slug]/page.tsx
│   ├── theme/[slug]/page.tsx
│   ├── checkout/page.tsx
│   ├── checkout/success/page.tsx
│   ├── library/page.tsx
│   ├── sellers/page.tsx
│   └── creators/[handle]/page.tsx
└── components/
apps/creator-console/src/
├── app/
│   ├── onboarding/page.tsx
│   ├── listings/page.tsx
│   ├── listings/create/page.tsx
│   ├── analytics/page.tsx
│   ├── statements/page.tsx
│   ├── payouts/page.tsx
│   ├── reviews/page.tsx
│   └── settings/page.tsx
└── components/
```

### Rule: marketplace is split into buyer / seller / admin

Three Next.js apps, each with narrow responsibility. The buyer's app never imports from the creator console; data flows through `packages/sdk-ts`.

---

## 4. Out of scope

- Backend catalog code (services are presumed complete).
- Payment provider integration backend (the SDK is presumed complete).

---

## 5. DoD checklist

- [ ] Every §2/#28, #29 feature reachable.
- [ ] Full purchase → install → render loop validated.
- [ ] Creator can list, sell, get paid.
- [ ] Reviews + replies work.
- [ ] Takedowns admin flow live.
- [ ] Locale support across all marketplace pages.
- [ ] No hardcoded listing arrays; every list is fetched.
