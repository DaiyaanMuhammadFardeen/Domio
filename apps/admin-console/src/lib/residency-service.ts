/**
 * Data Residency service — Wave 8 §S8.5.
 *
 * Wraps the (deferred) `/v1/admin/residency/*` endpoints for listing
 * regions, listing workspace residency, and previewing/apply migration
 * plans. Until the governance service exposes those, we return
 * deterministic local seed data so the admin-console UI and tests have
 * something to render. The pattern mirrors custom-domain-service and
 * dlp-service.
 */

import { fetcher } from './fetcher';
import type {
  MigrationPlan,
  MigrationPlanRequest,
  RegionInfo,
  WorkspaceResidency,
} from './types';

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

// ── Seed: regions ────────────────────────────────────────────────────────

const REGIONS: ReadonlyArray<RegionInfo> = [
  {
    id: 'us-east',
    label: 'US East',
    city: 'Ashburn',
    country: 'United States',
    count_workspaces: 18,
    storage_gb: 4_240,
  },
  {
    id: 'us-west',
    label: 'US West',
    city: 'Hillsboro',
    country: 'United States',
    count_workspaces: 7,
    storage_gb: 1_810,
  },
  {
    id: 'eu-west',
    label: 'EU West',
    city: 'Dublin',
    country: 'Ireland',
    count_workspaces: 11,
    storage_gb: 2_970,
  },
  {
    id: 'eu-central',
    label: 'EU Central',
    city: 'Frankfurt',
    country: 'Germany',
    count_workspaces: 9,
    storage_gb: 2_150,
  },
  {
    id: 'ap-south',
    label: 'AP South',
    city: 'Mumbai',
    country: 'India',
    count_workspaces: 5,
    storage_gb: 1_120,
  },
  {
    id: 'ap-northeast',
    label: 'AP Northeast',
    city: 'Tokyo',
    country: 'Japan',
    count_workspaces: 3,
    storage_gb: 880,
  },
  {
    id: 'sa-east',
    label: 'SA East',
    city: 'São Paulo',
    country: 'Brazil',
    count_workspaces: 2,
    storage_gb: 410,
  },
];

// ── Seed: workspace residency ────────────────────────────────────────────

const WORKSPACE_RESIDENCY: ReadonlyArray<WorkspaceResidency> = [
  {
    workspace_id: 'w-acme',
    workspace_name: 'Acme Sales',
    region: 'us-east',
    storage_gb: 1_280,
    last_migrated_at_ms: NOW - 90 * DAY_MS,
    residency_locked: true,
  },
  {
    workspace_id: 'w-acme-eu',
    workspace_name: 'Acme EU',
    region: 'eu-central',
    storage_gb: 640,
    last_migrated_at_ms: NOW - 14 * DAY_MS,
    residency_locked: false,
  },
  {
    workspace_id: 'w-initech',
    workspace_name: 'Initech Product',
    region: 'us-west',
    storage_gb: 920,
    last_migrated_at_ms: NOW - 30 * DAY_MS,
    residency_locked: false,
  },
  {
    workspace_id: 'w-stark',
    workspace_name: 'Stark Industries',
    region: 'eu-west',
    storage_gb: 1_540,
    last_migrated_at_ms: null,
    residency_locked: true,
  },
  {
    workspace_id: 'w-cyberdyne',
    workspace_name: 'Cyberdyne APAC',
    region: 'ap-northeast',
    storage_gb: 410,
    last_migrated_at_ms: NOW - 5 * DAY_MS,
    residency_locked: false,
  },
];

// ── Mutable plan store ───────────────────────────────────────────────────

const PLANS: MigrationPlan[] = [];

function genId(): string {
  return `mig-${Math.random().toString(36).slice(2, 10)}`;
}

function clonePlan(p: MigrationPlan): MigrationPlan {
  return { ...p };
}

function findWorkspace(workspaceId: string): WorkspaceResidency | undefined {
  return WORKSPACE_RESIDENCY.find((w) => w.workspace_id === workspaceId);
}

// ── Public API ───────────────────────────────────────────────────────────

