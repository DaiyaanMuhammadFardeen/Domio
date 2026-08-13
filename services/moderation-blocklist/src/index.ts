/**
 * @domio/moderation-blocklist — per-tenant blocklist with NFKC folding.
 *
 * Phase 16 W5. Each tenant has a list of blocked tokens and phrases.
 * A phrase matches if any token in the candidate text (after NFKC +
 * lowercase) exactly equals a blocklist token. Substring matching is
 * applied for multi-token phrases.
 */

export type ModerationDecision = 'allow' | 'flag' | 'block';

export interface BlocklistEntry {
  readonly token: string;
  /** `block` hard-rejects, `flag` lets through but flags for review. */
  readonly severity: 'block' | 'flag';
}

export interface ModerationResult {
  readonly decision: ModerationDecision;
  readonly matched: ReadonlyArray<string>;
}

export interface Moderator {
  evaluate(input: { workspace_id: string; raw_text: string }): Promise<ModerationResult>;
}

export class InMemoryBlocklistModerator implements Moderator {
  private readonly entries: Map<string, BlocklistEntry[]> = new Map();

  setEntries(workspace_id: string, entries: ReadonlyArray<BlocklistEntry>): void {
    this.entries.set(workspace_id, [...entries]);
  }

  async evaluate(input: { workspace_id: string; raw_text: string }): Promise<ModerationResult> {
    const list = this.entries.get(input.workspace_id) ?? [];
    const normalized = input.raw_text.normalize('NFKC').toLowerCase();
    const matched: string[] = [];
    let decision: ModerationDecision = 'allow';
    for (const e of list) {
      const needle = e.token.normalize('NFKC').toLowerCase();
      if (normalized.includes(needle)) {
        matched.push(e.token);
        if (e.severity === 'block') decision = 'block';
        else if (decision !== 'block') decision = 'flag';
      }
    }
    return { decision, matched };
  }
}
