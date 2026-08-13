/**
 * Template install engine — deep-copies a template's deck JSON and replaces
 * every TemplatePlaceholder with a caller-supplied value (or the placeholder's
 * default), following each placeholder's binding path.
 */

import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import type { TemplatePlaceholder } from '../store/types.js';

// ---------------------------------------------------------------------------
// Binding path utilities
// ---------------------------------------------------------------------------

/**
 * Parse a binding path like `slide[0].elements[1].props.label` into an array
 * of segment descriptors.  Supports dot-separated keys and bracket-index
 * array access (`[N]`).
 */
type Segment = { key: string; index?: number };

function parseBindingPath(binding: string): Segment[] {
  const segments: Segment[] = [];
  // Split on '.' but keep bracket content attached to the preceding key.
  const parts = binding.split('.');
  for (const part of parts) {
    const match = part.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (!match) {
      throw Errors.validation(`Invalid binding segment "${part}" in path "${binding}"`);
    }
    const seg: Segment = { key: match[1]! };
    if (match[2] !== undefined) {
      seg.index = Number(match[2]);
    }
    segments.push(seg);
  }
  return segments;
}

/** Set a value at the end of a binding path on the given root object. */
function setByBinding(root: unknown, binding: string, value: unknown): void {
  const segments = parseBindingPath(binding);
  let current: unknown = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    // Navigate: first by key (if present), then by index (if present).
    if (seg.key) {
      current = (current as Record<string, unknown>)[seg.key];
      if (current === undefined || current === null) {
        throw Errors.validation(
          `Cannot resolve binding "${binding}" — segment "${seg.key}" is ${String(current)}`,
        );
      }
    }
    if (seg.index !== undefined) {
      const arr = current as unknown[];
      current = arr[seg.index];
      if (current === undefined || current === null) {
        throw Errors.validation(
          `Cannot resolve binding "${binding}" — index [${seg.index}] is ${String(current)}`,
        );
      }
    }
  }

  const last = segments[segments.length - 1]!;
  if (last.key) {
    const target =
      last.index !== undefined
        ? ((current as Record<string, unknown>)[last.key] as unknown[])
        : (current as Record<string, unknown>);
    if (last.index !== undefined) {
      (target as unknown[])[last.index] = value;
    } else {
      (target as Record<string, unknown>)[last.key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export interface InstallInput {
  templateId: string;
  workspaceId: string;
  userId: string;
  values: Record<string, unknown>;
}

export interface ReplacedPlaceholder {
  placeholderId: string;
  key: string;
  binding: string;
  value: unknown;
}

export interface InstallResult {
  /** Deep-copied and substituted deck document. */
  deck: Record<string, unknown>;
  /** Ordered list of all replaced placeholders. */
  manifest: ReplacedPlaceholder[];
}

/**
 * Deep-clone a plain value (no functions, no cycles — JSON-safe objects only).
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Validates every required placeholder has a value, then applies each
 * placeholder's binding path to a deep-copied deck.
 *
 * Throws `Errors.validation` if:
 *  - a required placeholder is missing from `values` and has no `default`
 *  - a binding path cannot be resolved
 */
export async function installTemplate(
  deps: ServiceDeps,
  input: InstallInput,
): Promise<InstallResult> {
  const template = await deps.store.getTemplate(input.templateId);
  if (!template) throw Errors.notFound(`template ${input.templateId}`);

  const deckJson = template.deckJson;
  if (!deckJson || typeof deckJson !== 'object') {
    throw Errors.validation('Template has no deckJson');
  }

  const deck = deepClone(deckJson) as Record<string, unknown>;
  const manifest: ReplacedPlaceholder[] = [];

  for (const ph of template.placeholders) {
    const value = resolveValue(ph, input.values);

    if (value === undefined) {
      throw Errors.validation(
        `Required placeholder "${ph.key}" has no value provided and no default`,
      );
    }

    if (ph.binding) {
      setByBinding(deck, ph.binding, value);
      manifest.push({
        placeholderId: ph.id,
        key: ph.key,
        binding: ph.binding,
        value,
      });
    }
  }

  return { deck, manifest };
}

/**
 * Resolves the effective value for a placeholder: caller-supplied value wins,
 * then the placeholder's declared default, then `undefined` (for validation).
 */
function resolveValue(ph: TemplatePlaceholder, values: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(values, ph.key)) {
    return values[ph.key];
  }
  if (Object.prototype.hasOwnProperty.call(ph, 'default')) {
    return ph.default;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Guided ordering
// ---------------------------------------------------------------------------

/**
 * Returns placeholders in dependency-safe order for a guided UI:
 * required placeholders first (in declared order), then optional ones.
 */
export async function guidedOrder(
  deps: ServiceDeps,
  templateId: string,
): Promise<TemplatePlaceholder[]> {
  const template = await deps.store.getTemplate(templateId);
  if (!template) throw Errors.notFound(`template ${templateId}`);

  const required = template.placeholders.filter((p) => p.required);
  const optional = template.placeholders.filter((p) => !p.required);
  return [...required, ...optional];
}

// ---------------------------------------------------------------------------
// applyTemplate (convenience — install only, no persistence)
// ---------------------------------------------------------------------------

/**
 * Alias for installTemplate. Does NOT persist the resulting deck — callers
 * are responsible for store integration. Returns `{deck, manifest}`.
 */
export async function applyTemplate(
  deps: ServiceDeps,
  input: InstallInput,
): Promise<InstallResult> {
  return installTemplate(deps, input);
}
