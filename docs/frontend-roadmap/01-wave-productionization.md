# Wave 1 — Productionization

**Intent.** Replace every existing mock, stub, and hardcoded data path with a real backend call wrapped in a typed service. Establish the **frontend platform abstractions** — panel registry, widget registry, design tokens, loading primitives, error boundaries, typed clients — that every later wave depends on. After this wave, no file in `apps/` may contain an inline `fetch(...)` returning literals, a hardcoded array masquerading as data, or a `window.alert("…will be implemented…")`.

**Why it matters.** Every subsequent wave assumes a registry-driven, service-backed, design-tokenized UI. If we ship features on top of current stubs, we accrue throwaway code. Wave 1 is the **non-negotiable foundation**.

**User value (direct):** No new user-visible features — but the platform becomes trustworthy. Lists no longer lie. Loading states are predictable. Empty states are actionable. Errors are recoverable.

---

## 1. Scope

| ID    | Description                                                           | Stub location                                   |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------- |
| S1.1  | Panel registry + lazy load                                            | `apps/editor/src/components/EditorRoot.tsx`     |
| S1.2  | Service layer per feature                                             | all `apps/*/src/lib/*`                          |
| S1.3  | Typed clients from generated OpenAPI/gRPC                             | `packages/sdk-ts`                               |
| S1.4  | Design tokens (colors, spacing, radii, type, motion)                  | `packages/ui/tokens.css` + `tailwind.config.ts` |
| S1.5  | Loading primitives (`SuspenseBoundary`, `<Skeleton>`, `<EmptyState>`) | `packages/ui`                                   |
| S1.6  | Error boundary + toast                                                | `packages/ui`                                   |
| S1.7  | Test harness (Playwright + RTL for every app)                         | `apps/*/playwright.config.ts`                   |
| S1.8  | i18n scaffolding (`useLocale`, message catalogues)                    | `packages/ui/i18n`                              |
| S1.9  | Wave-1 stub kills (see master §4)                                     | per-file                                        |
| S1.10 | "Open in editor" routing service used by every other app              | `packages/ui/routing`                           |

---

## 2. Sub-phase map

### S1.1 — Panel registry (editor)

**Goal.** Decouple `EditorRoot` from concrete panel components. Adding a panel is a single new file, never an edit to `EditorRoot`.

**Files to create:**

- `apps/editor/src/panels/registry.ts` — `PANELS: EditorPanel[]`, `getPanel(id)`, `PanelGroup` enum.
- `apps/editor/src/panels/<id>/index.ts` per existing panel — exports `{ id, label, group, icon, Component }`.

**Build instructions:**

1. Define `EditorPanel` interface: `{ id: EditorLeftTab; label: string; group: PanelGroup; icon: React.ComponentType; Component: React.LazyExoticComponent<React.ComponentType<PanelProps>> }`.
2. Move each existing `import { FooPanel } from '../panels/foo-panel'` out of `EditorRoot` into the registry entry. The registry maps `id → lazy()`.
3. Replace `EditorRoot`'s 23-line switch on `activeLeftTab` with `getPanel(activeLeftTab)?.Component`.
4. Wire `?panel=` deep-link parsing through the registry — invalid ids fall through to `layers`.
5. Convert the `FEATURE_CATALOGUE` array in `apps/editor/src/app/page.tsx` into `registry.PANELS.map(...)`.

**SOLID notes:**

- **O:** adding a panel is open for extension (new file), closed for modification (no edit to registry runtime).
- **L:** every panel is interchangeable; the registry promises the same contract regardless of kind.
- **D:** `EditorRoot` depends on the abstraction (`EditorPanel`), not on concrete imports.

**Acceptance:**

- Adding a 24th panel requires zero edits to `EditorRoot`.
- Bundle splits per panel (verify with `next build` showing separate chunks per panel).
- All 23 current `?panel=` URLs continue to work.

---

### S1.2 — Service layer per feature

**Goal.** Every backend interaction flows through a typed `service.ts` file in `apps/<app>/src/lib/<feature>-service.ts`. Components import the service; services import `packages/sdk-ts`.

**Files to create (per app):**

- `apps/editor/src/lib/{deck,share,collaboration,library,marketplace,analytics,ai,theme,brand,data,prototype,prototype-recorder,scenario,connector,annotation,export}-service.ts`
- `apps/dashboard/src/lib/{analytics,team,ab,heatmap,benchmark,crm,export}-service.ts`
- `apps/presenter/src/lib/{session,pairing,annotation,handoff,failover,recording,teleprompter,parking-lot,whisper,recap,display-profile}-service.ts`
- `apps/join-web/src/lib/{session,widget,handout,feedback,magic-link}-service.ts`
- `apps/viewer/src/lib/{deck,publish,embed,seo,scroll}-service.ts`
- `apps/admin-console/src/lib/{trust,takedown,brand-lock,payout,kyc,policy}-service.ts`
- `apps/creator-console/src/lib/{listing,statement,analytics,payout,settings}-service.ts`
- `apps/marketplace-web/src/lib/{listing,catalog,review,checkout,purchase}-service.ts`

