import type { DeckDocument, SemanticAddress } from './generated/scene-graph.js';

export interface AddressResolver {
  /** Parses a `SemanticAddress` into a list of address segments. */
  parse(address: SemanticAddress): AddressSegment[];

  /** Resolves a `SemanticAddress` to the element it points at. */
  resolve(
    doc: DeckDocument,
    address: SemanticAddress,
  ):
    | { kind: 'slide'; index: number; address: string }
    | { kind: 'element'; slideIndex: number; elementIndex: number; address: string }
    | null;

  /** Returns the fully-qualified address for a given element. */
  addressOf(doc: DeckDocument, target: { slideIndex: number; elementIndex?: number }): string;
}

export interface AddressSegment {
  role: string;
  name: string;
}

const ADDRESS_REGEX =
  /^[a-zA-Z_][a-zA-Z0-9_]*\[[a-zA-Z0-9_-]+\](?:\.[a-zA-Z_][a-zA-Z0-9_]*\[[a-zA-Z0-9_-]+\])*$/;

export class DefaultAddressResolver implements AddressResolver {
  parse(address: SemanticAddress): AddressSegment[] {
    if (!ADDRESS_REGEX.test(address)) {
      throw new Error(`Invalid SemanticAddress: ${address}`);
    }
    const segments: AddressSegment[] = [];
    const dotParts = address.split('.');
    if (dotParts.length === 0) {
      throw new Error(`Invalid SemanticAddress: ${address}`);
    }
    for (const dotPart of dotParts) {
      const bracketIndex = dotPart.indexOf('[');
      if (bracketIndex < 0) {
        throw new Error(`Invalid SemanticAddress: ${address}`);
      }
      const role = dotPart.slice(0, bracketIndex);
      const closing = dotPart.indexOf(']', bracketIndex);
      if (closing < 0) {
        throw new Error(`Invalid SemanticAddress: ${address}`);
      }
      const name = dotPart.slice(bracketIndex + 1, closing);
      segments.push({ role, name });
    }
    return segments;
  }

  resolve(
    doc: DeckDocument,
    address: SemanticAddress,
  ):
    | { kind: 'slide'; index: number; address: string }
    | { kind: 'element'; slideIndex: number; elementIndex: number; address: string }
    | null {
    const segments = this.parse(address);
    if (segments.length === 0) return null;
    const head = segments[0];
    if (!head) return null;
    const slideIndex = doc.slides.findIndex((slide) => slide.semanticId === head.name);
    if (slideIndex < 0) return null;
    if (segments.length === 1) {
      return { kind: 'slide', index: slideIndex, address };
    }
    const tail = segments.slice(1);
    if (tail.length === 0) return null;
    const slide = doc.slides[slideIndex];
    if (!slide) return null;
    for (let i = 0; i < tail.length - 1; i++) {
      const seg = tail[i];
      if (!seg) return null;
      const child = slide.elements.find((el) => el.semanticId === seg.name && el.type === 'group');
      if (!child) return null;
    }
    const lastSeg = tail[tail.length - 1];
    if (!lastSeg) return null;
    const elementIndex = slide.elements.findIndex((el) => el.semanticId === lastSeg.name);
    if (elementIndex < 0) return null;
    return { kind: 'element', slideIndex, elementIndex, address };
  }

  addressOf(doc: DeckDocument, target: { slideIndex: number; elementIndex?: number }): string {
    const slide = doc.slides[target.slideIndex];
    if (!slide) {
      throw new Error(`slideIndex ${target.slideIndex} out of range.`);
    }
    const head = `slide[${slide.semanticId}]`;
    if (target.elementIndex === undefined) {
      return head;
    }
    const element = slide.elements[target.elementIndex];
    if (!element) {
      throw new Error(
        `elementIndex ${target.elementIndex} out of range on slide ${slide.semanticId}.`,
      );
    }
    const chain = collectAncestorChain(slide, target.elementIndex);
    const parts = [
      head,
      ...chain.slice(0, -1).map((el) => `${headOfElement(el)}[${el.semanticId}]`),
    ];
    const lastEl = chain[chain.length - 1];
    if (!lastEl) {
      throw new Error(`Empty element chain.`);
    }
    parts.push(`${headOfElement(lastEl)}[${lastEl.semanticId}]`);
    return parts.join('.');
  }
}

function collectAncestorChain(
  slide: DeckDocument['slides'][number],
  elementIndex: number,
): DeckDocument['slides'][number]['elements'] {
  const chain: DeckDocument['slides'][number]['elements'] = [];
  let currentIndex: number | undefined = elementIndex;
  while (currentIndex !== undefined) {
    const current = slide.elements[currentIndex];
    if (!current) break;
    chain.unshift(current);
    if (current.parentId === null) {
      currentIndex = undefined;
    } else {
      currentIndex = slide.elements.findIndex((el) => el.id === current.parentId);
    }
  }
  return chain;
}

function headOfElement(element: DeckDocument['slides'][number]['elements'][number]): string {
  return element.type === 'group'
    ? 'group'
    : element.type === 'autoLayout'
      ? 'autoLayout'
      : element.type;
}

export function isValidSemanticAddress(value: string): boolean {
  return ADDRESS_REGEX.test(value);
}
