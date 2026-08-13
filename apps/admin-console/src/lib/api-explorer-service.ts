/**
 * API Explorer service — Wave 10 §S10.3.
 *
 * Hardcoded endpoint catalogue + a request execution shim that tries the
 * real REST API and falls back to a deterministic mock when the API is
 * unreachable. The mock is what makes the demo work without a backend.
 *
 * Snippets are stored in-memory for the session so a refresh wipes them,
 * which matches the rest of the Wave 8-10 admin console pattern.
 */

export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointDef {
  method: EndpointMethod;
  path: string;
  description: string;
  group: string;
  /** What to pre-fill the body editor with. */
  sample_body?: Record<string, unknown>;
  /** What to pre-fill the query params list with. */
  sample_params?: Record<string, string>;
}

export interface ApiExplorerResponse {
  status: number;
  latency_ms: number;
  headers: Record<string, string>;
  body: string;
}

export interface ApiExplorerAuth {
  kind: 'api_key' | 'oauth' | 'mcp_token';
  value: string;
}

export interface ExecuteRequestOptions {
  method: string;
  path: string;
  params: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
  auth?: ApiExplorerAuth;
}

export interface SaveSnippetOptions {
  name: string;
  endpoint: string;
  request: object;
  response?: object;
}

export interface SavedSnippet {
  id: string;
  name: string;
  endpoint: string;
  request: object;
  response?: object;
  saved_at_ms: number;
}

// ---------------------------------------------------------------------------
// Hardcoded endpoint catalogue (~15 endpoints across 6 groups)
// ---------------------------------------------------------------------------

const ENDPOINTS: ReadonlyArray<EndpointDef> = [
  // Decks
  {
    method: 'GET',
    path: '/v1/decks',
    group: 'Decks',
    description: 'List all decks in the current workspace.',
    sample_params: { limit: '20', cursor: '' },
  },
  {
    method: 'POST',
    path: '/v1/decks',
    group: 'Decks',
    description: 'Create a new deck from a template.',
    sample_body: { template_id: 'tmpl-launch', title: 'Q3 launch' },
  },
  {
    method: 'GET',
    path: '/v1/decks/:id',
    group: 'Decks',
    description: 'Fetch a single deck by id.',
    sample_params: { id: 'dk-001' },
  },
  {
    method: 'PATCH',
    path: '/v1/decks/:id',
    group: 'Decks',
    description: 'Update an existing deck.',
    sample_body: { title: 'Renamed deck' },
  },
  {
    method: 'DELETE',
    path: '/v1/decks/:id',
    group: 'Decks',
    description: 'Permanently delete a deck.',
  },

  // Sessions
  {
    method: 'GET',
    path: '/v1/sessions',
    group: 'Sessions',
    description: 'List live and recent sessions.',
    sample_params: { status: 'live', limit: '10' },
  },
  {
    method: 'GET',
    path: '/v1/sessions/:id',
    group: 'Sessions',
    description: 'Fetch a session by id.',
    sample_params: { id: 'sess-99' },
  },
  {
    method: 'POST',
    path: '/v1/sessions/:id/advance',
    group: 'Sessions',
    description: 'Advance the session to the next slide.',
    sample_body: { slide_index: 3 },
  },

  // Analytics
  {
    method: 'GET',
    path: '/v1/analytics/deck/:id',
    group: 'Analytics',
    description: 'Deck-level analytics: views, completion, engagement.',
    sample_params: { id: 'dk-001', range: '30d' },
  },
  {
    method: 'GET',
    path: '/v1/analytics/sessions/:id',
    group: 'Analytics',
    description: 'Session-level analytics: attendees, outcomes.',
    sample_params: { id: 'sess-99' },
  },

  // Marketplace
  {
    method: 'GET',
    path: '/v1/marketplace/listings',
    group: 'Marketplace',
    description: 'List published marketplace listings.',
    sample_params: { category: 'sales', limit: '20' },
  },
  {
    method: 'POST',
    path: '/v1/marketplace/listings',
    group: 'Marketplace',
    description: 'Publish a new listing.',
    sample_body: { title: 'Sales closing playbook', price_cents: 4900 },
  },
  {
    method: 'GET',
    path: '/v1/marketplace/listings/:id',
    group: 'Marketplace',
    description: 'Fetch a listing by id.',
    sample_params: { id: 'lst-42' },
  },

  // MCP
  {
    method: 'GET',
    path: '/v1/mcp/tools',
    group: 'MCP',
    description: 'List tools exposed by the MCP server.',
  },
  {
    method: 'POST',
    path: '/v1/mcp/agents/:id/rotate',
    group: 'MCP',
    description: 'Rotate the MCP agent token.',
    sample_body: { reason: 'routine' },
  },

  // Webhooks
  {
    method: 'POST',
    path: '/v1/webhooks/test',
    group: 'Webhooks',
    description: 'Send a test webhook delivery to a registered endpoint.',
    sample_body: { webhook_id: 'wh-acme-deploy', event: 'deck.published' },
  },
];

export async function listEndpoints(): Promise<EndpointDef[]> {
  return ENDPOINTS.map((e) => ({ ...e }));
}

// ---------------------------------------------------------------------------
// executeRequest — try the real API, fall back to a deterministic mock
// ---------------------------------------------------------------------------

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

function joinUrl(path: string, params: Record<string, string>): string {
  const cleaned = path.replace(/:([a-zA-Z_]+)/g, (_, key: string) => {
    const v = params[key];
    return v !== undefined && v !== '' ? encodeURIComponent(v) : `:${key}`;
  });

  const remaining = Object.entries(params).filter(
    ([k]) => !path.includes(`:${k}`),
  );
  const url = new URL(cleaned, API_BASE);
  for (const [k, v] of remaining) {
    if (v !== '') url.searchParams.set(k, v);
  }
  return url.toString();
}

