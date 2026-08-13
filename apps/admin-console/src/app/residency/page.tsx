/**
 * Data Residency admin page — Wave 8 §S8.5.
 *
 * Three-section layout:
 *   1. KPI strip — workspace count, total storage, regions used.
 *   2. Region grid — every available region with load aggregates.
 *   3. Workspace table — current region per workspace with inline
 *      planner for the selected row.
 *
 * Active migrations are rendered as a tracker block once a workspace
 * triggers `applyMigration`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Globe2 } from 'lucide-react';
import { FormattedMessage } from '@domio/ui';
import { KpiTile } from '../../components/KpiTile';
import { SortableTable, type SortableColumn } from '../../components/SortableTable';
import { RegionSelector } from '../../components/residency/RegionSelector';
import { MigrationPlanner } from '../../components/residency/MigrationPlanner';
import { MigrationProgress } from '../../components/residency/MigrationProgress';
import {
  applyMigration,
  getMigration,
  listRegions,
  listWorkspaceResidency,
  previewMigration,
} from '../../lib/residency-service';
import type {
  MigrationPlan,
  Region,
  RegionInfo,
  WorkspaceResidency,
} from '../../lib/types';

type Row = Record<string, unknown> & {
  workspace_id: string;
  workspace_name: string;
  region: Region;
  storage_gb: number;
  residency_locked: boolean;
  last_migrated_at_ms: number | null;
};

function formatRelTime(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ResidencyPage() {
  const [regions, setRegions] = useState<ReadonlyArray<RegionInfo>>([]);
  const [workspaces, setWorkspaces] = useState<ReadonlyArray<WorkspaceResidency>>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [activeMigration, setActiveMigration] = useState<MigrationPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, w] = await Promise.all([listRegions(), listWorkspaceResidency()]);
      setRegions(r);
      setWorkspaces(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load residency data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep the tracker in sync if a workspace switches rows mid-migration.
  useEffect(() => {
    if (!activeMigration) return;
    const interval = window.setInterval(() => {
      getMigration(activeMigration.id)
        .then((fresh) => {
          if (!fresh) return;
          setActiveMigration(fresh);
          if (fresh.status === 'completed' || fresh.status === 'failed') {
            window.clearInterval(interval);
            loadData();
          }
        })
        .catch(() => {
          window.clearInterval(interval);
        });
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeMigration, loadData]);

  const totalWorkspaces = workspaces.length;
  const totalStorageGb = useMemo(
    () => workspaces.reduce((acc, w) => acc + w.storage_gb, 0),
    [workspaces],
  );
  const distinctRegions = useMemo(
    () => new Set(workspaces.map((w) => w.region)).size,
    [workspaces],
  );

  const selectedWorkspace = workspaces.find((w) => w.workspace_id === selectedWorkspaceId) ?? null;

  const columns: ReadonlyArray<SortableColumn<Row>> = [
    {
      key: 'workspace_name',
      header: 'Workspace',
      type: 'string',
      format: (val, row) => (
        <button
          type="button"
          onClick={() => setSelectedWorkspaceId(row.workspace_id)}
          data-testid={`residency-workspace-row-${row.workspace_id}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {String(val)}
        </button>
      ),
    },
    { key: 'region', header: 'Region', type: 'string' },
    {
      key: 'storage_gb',
      header: 'Storage',
      type: 'number',
      align: 'right',
      format: (val) => `${Number(val).toLocaleString()} GB`,
    },
    {
      key: 'residency_locked',
      header: 'Locked',
      type: 'string',
      format: (val) => {
        const locked = Boolean(val);
        if (!locked) return <span className="text-slate-400">—</span>;
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <Lock className="h-3 w-3" aria-hidden />
            Locked
          </span>
        );
      },
    },
    {
      key: 'last_migrated_at_ms',
      header: 'Last migrated',
      type: 'number',
      align: 'right',
      format: (val) => formatRelTime(val as number | null),
    },
  ];

  const rows: Row[] = workspaces.map((w) => ({
    workspace_id: w.workspace_id,
    workspace_name: w.workspace_name,
    region: w.region,
    storage_gb: w.storage_gb,
    residency_locked: w.residency_locked,
    last_migrated_at_ms: w.last_migrated_at_ms,
  }));

  return (
    <div data-testid="residency-page" className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.residency.heading" />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            <FormattedMessage id="admin.residency.subheading" />
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile title="Workspaces" value={String(totalWorkspaces)} tone="brand" />
        <KpiTile
          title="Total Storage"
          value={`${totalStorageGb.toLocaleString()} GB`}
          tone="success"
        />
        <KpiTile
          title="Regions in use"
          value={String(distinctRegions)}
          tone="muted"
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-slate-500" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Available regions
          </h2>
        </div>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : (
          <RegionSelector
            regions={regions}
            selected={selectedWorkspace?.region ?? null}
            onSelect={(r) => {
              const target = workspaces.find((w) => w.region === r);
              if (target) setSelectedWorkspaceId(target.workspace_id);
            }}
          />
        )}
      </section>

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Workspace residency
        </h2>
        {loading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <div data-testid="residency-workspace-table">
            <SortableTable<Row> rows={rows} columns={columns} />
          </div>
        )}
      </section>

      {selectedWorkspace && (
        <MigrationPlanner
          workspace={selectedWorkspace}
          regions={regions}
          onPreview={async (req) => previewMigration(req)}
          onApply={async (planId) => {
            const applied = await applyMigration(planId);
            setActiveMigration(applied);
            return applied;
          }}
        />
      )}

      {activeMigration && activeMigration.status === 'in_progress' && (
        <MigrationProgress plan={activeMigration} />
      )}
    </div>
  );
}
