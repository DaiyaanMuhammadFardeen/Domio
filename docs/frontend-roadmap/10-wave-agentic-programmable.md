# Wave 10 — Agentic & Programmable Interfaces

**Intent.** Build the UI surfaces that let external agents and power users drive Domio. MCP server config, webhook tester, API explorer, CLI download, plugin SDK portal, rate-limit + spend dashboards, and the agent-to-agent handoff inspector.

**Why it matters.** Agents are the next adoption vector. A platform with a great MCP server but no UI for it is invisible to non-developers. A platform with an MCP UI but no way to discover tools is invisible to agents.

---

## 1. Scope

- **§16 Agentic & Programmable Interfaces:** #221–236 (every feature with a UI gap).
- **§15 Novel/frontier:** #230 (agent-to-agent handoff UI).

---

## 2. Sub-phase map

### S10.1 — MCP server config UI

**Features:** #221, #225, #226.

**Files to create:**
- `apps/admin-console/src/app/mcp/page.tsx`
- `apps/admin-console/src/app/mcp/tools/page.tsx`
- `apps/admin-console/src/app/mcp/permissions/page.tsx`
- `apps/admin-console/src/app/mcp/audit/page.tsx`

**Build instructions:**
1. MCP server status: running, version, uptime.
2. Tools registry browser: every MCP tool listed with name, description, params, return shape, rate-limit class.
3. Per-agent permissions: scope (this-deck-only, read-only, data-binding-only, no-brand-locked-regions), token rotation.
4. Audit log of agent actions: tool, args, result, latency, trace id.

**SOLID notes:**
- **O:** adding a new MCP tool is server-side only; the UI consumes the live registry.

**Acceptance:**
- Tool registry loads <500 ms.
- Audit log queryable per agent + per tool.

---

### S10.2 — Webhook subscriptions UI

**Features:** #229.

**Files to modify:**
- `apps/admin-console/src/app/webhooks/page.tsx` (already in Wave 8; extend with tester)

**Build instructions:**
1. List subscriptions per event (`deck.viewed`, `comment.added`, `approval.granted`, `data.updated`).
2. Subscribe form: event, URL, secret, retry policy.
3. Webhook tester: send a sample payload; show the receiving endpoint's response.

---

### S10.3 — API explorer (Postman-style)

**Features:** #238.

**Files to create:**
- `apps/admin-console/src/app/api-explorer/page.tsx`
- `apps/admin-console/src/components/api-explorer/{EndpointTree,RequestBuilder,ResponseViewer,AuthSelector}.tsx`

**Build instructions:**
1. Endpoint tree on the left; clicking populates the request builder.
2. Request builder: params, headers, body editor (Monaco, JSON-aware).
3. Auth selector: API key, OAuth, MCP token.
4. Response viewer: status, headers, body (pretty-printed JSON), latency.
5. Save as snippet; copy as cURL.

---

### S10.4 — CLI download page

**Features:** #237.

**Files to create:**
- `apps/landing/src/app/cli/page.tsx`
- `apps/landing/src/components/cli/{InstallInstructions,CommandList,ExamplesGallery}.tsx`

**Build instructions:**
1. Install instructions per OS (macOS, Linux, Windows) + per package manager (brew, apt, scoop).
2. Command list: `deckctl create`, `deckctl push`, `deckctl diff`, `deckctl export`, `deckctl patch`.
3. Examples gallery with copy-able snippets.

---

### S10.5 — Plugin SDK portal

**Features:** #236.

**Files to create:**
- `apps/landing/src/app/plugins-sdk/page.tsx`
- `apps/landing/src/components/plugins-sdk/{Quickstart,Tutorials,SamplePlugin,PublishFlow}.tsx`

**Build instructions:**
1. Quickstart: scaffold a plugin in 5 minutes.
2. Tutorials: canvas plugin, data connector, export format.
3. Sample plugin repo + download.
4. Publish flow: submit to marketplace review.

---

### S10.6 — Rate-limit + spend dashboards

**Features:** #233, #234.

**Files to create:**
- `apps/admin-console/src/app/billing/usage/page.tsx`
- `apps/admin-console/src/app/billing/rate-limits/page.tsx`

**Build instructions:**
1. Usage chart: API calls, AI tokens, render minutes, export minutes.
2. Per-agent breakdown.
3. Cost projection.
4. Rate-limit editor: per-key or per-agent limits.

---

### S10.7 — Server-sent change feed inspector

**Features:** #240.

**Files to create:**
- `apps/admin-console/src/app/change-feed/page.tsx`

**Build instructions:**
1. Subscribe to a deck's change feed; live stream of CRDT ops.
2. Filter by op kind (slide create, element update, etc.).
3. Pause / resume / replay.

---

### S10.8 — Agent-to-agent handoff inspector

**Features:** #230.

**Files to create:**
- `apps/admin-console/src/app/agent-handoff/page.tsx`

**Build instructions:**
1. Pipeline visualizer: a graph of agents (research → deck-builder → brand-compliance → rehearsal-coach) with status per node.
2. Per-pipeline detail: inputs, outputs, handoff tokens, latency, errors.
3. Replay a pipeline against the current deck state.

---

### S10.9 — Tool-call transcript viewer

**Features:** #227.

**Files to modify:**
- `apps/editor/src/components/prototyping/agent/AuditTrail.tsx` (already exists; harden)

**Build instructions:**
1. Audit trail shows every tool call made by an agent against the current deck, separated from human edits.
2. Filter by agent, time range, tool.
3. Click an entry to see the full request/response.

---

### S10.10 — Dry-run preview for agent edits

**Features:** #228.

**Files to create:**
- `apps/editor/src/components/prototyping/agent/DryRunPreview.tsx`

**Build instructions:**
1. Agent proposes a diff; preview pane shows added/removed/changed elements.
2. Approve to apply; reject to discard.
3. Diff is structured (per #240) — not just text.

---

## 3. SOLID injection

### Module map
```
apps/admin-console/src/app/
├── mcp/page.tsx
├── mcp/tools/page.tsx
├── mcp/permissions/page.tsx
├── mcp/audit/page.tsx
├── webhooks/page.tsx          # Wave 8 + tester here
├── api-explorer/page.tsx
├── change-feed/page.tsx
├── agent-handoff/page.tsx
└── billing/
    ├── usage/page.tsx
    └── rate-limits/page.tsx

apps/landing/src/app/
├── cli/page.tsx
└── plugins-sdk/page.tsx
```

### Rule: agentic surfaces are read-mostly with narrow actions
MCP config is set once and rarely changed. Tool registry is browsed, not edited. Audits are read. The few actions (mint token, rotate secret, subscribe webhook) follow a tight pattern: confirm modal → toast → audit log entry.

---

## 4. Out of scope

- Building the MCP server itself (backend presumed complete).
- Building the CLI itself (backend presumed complete).

---

## 5. DoD checklist

- [ ] Every §16 feature has a UI surface.
- [ ] API explorer round-trips a real call.
- [ ] Webhook tester successfully sends + receives a sample payload.
- [ ] CLI install instructions verified per OS.
- [ ] Spend dashboard accurate to the cent.
- [ ] Change feed inspector streams live.
- [ ] MCP tool registry loads in <500 ms.
