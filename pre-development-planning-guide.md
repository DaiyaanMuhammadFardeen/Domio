# Pre-Development Planning Guide

A checklist of everything worth thinking through **before** you write the first line of application code. Skipping these doesn't mean you avoid the work — it means you do it later, mid-build, when it's more expensive to change. Each section says _what it is_ and _why it matters_.

> **Note on section 11 (Legal & Compliance):** Bangladesh's data protection framework is new and actively being amended — the Personal Data Protection Act 2026 was only finalized in April 2026, with a February 2026 amendment already having changed its localization rules. Treat the specifics below as current as of mid-2026 and **verify against official sources or legal counsel before finalizing architecture decisions**, especially around data localization and enforcement timelines.

---

## 1. Problem & Product Definition

### 1.0 Competitive / Existing-Solution Analysis

What already exists that solves this or something adjacent? Why isn't that enough — what's genuinely different about what you're building?
**Why:** Often reshapes the problem statement itself before it even solidifies. Skipping this risks rebuilding something that already exists, or missing a constraint a competitor already learned the hard way.

### 1.1 Problem Statement

What specific problem are you solving, for whom, and why does it matter? Write this in 2-3 sentences before anything else.
**Why:** Every downstream decision (features, architecture, tech stack) should trace back to this. Without it, scope creep is inevitable.

### 1.2 Target Users / Personas

Who uses this? What's their technical skill level, context of use (mobile on the go? desktop at a desk?), and pain points?
**Why:** Determines UI complexity, platform priority, offline needs, accessibility requirements.

### 1.3 Success Metrics

How will you know this worked? (e.g., signups, latency targets, retention, cost savings, correctness rate)
**Why:** Without metrics you can't tell "done" from "not done," and you can't prioritize trade-offs objectively.

### 1.4 Scope: MVP vs. Later

Explicitly list what's **in** for v1 and what's explicitly **deferred**.
**Why:** The single biggest cause of blown timelines is undefined scope. Write the "not doing this yet" list — it's as important as the "doing this" list.

### 1.5 Constraints

Budget, deadline, team size/skills, compliance requirements (GDPR, HIPAA, etc.), platform constraints (must run offline, must run on-prem, must support old browsers).
**Why:** Constraints eliminate entire categories of solutions early, saving you from designing something you can't actually ship.

---

## 2. Requirements Engineering

### 2.1 Functional Requirements

The concrete list of what the system _does_ — usually as user stories or use cases ("As a user, I can reset my password via email").
**Why:** This becomes your source of truth for what to build and what "feature complete" means. Ambiguity here becomes rework later.

### 2.2 Non-Functional Requirements (NFRs)

Performance targets (response time, throughput), scalability targets (concurrent users, data volume), availability/uptime target, security requirements, accessibility (WCAG level), localization/i18n needs, browser/device support matrix.
**Why:** NFRs shape architecture far more than features do. "Must handle 10K concurrent users" and "must handle 10 users" produce completely different systems. Deciding this after the fact often means a rewrite.

### 2.3 Acceptance Criteria

For each major requirement, define what "done and correct" looks like, testable and unambiguous.
**Why:** Prevents disagreements about whether a feature is finished, and feeds directly into your test plan.

### 2.4 Out-of-Scope / Non-Goals

Explicitly document what you will **not** build, even if related.
**Why:** Stops well-meaning scope creep during development ("while we're at it, let's also...").

---

## 3. User Experience & Interface Planning

### 3.1 User Flows

Diagrams of the paths a user takes through the system to accomplish key tasks (signup → onboarding → core action).
**Why:** Surfaces missing screens/states/edge cases (what happens if they abandon halfway?) before you've built the backend to support them.

### 3.2 Wireframes / Low-Fidelity Mockups

Rough sketches of each screen's layout and content, not visual polish.
**Why:** Cheap to change now, expensive to change once coded. Aligns what you're building with what stakeholders expect.

### 3.3 Design System / UI Conventions

Component library choice, spacing/typography rules, color palette, interaction patterns (loading states, error states, empty states).
**Why:** Prevents a UI that looks inconsistently built by different people at different times, and speeds up actual implementation once decided.

