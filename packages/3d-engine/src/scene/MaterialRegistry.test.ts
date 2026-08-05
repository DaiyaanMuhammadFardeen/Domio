import { describe, it, expect } from 'vitest';
import { MaterialRegistry } from './MaterialRegistry.js';

describe('MaterialRegistry', () => {
  it('stores and retrieves material definitions', () => {
    const reg = new MaterialRegistry();
    reg.define({
      id: 'mat-1',
      name: 'Red Plastic',
      baseColor: '#ff0000',
      metallic: 0.0,
      roughness: 0.5,
      opacity: 1.0,
    });
    const mat = reg.get('mat-1');
    expect(mat).toBeDefined();
    expect(mat!.name).toBe('Red Plastic');
  });

  it('returns undefined for unknown material id', () => {
    const reg = new MaterialRegistry();
    expect(reg.get('unknown')).toBeUndefined();
  });
});

describe('MaterialRegistry submesh assignment', () => {
  it('assigns a material to a submesh and retrieves it', () => {
    const reg = new MaterialRegistry();
    reg.define({ id: 'mat-a', name: 'A', baseColor: '#000', metallic: 0, roughness: 0, opacity: 1 });
    reg.define({ id: 'mat-b', name: 'B', baseColor: '#fff', metallic: 0, roughness: 0, opacity: 1 });

    reg.assign('mesh-1', 0, 'mat-a');
    reg.assign('mesh-1', 1, 'mat-b');

    expect(reg.getMaterialId('mesh-1', 0)).toBe('mat-a');
    expect(reg.getMaterialId('mesh-1', 1)).toBe('mat-b');
    expect(reg.getMaterialId('mesh-1', 2)).toBeUndefined();
  });

  it('overwrites existing assignment for same mesh + submesh', () => {
    const reg = new MaterialRegistry();
    reg.define({ id: 'mat-a', name: 'A', baseColor: '#000', metallic: 0, roughness: 0, opacity: 1 });
    reg.define({ id: 'mat-b', name: 'B', baseColor: '#fff', metallic: 0, roughness: 0, opacity: 1 });

    reg.assign('mesh-1', 0, 'mat-a');
    reg.assign('mesh-1', 0, 'mat-b');

    expect(reg.getMaterialId('mesh-1', 0)).toBe('mat-b');
  });

  it('returns all assignments for a mesh', () => {
    const reg = new MaterialRegistry();
    reg.assign('mesh-1', 0, 'mat-a');
    reg.assign('mesh-1', 1, 'mat-b');
    reg.assign('mesh-2', 0, 'mat-a');

    const assignments = reg.getMeshAssignments('mesh-1');
    expect(assignments).toHaveLength(2);
    expect(assignments[0]!.materialId).toBe('mat-a');
    expect(assignments[1]!.materialId).toBe('mat-b');
  });

  it('clears everything', () => {
    const reg = new MaterialRegistry();
    reg.define({ id: 'mat-a', name: 'A', baseColor: '#000', metallic: 0, roughness: 0, opacity: 1 });
    reg.assign('mesh-1', 0, 'mat-a');
    reg.clear();
    expect(reg.get('mat-a')).toBeUndefined();
    expect(reg.getMaterialId('mesh-1', 0)).toBeUndefined();
  });
});

describe('MaterialRegistry lintScales', () => {
  it('returns no issues for positive scales', () => {
    const reg = new MaterialRegistry();
    const issues = reg.lintScales([
      { meshId: 'm1', scale: { x: 1, y: 1, z: 1 } },
      { meshId: 'm2', scale: { x: 2, y: 3, z: 4 } },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('flags negative X scale', () => {
    const reg = new MaterialRegistry();
    const issues = reg.lintScales([
      { meshId: 'm1', scale: { x: -1, y: 1, z: 1 } },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.path).toBe('m1.scale.x');
  });

  it('flags multiple negative components', () => {
    const reg = new MaterialRegistry();
    const issues = reg.lintScales([
      { meshId: 'm1', scale: { x: -1, y: -2, z: 3 } },
    ]);
    expect(issues).toHaveLength(2);
  });

  it('flags negative scale across multiple meshes', () => {
    const reg = new MaterialRegistry();
    const issues = reg.lintScales([
      { meshId: 'm1', scale: { x: -1, y: 1, z: 1 } },
      { meshId: 'm2', scale: { x: 1, y: -1, z: 1 } },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.path).toBe('m1.scale.x');
    expect(issues[1]!.path).toBe('m2.scale.y');
  });
});
