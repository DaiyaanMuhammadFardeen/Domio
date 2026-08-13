/**
 * Shader Registry — persistence layer (Phase 11).
 *
 * In-memory Map repository with injectable id generation.
 * Stores shader records keyed by workspace.
 */

// ---------------------------------------------------------------------------
// Domain records
// ---------------------------------------------------------------------------

export type ShaderKind = 'background' | 'particle' | 'material' | 'post';

export interface Shader {
  readonly id: string;
  readonly workspaceId: string;
  readonly authorId: string;
  readonly name: string;
  readonly kind: ShaderKind;
  readonly sourceWgsl: string;
  readonly sourceGlsl: string;
  readonly inputs: Record<string, { type: string; default?: unknown; description?: string }>;
  readonly published: boolean;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ShaderRepository {
  insert(record: Shader): Promise<void>;
  findById(id: string, workspaceId: string): Promise<Shader | null>;
  listByWorkspace(workspaceId: string, kind?: ShaderKind): Promise<Shader[]>;
  update(
    id: string,
    workspaceId: string,
    patch: Partial<Pick<Shader, 'name' | 'sourceWgsl' | 'sourceGlsl' | 'inputs' | 'published'>>,
  ): Promise<Shader>;
  delete(id: string, workspaceId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryShaderRepository implements ShaderRepository {
  private store = new Map<string, Shader>();
  private k(id: string, ws: string): string {
    return `${ws}::${id}`;
  }

  async insert(record: Shader): Promise<void> {
    this.store.set(this.k(record.id, record.workspaceId), record);
  }

  async findById(id: string, workspaceId: string): Promise<Shader | null> {
    return this.store.get(this.k(id, workspaceId)) ?? null;
  }

  async listByWorkspace(workspaceId: string, kind?: ShaderKind): Promise<Shader[]> {
    const out: Shader[] = [];
    for (const r of this.store.values()) {
      if (r.workspaceId !== workspaceId) continue;
      if (kind && r.kind !== kind) continue;
      out.push(r);
    }
    return out;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: Partial<Pick<Shader, 'name' | 'sourceWgsl' | 'sourceGlsl' | 'inputs' | 'published'>>,
  ): Promise<Shader> {
    const existing = await this.findById(id, workspaceId);
    if (!existing) throw new ShaderNotFoundError(id);
    const updated: Shader = { ...existing, ...patch };
    this.store.set(this.k(id, workspaceId), updated);
    return updated;
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    return this.store.delete(this.k(id, workspaceId));
  }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ShaderNotFoundError extends Error {
  readonly code = 'SHADER_NOT_FOUND' as const;
  constructor(public readonly shaderId: string) {
    super(`Shader ${shaderId} not found`);
    this.name = 'ShaderNotFoundError';
  }
}
