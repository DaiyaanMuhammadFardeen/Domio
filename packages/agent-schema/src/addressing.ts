/**
 * Address parser for agent-targeted deck paths.
 *
 * Examples:
 *   "slide[3]"           -> { kind: 'slide', indexOrId: '3' }
 *   "slide[id]"          -> { kind: 'slide', indexOrId: 'id' }
 *   "slide[3].hotspot[cta_pricing]"
 *                          -> { kind: 'hotspot', indexOrId: 'cta_pricing', parent: { kind: 'slide', indexOrId: '3' } }
 *   "variable[revenue]"  -> { kind: 'variable', indexOrId: 'revenue' }
 *
 * Throws on malformed paths.
 */

export type AddressKind =
  | 'slide'
  | 'hotspot'
  | 'variable'
  | 'rule'
  | 'overlay'
  | 'form'
  | 'calculator'
  | 'device-frame'
  | 'quiz'
  | 'sequence'
  | 'deep-link';

export interface AddressNode {
  readonly kind: AddressKind;
  readonly indexOrId: string;
  readonly parent?: AddressNode;
}

const KINDS: readonly AddressKind[] = [
  'slide',
  'hotspot',
  'variable',
  'rule',
  'overlay',
  'form',
  'calculator',
  'device-frame',
  'quiz',
  'sequence',
  'deep-link',
];

const KIND_SET = new Set<string>(KINDS);

const SEGMENT_RE = /^([a-zA-Z][a-zA-Z0-9_-]*)\[([^\]]+)\]$/;

export class AddressParseError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`Invalid address path "${path}": ${message}`);
    this.name = 'AddressParseError';
  }
}

export function parseAddress(path: string): AddressNode {
  if (typeof path !== 'string') {
    throw new AddressParseError('path must be a string', String(path));
  }
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    throw new AddressParseError('path is empty', path);
  }

  const segments = trimmed.split('.');
  let parent: AddressNode | undefined;
  for (const raw of segments) {
    const segment = raw.trim();
    if (segment.length === 0) {
      throw new AddressParseError('empty segment', path);
    }
    const match = SEGMENT_RE.exec(segment);
    if (!match) {
      throw new AddressParseError(`segment "${segment}" must be kind[id]`, path);
    }
    const kind = match[1] ?? '';
    const indexOrId = match[2] ?? '';
    if (!KIND_SET.has(kind)) {
      throw new AddressParseError(`unknown kind "${kind}"`, path);
    }
    if (indexOrId.trim().length === 0) {
      throw new AddressParseError('missing index or id', path);
    }
    const node: AddressNode = parent
      ? { kind: kind as AddressKind, indexOrId, parent }
      : { kind: kind as AddressKind, indexOrId };
    parent = node;
  }
  if (!parent) {
    throw new AddressParseError('no segments parsed', path);
  }
  return parent;
}

export function addressToString(node: AddressNode): string {
  const parts: string[] = [];
  let current: AddressNode | undefined = node;
  while (current) {
    parts.unshift(`${current.kind}[${current.indexOrId}]`);
    current = current.parent;
  }
  return parts.join('.');
}
