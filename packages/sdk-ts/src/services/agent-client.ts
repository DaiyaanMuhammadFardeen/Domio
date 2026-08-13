/**
 * AgentServiceClient — typed client for the brand-aware MCP agent
 * surface that powers the editor's NL patch, deck diff, and audit
 * panels.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Endpoints (mocked today, backed by mcp-server tomorrow):
 *   POST /v1/agents/nl/parse
 *   POST /v1/agents/nl/apply
 *   POST /v1/agents/nl/rollback
 *   POST /v1/decks/{deckId}/diff
 *   GET  /v1/decks/{deckId}/audit
 */

import type { HttpLikeTransport } from '../loader.js';

export interface NlToolCallSummary {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface DeckDiffEntry {
  readonly kind: string;
  readonly id: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface DeckDiffResult {
  readonly added: readonly DeckDiffEntry[];
  readonly removed: readonly DeckDiffEntry[];
  readonly changed: readonly DeckDiffEntry[];
}

export interface AuditEntryDTO {
  readonly id: string;
  readonly agentId: string;
  readonly source: 'agent' | 'human' | 'system';
  readonly toolName: string;
  readonly timestamp: string;
  readonly input: string;
  readonly output: unknown;
}

export interface AgentServiceError {
  readonly code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NETWORK';
  readonly message: string;
}

export interface AgentServiceClient {
  parseNl(prompt: string, deckId: string): Promise<readonly NlToolCallSummary[]>;
  applyNl(deckId: string, calls: readonly NlToolCallSummary[]): Promise<void>;
  rollbackNl(deckId: string, calls: readonly NlToolCallSummary[]): Promise<void>;
  diffDecks(deckId: string, otherDeckId: string): Promise<DeckDiffResult>;
  listAuditEntries(deckId: string): Promise<readonly AuditEntryDTO[]>;
}

export class HttpAgentServiceClient implements AgentServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: HttpLikeTransport,
  ) {}

  async parseNl(prompt: string, deckId: string): Promise<readonly NlToolCallSummary[]> {
    const res = await this.transport.post(`${this.baseUrl}/v1/agents/nl/parse`, {
      deckId,
      prompt,
    });
    if (!res.ok) throw this.toError(res);
    return (res.body as { calls: NlToolCallSummary[] }).calls ?? [];
  }

  async applyNl(deckId: string, calls: readonly NlToolCallSummary[]): Promise<void> {
    const res = await this.transport.post(`${this.baseUrl}/v1/agents/nl/apply`, {
      deckId,
      calls: calls as unknown as NlToolCallSummary[],
    });
    if (!res.ok) throw this.toError(res);
  }

  async rollbackNl(deckId: string, calls: readonly NlToolCallSummary[]): Promise<void> {
    const res = await this.transport.post(`${this.baseUrl}/v1/agents/nl/rollback`, {
      deckId,
      calls: calls as unknown as NlToolCallSummary[],
    });
    if (!res.ok) throw this.toError(res);
  }

  async diffDecks(deckId: string, otherDeckId: string): Promise<DeckDiffResult> {
    const res = await this.transport.post(
      `${this.baseUrl}/v1/decks/${encodeURIComponent(deckId)}/diff`,
      { otherDeckId },
    );
    if (!res.ok) throw this.toError(res);
    return res.body as DeckDiffResult;
  }

  async listAuditEntries(deckId: string): Promise<readonly AuditEntryDTO[]> {
    const res = await this.transport.get(
      `${this.baseUrl}/v1/decks/${encodeURIComponent(deckId)}/audit`,
    );
    if (!res.ok) throw this.toError(res);
    return (res.body as { entries: AuditEntryDTO[] }).entries ?? [];
  }

  private toError(res: { status: number; body: unknown }): AgentServiceError {
    const body = res.body as { code?: string; error?: string } | null;
    let code: AgentServiceError['code'] = 'NETWORK';
    if (res.status === 404) code = 'NOT_FOUND';
    else if (res.status === 401) code = 'UNAUTHORIZED';
    else if (res.status === 403) code = 'FORBIDDEN';
    else if (res.status === 400 || res.status === 422) code = 'INVALID_INPUT';
    const codeFromBody = body?.code as AgentServiceError['code'] | undefined;
    return {
      code: codeFromBody ?? code,
      message: body?.error ?? `Agent service error (status ${res.status}).`,
    };
  }
}
