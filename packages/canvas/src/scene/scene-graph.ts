/**
 * Scene graph — reactive mirror of the deck document.
 *
 * The scene graph is built once from a `DeckDocument`, then mutated through
 * the history engine. The renderer consumes a normalized view of the graph;
 * the spatial index is updated on every mutation.
 *
 * This module owns *no* layout; the layout worker (auto-layout.ts /
 * constraints.ts) is responsible for transform mutation after group / drop
 * operations.
 */

import type {
  DeckDocument,
  Element,
  Slide,
  ULID,
  Transform2D,
} from '@domio/schema';
import type { Aabb } from '../renderer/camera.js';
import { SpatialIndex, type SpatialItem } from './spatial-index.js';

export type NodeKind = 'deck' | 'slide' | 'element';

export interface SceneNode {
  kind: NodeKind;
  id: string;
  parentId: string | null;
  z: number;
  bounds: Aabb;
  ref: DeckDocument | Slide | Element;
}

export interface SceneGraphQuery {
  byId(id: string): SceneNode | null;
  ancestors(id: string): SceneNode[];
  descendants(id: string): SceneNode[];
  children(id: string): SceneNode[];
}

export class SceneGraph implements SceneGraphQuery {
  private readonly nodes = new Map<string, SceneNode>();
  private readonly index = new SpatialIndex();

  ingest(doc: DeckDocument): void {
    this.nodes.clear();
    this.index.clear();
    this.insertNode({
      kind: 'deck',
      id: doc.id,
      parentId: null,
      z: 0,
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      ref: doc,
    });
    doc.slides.forEach((slide, slideIndex) => {
      const slideNode: SceneNode = {
        kind: 'slide',
        id: slide.id,
        parentId: doc.id,
        z: slideIndex,
        bounds: { x: 0, y: 0, w: 0, h: 0 },
        ref: slide,
      };
      this.insertNode(slideNode);
      slide.elements.forEach((element) => this.ingestElement(element));
    });
  }

  byId(id: string): SceneNode | null {
    return this.nodes.get(id) ?? null;
  }

  ancestors(id: string): SceneNode[] {
    const out: SceneNode[] = [];
    let current = this.nodes.get(id);
    while (current && current.parentId) {
      const parent = this.nodes.get(current.parentId);
      if (!parent) break;
      out.push(parent);
      current = parent;
    }
    return out;
  }

  descendants(id: string): SceneNode[] {
    const out: SceneNode[] = [];
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop()!;
      for (const child of this.children(next)) {
        out.push(child);
        stack.push(child.id);
      }
    }
    return out;
  }

  children(id: string): SceneNode[] {
    const out: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.parentId === id) out.push(node);
    }
    out.sort((a, b) => a.z - b.z);
    return out;
  }

  /** Returns the spatial index the renderer + hit-test use. */
  spatialIndex(): SpatialIndex {
    return this.index;
  }

  /**
   * Update an element's transform and refresh the spatial index.
   */
  updateTransform(elementId: ULID, transform: Transform2D): void {
    const node = this.nodes.get(elementId);
    if (!node) return;
    node.bounds = transformToBounds(transform);
    if (node.kind === 'element') {
      (node.ref as Element).transform = transform;
    }
    this.index.update(toSpatialItem(node));
  }

  /** Set z (stacking order) on an element. */
  updateZ(elementId: ULID, z: number): void {
    const node = this.nodes.get(elementId);
    if (!node) return;
    node.z = z;
    if (node.kind === 'element') {
      (node.ref as Element).z = z;
    }
    this.index.update(toSpatialItem(node));
  }

  /** Toggle a layer's locked/hidden state. */
  setFlag(elementId: ULID, flag: 'locked' | 'hidden', value: boolean): void {
    const node = this.nodes.get(elementId);
    if (!node || node.kind !== 'element') return;
    const element = node.ref as Element;
    if (flag === 'locked') element.locked = value;
    if (flag === 'hidden') element.hidden = value;
  }

  /** Add an element (used by pen tool, etc.). */
  addElement(parentId: string, element: Element): void {
    const node: SceneNode = {
      kind: 'element',
      id: element.id,
      parentId,
      z: element.z ?? 0,
      bounds: element.transform ? transformToBounds(element.transform) : { x: 0, y: 0, w: 0, h: 0 },
      ref: element,
    };
    this.insertNode(node);
  }

  removeElement(elementId: string): void {
    const node = this.nodes.get(elementId);
    if (!node) return;
    for (const child of this.descendants(elementId)) {
      this.nodes.delete(child.id);
      this.index.remove(child.id);
    }
    this.nodes.delete(elementId);
    this.index.remove(elementId);
  }

  /** Replace parent on an element (re-parent / drop). */
  reparent(elementId: string, newParentId: string, newZ?: number): void {
    const node = this.nodes.get(elementId);
    if (!node) return;
    node.parentId = newParentId;
    if (newZ !== undefined) {
      node.z = newZ;
      if (node.kind === 'element') {
        (node.ref as Element).z = newZ;
      }
    }
    this.index.update(toSpatialItem(node));
  }

  private insertNode(node: SceneNode): void {
    this.nodes.set(node.id, node);
    if (node.kind === 'element') {
      this.index.insert(toSpatialItem(node));
    }
  }

  private ingestElement(element: Element): void {
    const transform = element.transform;
    this.insertNode({
      kind: 'element',
      id: element.id,
      parentId: element.parentId,
      z: element.z ?? 0,
      bounds: transform ? transformToBounds(transform) : { x: 0, y: 0, w: 0, h: 0 },
      ref: element,
    });
  }
}

export function transformToBounds(transform: Transform2D): Aabb {
  return { x: transform.x, y: transform.y, w: transform.w, h: transform.h };
}

export function toSpatialItem(node: SceneNode): SpatialItem {
  return { id: node.id, bounds: node.bounds, z: node.z };
}