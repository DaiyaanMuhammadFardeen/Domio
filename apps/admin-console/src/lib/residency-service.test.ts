/**
 * Residency service tests — Wave 8 §S8.5.
 */

import { describe, it, expect } from 'vitest';
import {
  listRegions,
  listWorkspaceResidency,
  previewMigration,
  applyMigration,
  getMigration,
} from './residency-service';

describe('residency-service', () => {
  it('listRegions returns 7+ regions', async () => {
    const regions = await listRegions();
    expect(regions.length).toBeGreaterThanOrEqual(7);
    const ids = regions.map((r) => r.id);
    expect(ids).toContain('us-east');
    expect(ids).toContain('eu-central');
    expect(ids).toContain('ap-northeast');
  });

  it('listWorkspaceResidency returns at least 1 workspace', async () => {
    const items = await listWorkspaceResidency();
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const ws of items) {
      expect(typeof ws.workspace_id).toBe('string');
      expect(typeof ws.workspace_name).toBe('string');
      expect(['us-east', 'us-west', 'eu-west', 'eu-central', 'ap-south', 'ap-northeast', 'sa-east']).toContain(
        ws.region,
      );
    }
  });

  it('previewMigration returns a plan with status=preview', async () => {
    const plan = await previewMigration({ workspace_id: 'w-acme-eu', to_region: 'us-east' });
    expect(plan.status).toBe('preview');
    expect(plan.workspace_id).toBe('w-acme-eu');
    expect(plan.from_region).toBe('eu-central');
    expect(plan.to_region).toBe('us-east');
    expect(plan.id).toMatch(/^mig-/);
  });

  it('previewMigration cost > 0', async () => {
    const plan = await previewMigration({ workspace_id: 'w-initech', to_region: 'eu-west' });
    expect(plan.estimated_cost_cents).toBeGreaterThan(0);
  });

  it('previewMigration downtime > 0', async () => {
    const plan = await previewMigration({ workspace_id: 'w-cyberdyne', to_region: 'us-west' });
    expect(plan.estimated_downtime_minutes).toBeGreaterThan(0);
  });

  it('applyMigration returns in_progress', async () => {
    const preview = await previewMigration({ workspace_id: 'w-initech', to_region: 'eu-central' });
    const applied = await applyMigration(preview.id);
    expect(applied.status).toBe('in_progress');
    expect(applied.progress_pct).toBeGreaterThanOrEqual(10);
    expect(applied.progress_pct).toBeLessThanOrEqual(100);
    expect(applied.started_at_ms).not.toBeNull();
  });

  it('getMigration by id returns the plan', async () => {
    const preview = await previewMigration({ workspace_id: 'w-acme-eu', to_region: 'us-west' });
    const fetched = await getMigration(preview.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(preview.id);
    expect(fetched?.workspace_id).toBe('w-acme-eu');
  });

  it('getMigration returns null for unknown id', async () => {
    expect(await getMigration('mig-nope')).toBeNull();
  });

  it('previewMigration rejects locked workspaces', async () => {
    await expect(
      previewMigration({ workspace_id: 'w-acme', to_region: 'us-west' }),
    ).rejects.toThrow(/locked/i);
  });

  it('previewMigration rejects same-region target', async () => {
    await expect(
      previewMigration({ workspace_id: 'w-acme-eu', to_region: 'eu-central' }),
    ).rejects.toThrow(/target region/i);
  });
});
