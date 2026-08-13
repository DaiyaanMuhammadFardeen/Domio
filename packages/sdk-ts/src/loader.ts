import {
  DECK_SCHEMA_VERSION,
  validate,
  type DeckDocument,
  type SchemaValidateResult,
  type ULID,
} from '@domio/schema';
import { newToken } from '@domio/common';

/**
 * Client-side loader contract used by both the editor and the viewer.
 * The Phase 04 / 05 control plane backs this with the real HTTP transport;
 * Phase 02 ships the stub that the editor uses today.
 */
export interface ClientDocumentLoader {
  fetchDeck(deckId: ULID): Promise<DeckDocument>;
  saveDeck(doc: DeckDocument, expectedRevision: number): Promise<SaveResult>;
}

export interface SaveResult {
  revision: number;
  warnings: Array<{ code: string; path: string; message: string }>;
}

export interface SaveError {
  code:
    | 'REVISION_CONFLICT'
    | 'INVALID_SCHEMA'
    | 'TENANT_MISMATCH'
    | 'DECK_NOT_FOUND'
    | 'PAYLOAD_TOO_LARGE'
    | 'NETWORK';
  message: string;
  details?: unknown;
}

/**
 * Idempotency keys are required for every save call so the server can
 * safely retry client writes without applying them twice.
 */
export interface IdempotencyKeyProvider {
  next(): string;
}

export class GeneratedIdempotencyKey implements IdempotencyKeyProvider {
  next(): string {
    return newToken(16);
  }
}

export interface HttpLikeTransport {
  get(url: string): Promise<{ ok: boolean; status: number; body: unknown }>;
  post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; body: unknown }>;
}

/**
 * Concrete HTTP-backed loader. It runs the structural validator on the
 * client before issuing the save, so the editor never hits the wire
 * with a payload the server would reject anyway.
 */
export class HttpClientDocumentLoader implements ClientDocumentLoader {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: HttpLikeTransport,
    private readonly keys: IdempotencyKeyProvider = new GeneratedIdempotencyKey(),
  ) {}

  async fetchDeck(deckId: ULID): Promise<DeckDocument> {
    const response = await this.transport.get(`${this.baseUrl}/v1/decks/${deckId}`);
    if (response.status === 404) {
      throw makeError('DECK_NOT_FOUND', `Deck ${deckId} not found.`);
    }
    if (!response.ok) {
      throw makeError('NETWORK', `Failed to load deck (status ${response.status}).`);
    }
    const validation: SchemaValidateResult = validate(response.body, { ignoreVersion: true });
    if (!validation.valid) {
      throw makeError('INVALID_SCHEMA', 'Server returned a malformed deck document.', {
        errors: validation.errors,
      });
    }
    const doc = response.body as DeckDocument;
    if (doc.schemaVersion !== DECK_SCHEMA_VERSION) {
      // The server is responsible for migrating, but if not, the
      // loader surfaces the version mismatch so the editor can react.
      throw makeError(
        'INVALID_SCHEMA',
        `Schema version mismatch: server returned ${doc.schemaVersion}, expected ${DECK_SCHEMA_VERSION}.`,
      );
    }
    return doc;
  }

  async saveDeck(doc: DeckDocument, expectedRevision: number): Promise<SaveResult> {
    const clientValidation = validate(doc);
    if (!clientValidation.valid) {
      throw makeError('INVALID_SCHEMA', 'Deck failed client-side validation.', {
        errors: clientValidation.errors,
      });
    }
    const idempotencyKey = this.keys.next();
    const response = await this.transport.post(
      `${this.baseUrl}/v1/decks/${doc.id}/schema`,
      { doc, expectedRevision },
      { 'Idempotency-Key': idempotencyKey },
    );
    if (response.status === 404) {
      throw makeError('DECK_NOT_FOUND', `Deck ${doc.id} not found.`);
    }
    if (response.status === 409) {
      throw makeError(
        'REVISION_CONFLICT',
        `Expected revision ${expectedRevision} but server has a newer one.`,
      );
    }
    if (response.status === 413) {
      throw makeError('PAYLOAD_TOO_LARGE', 'Deck payload exceeds the 16 MB size limit.');
    }
    if (response.status === 422) {
      throw makeError('INVALID_SCHEMA', 'Server rejected the deck payload.', response.body);
    }
    if (response.status === 403) {
      throw makeError('TENANT_MISMATCH', 'Deck belongs to a different tenant.');
    }
    if (!response.ok) {
      throw makeError('NETWORK', `Save failed with status ${response.status}.`);
    }
    const body = response.body as { revision: number; warnings?: SaveResult['warnings'] };
    return { revision: body.revision, warnings: body.warnings ?? [] };
  }
}

function makeError(code: SaveError['code'], message: string, details?: unknown): SaveError {
  return { code, message, details };
}