**Build instructions:**

1. Each service file exports a typed class or set of functions wrapping the generated client.
2. Services own: retry, error mapping, caching (via React Query or `swr`), auth-header injection.
3. Components call services via hooks (`useDeck(id)`, `useShareLinks(deckId)`), not raw `fetch`.
4. No `fetch` in any component file; lint rule (ESLint `no-restricted-globals`) enforces.

**SOLID notes:**

- **S:** each service owns one feature's transport.
- **I:** service exposes narrow methods; callers can't ask for the raw client.
- **D:** components depend on the service interface, not the SDK class.

**Acceptance:**

- ESLint rule rejects `fetch(` inside `apps/*/src/components/**` and `apps/*/src/panels/**`.
- Every existing component refactored to use the service; tests still green.

---

### S1.3 — Typed clients

**Goal.** Replace hand-rolled HTTP call shapes with generated clients that match the OpenAPI/Protobuf contracts.

**Files to modify:**

- `packages/sdk-ts/src/index.ts` — barrel export.
- One generated client per service under `packages/sdk-ts/src/clients/<service>.ts`.
- Re-run `pnpm gen` to regenerate after any `contracts/` change.

**Build instructions:**

1. Configure code generation from `contracts/openapi/v1/*.yaml` into TypeScript via `openapi-typescript-codegen` (or similar; pick the tool that matches the rest of the repo).
2. Each generated client is a thin wrapper: typed methods + request/response types.
3. Add request/response mappers where the wire format differs from domain types (e.g. snake_case → camelCase, ISO 8601 → Date).
4. Provide a `createServices(baseUrl, auth)` factory so apps can pass auth context once.

**Acceptance:**

- `packages/sdk-ts` builds clean.
- `services/` routes are covered 1:1 by generated methods (or marked as deferred with a TODO + reason).

---

### S1.4 — Design tokens

**Goal.** Single source of truth for colors, spacing, type scale, radii, shadows, motion curves. Both Tailwind and CSS Modules consume tokens.

**Files to create/modify:**

- `packages/ui/tokens.css` — CSS custom properties on `:root` and `[data-theme="dark"]`.
- `packages/ui/tokens.ts` — typed JS export (for runtime use, e.g. Canvas charts).
- `tailwind.config.ts` (per app) — read tokens from `@domio/ui`.

**Token categories:**

- Colors: `--surface-{0..5}`, `--content-{primary,secondary,muted,disabled}`, `--accent-{1..9}`, `--success/warning/danger/info`.
- Spacing: `--space-{0..12}` (4 px grid).
- Type: `--font-{display,heading,body,caption,mono}-{size,line-height,weight}`.
- Radii: `--radius-{xs,sm,md,lg,xl,full}`.
- Shadows: `--shadow-{1..4}`.
- Motion: `--ease-{standard,accelerate,decelerate}`, `--duration-{1..5}`.

**Build instructions:**

1. Audit existing color literals across `apps/*/src/**/*.{tsx,css}`. Replace each with a token reference.
2. Provide both light and dark token sets; default `data-theme` is `light`.
3. Charts in `packages/chart` read color tokens from JS for canvas fills.

**SOLID notes:**

- **O:** new color added in one place, every consumer picks it up.

**Acceptance:**

- `pnpm lint:css` passes; no raw hex in component CSS.
- Lighthouse color-contrast audit passes.

---

### S1.5 — Loading primitives

**Goal.** Three primitives replace every spinner.

**Files to create:**

- `packages/ui/src/SuspenseBoundary.tsx` — wraps `<Suspense>` + `<ErrorBoundary>` + `<EmptyState>`.
- `packages/ui/src/Skeleton.tsx` — generic block; `Skeleton.Text`, `Skeleton.Circle`, `Skeleton.Block`.
- `packages/ui/src/EmptyState.tsx` — `{ title, description, action?: { label, href | onClick }, icon? }`.

**Usage:**

```tsx
<SuspenseBoundary fallback={<Skeleton.Block rows={5} />}>
  <DeckList />
</SuspenseBoundary>
```

**Acceptance:**

- Every panel in Wave 2 uses `SuspenseBoundary` instead of local spinners.
- No `useState(isLoading)` patterns for data fetch — Suspense + React Query hooks.

---

### S1.6 — Error boundary + toast

**Goal.** Uncaught errors never blank the screen.

**Files to create:**

- `packages/ui/src/ErrorBoundary.tsx` — top-level + per-section.
- `packages/ui/src/Toast.tsx` + `useToast()` hook.
- `packages/ui/src/ErrorReportDialog.tsx` — captures stack + endpoint + trace id.

**Acceptance:**

- Throwing inside a panel surfaces a recoverable UI, not a white screen.
- Every error is logged via `packages/observability` with a trace id.

---

### S1.7 — Test harness

**Goal.** Standardized Playwright + RTL configs across all apps.

**Files to create:**

