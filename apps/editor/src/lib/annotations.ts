/**
 * Annotations on data points — Wave 2 §S2.8.
 *
 * Annotations are CRDT-safe metadata stored alongside the element they
 * describe. The storage shape mirrors other element-level config
 * (timeline, motion path, locale): the annotation lives under the
 * `x-domio:annotations` key of the element's `component.props` (or the
 * element's own `style` map) and carries an array of independent pins.
 *
 * Each pin is uniquely identified so concurrent reviewers don't
 * overwrite each other; the runtime renders them with a leader-line
 * + chip.
 */

export interface AnnotationPin {
  /** Stable identifier; ULID when created in the editor. */
  id: string;
  /** The data point this annotation is attached to. Format depends on
   *  the host (chart point id, table row id, etc.) — left as a free-form
   *  string so the editor doesn't need to know every chart type. */
  dataPointId: string;
  /** Pin text — markdown-lite (bold/italic only). */
  text: string;
  /** Foreground / chip color (CSS color). Defaults to the editor accent. */
  color?: string;
  /** Author display name (filled in from the session user). */
  author: string;
  /** Creation timestamp (ms since epoch). */
  createdAtMs: number;
  /** Optional (x, y) anchor in element-local coordinates for placement. */
  x?: number;
  y?: number;
}

export interface AnnotationCollection {
  pins: AnnotationPin[];
}

const KEY = 'x-domio:annotations';

export function readAnnotations(props: Record<string, unknown> | undefined): AnnotationPin[] {
  if (!props) return [];
  const value = props[KEY];
  if (typeof value !== 'object' || value === null) return [];
  const collection = value as AnnotationCollection;
  return Array.isArray(collection.pins) ? collection.pins : [];
}

export function writeAnnotations(
  props: Record<string, unknown> | undefined,
  pins: AnnotationPin[],
): Record<string, unknown> {
  return { ...(props ?? {}), [KEY]: { pins } satisfies AnnotationCollection };
}

export function upsertAnnotation(
  props: Record<string, unknown> | undefined,
  pin: AnnotationPin,
): Record<string, unknown> {
  const pins = readAnnotations(props);
  const idx = pins.findIndex((p) => p.id === pin.id);
  const next = [...pins];
  if (idx === -1) next.push(pin);
  else next[idx] = pin;
  return writeAnnotations(props, next);
}

export function removeAnnotation(
  props: Record<string, unknown> | undefined,
  pinId: string,
): Record<string, unknown> {
  const next = readAnnotations(props).filter((p) => p.id !== pinId);
  return writeAnnotations(props, next);
}

export function clearAnnotations(props: Record<string, unknown> | undefined): Record<string, unknown> {
  return writeAnnotations(props, []);
}

/**
 * Create a fresh annotation pin with sensible defaults. The id and
 * `createdAtMs` are filled in if not supplied.
 */
export function makeAnnotationPin(input: Partial<AnnotationPin> & Pick<AnnotationPin, 'dataPointId' | 'text' | 'author'>): AnnotationPin {
  return {
    id: input.id ?? `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    dataPointId: input.dataPointId,
    text: input.text,
    color: input.color ?? '#58a6ff',
    author: input.author,
    createdAtMs: input.createdAtMs ?? Date.now(),
    ...(input.x !== undefined ? { x: input.x } : {}),
    ...(input.y !== undefined ? { y: input.y } : {}),
  };
}