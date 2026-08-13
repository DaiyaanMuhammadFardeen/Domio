/**
 * Policy service — admin-side policy violations + automation rules.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

export interface PolicyRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
}

export const BOOTSTRAP_POLICY_RULES: ReadonlyArray<PolicyRule> = [];

export async function listPolicyRules(): Promise<ReadonlyArray<PolicyRule>> {
  try {
    const json = await fetcher<{ rows?: PolicyRule[] }>('/v1/admin/policy');
    return json.rows ?? [];
  } catch {
    return [];
  }
}