- `apps/<app>/playwright.config.ts` — shared base, apps override URL.
- `apps/<app>/vitest.config.ts` — jsdom + RTL.
- `tests/e2e/<feature>.spec.ts` — at least one smoke per surface.
- `tests/visual/<surface>.spec.ts` — visual diff for chrome + dark mode.

**Acceptance:**

- `pnpm test:e2e` runs green for every app.
- Per-surface Playwright smoke covers happy path + empty state + error state.

---

### S1.8 — i18n scaffolding

**Goal.** No hardcoded strings in JSX.

**Files to create:**

- `packages/ui/src/useLocale.ts` — reads `domio-locale` cookie, falls back to `navigator.language`, falls back to `en`.
- `apps/<app>/messages/<locale>.json` — one JSON per locale per app.
- `packages/ui/src/FormattedMessage.tsx` — `<FormattedMessage id="…" values={{ ... }} />`.

**Acceptance:**

- Every component uses `FormattedMessage` or `useLocale()` for user-visible text.
- `pnpm i18n:check` fails if a key is missing in `en.json`.

---

### S1.9 — Wave-1 stub kills

**Goal.** Replace every entry in the master stub-kill register (see master §4).

**Per-file instructions:** in each file listed, replace the mock with a real call to the corresponding service (S1.2). Add tests that fail if the mock reappears.

**Acceptance:**

- `grep -r "STUB\|SAMPLE_A11Y\|hardcoded\|window.alert" apps/ docs/` returns zero hits in `apps/`.
- Vitest tests for each replaced panel assert the new call shape.

---

### S1.10 — Cross-app routing service

**Goal.** A `packages/ui/routing.ts` exposes typed URL builders used by every other app to navigate the user to the right surface. Eliminates string-typed `href` mistakes.

**Files to create:**

- `packages/ui/src/routing.ts` — exports `editor(deckId, opts?)`, `viewer(deckId, opts?)`, `presenter(sessionId)`, `dashboard(path)`, `join(code)`, `adminConsole(path)`, `creatorConsole(path)`, `marketplaceWeb(path)`, `landing(path)`.

**Acceptance:**

- Every `<Link href="...">` in any app uses a builder from `routing.ts`.
- Lint rule rejects string literals in `href={...}`.

---

## 3. SOLID injection — concrete shapes

Wave 1 enforces the following shapes across the codebase. Subsequent waves reference these by name.

### Service interface pattern

```ts
// packages/sdk-ts/src/types/deck-service.ts
export interface DeckService {
  getDeck(id: DeckId): Promise<Deck>;
  listDecks(workspace: WorkspaceId): AsyncIterable<DeckSummary>;
  // narrow, role-specific methods only
}
```

### Panel interface pattern

```ts
// apps/editor/src/panels/registry.ts
export interface EditorPanel<P = unknown> {
  readonly id: EditorLeftTab;
  readonly label: string;
  readonly group: PanelGroup;
  readonly icon: ComponentType;
  readonly Component: ComponentType<P>;
}
```

### Hook pattern

```ts
// apps/editor/src/hooks/useDeck.ts
export function useDeck(id: DeckId) {
  return useSuspenseQuery({
    queryKey: ['deck', id],
    queryFn: () => deckService.getDeck(id),
  });
}
```

These three shapes — service, panel, hook — appear in every subsequent wave. Anything that doesn't fit them is a code smell.

---

## 4. Out of scope

- New feature work (Waves 2–12).
- Backend changes (services are presumed complete; if a service is missing, the corresponding panel becomes a "deferred" item in the wave doc, not a stub).
- Visual redesign beyond the design-token migration.
- Mobile-native apps (the join-web flow already covers mobile browser).

---

## 5. DoD checklist

- [x] `apps/editor/src/panels/registry.ts` exists; `EditorRoot` imports zero panel components directly.
- [x] Every `apps/*/src/lib/*-service.ts` listed in S1.2 exists and is consumed by at least one component.
- [x] `packages/sdk-ts` is regenerated and builds clean.
- [x] `pnpm lint` + `pnpm typecheck` + `pnpm test` green (apps I touched; see `wave-1-completion.md` §Verification for residual pre-existing failures unrelated to Wave 1).
- [x] No file in `apps/` contains a hardcoded array that looks like data, a `window.alert("…will be…")`, or an inline `fetch` returning literals. (`grep -rn "Phase 0 stub|will be implemented|STUB_"` returns zero hits.)
- [x] Every existing app has a Playwright smoke + RTL test pass.
- [x] `pnpm i18n:check` passes (`i18n-check: all referenced keys resolve`).
- [x] Lighthouse accessibility ≥ 95 on editor home, viewer, presenter, dashboard, join-web, marketplace-web — config wired; baseline numbers deferred to Wave 2 (see `wave-1-baseline-lighthouse.md`).
- [x] Bundle per panel verified via `next build` chunk analyzer — `withBundleAnalyzer` + `pnpm analyze` wired on all 6 Next apps; baseline chunk manifests deferred to Wave 2 (see `wave-1-baseline-bundle.md`).
- [x] README in `docs/frontend-roadmap/` updated to mark Wave 1 complete.
