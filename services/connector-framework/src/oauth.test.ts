/**
 * OAuth / auth flow tests (Phase 08).
 *
 * Tests auth_start redirect URLs, auth_callback code exchange,
 * and credential validation for various connectors.
 */

import { describe, it, expect } from 'vitest';
import { GoogleSheetsAdapter } from './adapters/google-sheets.js';
import { NotionAdapter } from './adapters/notion.js';
import type {
  AdapterContext,
  Connection,
  Transport,
  HttpRequestOpts,
  HttpResponse,
} from './types.js';
import { validatePostgresCredentials } from './credentials/postgres.js';
import { validateBigqueryCredentials } from './credentials/bigquery.js';

// ---------------------------------------------------------------------------
// Fixture transport
// ---------------------------------------------------------------------------

class StubTransport implements Transport {
  async request(_opts: HttpRequestOpts): Promise<HttpResponse> {
    return { status: 200, body: { access_token: 'stub-token', token_type: 'Bearer' } };
  }
}

function makeCtx(transport?: Transport): AdapterContext {
  const conn: Connection = {
    id: 'conn-auth-1',
    tenant_id: 'tenant-1',
    owner_id: 'owner-1',
    connector_id: 'google_sheets',
    connector_ver: '1.0.0',
    label: 'Test',
    scope: 'personal',
    created_at: new Date(),
  };
  return {
    tenant_id: 'tenant-1',
    owner_id: 'owner-1',
    connection: conn,
    credential: { vault: 'test', path: 'test' },
    transport: transport ?? new StubTransport(),
  };
}

// ---------------------------------------------------------------------------
// Google Sheets auth_start
// ---------------------------------------------------------------------------