### 3.4 Content & Copy

Placeholder text, tone of voice, error messages, empty states — planned, not left as "TODO" in the UI.
**Why:** Copy is often treated as an afterthought and ends up inconsistent or condescending/unclear when rushed at the end.

### 3.5 Accessibility Testing Plan

Not just the WCAG target level (an NFR) but _how_ you'll verify it: automated scanning tools in CI, plus a manual keyboard-navigation and screen-reader pass before major releases.
**Why:** Accessibility named as a requirement but never actually tested is where most teams quietly drop it. Without an explicit verification step it doesn't happen.

---

## 4. System Architecture

### 4.1 High-Level Architecture Diagram

The big picture: client(s), backend, databases, third-party services, and how they connect.
**Why:** Forces you to think about the whole system before committing to any one part of it. Also the fastest way to communicate the system to a new team member or reviewer.

### 4.2 Monolith vs. Microservices vs. Modular Monolith

Decide deliberately, don't default to microservices out of trend-following.
**Why:** Microservices add real operational cost (networking, observability, deployment complexity, data consistency across services). For most early-stage products, a well-structured **modular monolith** is faster to build, easier to debug, and easier to split later once you actually know where the seams should be. Only choose microservices if you have genuine independent-scaling needs, separate team ownership boundaries, or regulatory isolation requirements from day one.

### 4.3 Service Boundaries (if microservices/modules)

If you do split services/modules, define boundaries by business capability (e.g., "billing," "auth," "notifications"), not by technical layer.
**Why:** Boundaries drawn along business capabilities age well; boundaries drawn along technical layers (e.g., "the database service") tend to create tightly-coupled, chatty systems that defeat the purpose of splitting them.

### 4.4 Communication Patterns

Synchronous (REST/gRPC/GraphQL) vs. asynchronous (message queue/event bus) between components, and where each is appropriate.
**Why:** Sync calls are simple but create tight coupling and cascading failures. Async improves resilience and scalability but adds complexity (eventual consistency, debugging distributed flows). Pick per-interaction, not globally.

### 4.5 API Design & Contracts

API style (REST/GraphQL/gRPC), versioning strategy, endpoint/resource naming conventions, request/response schemas, error format, pagination approach, auth mechanism per endpoint.
**Why:** Once external clients (including your own frontend) depend on an API shape, changing it is a breaking change. Define the contract before parallel frontend/backend work starts, so both sides can build against a shared spec (e.g., OpenAPI) instead of guessing.

### 4.6 Data Flow Diagrams

How data moves through the system for key operations (e.g., what happens end-to-end when a user places an order).
**Why:** Surfaces race conditions, missing validation points, and unclear ownership of data before they become production bugs.

### 4.7 Error Handling & Resilience Philosophy

A deliberate stance — not a per-incident improvisation — on retry policies, timeout budgets, circuit breakers, and graceful degradation: when a downstream dependency is unavailable, does the system fail loudly, fail silently, or fall back to reduced functionality?
**Why:** This is a design decision, not a bug-fix decision. Deciding it upfront means every component is built consistently around it; deciding it reactively during an outage means whatever gets bolted on under pressure, which tends to be inconsistent across the system.

### 4.8 Idempotency & Concurrency Design

For any operation with financial, write-heavy, or retry-prone characteristics: idempotency keys, optimistic vs. pessimistic locking, and explicit handling of race conditions (e.g., two requests modifying the same record simultaneously).
**Why:** Easy to skip because it rarely bites in early testing, and brutal to retrofit once it does — usually as a duplicate charge, a double-booked resource, or a corrupted record in production.

### 4.9 Feature Flags & Rollout Strategy

How incomplete or risky features ship safely: flag-gating, canary/phased rollouts, and a kill-switch to disable a misbehaving feature without a full redeploy.
**Why:** Without this, every deploy is all-or-nothing, which either slows down shipping (everyone waits for 100% confidence) or increases blast radius when something goes wrong.

### 4.10 API Versioning & Deprecation Policy for External Consumers

