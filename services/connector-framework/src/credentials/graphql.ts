/**
 * Credential validation — GraphQL (Phase 08).
 */

export type ValidationResult =
  | { readonly ok: true; readonly credential_ref: string }
  | { readonly ok: false; readonly errors: Array<{ field: string; message: string }> };

export function validateGraphqlCredentials(input: Record<string, unknown>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.url || typeof input.url !== 'string') errors.push({ field: 'url', message: 'url is required' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, credential_ref: `connectors/${String(input.tenant_id ?? 'default')}/gql_creds` };
}
