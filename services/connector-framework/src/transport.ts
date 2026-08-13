/**
 * Connector framework — transport abstraction (Phase 08).
 *
 * The transport layer wraps HTTP-like requests for each connector.
 * In tests, a FixtureTransport maps URL patterns to canned responses.
 * In production, the transport would be an HTTP client facade.
 */

import type { HttpRequestOpts, HttpResponse, Transport } from './types.js';

// ---------------------------------------------------------------------------
// Fixture transport (for tests)
// ---------------------------------------------------------------------------

export interface FixtureRoute {
  /** URL pattern to match. String prefix match or regex. */
  readonly pattern: string | RegExp;
  readonly method?: string;
  readonly response: HttpResponse;
}

/**
 * A transport that maps URL patterns to canned responses.
 * Used in tests to avoid real HTTP calls.
 */
export class FixtureTransport implements Transport {
  private readonly routes: FixtureRoute[];

  constructor(routes: FixtureRoute[]) {
    this.routes = routes;
  }

  async request(opts: HttpRequestOpts): Promise<HttpResponse> {
    for (const route of this.routes) {
      const methodMatch = !route.method || route.method === opts.method;
      const urlMatch =
        typeof route.pattern === 'string'
          ? opts.url.startsWith(route.pattern)
          : route.pattern.test(opts.url);
      if (methodMatch && urlMatch) {
        return route.response;
      }
    }
    return { status: 404, body: { error: 'No fixture matched', url: opts.url } };
  }
}

/**
 * Create a fixture transport for all 10 connector types.
 */
export function createDefaultFixtureTransport(): FixtureTransport {
  return new FixtureTransport([
    // Google Sheets
    {
      pattern: 'https://sheets.googleapis.com/v4/spreadsheets',
      method: 'GET',
      response: {
        status: 200,
        body: { spreadsheetId: 'sheet-1', properties: { title: 'Test Sheet' } },
      },
    },
    {
      pattern: 'https://sheets.googleapis.com/v4/spreadsheets',
      method: 'POST',
      response: { status: 200, body: { spreadsheetId: 'sheet-1' } },
    },
    {
      pattern: 'https://sheets.googleapis.com/v4/spreadsheets/',
      response: {
        status: 200,
        body: {
          values: [
            ['Name', 'Email', 'Revenue'],
            ['Alice', 'alice@test.com', '$1,200'],
            ['Bob', 'bob@test.com', '$3,400'],
          ],
        },
      },
    },
    // Excel
    {
      pattern: 'https://graph.microsoft.com/v1.0/me/drive/items',
      response: { status: 200, body: { value: [{ id: 'file-1', name: 'data.xlsx' }] } },
    },
    // Airtable
    {
      pattern: 'https://api.airtable.com/v0/',
      response: {
        status: 200,
        body: {
          records: [{ id: 'rec1', fields: { Name: 'Test', Revenue: 100 } }],
          offset: undefined,
        },
      },
    },
    // Notion
    {
      pattern: 'https://api.notion.com/v1/',
      response: {
        status: 200,
        body: {
          results: [
            { id: 'page-1', properties: { Name: { title: [{ text: { content: 'Test' } }] } } },
          ],
          has_more: false,
        },
      },
    },
    // Postgres / MySQL (SQL gateway)
    {
      pattern: 'http://sql-gateway:3000/query',
      response: {
        status: 200,
        body: {
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          rows: [
            [1, 'Alice'],
            [2, 'Bob'],
          ],
          row_count: 2,
        },
      },
    },
    // BigQuery
    {
      pattern: 'https://bigquery.googleapis.com/bigquery/v2/',
      response: {
        status: 200,
        body: {
          schema: {
            fields: [
              { name: 'id', type: 'INTEGER' },
              { name: 'name', type: 'STRING' },
            ],
          },
          rows: [{ f: [{ v: '1' }, { v: 'Alice' }] }, { f: [{ v: '2' }, { v: 'Bob' }] }],
        },
      },
    },
    // Snowflake
    {
      pattern: 'https://account.snowflakecomputing.com/',
      response: {
        status: 200,
        body: {
          result: {
            rows: [
              { ID: 1, NAME: 'Alice' },
              { ID: 2, NAME: 'Bob' },
            ],
            schema: {
              resultMetaData: {
                rowType: [
                  { name: 'ID', type: 'FIXED' },
                  { name: 'NAME', type: 'TEXT' },
                ],
              },
            },
          },
        },
      },
    },
    // REST API
    {
      pattern: 'https://api.example.com/',
      response: {
        status: 200,
        body: {
          data: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
          pagination: { cursor: undefined },
        },
      },
    },
    // GraphQL
    {
      pattern: 'https://graphql.example.com/',
      response: {
        status: 200,
        body: {
          data: {
            items: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ],
          },
        },
      },
    },
  ]);
}