Beyond internal API contract design (4.5): how you communicate breaking changes to _external_ API consumers, how long old versions stay supported, and the sunset process.
**Why:** Internal API changes are your problem; external ones are your users' problem. Without a stated policy, every change either breaks someone silently or you're stuck supporting every version forever.

---

## 5. Data & Database Design

### 5.1 Data Modeling / Entity Relationship Diagram (ERD)

Entities, their attributes, and relationships (one-to-many, many-to-many, etc.) — done conceptually before any table exists.
**Why:** The database schema is one of the most expensive things to change after launch (migrations, downtime risk, data loss risk). Getting the model right early avoids painful reshaping later.

### 5.2 Database Choice: SQL vs. NoSQL vs. Hybrid

Pick based on data shape and access patterns: relational for structured data with relationships and strong consistency needs; document/NoSQL for flexible or hierarchical schemas and horizontal scale; key-value/cache for high-speed lookups; graph DB for deeply relational/network data.
**Why:** Wrong choice here means fighting your database for the life of the project. Given your stated preference for local-first infrastructure, also weigh what's easy to self-host and back up (Postgres/SQLite are strong defaults here).

### 5.3 Schema Design

Table/collection structures, primary/foreign keys, indexes, constraints (unique, not-null, check constraints), normalization level (and deliberate denormalization where it helps read performance).
**Why:** Good indexing decided upfront prevents "why is this query slow" fire drills later. Under-normalized schemas cause data inconsistency; over-normalized ones cause slow joins — the right level depends on actual query patterns, so plan around your real access patterns, not defaults.

### 5.4 Data Migration & Seeding Strategy

How schema changes will be version-controlled and rolled out (migration tooling), and how you'll generate realistic seed/test data.
**Why:** Without a migration strategy, schema changes become manual, undocumented, and risky across environments (dev/staging/prod drift).

### 5.5 Data Retention & Backup Policy

What data is kept, for how long, backup frequency, and recovery process (tested, not just assumed to work).
**Why:** An untested backup is not a backup. Deciding retention early also matters for compliance and storage cost planning.

### 5.6 Data Privacy & Classification

Which fields are PII/sensitive, and how they're handled (encryption at rest, masking in logs, access restrictions).
**Why:** Retrofitting privacy protections after data is already flowing unencrypted through logs and caches is far harder than designing it in from the start.

### 5.7 Internationalization Data Model

If i18n is in scope, this isn't just UI copy — it's schema: timezone storage (always store in UTC, convert at display), currency as integers/cents rather than floats, text-direction support, and locale-aware sortable collation.
**Why:** These are structural schema decisions. Storing local time instead of UTC, or currency as floats, are the kind of mistakes that require a data migration to fix later rather than a code change.

### 5.8 Account Offboarding & Data Export

The reverse of onboarding: how a user deletes their account, what happens to their data (hard delete vs. anonymize vs. retain for legal reasons), and how they export their own data.
**Why:** Often legally required (GDPR right-to-erasure, data portability) and commonly forgotten until a user or regulator actually asks for it — at which point it's an emergency instead of a planned feature.

---

## 6. Technology Stack Decisions

### 6.1 Language & Framework Selection

Chosen per component based on the problem's actual characteristics (CPU-bound vs I/O-bound, team familiarity, ecosystem maturity, hiring/learning cost) — not hype.
**Why:** The "best" language is context-dependent. A wrong-but-familiar stack often ships faster than a "correct" but unfamiliar one.

### 6.2 Third-Party Services & Build vs. Buy

For each non-core capability (payments, email, search, auth, file storage), decide whether to build, self-host an open-source option, or use a managed vendor.
**Why:** Every third-party dependency is a future point of vendor lock-in, cost scaling, and outage risk — but building everything yourself is its own tax on time. Decide deliberately per capability, and note where self-hosting keeps you privacy/control-friendly if that matters for the project.

### 6.3 Dependency & Version Policy

How you'll manage package versions, lockfiles, and update cadence.
**Why:** Uncontrolled dependency drift is a common source of "works on my machine" and supply-chain risk.

