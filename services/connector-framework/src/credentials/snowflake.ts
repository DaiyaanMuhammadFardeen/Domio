/**
 * Credential validation — Snowflake (Phase 08).
 */

export type ValidationResult =
  | { readonly ok: true; readonly credential_ref: string }
  | { readonly ok: false; readonly errors: Array<{ field: string; message: string }> };

export function validateSnowflakeCredentials(input: Record<string, unknown>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.account || typeof input.account !== 'string')
    errors.push({ field: 'account', message: 'account is required' });
  if (!input.warehouse || typeof input.warehouse !== 'string')
    errors.push({ field: 'warehouse', message: 'warehouse is required' });
  if (!input.database || typeof input.database !== 'string')
    errors.push({ field: 'database', message: 'database is required' });
  if (!input.user || typeof input.user !== 'string')
    errors.push({ field: 'user', message: 'user is required' });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    credential_ref: `connectors/${String(input.tenant_id ?? 'default')}/sf_creds`,
  };
}