function headerForAuth(auth: ApiExplorerAuth | undefined): Record<string, string> {
  if (!auth || !auth.value) return {};
  switch (auth.kind) {
    case 'api_key':
      return { authorization: `Bearer ${auth.value}` };
    case 'oauth':
      return { authorization: `OAuth ${auth.value}` };
    case 'mcp_token':
      return { 'x-mcp-token': auth.value };
  }
}

/**
 * Compute a deterministic mock response for a given (method, path).
 * Keeps the demo feeling real even with no backend.
 */
function mockResponse(opts: ExecuteRequestOptions): ApiExplorerResponse {
  // Prefer any id that was substituted into the path; otherwise fall
  // back to a generated short id.
  const provided = opts.params['id'];
  const id = (provided && provided !== '')
    ? provided
    : Math.random().toString(36).slice(2, 8);
  const isWrite = opts.method !== 'GET' && opts.method !== 'DELETE';

  let body: Record<string, unknown> = {};
  if (opts.method === 'DELETE') {
    body = { id, deleted: true };
  } else if (opts.path.endsWith('/v1/decks') && opts.method === 'GET') {
    body = {
      items: [
        { id: 'dk-001', title: 'Q3 launch', slides: 12, updated_at_ms: Date.now() - 86_400_000 },
        { id: 'dk-002', title: 'Sales playbook', slides: 8, updated_at_ms: Date.now() - 3_600_000 },
      ],
      next_cursor: null,
    };
  } else if (opts.path.includes('/v1/decks/') && opts.method === 'GET') {
    body = { id, title: 'Q3 launch', slides: 12, owner: 'u-alice' };
  } else if (opts.path.includes('/v1/sessions') && opts.method === 'GET' && !opts.path.includes('/advance')) {
    body = { id, status: 'live', attendees: 12, current_slide: 3 };
  } else if (opts.path.includes('/v1/analytics/')) {
    body = { id, views: 182, completion: 0.74, engagement: 0.62, range: '30d' };
  } else if (opts.path.includes('/v1/marketplace/listings') && opts.method === 'GET' && !opts.path.match(/listings\/[^/]+$/)) {
    body = {
      items: [
        { id: 'lst-42', title: 'Sales closing playbook', price_cents: 4900 },
        { id: 'lst-43', title: 'Onboarding deck', price_cents: 2900 },
      ],
    };
  } else if (opts.path.includes('/v1/marketplace/listings/') && opts.method === 'GET') {
    body = { id, title: 'Sales closing playbook', price_cents: 4900, seller: 'alice@domio.app' };
  } else if (opts.path.endsWith('/v1/mcp/tools')) {
    body = {
      tools: [
        { name: 'deck.create', description: 'Create a new deck.' },
        { name: 'deck.share', description: 'Share a deck with a link.' },
      ],
    };
  } else if (isWrite) {
    body = { id, ok: true, echoed_body: safeJsonParse(opts.body) };
  }

  // Sprinkle a few synthetic headers so the response viewer has something
  // to render even when the backend is off.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': `mock-${Date.now()}`,
    'x-ratelimit-remaining': '997',
    'x-powered-by': 'domio-mock',
  };
  if (opts.auth) {
    headers['x-auth-kind'] = opts.auth.kind;
  }

  return {
    status: 200,
    latency_ms: 40 + Math.round(Math.random() * 60),
    headers,
    body: JSON.stringify(body, null, 2),
  };
}

function safeJsonParse(s: string | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function executeRequest(
  opts: ExecuteRequestOptions,
): Promise<ApiExplorerResponse> {
  const url = joinUrl(opts.path, opts.params);
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...headerForAuth(opts.auth),
    ...opts.headers,
  };

  const init: RequestInit = {
    method: opts.method,
    headers,
    cache: 'no-store',
    ...(opts.body !== undefined && opts.body !== ''
      ? { body: opts.body }
      : {}),
  };

  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const latency_ms = Date.now() - started;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    const body = await res.text();
    return { status: res.status, latency_ms, headers: resHeaders, body };
  } catch {
    // Backend unreachable — return mock so the demo still works.
    return mockResponse(opts);
  }
}

// ---------------------------------------------------------------------------
// saveSnippet — in-memory store
// ---------------------------------------------------------------------------

const SNIPPET_STORE: SavedSnippet[] = [];

export async function saveSnippet(
  opts: SaveSnippetOptions,
): Promise<{ id: string }> {
  const id = `snip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const snippet: SavedSnippet = {
    id,
    name: opts.name,
    endpoint: opts.endpoint,
    request: opts.request,
    ...(opts.response !== undefined ? { response: opts.response } : {}),
    saved_at_ms: Date.now(),
  };
  SNIPPET_STORE.push(snippet);
  try {
    await fetch(`${API_BASE}/v1/admin/snippets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snippet),
    });
  } catch {
    // best-effort persistence
  }
  return { id };
}

export function listSnippets(): ReadonlyArray<SavedSnippet> {
  return SNIPPET_STORE.slice();
}

// ---------------------------------------------------------------------------
// Helper — build a cURL command from a request
// ---------------------------------------------------------------------------

export function formatAsCurl(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): string {
  const lines = [`curl -X ${opts.method.toUpperCase()} '${opts.url}'`];
  for (const [k, v] of Object.entries(opts.headers)) {
    lines.push(`  -H '${k}: ${v.replace(/'/g, "\\'")}'`);
  }
  if (opts.body && opts.body.trim() !== '') {
    lines.push(`  -d '${opts.body.replace(/'/g, "\\'")}'`);
  }
  return lines.join(' \\\n');
}