---

## 7. Security Planning

### 7.1 Authentication & Authorization Model

How users prove identity (password, OAuth, passkeys, SSO) and how permissions are structured (RBAC, ABAC, simple roles).
**Why:** Auth is foundational and deeply invasive to retrofit — nearly every feature ends up touching it. Get the model right before building features on top of it.

### 7.2 Threat Modeling

Walk through likely attack vectors for this specific system (injection, broken auth, data exposure, SSRF, etc. — see OWASP Top 10 as a starting checklist).
**Why:** Cheapest time to fix a security hole is at design time. Post-launch, it's an incident response.

### 7.3 Secrets Management

How API keys, credentials, and tokens are stored and rotated (never hardcoded, never committed).
**Why:** Leaked secrets are one of the most common and most damaging real-world breaches — and one of the easiest to prevent with upfront tooling (env vars, vaults, secret managers).

### 7.4 Input Validation & Sanitization Strategy

Where validation happens (client, API boundary, database) and what's the standard for it.
**Why:** Consistent validation at the boundary prevents an entire class of bugs and vulnerabilities, and prevents "validated in one form but not another" gaps.

### 7.5 Rate Limiting & Abuse Prevention

Plans for throttling, bot protection, and abuse detection on public-facing endpoints.
**Why:** Cheap to add at the gateway/middleware layer upfront; painful to bolt on after you've been scraped or DDoS'd.

---

## 8. Infrastructure & DevOps Planning

### 8.1 Environment Strategy

Local dev, staging, production (and possibly QA) — clearly separated, with parity between them as much as possible.
**Why:** "It worked in dev" gaps almost always trace back to environment drift. Deciding this early prevents configuration chaos.

### 8.2 Hosting & Deployment Target

Self-hosted, VPS, cloud provider, or hybrid — and specifically, containerized (Docker) or not.
**Why:** Affects almost every other infra decision (CI/CD, scaling approach, cost model). Given a local-first preference, self-hosted/VPS with containers is often a good default over deep cloud-vendor lock-in.

### 8.3 CI/CD Pipeline

What triggers a build, what tests/checks gate a merge, how deployment happens (manual approval vs. automatic).
**Why:** Without this planned, deployments become manual, inconsistent, and risky — and testing gets skipped under time pressure.

### 8.4 Observability: Logging, Metrics, Tracing

What gets logged, structured log format, metrics collected, and (for distributed systems) distributed tracing.
**Why:** You cannot debug production issues you can't see. Retrofitting observability after an outage is too late for that outage.

### 8.5 Alerting & On-Call

What conditions trigger an alert, and to whom.
**Why:** Detecting an outage from a user complaint instead of a monitor is a bad first impression and a slow recovery.

### 8.6 Scaling Strategy

Vertical vs. horizontal scaling plan, stateless vs. stateful service design, caching layers.
**Why:** Stateful services are hard to scale horizontally after the fact — deciding statelessness early keeps that option open cheaply.

### 8.7 Disaster Recovery Plan

What happens if the database is lost, a deploy breaks prod, or a dependency goes down — recovery time objective (RTO) and recovery point objective (RPO).
**Why:** Having a plan (even a simple one) turns a potential extinction-level event into a bad afternoon.

### 8.8 Cost Modeling

An actual projection of infra cost at expected scale — $/user or $/request, not just "stay within budget" as a vague constraint. Model this _before_ picking a database or hosting approach, since some choices that look free at small scale get expensive fast.
**Why:** Budget as a constraint (section 1.5) tells you a ceiling; cost modeling tells you whether your architecture will hit that ceiling at 10x or 1000x your current scale — and lets you catch a bad-at-scale choice while it's still cheap to change.

---

## 9. Testing Strategy

### 9.1 Test Pyramid Plan

What proportion of unit vs. integration vs. end-to-end tests, and what each layer is responsible for catching.
**Why:** Without a plan, teams either over-invest in slow E2E tests or under-invest in tests entirely. Planning this avoids both.

### 9.2 Test Data Strategy

