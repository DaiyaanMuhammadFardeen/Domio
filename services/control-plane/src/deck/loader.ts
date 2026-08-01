import {
  DECK_SCHEMA_VERSION,
  SchemaMigrator,
  validate,
  type DeckDocument,
  type SchemaValidateResult,
  type ULID,
  type ValidationWarning,
} from '@domio/schema';

/**
 * Errors surfaced by the control-plane `DocumentLoader`. Codes match
 * the Phase 02 contract (`docs/04-system-architecture.md` §4.6.2).
 */
export type DocumentLoaderErrorCode =
  | 'DECK_NOT_FOUND'
  | 'TENANT_MISMATCH'
  | 'INVALID_SCHEMA'
  | 'REVISION_CONFLICT'
  | 'PAYLOAD_TOO_LARGE';

export class DocumentLoaderError extends Error {
  constructor(
    public readonly code: DocumentLoaderErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DocumentLoaderError';
  }
}

export interface DeckRepository {
  /** Reads the canonical JSONB document for `(deckId, revision)`. */
  fetchRaw(
    deckId: ULID,
    tenantId: string,
  ): Promise<{ document: DeckDocument; revision: number } | null>;

  /** Returns the live `current_revision` row used for optimistic locking. */
  fetchCurrentRevision(deckId: ULID, tenantId: string): Promise<number | null>;

  /** Persists a new revision. Returns the new revision number. */
  insertRevision(
    deckId: ULID,
    tenantId: string,
    document: DeckDocument,
    expectedRevision: number,
  ): Promise<{ revision: number }>;
}

export interface DocumentLoaderOptions {
  /** Optional explicit migrator (used by tests). */
  migrator?: SchemaMigrator;
  /** Optional repository implementation (defaults to `NoopDeckRepository`). */
  repository?: DeckRepository;
}

export interface SaveResult {
  revision: number;
  warnings: ValidationWarning[];
}

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * The control-plane entry point for loading and saving decks. It is the
 * **only** path that the editor and viewer use to read or mutate a deck.
 */
export class DocumentLoader {
  private readonly migrator: SchemaMigrator;
  private readonly repository: DeckRepository;

  constructor(
    private readonly tenantId: string,
    options: DocumentLoaderOptions = {},
  ) {
    this.migrator = options.migrator ?? new SchemaMigrator(DECK_SCHEMA_VERSION);
    this.repository = options.repository ?? new NoopDeckRepository();
  }

  async load(deckId: ULID): Promise<DeckDocument> {
    const raw = await this.repository.fetchRaw(deckId, this.tenantId);
    if (!raw) {
      throw new DocumentLoaderError('DECK_NOT_FOUND', `Deck ${deckId} not found.`);
    }
    return this.migrator.apply(raw.document);
  }

  async save(
    deckId: ULID,
    document: DeckDocument,
    expectedRevision: number,
  ): Promise<SaveResult> {
    if (document.id !== deckId) {
      throw new DocumentLoaderError(
        'INVALID_SCHEMA',
        `Document id ${document.id} does not match path ${deckId}.`,
      );
    }
    if (document.tenantId !== this.tenantId) {
      throw new DocumentLoaderError(
        'TENANT_MISMATCH',
        `Document tenant ${document.tenantId} does not match ${this.tenantId}.`,
      );
    }
    const byteSize = approximateByteSize(document);
    if (byteSize > MAX_BYTES) {
      throw new DocumentLoaderError(
        'PAYLOAD_TOO_LARGE',
        `Deck payload is ${byteSize} bytes which exceeds the 16 MB limit.`,
        { byteSize, max: MAX_BYTES },
      );
    }
    const result: SchemaValidateResult = validate(document);
    if (!result.valid) {
      throw new DocumentLoaderError(
        'INVALID_SCHEMA',
        'Document failed structural validation.',
        { errors: result.errors },
      );
    }
    const persisted = await this.repository.insertRevision(
      deckId,
      this.tenantId,
      document,
      expectedRevision,
    );
    return { revision: persisted.revision, warnings: result.errors };
  }
}

/**
 * Default repository used until the Phase 02 Postgres migration ships.
 * It defers persistence to the in-process migrator only and throws
 * `REVISION_CONFLICT` on concurrent writes via `current_revision`
 * (optimistic locking per docs/04-system-architecture.md §4.6.2).
 */
export class NoopDeckRepository implements DeckRepository {
  private readonly revisions = new Map<string, { revision: number; document: DeckDocument }>();

  async fetchRaw(
    deckId: ULID,
    tenantId: string,
  ): Promise<{ document: DeckDocument; revision: number } | null> {
    const row = this.revisions.get(`${tenantId}:${deckId}`);
    if (!row) return null;
    return { document: row.document, revision: row.revision };
  }

  async fetchCurrentRevision(deckId: ULID, tenantId: string): Promise<number | null> {
    const row = this.revisions.get(`${tenantId}:${deckId}`);
    return row ? row.revision : null;
  }

  async insertRevision(
    deckId: ULID,
    tenantId: string,
    document: DeckDocument,
    expectedRevision: number,
  ): Promise<{ revision: number }> {
    const key = `${tenantId}:${deckId}`;
    const current = this.revisions.get(key);
    const currentRevision = current?.revision ?? -1;
    if (currentRevision !== expectedRevision) {
      throw new DocumentLoaderError(
        'REVISION_CONFLICT',
        `Expected revision ${expectedRevision} but current is ${currentRevision}.`,
        { currentRevision },
      );
    }
    const revision = currentRevision + 1;
    this.revisions.set(key, { revision, document });
    return { revision };
  }
}

function approximateByteSize(document: DeckDocument): number {
  try {
    return Buffer.byteLength(JSON.stringify(document), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}