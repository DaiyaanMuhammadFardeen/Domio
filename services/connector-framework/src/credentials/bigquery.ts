/**
 * Credential validation — BigQuery (Phase 08).
 */

export type ValidationResult =
  | { readonly ok: true; readonly credential_ref: string }
  | { readonly ok: false; readonly errors: Array<{ field: string; message: string }> };

export function validateBigqueryCredentials(input: Record<string, unknown>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  if (!input.project_id || typeof input.project_id !== 'string') errors.push({ field: 'project_id', message: 'project_id is required' });
  if (!input.key && !input.service_account_json) errors.push({ field: 'key', message: 'key or service_account_json is required' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, credential_ref: `connectors/${String(input.tenant_id ?? 'default')}/bq_creds` };
}
