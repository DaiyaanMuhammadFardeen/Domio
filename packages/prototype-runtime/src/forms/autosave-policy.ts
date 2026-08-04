/**
 * AutosavePolicy — debounced draft save for forms.
 *
 * Phase 10 M4.1 — saves a draft 5 s after the user's last edit. The
 * callback is responsible for persistence; this class only handles
 * timing and the in-memory draft cache.
 */

import type { FormId, FormValues } from './types.js';

export type DraftSaveCallback = (formId: FormId, values: FormValues) => Promise<void> | void;

export interface AutosavePolicyOptions {
  readonly debounceMs?: number;
  readonly save?: DraftSaveCallback;
  readonly clock?: () => number;
}

export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 5_000;

export interface PersistedDraft {
  readonly formId: FormId;
  readonly values: FormValues;
  readonly savedAt: number;
}

/**
 * Tracks every draft per-form. `markDirty` resets the debounce timer;
 * after the timer fires without a new edit, the callback runs.
 */
export class AutosavePolicy {
  readonly debounceMs: number;
  private readonly saveCallback: DraftSaveCallback | undefined;
  private readonly clock: () => number;
  private readonly drafts = new Map<FormId, PersistedDraft>();
  private readonly timers = new Map<FormId, ReturnType<typeof setTimeout>>();

  constructor(opts: AutosavePolicyOptions = {}) {
    this.debounceMs = opts.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS;
    this.saveCallback = opts.save;
    this.clock = opts.clock ?? (() => Date.now());
  }

  /** Mark a form as edited — debounces a save. */
  markDirty(formId: FormId, values: FormValues): void {
    const existing = this.timers.get(formId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.timers.delete(formId);
      void this.flush(formId, values);
    }, this.debounceMs);
    this.timers.set(formId, handle);
  }

  /** Force-flush a draft immediately (e.g. on page unload). */
  async flush(formId: FormId, values: FormValues): Promise<void> {
    if (this.saveCallback) {
      await this.saveCallback(formId, values);
    }
    this.drafts.set(formId, {
      formId,
      values,
      savedAt: this.clock(),
    });
  }

  /** Restore a previously autosaved draft, if any. */
  restoreDraft(formId: FormId): PersistedDraft | null {
    return this.drafts.get(formId) ?? null;
  }

  /** Discard a saved draft. */
  clearDraft(formId: FormId): void {
    this.drafts.delete(formId);
    const t = this.timers.get(formId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(formId);
    }
  }

  /** Current snapshot of every draft — for the editor's draft list UI. */
  listDrafts(): readonly PersistedDraft[] {
    return Array.from(this.drafts.values());
  }

  /** Cancel all pending timers (e.g. on editor teardown). */
  destroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
