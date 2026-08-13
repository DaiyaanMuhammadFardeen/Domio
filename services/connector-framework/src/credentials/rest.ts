/**
 * Credential validation — REST API (Phase 08).
 */

export type ValidationResult =
  | { readonly ok: true; readonly credential_ref: string }
  | { readonly ok: false; readonly errors: Array<{ field: string; message: string }> };

export function validateRestCredentials(input: Record<string, unknown>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.baseUrl || typeof input.baseUrl !== 'string')
    errors.push({ field: 'baseUrl', message: 'baseUrl is required' });
  const authKind = input.auth_kind as string | undefined;
  if (authKind === 'bearer' && (!input.token || typeof input.token !== 'string')) {
    errors.push({ field: 'token', message: 'token is required for bearer auth' });
  }
  if (authKind === 'api_key') {
    if (!input.key_name || typeof input.key_name !== 'string')
      errors.push({ field: 'key_name', message: 'key_name is required for api_key auth' });
    if (!input.key_value || typeof input.key_value !== 'string')
      errors.push({ field: 'key_value', message: 'key_value is required for api_key auth' });
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    credential_ref: `connectors/${String(input.tenant_id ?? 'default')}/rest_creds`,
  };
}
