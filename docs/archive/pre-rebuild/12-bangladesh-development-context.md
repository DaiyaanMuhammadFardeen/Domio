# 12 — Bangladesh Development Environment Considerations

> **Purpose:** translate Bangladesh-specific connectivity, infrastructure, payment, language, regulatory, and human context into concrete product, engineering, and operational decisions.
> **Posture:** these are not edge cases to handle later; they are first-class design constraints that shape the platform.
> **Cross-references:** `02` (NFRs), `03` (UX/locale), `04` (residency, edge), `05` (data), `06` (stack), `07` (security), `08` (infra), `11` (compliance).

---

## 12.0 Connectivity & Infrastructure Reliability

### 12.0.1 Reality

- Mobile networks (4G, expanding 5G) are the primary access.
- Variable quality; 2G/3G fallback in rural areas.
- Power interruptions common outside major urban hubs and during load-shedding.
- International bandwidth to global clouds can be slow and metered.

### 12.0.2 Product implications

- **Offline-first editor** (#21) is non-negotiable.
- **Presenter offline mode** (#137) is non-negotiable.
- **Service worker** caches shell + assets for editor and viewer.
- **Aggressive client-side caching** with explicit invalidation.
- **Lazy loading** of non-essential modules.
- **Resumable sync** with backoff and conflict-free merge.
- **Snapshot fallback** for live data when offline on stage.

### 12.0.3 Engineering implications

- **Local mirrors of dependencies** for CI/CD and self-host.
- **npm/pnpm registry mirror** for development machines.
- **Container image mirror** for self-host customers.
- **WebSocket reconnect** with capped jittered backoff.
- **Asset compression** for all binaries; aggressive cache headers.

### 12.0.4 Operational implications

- **Resilient CI:** test runs survive flaky network; idempotent retries.
- **On-call awareness** of BD time zone and working hours.
- **Status page** mirrored for BD users; localized copy.

---

## 12.1 Hosting: Local vs Foreign Trade-offs

### 12.1.1 Decision posture

- Default tenant home region is the **nearest operational region** (ap-south-1 for BD users).
- **BD local hosting option** is required for restricted/CII data and for residency-conscious customers.
- Local hosting partner options: BTCL data centers, third-party DCs (e.g., btcl, dhaka-based providers), or self-host in customer premises.

### 12.1.2 Trade-offs

| Option                   | Latency (BD) | Residency | Cost (BDT)      | Currency risk | Operational risk                      |
| ------------------------ | ------------ | --------- | --------------- | ------------- | ------------------------------------- |
| Foreign cloud (us/eu)    | higher       | weaker    | USD-denominated | high          | geopolitical                          |
| Foreign cloud (ap-south) | medium       | regional  | USD-denominated | medium        | regulatory                            |
| BD local hosting         | lowest       | strongest | BDT-denominated | low           | smaller scale, fewer managed services |

### 12.1.3 Decision principle

- Architecture supports all three with the same code paths.
- Default policy: closest region with strong SLA.
- Allow tenant override to BD local at any time; portable schema and data.
- Maintain zero vendor lock-in to keep relocation feasible.

---

## 12.2 Mobile-First, Bandwidth-Conscious Design

### 12.2.1 Targets

- Initial JS for editor on cold load ≤ 350 KB gzipped.
- Initial first paint for viewer on cold load ≤ 1.5 MB total.
- Image auto-format (AVIF/WebP) with size cap.
- Font subsetting per locale.

### 12.2.2 Editor on mobile

- Web responsive; full feature set on tablet/desktop; read + light edit on phone.
- Touch targets ≥ 44×44 CSS px.
- Pinch zoom and pan for canvas.
- Voice input for slide text where available.

### 12.2.3 Viewer

- Lightweight bundle; minimal JS.
- Scroll-mode web deck is the default for phones.
- All assets served via CDN with optimal cache headers.

### 12.2.4 Performance budgets

- NFR-PERF targets (#01..13) are enforced in CI for the relevant surfaces.

---

## 12.3 Language & Localization

### 12.3.1 Bangla first-class

- Bangla UI: full translation; native review per release.
- Bangla numerals toggle.
- Bangla fonts: Noto Sans Bengali default; SolaimanLipi fallback; system Bengali fallback.
- Sample content uses Bangla names and contexts.
- Voice prompts support Bangla.

### 12.3.2 Bilingual UX

- Bangla/English UI toggle; language picker prominent.
- Date/time: locale-aware (e.g., `২৯ জুলাই ২০২৬`).
- Number/currency: locale-aware formatting.

### 12.3.3 Data model i18n

- All timestamps UTC; display per locale.
- Currency stored as integer minor units; display per locale.
- Collation locale-aware per column.

### 12.3.4 Translation pipeline

- Crowdin/Lokalise for human translation.
- ICU MessageFormat.
- Pseudo-locale QA (`en-XA`, `ar-XB`).
- Glossary maintained; product terminology aligned.
- Bangla QA with native speaker on every release.

---

## 12.4 Local Payments

### 12.4.1 Supported methods

- **bKash**, **Nagad**, **Rocket** (and any new Bangladesh Bank-approved MFS).
- **Cards** (Visa, Mastercard) via aggregator.
- **Bank transfer** via aggregator where supported.
- **Aggregator default:** Bangladesh Bank-approved (SSLCommerz, ShurjoPay, Moneybag, AamarPay).

### 12.4.2 Pricing & billing

- Pricing displayed in BDT and USD; checkout in user's selected currency.
- BDT-denominated billing for BD customers where contract demands.
- Receipts in Bangla for BD customers; VAT/turnover compliance per law.

### 12.4.3 Marketplace payouts

- BD creators paid through approved aggregator; KYC required.
- Non-BD creators through Stripe Connect or equivalent.

### 12.4.4 Anti-fraud

- Velocity checks per account.
- Reconciliation with aggregator daily.
- Chargeback handling.

---

## 12.5 Local Support & Onboarding

- **Tier-1 support** in Bangla and English during BD business hours.
- **Self-host BD customers** get dedicated support tier.
- **Onboarding content** in Bangla (video, written).
- **Local user community** (Discord/Telegram group, monthly office hours in Dhaka if traction justifies).
- **Field research:** quarterly visits to BD customers (designers, sales teams, educators).
- **Training** for marketplace creators in Bangla.

---

## 12.6 Offline-First and Resumable Sync

- **Editor:** local CRDT store; IndexedDB; service worker for shell.
- **Presenter:** cached deck + data snapshot; offline mode (#137).
- **Viewer:** cached deck + assets.
- **Sync:** reconnect with capped backoff; CRDT convergence; outbox replay.
- **Conflict surface** minimized for user; visible diffs only when needed.
- **Status bar** always shows connectivity and sync state.

---

## 12.7 CDN, Latency, Edge

- Multi-region CDN with edge nodes in/near BD.
- Static assets globally cached; private origin via signed URLs.
- Realtime edge nodes (ap-south) for low-latency presence.
- Image/font optimization at edge.

---

## 12.8 Data Residency Fallback

- Tenant policy controls residency; restricted data requires BD local copy.
- Cross-region transfer is gated and audited.
- Forced-relocation runbook maintained and tested.
- Self-host always available for any customer needing full data control.

---

## 12.9 Device / Browser Matrix

| Class   | Browser          | Min version | Notes                        |
| ------- | ---------------- | ----------- | ---------------------------- |
| Desktop | Chrome           | latest 2    | primary dev target           |
| Desktop | Edge             | latest 2    | supported                    |
| Desktop | Firefox          | latest 2    | supported                    |
| Desktop | Safari           | latest 2    | supported (limited WebGPU)   |
| Mobile  | Safari iOS       | latest 2    | audience + presenter remote  |
| Mobile  | Chrome Android   | latest 2    | audience + presenter remote  |
| Mobile  | Samsung Internet | latest 1    | supported                    |
| Tablet  | iPadOS Safari    | latest 2    | full editor on large tablets |
| Tablet  | Android Chrome   | latest 2    | full editor on large tablets |

- No IE or Edge Legacy.
- WebGPU progressive enhancement; WebGL2 fallback.
- Service worker support required; older browsers fall back to read-only viewer with banner.

---

## 12.10 Accessibility & Digital Literacy

- **Accessibility:** WCAG 2.2 AA across surfaces; assistive tech tested (TalkBack, VoiceOver).
- **Digital literacy:** first-run guided tour; contextual help; tooltips.
- **Video tutorials** in Bangla for key flows.
- **Low-bandwidth mode** for users on slow connections.
- **Simple mode** for less tech-savvy users (toggle to hide advanced controls; default for new users).
- **Phone-first** UI patterns for audience join and presenter remote.

---

## 12.11 Localization QA

- Pseudo-locale build in CI.
- Native-speaker review per tier-1 locale per release.
- Visual regression for layout overflow per locale.
- Numerical/currency/date format tests.
- Audio/voice feature testing in Bangla.

---

## 12.12 Community & Cultural Considerations

- Content moderation aligned with local law and platform policy.
- Avoid culturally insensitive defaults (examples, sample content).
- Holiday calendar includes BD holidays; events/recurring presentations respect timezone.
- Multilingual collaboration encouraged: team members can use different locales; the system stores per-user locale preference.
- Right-to-left data support prepared for future Arabic UI.

---

## 12.13 Local Engineering Practices

- **Dev environment:** Docker Compose stack with optional local AI (Ollama) for offline dev.
- **Dependency mirror** for CI.
- **Image registry** mirror for self-host.
- **Documentation** in Bangla where appropriate.
- **Team distribution:** at least one team member in BD time zone; overlap with global team.
- **Recruitment:** local hires for BD market presence and context.

---

## 12.14 Open Decisions

| ID       | Decision                                                             | Owner          |
| -------- | -------------------------------------------------------------------- | -------------- |
| OD-BD-01 | BD local hosting partner selection.                                  | BD ops + Legal |
| OD-BD-02 | Whether to ship a Bangla-first default for BD-detected users.        | i18n + Product |
| OD-BD-03 | Default payment aggregator and backup.                               | BD ops         |
| OD-BD-04 | Whether to commission a Bangla-native UX variant beyond translation. | Design         |
| OD-BD-05 | Local field research cadence.                                        | Research + GTM |

---

## 12.15 Decisions Log

| ID      | Decision                           | Rationale                  | Alternative                           |
| ------- | ---------------------------------- | -------------------------- | ------------------------------------- |
| D-BD-01 | Offline-first editor and presenter | Connectivity reality       | Online-only — rejected                |
| D-BD-02 | BD local hosting option required   | Localization law + latency | SaaS-only — rejected                  |
| D-BD-03 | Aggregator-first BD payments       | Faster, lower risk         | Direct MFS only — rejected            |
| D-BD-04 | Bangla tier-1 locale               | Market reality             | English-only-then-localize — rejected |
| D-BD-05 | Local CDN/edge                     | Latency                    | Single region — rejected              |
| D-BD-06 | Dependency and image mirrors       | Bandwidth/reliability      | Direct pulls — rejected               |
| D-BD-07 | Simple mode toggle                 | Digital literacy           | Always advanced — rejected            |

---

_End of 12-bangladesh-development-context.md._

_End of all 12 super docs._