How test environments get realistic, safe (non-production, non-PII) data.
**Why:** Tests against unrealistic data give false confidence; tests against real prod data risk leaking PII into lower environments.

### 9.3 Definition of "Done"

Explicit checklist a feature must pass before merge (tests written, code reviewed, docs updated).
**Why:** Prevents "done" meaning different things to different team members, which quietly erodes quality over time.

---

## 10. Project & Team Planning

### 10.1 Team Roles & Ownership

Who owns which part of the system, and decision-making authority for architecture changes.
**Why:** Ambiguous ownership causes both duplicated effort and dropped responsibilities.

### 10.2 Development Workflow

Branching strategy (trunk-based, git-flow), code review process, commit conventions.
**Why:** Agreeing on this before multiple people are writing code prevents merge chaos and inconsistent history.

### 10.3 Documentation Plan

What gets documented (architecture decisions, API docs, runbooks, onboarding guide) and where it lives.
**Why:** Undocumented decisions get re-litigated repeatedly, and undocumented systems are painful to onboard new contributors into — including future-you.

### 10.4 Timeline & Milestones

Rough phases with checkpoints, not just a single end date.
**Why:** Milestones let you catch schedule slippage early enough to adjust scope, instead of discovering it at the deadline.

---

## 11. Legal & Compliance — Bangladesh Context

Bangladesh's regulatory landscape for software has changed significantly and is still actively settling — plan against the current state, but expect amendments.

### 11.1 Personal Data Protection Act, 2026 (PDPA)

Bangladesh's first standalone data protection law (originally the Personal Data Protection Ordinance 2025, formally passed as the PDPA in April 2026). It applies to any entity processing personal data of individuals in Bangladesh — including foreign companies serving Bangladeshi users — and introduces the concept of a "data fiduciary" (equivalent to GDPR's "data controller"). Core obligations: consent must be voluntary, specific, informed, unambiguous, and withdrawable; data subject rights (access, correction, erasure); breach notification; a required "Chief Data Officer" for significant data fiduciaries; retention limits; special protections for children's data.
**Why:** Full enforcement (penalties, formal complaint/investigation procedures) activates around **May 2027**, but the law is already in force in principle — so the current period is a compliance runway, not a grace period to ignore. Design consent flows, data subject request handling, and retention policies now rather than retrofitting them under regulatory pressure later. **Verify current enforcement status and requirements directly before launch, since this law is actively being amended.**

### 11.2 Data Localization Requirements

As amended in February 2026, the mandatory "synchronized real-time local copy" requirement for cloud-stored data applies specifically to **restricted personal data** and **Critical Information Infrastructure (CII)** data — general personal data, internal data, and confidential data on foreign cloud providers are no longer subject to mandatory local mirroring. However, the regulatory Authority retains power to order relocation or cessation of cloud infrastructure (domestic or foreign) within 60 days if it finds a data breach or "national interest" concern.
**Why:** This directly affects your hosting decision (section 8.2). If your data includes anything classifiable as "restricted" (the PDPA schedule defines tiers), plan for a local synchronized copy from day one rather than discovering the requirement after you've built on a foreign-only cloud stack. Even outside that category, the discretionary relocation power is a real operational risk worth architecting for (e.g., avoid deep platform lock-in that would make a forced migration catastrophic). **This is an evolving area — confirm current classification rules before committing to a hosting architecture.**

### 11.3 Cyber Security Ordinance 2025 (successor to the Digital Security Act 2018 / Cyber Security Act 2023)

Governs unauthorized access, data breaches, and cyber offenses, and defines Critical Information Infrastructure (which pulls in the stricter localization rule above if applicable to your sector).
**Why:** Determines what counts as a reportable security incident and what liability looks like for breaches — check whether your sector or data type qualifies as CII, since that changes your localization and security obligations materially.

### 11.4 Sector-Specific Regulation (Bangladesh Bank / BTRC)