describe('GoogleSheetsAdapter — auth_start', () => {
  it('returns redirect URL with state (CSRF nonce) and default scope', async () => {
    const adapter = new GoogleSheetsAdapter();
    const ctx = makeCtx();
    const result = await adapter.authStart(ctx, { connection_id: 'conn-1' });

    expect(result.redirect_url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(result.redirect_url).toContain('response_type=code');
    expect(result.redirect_url).toContain('client_id=');

    // State is non-empty (CSRF nonce)
    expect(result.state).toBeTruthy();
    expect(result.state).toMatch(/^gs_tenant-1_/);

    // Default scope includes spreadsheets
    expect(result.scope).toContain('spreadsheets');
  });

  it('uses custom scope when provided', async () => {
    const adapter = new GoogleSheetsAdapter();
    const ctx = makeCtx();
    const result = await adapter.authStart(ctx, {
      connection_id: 'conn-1',
      scope: ['https://www.googleapis.com/auth/drive'],
    });

    expect(result.scope).toBe('https://www.googleapis.com/auth/drive');
  });

  it('uses custom redirect_uri when provided', async () => {
    const adapter = new GoogleSheetsAdapter();
    const ctx = makeCtx();
    const result = await adapter.authStart(ctx, {
      connection_id: 'conn-1',
      redirect_uri: 'https://myapp.com/callback',
    });

    expect(result.redirect_url).toContain('redirect_uri=https');
    expect(result.redirect_url).toContain('myapp.com');
  });
});

// ---------------------------------------------------------------------------
// Notion auth_start
// ---------------------------------------------------------------------------

describe('NotionAdapter — auth_start', () => {
  it('returns redirect URL with state and scope', async () => {
    const adapter = new NotionAdapter();
    const ctx = makeCtx();
    const result = await adapter.authStart(ctx, { connection_id: 'conn-1' });

    expect(result.redirect_url).toContain('api.notion.com/v1/oauth/authorize');
    expect(result.redirect_url).toContain('response_type=code');

    // State is non-empty
    expect(result.state).toBeTruthy();
    expect(result.state).toMatch(/^nt_tenant-1_/);

    // Notion uses fixed scope
    expect(result.scope).toBe('read_content');
  });

  it('passes custom redirect_uri', async () => {
    const adapter = new NotionAdapter();
    const ctx = makeCtx();
    const result = await adapter.authStart(ctx, {
      connection_id: 'conn-1',
      redirect_uri: 'https://notion-app.example.com/cb',
    });

    expect(result.redirect_url).toContain('notion-app.example.com');
  });
});

// ---------------------------------------------------------------------------
// auth_callback code exchange
// ---------------------------------------------------------------------------

describe('auth_callback — code exchange', () => {
  it('google_sheets auth_callback returns credential_ref', async () => {
    const adapter = new GoogleSheetsAdapter();
    const ctx = makeCtx();
    const result = await adapter.authCallback(ctx, {
      connection_id: 'conn-1',
      code: 'test-auth-code',
      state: 'gs_tenant-1_12345',
    });

    expect(result.credential_ref.vault).toBe('phase-01');
    expect(result.credential_ref.path).toContain('connectors/');
    expect(result.credential_ref.path).toContain('gs_creds');
  });

  it('notion auth_callback returns credential_ref', async () => {
    const adapter = new NotionAdapter();
    const ctx = makeCtx();
    const result = await adapter.authCallback(ctx, {
      connection_id: 'conn-1',
      code: 'test-code',
      state: 'nt_tenant-1_12345',
    });

    expect(result.credential_ref.vault).toBe('phase-01');
    expect(result.credential_ref.path).toContain('nt_creds');
  });
});

// ---------------------------------------------------------------------------
// Credential validation — Postgres
// ---------------------------------------------------------------------------

describe('validatePostgresCredentials', () => {
  it('returns ok for valid credentials', () => {
    const result = validatePostgresCredentials({
      host: 'localhost',
      port: 5432,
      user: 'admin',
      password: 'secret',
      database: 'mydb',
    });

    expect(result.ok).toBe(true);
  });

  it('returns errors for missing host', () => {
    const result = validatePostgresCredentials({
      port: 5432,
      user: 'admin',
      password: 'secret',
      database: 'mydb',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'host')).toBe(true);
    }
  });

  it('returns errors for missing port (wrong type)', () => {
    const result = validatePostgresCredentials({
      host: 'localhost',
      port: '5432',
      user: 'admin',
      password: 'secret',
      database: 'mydb',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'port')).toBe(true);
    }
  });

  it('returns errors for missing user', () => {
    const result = validatePostgresCredentials({
      host: 'localhost',
      port: 5432,
      password: 'secret',
      database: 'mydb',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'user')).toBe(true);
    }
  });

  it('returns errors for missing password', () => {
    const result = validatePostgresCredentials({
      host: 'localhost',
      port: 5432,
      user: 'admin',
      database: 'mydb',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'password')).toBe(true);
    }
  });

  it('returns errors for missing database', () => {
    const result = validatePostgresCredentials({
      host: 'localhost',
      port: 5432,
      user: 'admin',
      password: 'secret',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'database')).toBe(true);
    }
  });

  it('returns multiple errors for completely empty input', () => {
    const result = validatePostgresCredentials({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Credential validation — BigQuery
// ---------------------------------------------------------------------------

describe('validateBigqueryCredentials', () => {
  it('returns ok for valid credentials with key', () => {
    const result = validateBigqueryCredentials({
      project_id: 'my-project',
      key: 'service-account-key',
    });

    expect(result.ok).toBe(true);
  });

  it('returns ok for valid credentials with service_account_json', () => {
    const result = validateBigqueryCredentials({
      project_id: 'my-project',
      service_account_json: '{"type":"service_account"}',
    });

    expect(result.ok).toBe(true);
  });

  it('returns errors for missing project_id', () => {
    const result = validateBigqueryCredentials({
      key: 'service-account-key',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'project_id')).toBe(true);
    }
  });

  it('returns errors for missing both key and service_account_json', () => {
    const result = validateBigqueryCredentials({
      project_id: 'my-project',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'key')).toBe(true);
    }
  });

  it('returns errors for completely empty input', () => {
    const result = validateBigqueryCredentials({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
