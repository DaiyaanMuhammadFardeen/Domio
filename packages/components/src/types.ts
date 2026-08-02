/**
 * Component pack types — a Domio component is a declarative, prop-driven
 * scene-graph template (docs/development_phases/phase-06 §4.1-4.2).
 */

import type { Element, ULID } from '@domio/schema';
import type { DomioPropsSchema } from '@domio/schema-prop';

export type ComponentCategory =
  | 'statistics'
  | 'data'
  | 'structure'
  | 'people'
  | 'layout';

export interface ComponentVariant {
  id: string;
  label: string;
  /** Theme bucket the variant drives (light/dark token sets). */
  theme: 'light' | 'dark';
}

export interface DomioComponentDef {
  /** Namespaced catalog id, e.g. `domio.stat-card`. */
  catalogId: string;
  name: string;
  description: string;
  category: ComponentCategory;
  /** Semver of the component package. */
  version: string;
  variants: ComponentVariant[];
  defaultVariant: string;
  /** Intrinsic design size in scene-graph units. */
  size: { w: number; h: number };
  propsSchema: DomioPropsSchema;
  /** Expands props into scene-graph elements in LOCAL coordinates. */
  build: (props: Record<string, unknown>, ctx: BuildContext) => Element[];
}

export interface BuildContext {
  variantId: string;
  /** Deterministic ULID factory seeded per instance. */
  id: () => ULID;
  semanticId: (role: string) => string;
}

export type ComponentResolvedProps = Record<string, unknown>;
