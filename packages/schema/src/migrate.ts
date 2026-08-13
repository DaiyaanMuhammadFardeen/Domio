import type { DeckDocument } from './generated/scene-graph.js';
import { MigrationRegistry } from './registry.js';

export interface MigrationPlan {
  from: string;
  to: string;
  steps: number;
}

/**
 * Lazy schema migration driver. The control plane's `DocumentLoader.load`
 * invokes this to bring a stored document up to the current
 * `DECK_SCHEMA_VERSION` before handing it to the editor or viewer.
 */
export class SchemaMigrator {
  private readonly registry: MigrationRegistry;
  private readonly currentVersion: string;

  constructor(currentVersion: string, registry: MigrationRegistry = new MigrationRegistry()) {
    this.currentVersion = currentVersion;
    this.registry = registry;
  }

  current(): string {
    return this.currentVersion;
  }

  plan(doc: DeckDocument): MigrationPlan {
    const path = this.registry.findPath(doc.schemaVersion, this.currentVersion);
    return {
      from: doc.schemaVersion,
      to: this.currentVersion,
      steps: path?.length ?? 0,
    };
  }

  apply(doc: DeckDocument): DeckDocument {
    const path = this.registry.findPath(doc.schemaVersion, this.currentVersion);
    if (!path) {
      throw new Error(
        `No schema migration path from ${doc.schemaVersion} to ${this.currentVersion}.`,
      );
    }
    let current: unknown = doc;
    for (const step of path) {
      current = step.apply(current);
    }
    return { ...(current as DeckDocument), schemaVersion: this.currentVersion };
  }
}