export async function listRegions(): Promise<ReadonlyArray<RegionInfo>> {
  try {
    const json = await fetcher<{ items?: RegionInfo[] }>('/v1/admin/residency/regions');
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  return REGIONS.slice();
}

export async function listWorkspaceResidency(): Promise<ReadonlyArray<WorkspaceResidency>> {
  try {
    const json = await fetcher<{ items?: WorkspaceResidency[] }>(
      '/v1/admin/residency/workspaces',
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  return WORKSPACE_RESIDENCY.slice();
}

/**
 * Cost heuristic: $0.02 per GB migrated (in cents).
 * Downtime heuristic: storage_gb / 60 minutes + 5 minute base.
 */
function estimate(storage_gb: number): { cost_cents: number; downtime_minutes: number } {
  const cost_cents = Math.max(1, Math.round(storage_gb * 2));
  const downtime_minutes = Math.max(1, Math.round(storage_gb / 60 + 5));
  return { cost_cents, downtime_minutes };
}

/**
 * Preview a migration. Returns a `MigrationPlan` with status='preview'
 * and progress_pct=0 — nothing has been queued yet. Callers can show the
 * estimate to the user, then call `applyMigration(plan.id)` to commit.
 */
export async function previewMigration(
  req: MigrationPlanRequest,
): Promise<MigrationPlan> {
  const ws = findWorkspace(req.workspace_id);
  if (!ws) {
    throw new Error(`Workspace ${req.workspace_id} not found`);
  }
  if (ws.region === req.to_region) {
    throw new Error('Target region equals current region');
  }
  if (ws.residency_locked) {
    throw new Error(`Workspace ${ws.workspace_id} is residency-locked`);
  }
  const { cost_cents, downtime_minutes } = estimate(ws.storage_gb);
  const plan: MigrationPlan = {
    id: genId(),
    workspace_id: ws.workspace_id,
    from_region: ws.region,
    to_region: req.to_region,
    estimated_storage_gb: ws.storage_gb,
    estimated_cost_cents: cost_cents,
    estimated_downtime_minutes: downtime_minutes,
    status: 'preview',
    progress_pct: 0,
    created_at_ms: NOW,
    started_at_ms: null,
    completed_at_ms: null,
  };
  PLANS.push(plan);
  try {
    await fetcher<MigrationPlan>('/v1/admin/residency/plans', {
      method: 'POST',
      body: req,
    });
  } catch {
    // Backend deferred — keep the local preview.
  }
  return clonePlan(plan);
}

/**
 * Apply a previously-previewed migration. Returns an `in_progress` plan
 * with a randomized progress_pct (10–90) so the UI can render a
 * progress bar. Subsequent calls advance the percentage to simulate a
 * long-running backend job.
 */
export async function applyMigration(planId: string): Promise<MigrationPlan> {
  const idx = PLANS.findIndex((p) => p.id === planId);
  if (idx < 0) {
    throw new Error(`Migration plan ${planId} not found`);
  }
  const prev = PLANS[idx];
  if (!prev) {
    throw new Error(`Migration plan ${planId} not found`);
  }
  if (prev.status === 'in_progress') {
    // Advance the progress for the simulated job.
    const nextPct = Math.min(95, prev.progress_pct + Math.floor(5 + Math.random() * 20));
    const next: MigrationPlan = { ...prev, progress_pct: nextPct };
    PLANS[idx] = next;
    return clonePlan(next);
  }
  const started = prev.status === 'preview' ? NOW : prev.started_at_ms ?? NOW;
  const initialPct = prev.status === 'preview' ? 10 + Math.floor(Math.random() * 30) : prev.progress_pct;
  const next: MigrationPlan = {
    ...prev,
    status: 'in_progress',
    progress_pct: initialPct,
    started_at_ms: started,
    completed_at_ms: null,
  };
  PLANS[idx] = next;
  return clonePlan(next);
}

export async function getMigration(planId: string): Promise<MigrationPlan | null> {
  const found = PLANS.find((p) => p.id === planId);
  if (!found) return null;
  return clonePlan(found);
}
