/**
 * Per-submesh material registry.
 *
 * Supports multi-material meshes where each submesh can reference a
 * different material.  Lint results surface issues such as negative
 * scale on meshes.
 */

import type { Vec3 } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type LintSeverity = 'warning' | 'error';

export interface LintIssue {
  severity: LintSeverity;
  message: string;
  path: string;
}

export interface MaterialAssignment {
  meshId: string;
  submeshIndex: number;
  materialId: string;
}

export interface MaterialDefinition {
  id: string;
  name: string;
  baseColor: string;
  metallic: number;
  roughness: number;
  opacity: number;
}

export interface ScaleCheckInput {
  meshId: string;
  scale: Vec3;
}

// ---------------------------------------------------------------------------
// MaterialRegistry
// ---------------------------------------------------------------------------

export class MaterialRegistry {
  private materials = new Map<string, MaterialDefinition>();
  private assignments: MaterialAssignment[] = [];

  /** Register a material definition. */
  define(def: MaterialDefinition): void {
    this.materials.set(def.id, def);
  }

  /** Get a material by id. Returns undefined if not registered. */
  get(id: string): MaterialDefinition | undefined {
    return this.materials.get(id);
  }

  /** Assign a material to a specific submesh of a mesh. */
  assign(meshId: string, submeshIndex: number, materialId: string): void {
    // Remove existing assignment for the same mesh + submesh
    this.assignments = this.assignments.filter(
      (a) => !(a.meshId === meshId && a.submeshIndex === submeshIndex),
    );
    this.assignments.push({ meshId, submeshIndex, materialId });
  }

  /** Get the material id for a specific submesh. Returns undefined if unassigned. */
  getMaterialId(meshId: string, submeshIndex: number): string | undefined {
    const found = this.assignments.find(
      (a) => a.meshId === meshId && a.submeshIndex === submeshIndex,
    );
    return found?.materialId;
  }

  /** Get all assignments for a mesh. */
  getMeshAssignments(meshId: string): MaterialAssignment[] {
    return this.assignments.filter((a) => a.meshId === meshId);
  }

  /** Remove all assignments and materials. */
  clear(): void {
    this.materials.clear();
    this.assignments = [];
  }

  /**
   * Lint scales for negative values.  Each negative component on a mesh
   * produces a warning-level lint issue.
   */
  lintScales(inputs: ScaleCheckInput[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const input of inputs) {
      if (input.scale.x < 0) {
        issues.push({
          severity: 'warning',
          message: `Negative X scale on mesh "${input.meshId}" may invert normals`,
          path: `${input.meshId}.scale.x`,
        });
      }
      if (input.scale.y < 0) {
        issues.push({
          severity: 'warning',
          message: `Negative Y scale on mesh "${input.meshId}" may invert normals`,
          path: `${input.meshId}.scale.y`,
        });
      }
      if (input.scale.z < 0) {
        issues.push({
          severity: 'warning',
          message: `Negative Z scale on mesh "${input.meshId}" may invert normals`,
          path: `${input.meshId}.scale.z`,
        });
      }
    }
    return issues;
  }
}
