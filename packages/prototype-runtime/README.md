# @domio/prototype-runtime

> Prototype variables, conditional rules, hotspots, overlays, and
> branching graph primitives — the in-process engine that powers the
> editor preview, web viewer, and (future) presenter runtime.
>
> **Phase 10 implementation.** The persisted CRUD layer lives in
> `services/prototype-runtime/`; the MCP agent surface ships in M8.

## Owner

Phase 10 stream C — Prototyping & Interactivity.

## Public API surface

### Expression subsystem (`expression/`)

- `compileExpression(source, opts)` → `{ source, ast, hash }`
- `evaluateExpression(ast, ctx)` — sandboxed tree-walker evaluator
- `BUILTINS` — round, floor, ceil, abs, min, max, clamp, if, coalesce,
  length, match, concat, upper, lower, formatNumber, formatCurrency,
  formatDate, not
- `validateAst(ast)` — AST whitelist check; rejects member access,
  dynamic property access, `eval`, `Function`, `this`, `arguments`,
  `globalThis`, `constructor`, `prototype`, etc.
- Sandboxed `EvalCaps`: `maxSteps`, `maxDepth`, `maxRuntimeMs`.

### Variable store (`var-store.ts`)

```ts
const store = new VarStore();
store.hydrate('deck', { TIER: 'monthly' });
store.write('TIER', 'annual', { scope: 'session' });
store.read('TIER'); // 'annual'
const off = store.subscribe('TIER', (e) => console.log(e));
store.snapshot('session'); // → VarSnapshot
store.restore(snapshot);
```

Five scopes: `viewer → session → component_instance → slide → deck`. Reads
walk the ladder; writes are per-scope. Change detection via `Object.is` —
unchanged writes don't fire listeners.

### Bindings DAG (`bindings-dag.ts`)

```ts
const dag = new BindingsDAG(store);
dag.registerVariable(variableDef);
dag.addBinding({ id, variableId, targetKind, targetId, targetProp }, setter);
dag.activate();
```

Cycles detected at `addBinding` time → `BindingCycleError`. Compiled
transform expressions are cached by `(ruleId, source-hash)`.

### Rule evaluator (`rule-evaluator.ts`)

```ts
const evaluator = new RuleEvaluator();
const result = evaluator.evaluate(rules, store, { currentSlideId: 's3' });
if (result.matched) await executor.execute(result.action);
```

Ordering: `priority desc, created_at asc`. First true condition
short-circuits.

### Action executor (`action-executor.ts`)

```ts
const executor = new ActionExecutor();
Object.entries(defaultActionHandlers(store)).forEach(([k, fn]) =>
  executor.register(k as ActionKind, fn),
);
await executor.execute({ kind: 'navigate_to', params: { slideId: 's5' } });
```

Hosts register handlers keyed by `ActionKind`. Unknown kinds throw
`UnknownActionError` to surface misconfiguration.

### Branching graph (`branching/graph.ts`)

```ts
const graph = new BranchingGraph();
graph.addNode({ id: 's1', isStart: true, defaultStart: true });
graph.addEdge({ id, deckId, tenantId, fromSlideId: 's1', toSlideId: 's2', name: 'next', ruleId: null, priority: 0, createdAt });
const v = graph.validate();
// { hasCycle, cycles, unreachable, islands, multiStart }
```

Tarjan SCC; max-hops cap default 100, override up to 10 000 for
escape-room scenarios.

### Hotspot hit-test (`hotspot/hit-test.ts`)

```ts
const tester = new HotspotHitTester();
tester.pickAt(hotspots, 0.42, 0.31, 'click'); // → PickResult | null
```

Normalized `[0..1]` coordinates, LRU-cached, z-index aware (innermost
wins), 1024-entry cap.

### Overlay stack (`overlay/stack.ts`)

```ts
const stack = new OverlayStack();
stack.openOverlay(overlay);
stack.topmost();
stack.closeTopmost(); // returns invoker id for focus restoration
```

Max depth 5; 6th open throws `OverlayStackFullError`.

## Events emitted / consumed

The runtime itself is pure and silent. Hosts listen to:

- `VarStore.subscribe(name, fn)` — variable changes
- `VarStore.subscribeAll(fn)` — wildcard
- `BindingsDAG` — auto-fires bound setters on variable writes
- `ActionExecutor.execute(action)` — handlers called per `ActionKind`
- `addHostListener('action:*', fn)` — `setVariable` etc. fire these so
  the editor can drive its UI from rule firings

## Database tables owned

None — this package is pure TS. Tables live in the persisted CRUD
service (`services/prototype-runtime/`); see migrations `0025`/`0026`.

## Runbook

- **Compile-time sandbox escape**: validate every persisted
  `conditionSource` through `compileExpression()` before storing. Do
  not persist raw strings into `condition`.
- **Hotspot geometry**: always store in normalized `[0..1]` space;
  resolve against rendered rect at runtime.
- **Branching graph**: cap traversal at `maxHopsPerSession` (100
  default, 10 000 escape-room override). A cycle in the branching
  graph means the user can navigate forever — surface it in the
  Connections panel and require a fix before shipping.
- **Variable scope ladder**: writes at a lower scope don't shadow
  reads at a higher scope. Use the right scope for the right job;
  `viewer` for per-viewer state, `session` for single-session
  ephemeral state, `deck` for deck-wide defaults.

## Tests

`pnpm --filter @domio/prototype-runtime test` — ~150 unit tests
covering expression compile/eval, sandbox caps, VarStore change
detection, BindingsDAG cycle detection, rule ordering, branching
SCC, hotspot hit-test, and overlay stack depth.