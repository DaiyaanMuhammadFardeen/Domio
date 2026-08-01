import type { DeckDocument, ULID } from './generated/scene-graph.js';

export type SchemaMigrationDirection = 'up' | 'down';

export interface SchemaMigration {
  readonly from: string;
  readonly to: string;
  readonly direction: SchemaMigrationDirection;
  readonly description: string;
  apply(doc: unknown): unknown;
}

/**
 * Registry of schema migrations. Consumers register migrations ahead of time
 * (or they ship inside `@domio/schema`) and the migration runner can then
 * upgrade any `DeckDocument` to the requested version without code changes
 * in the consumer packages.
 */
export class MigrationRegistry {
  private readonly byKey = new Map<string, SchemaMigration[]>();

  register(migration: SchemaMigration): void {
    const key = `${migration.from}->${migration.to}`;
    const list = this.byKey.get(key) ?? [];
    list.push(migration);
    this.byKey.set(key, list);
  }

  has(from: string, to: string): boolean {
    return this.byKey.has(`${from}->${to}`) || this.byKey.has(`${to}->${from}`);
  }

  /**
   * Walks the registry to find a path of migrations that connects
   * `from` to `to`. Returns an empty array when they are identical,
   * `null` when no path exists.
   */
  findPath(from: string, to: string): SchemaMigration[] | null {
    if (from === to) return [];
    const queue: Array<{ version: string; path: SchemaMigration[] }> = [
      { version: from, path: [] },
    ];
    const seen = new Set<string>([from]);
    while (queue.length > 0) {
      const head = queue.shift()!;
      const list = Array.from(this.byKey.entries()).filter(([key]) =>
        key.startsWith(`${head.version}->`),
      );
      for (const [key, candidates] of list) {
        const migration = candidates[0];
        if (!migration) continue;
        const next = key.split('->')[1];
        if (!next) continue;
        if (seen.has(next)) continue;
        const path = [...head.path, migration];
        if (next === to) return path;
        seen.add(next);
        queue.push({ version: next, path });
      }
    }
    return null;
  }
}

/**
 * Track per-deck validation warnings. Returned by `DocumentLoader.save`.
 */
export interface ValidationWarning {
  code: string;
  path: string;
  message: string;
}

export interface SchemaValidateResult {
  valid: boolean;
  errors: ValidationWarning[];
}

export interface DeckSchemaValidator {
  validate(doc: DeckDocument): SchemaValidateResult;
}

export interface DeckRepository {
  load(id: ULID): Promise<DeckDocument | null>;
  save(id: ULID, doc: DeckDocument, expectedRevision: number): Promise<{ revision: number }>;
}
