/**
 * Adapter integration tests (Phase 08).
 *
 * Uses an in-memory FixtureTransport to test each adapter's query →
 * normalize pipeline end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { GoogleSheetsAdapter } from './google-sheets.js';
import { AirtableAdapter } from './airtable.js';
import { NotionAdapter } from './notion.js';
import { RestAdapter } from './rest.js';
import { GraphqlAdapter } from './graphql.js';
import { PostgresAdapter } from './postgres.js';
import type {
  AdapterContext,
  Connection,
  Transport,
  HttpRequestOpts,
  HttpResponse,
  CanonicalColumn,
} from '../types.js';

// ---------------------------------------------------------------------------
// In-memory recorded-response transport
// ---------------------------------------------------------------------------

class RecordedTransport implements Transport {
  public calls: HttpRequestOpts[] = [];

  constructor(private routes: Map<string, HttpResponse>) {}

  async request(opts: HttpRequestOpts): Promise<HttpResponse> {
    this.calls.push(opts);
    for (const [pattern, response] of this.routes) {
      if (opts.url.startsWith(pattern)) {
        return response;
      }
    }
    return { status: 404, body: { error: 'no route' } };
  }
}

function makeContext(transport: Transport): AdapterContext {
  const conn: Connection = {
    id: 'conn-test-1',
    tenant_id: 'tenant-1',
    owner_id: 'owner-1',
    connector_id: 'google_sheets',
    connector_ver: '1.0.0',
    label: 'Test Connection',
    scope: 'personal',
    created_at: new Date(),
  };
  return {
    tenant_id: 'tenant-1',
    owner_id: 'owner-1',
    connection: conn,
    credential: { vault: 'test', path: 'test' },
    transport,
  };
}

// ---------------------------------------------------------------------------
// Google Sheets adapter
// ---------------------------------------------------------------------------

describe('GoogleSheetsAdapter — query + normalize', () => {
  it('produces canonical rows from spreadsheet data', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://sheets.googleapis.com/v4/spreadsheets/', {
      status: 200,
      body: {
        values: [
          ['Name', 'Email', 'Revenue'],
          ['Alice', 'alice@test.com', '$1,200'],
          ['Bob', 'bob@test.com', '$3,400'],
        ],
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new GoogleSheetsAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, { connection_id: 'conn-1', sql: 'Sheet1!A:C' });

    expect(result.columns.length).toBe(3);
    expect(result.rows.length).toBe(2);

    // Check column names
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['Name', 'Email', 'Revenue']);

    // Check column types are from canonical set
    const validTypes = ['string', 'number', 'boolean', 'date', 'currency', 'percent'];
    for (const col of result.columns) {
      expect(validTypes).toContain(col.type);
    }

    // Check row values preserved
    expect(result.rows[0]).toEqual(['Alice', 'alice@test.com', '$1,200']);
    expect(result.rows[1]).toEqual(['Bob', 'bob@test.com', '$3,400']);
  });
});

// ---------------------------------------------------------------------------
// Airtable adapter
// ---------------------------------------------------------------------------

describe('AirtableAdapter — query + normalize', () => {
  it('produces canonical rows from records', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.airtable.com/v0/', {
      status: 200,
      body: {
        records: [
          { id: 'rec1', fields: { Name: 'Alice', Score: 95 } },
          { id: 'rec2', fields: { Name: 'Bob', Score: 87 } },
        ],
        offset: undefined,
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new AirtableAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, { connection_id: 'conn-1', sql: 'tbl1' });

    expect(result.columns.length).toBe(2);
    expect(result.rows.length).toBe(2);
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['Name', 'Score']);
    expect(result.rows[0]).toEqual(['Alice', 95]);
    expect(result.rows[1]).toEqual(['Bob', 87]);
  });
});

// ---------------------------------------------------------------------------
// Notion adapter
// ---------------------------------------------------------------------------

describe('NotionAdapter — query + normalize', () => {
  it('produces canonical rows from pages', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.notion.com/v1/databases/', {
      status: 200,
      body: {
        results: [
          {
            id: 'page-1',
            properties: {
              Name: { title: [{ text: { content: 'Project Alpha' } }] },
              Status: { select: { name: 'Active' } },
            },
          },
          {
            id: 'page-2',
            properties: {
              Name: { title: [{ text: { content: 'Project Beta' } }] },
              Status: { select: { name: 'Done' } },
            },
          },
        ],
        has_more: false,
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new NotionAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, { connection_id: 'conn-1', sql: 'db-id-123' });

    expect(result.columns.length).toBe(2);
    expect(result.rows.length).toBe(2);
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['Name', 'Status']);
    expect(result.rows[0]).toEqual(['Project Alpha', { select: { name: 'Active' } }]);
    expect(result.rows[1]).toEqual(['Project Beta', { select: { name: 'Done' } }]);
  });
});

// ---------------------------------------------------------------------------
// REST adapter
// ---------------------------------------------------------------------------

describe('RestAdapter — query + normalize', () => {
  it('produces canonical rows from JSON array', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.example.com/', {
      status: 200,
      body: {
        data: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
        ],
        pagination: { cursor: undefined },
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new RestAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, { connection_id: 'conn-1', sql: 'users' });

    expect(result.columns.length).toBe(3);
    expect(result.rows.length).toBe(2);
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['id', 'name', 'active']);

    // Values preserved
    expect(result.rows[0]).toEqual([1, 'Alice', true]);
    expect(result.rows[1]).toEqual([2, 'Bob', false]);

    // Types from canonical set
    const validTypes = ['string', 'number', 'boolean', 'date', 'currency', 'percent'];
    for (const col of result.columns) {
      expect(validTypes).toContain(col.type);
    }
  });
});

// ---------------------------------------------------------------------------
// GraphQL adapter
// ---------------------------------------------------------------------------

describe('GraphqlAdapter — query + normalize', () => {
  it('produces canonical rows from GraphQL response', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://graphql.example.com/', {
      status: 200,
      body: {
        data: {
          items: [
            { id: 1, name: 'Alice', score: 42 },
            { id: 2, name: 'Bob', score: 37 },
          ],
        },
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new GraphqlAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, { connection_id: 'conn-1', sql: '{ items { id name score } }' });

    expect(result.columns.length).toBe(3);
    expect(result.rows.length).toBe(2);
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['id', 'name', 'score']);
    expect(result.rows[0]).toEqual([1, 'Alice', 42]);
    expect(result.rows[1]).toEqual([2, 'Bob', 37]);
  });
});

// ---------------------------------------------------------------------------
// Postgres adapter (non-gated: mocked transport)
// ---------------------------------------------------------------------------

describe('PostgresAdapter — query with mocked transport', () => {
  it('builds the right request and maps rows', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('http://sql-gateway:3000/query', {
      status: 200,
      body: {
        columns: [{ name: 'id', type: 'number' }, { name: 'email', type: 'string' }],
        rows: [
          [1, 'alice@example.com'],
          [2, 'bob@example.com'],
        ],
        row_count: 2,
      },
    });

    const transport = new RecordedTransport(routes);
    const adapter = new PostgresAdapter();
    const ctx = makeContext(transport);

    const result = await adapter.query(ctx, {
      connection_id: 'conn-1',
      sql: 'SELECT id, email FROM users',
      params: [],
    });

    expect(result.columns.length).toBe(2);
    expect(result.rows.length).toBe(2);
    expect(result.columns.map((c: CanonicalColumn) => c.name)).toEqual(['id', 'email']);
    expect(result.rows[0]).toEqual([1, 'alice@example.com']);
    expect(result.rows[1]).toEqual([2, 'bob@example.com']);

    // Check the transport was called with the right SQL body
    expect(transport.calls.length).toBe(1);
    const call = transport.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('http://sql-gateway:3000/query');
    expect((call.body as Record<string, unknown>).sql).toBe('SELECT id, email FROM users');
  });
});

// ---------------------------------------------------------------------------
// Postgres adapter — docker-gated test
// ---------------------------------------------------------------------------

describe('PostgresAdapter — integration (docker-gated)', () => {
  it.skipIf(!process.env.POSTGRES_URL)('runs a real query against local Postgres', async () => {
    const url = process.env.POSTGRES_URL!;
    const transport: Transport = {
      async request(opts: HttpRequestOpts) {
        // Forward to real Postgres HTTP gateway
        const resp = await fetch(url, {
          method: opts.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts.body),
        });
        const body = await resp.json();
        return { status: resp.status, body };
      },
    };

    const adapter = new PostgresAdapter();
    const conn: Connection = {
      id: 'conn-pg-integration',
      tenant_id: 'test',
      owner_id: 'test',
      connector_id: 'postgres',
      connector_ver: '1.0.0',
      label: 'Test PG',
      scope: 'personal',
      created_at: new Date(),
    };
    const ctx: AdapterContext = {
      tenant_id: 'test',
      owner_id: 'test',
      connection: conn,
      credential: { vault: 'test', path: 'test' },
      transport,
    };

    const result = await adapter.query(ctx, {
      connection_id: 'conn-pg-integration',
      sql: 'SELECT 1 AS id, \'hello\' AS msg',
    });

    expect(result.columns.length).toBe(2);
    expect(result.rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Adapter ping tests
// ---------------------------------------------------------------------------

describe('Adapters — ping', () => {
  it('google_sheets ping succeeds', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://sheets.googleapis.com/v4/spreadsheets/', { status: 200, body: {} });
    const transport = new RecordedTransport(routes);
    const adapter = new GoogleSheetsAdapter();
    const result = await adapter.ping(makeContext(transport));
    expect(result.ok).toBe(true);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('rest ping succeeds', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.example.com/', { status: 200, body: {} });
    const transport = new RecordedTransport(routes);
    const adapter = new RestAdapter();
    const result = await adapter.ping(makeContext(transport));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Adapter discover tests
// ---------------------------------------------------------------------------

describe('Adapters — discover', () => {
  it('google_sheets discover returns tables', async () => {
    const adapter = new GoogleSheetsAdapter();
    const result = await adapter.discover(makeContext(new RecordedTransport(new Map())), { connection_id: 'conn-1' });
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.tables[0]!.columns.length).toBeGreaterThan(0);
  });

  it('postgres discover returns tables with PII annotations', async () => {
    const adapter = new PostgresAdapter();
    const result = await adapter.discover(makeContext(new RecordedTransport(new Map())), { connection_id: 'conn-1' });
    expect(result.tables.length).toBeGreaterThan(0);
    // The postgres adapter's fixture discover result has PII on email
    const emailCol = result.tables[0]!.columns.find((c) => c.name === 'email');
    expect(emailCol?.pii_detected).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Adapter empty result tests
// ---------------------------------------------------------------------------

describe('Adapters — empty results', () => {
  it('rest adapter handles empty data array', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.example.com/', { status: 200, body: { data: [] } });
    const transport = new RecordedTransport(routes);
    const adapter = new RestAdapter();
    const result = await adapter.query(makeContext(transport), { connection_id: 'conn-1', sql: 'empty' });
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toHaveLength(0);
  });

  it('notion adapter handles empty results', async () => {
    const routes = new Map<string, HttpResponse>();
    routes.set('https://api.notion.com/v1/databases/', { status: 200, body: { results: [], has_more: false } });
    const transport = new RecordedTransport(routes);
    const adapter = new NotionAdapter();
    const result = await adapter.query(makeContext(transport), { connection_id: 'conn-1', sql: 'db-id' });
    expect(result.rows).toHaveLength(0);
  });
});
