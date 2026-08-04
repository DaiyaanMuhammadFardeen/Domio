/**
 * Credential validation — MySQL (Phase 08).
 */

export type ValidationResult =
  | { readonly ok: true; readonly credential_ref: string }
  | { readonly ok: false; readonly errors: Array<{ field: string; message: string }> };

export function validateMysqlCredentials(input: Record<string, unknown>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.host || typeof input.host !== 'string') errors.push({ field: 'host', message: 'host is required' });
  if (!input.port || typeof input.port !== 'number') errors.push({ field: 'port', message: 'port is required' });
  if (!input.user || typeof input.user !== 'string') errors.push({ field: 'user', message: 'user is required' });
  if (!input.password || typeof input.password !== 'string') errors.push({ field: 'password', message: 'password is required' });
  if (!input.database || typeof input.database !== 'string') errors.push({ field: 'database', message: 'database is required' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, credential_ref: `connectors/${String(input.tenant_id ?? 'default')}/my_creds` };
}
