/**
 * Phase 11 camera keyframe — in-memory repository.
 *
 * Injectable id generator (ULID-ish) mirrors timeline-api's repo pattern.
 */

import type { CameraKeyframe } from './types.js';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface CameraKeyframeRepository {
  insert(record: CameraKeyframe): Promise<void>;
  findById(id: string): Promise<CameraKeyframe | null>;
  listBySlide(slideId: string, sceneId?: string): Promise<CameraKeyframe[]>;
  update(id: string, patch: Partial<Omit<CameraKeyframe, 'id' | 'createdAt'>>): Promise<CameraKeyframe>;
  delete(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class KeyframeNotFoundError extends Error {
  readonly code = 'KEYFRAME_NOT_FOUND' as const;
  constructor(public readonly keyframeId: string) {
    super(`Keyframe ${keyframeId} not found`);
    this.name = 'KeyframeNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryCameraKeyframeRepository implements CameraKeyframeRepository {
  private store = new Map<string, CameraKeyframe>();

  async insert(record: CameraKeyframe): Promise<void> {
    this.store.set(record.id, record);
  }

  async findById(id: string): Promise<CameraKeyframe | null> {
    return this.store.get(id) ?? null;
  }

  async listBySlide(slideId: string, sceneId?: string): Promise<CameraKeyframe[]> {
    const items: CameraKeyframe[] = [];
    for (const kf of this.store.values()) {
      if (kf.slideId === slideId) {
        if (sceneId !== undefined && kf.sceneId !== sceneId) continue;
        items.push(kf);
      }
    }
    return items.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async update(
    id: string,
    patch: Partial<Omit<CameraKeyframe, 'id' | 'createdAt'>>,
  ): Promise<CameraKeyframe> {
    const existing = this.store.get(id);
    if (!existing) throw new KeyframeNotFoundError(id);

    // Merge nested objects properly
    const position = patch.position !== undefined
      ? { ...existing.position, ...patch.position } as CameraKeyframe['position']
      : existing.position;
    const target = patch.target !== undefined
      ? { ...existing.target, ...patch.target } as CameraKeyframe['target']
      : existing.target;
    const easing = patch.easing !== undefined
      ? { ...existing.easing, ...patch.easing } as CameraKeyframe['easing']
      : existing.easing;

    const updated: CameraKeyframe = {
      ...existing,
      ...(patch.position !== undefined ? { position } : {}),
      ...(patch.target !== undefined ? { target } : {}),
      ...(patch.easing !== undefined ? { easing } : {}),
      ...(patch.fov !== undefined ? { fov: patch.fov } : {}),
      ...(patch.roll !== undefined ? { roll: patch.roll } : {}),
      ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : {}),
      ...(patch.trigger !== undefined ? { trigger: patch.trigger } : {}),
      ...(patch.orderIndex !== undefined ? { orderIndex: patch.orderIndex } : {}),
      ...(patch.sceneId !== undefined ? { sceneId: patch.sceneId } : {}),
    };

    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Default ULID-ish id generator
// ---------------------------------------------------------------------------

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function defaultIdGenerator(): string {
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += ULID_CHARS[Math.floor(Math.random() * 32)]!;
  }
  return id;
}