If handling payments or financial data: Bangladesh Bank issues data management and cybersecurity guidelines for financial institutions and payment services, separate from and additional to the PDPA. If handling telecom data or operating anything BTRC-regulated: BTRC has its own data-handling rules for telecom and consumer data.
**Why:** Sector regulators can impose stricter or additional requirements on top of the general data protection law — a fintech or payments product can't assume PDPA compliance alone is sufficient.

### 11.5 Payment Gateway & Financial Integration Compliance

If accepting payments: mobile financial services (bKash, Nagad, Rocket) dominate the market (roughly 70%+ of online payments), so plan to support at least bKash and Nagad alongside cards. You can integrate directly with each provider's API, or through a Bangladesh Bank-approved aggregator (e.g., SSLCommerz, ShurjoPay, Moneybag) that provides one integration covering multiple methods — generally the faster path unless you have a specific reason to integrate directly. Merchant onboarding requires KYC documentation (trade license, NID, bank account details), and any gateway you use should be Bangladesh Bank approved and, ideally, PCI-DSS certified for card handling.
**Why:** Building for card payments alone in a mobile-wallet-dominant market will hurt adoption regardless of how good the product is. Deciding aggregator vs. direct integration early affects both timeline (aggregators are much faster to launch with) and long-term fee structure — worth comparing before committing.

### 11.6 Terms of Service / Privacy Policy

Drafted in line with what the system actually does with user data, and specifically referencing PDPA obligations (consent basis, retention periods, data subject rights, data fiduciary contact) rather than a generic GDPR-style template.
**Why:** A copy-pasted foreign privacy policy that doesn't reflect actual PDPA requirements is a compliance gap that looks like compliance — worse than having none, because it creates false confidence.

### 11.7 Licensing

Licenses of all third-party dependencies and libraries, checked for compatibility with your intended use (including commercial use if applicable).
**Why:** Some open-source licenses (e.g., copyleft licenses like AGPL) impose obligations that can conflict with proprietary/commercial plans if not checked upfront.

---

## 12. Bangladesh Development Environment Considerations

### 12.1 Connectivity & Infrastructure Reliability

Design for intermittent internet connectivity and power interruptions as a normal operating condition, not an edge case — this affects both your own dev/deployment pipeline (local mirrors of dependencies where feasible) and end-user-facing product decisions (offline-first or offline-tolerant UX, aggressive client-side caching, graceful reconnection handling).
**Why:** Assuming always-on, low-latency connectivity (a common default in tooling built for other markets) produces a product that feels broken for a meaningful share of local users and complicates your own CI/CD if it isn't accounted for.

### 12.2 Hosting: Local vs. Foreign Cloud Trade-off

Weigh local Bangladeshi hosting/data-center options against foreign cloud providers (AWS, GCP, Azure) considering: latency for local users, the localization requirements in 11.2, cost in BDT vs. USD-denominated billing (currency risk), and the discretionary relocation risk noted above.
**Why:** This isn't purely a technical decision here — the localization law and the Authority's relocation power make it partly a compliance decision too. A foreign-cloud-only architecture without a documented fallback plan carries real regulatory exposure specifically in this market.

### 12.3 Mobile-First, Bandwidth-Conscious Design

Given mobile-dominant internet access and variable network quality, prioritize lightweight payloads, image optimization, and progressive loading over designs that assume desktop-class bandwidth.
**Why:** Directly affects conversion and usability for the majority of the actual user base in this market, more so than in bandwidth-rich contexts.

### 12.4 Language & Localization

Bangla (Bengali) language support — proper Unicode/Bangla font rendering, Bangla numeral display where culturally expected, and bilingual (Bangla/English) UI where the target audience spans both.
**Why:** Ties back to the i18n data modeling section (5.7) but is worth calling out explicitly here — a Bangla-illiterate product in a market where a large share of users are more comfortable in Bangla than English is a real adoption barrier, not a nice-to-have.

---

_A note on how to use this: you don't need every section fleshed out to the same depth for every project. A weekend side project might need sections 1, 4, 5, and 6 at a paragraph each. A production system handling real user data and money needs most of this in real depth. Scale the rigor to the stakes — but at least *consciously decide* to skip a section, rather than skip it by not knowing it exists._
