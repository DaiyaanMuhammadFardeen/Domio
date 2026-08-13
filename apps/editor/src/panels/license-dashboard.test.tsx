import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LicenseDashboard, type LicenseGrantView } from './license-dashboard';

// Reference "now" anchored to the running test clock — never hardcoded
// so the dashboard's internal Date.now() classifies grants correctly.
const NOW = Date.now();
const DAY = 86_400_000;

function makeGrant(overrides: Partial<LicenseGrantView> = {}): LicenseGrantView {
  return {
    id: overrides.id ?? 'lic_1',
    catalogId: overrides.catalogId ?? 'domio.model.hero',
    version: overrides.version ?? '1.0.0',
    seats: overrides.seats ?? 5,
    seatsUsed: overrides.seatsUsed ?? 1,
    expiresAt: overrides.expiresAt ?? NOW + 30 * DAY,
    revokedAt: overrides.revokedAt ?? null,
    status: overrides.status ?? 'active',
  };
}

describe('LicenseDashboard', () => {
  it('renders the summary heading', async () => {
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_1' })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-dashboard-summary').textContent).toContain('1 active');
    });
  });

  it('shows the seats, days-left, and status per grant', async () => {
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_1', seats: 10, seatsUsed: 4 })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('license-grant-lic_1-seats').textContent).toContain('4 / 10 seats');
    expect(screen.getByTestId('license-grant-lic_1-status').textContent).toContain('active');
    expect(screen.getByTestId('license-grant-lic_1-days').textContent).toMatch(/days? left/);
  });

  it('classifies an expiring grant when within 14 days', async () => {
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_exp', expiresAt: NOW + 5 * DAY })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_exp')).toBeInTheDocument();
    });
    expect(screen.getByTestId('license-grant-lic_exp').getAttribute('data-status')).toBe(
      'expiring',
    );
  });

  it('classifies an expired grant when past its expiry', async () => {
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_past', expiresAt: NOW - 1 * DAY })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_past')).toBeInTheDocument();
    });
    expect(screen.getByTestId('license-grant-lic_past').getAttribute('data-status')).toBe(
      'expired',
    );
  });

  it('classifies a revoked grant when revokedAt is set', async () => {
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_rev', revokedAt: NOW - 100 })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_rev')).toBeInTheDocument();
    });
    expect(screen.getByTestId('license-grant-lic_rev').getAttribute('data-status')).toBe('revoked');
  });

  it('renders an empty state when there are no grants', async () => {
    const fetch = vi.fn(async () => []);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-dashboard-empty')).toBeInTheDocument();
    });
  });

  it('shows the error state when fetcher rejects', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('Network down');
    });
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-dashboard-error').textContent).toContain('Network down');
    });
  });

  it('calls onRevoke when revoke is clicked', async () => {
    const onRevoke = vi.fn();
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_1' })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} onRevoke={onRevoke} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_1-revoke')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('license-grant-lic_1-revoke'));
    expect(onRevoke).toHaveBeenCalledWith('lic_1');
  });

  it('hides the revoke button for revoked grants', async () => {
    const onRevoke = vi.fn();
    const fetch = vi.fn(async () => [makeGrant({ id: 'lic_rev', revokedAt: NOW - 1000 })]);
    render(<LicenseDashboard workspaceId="ws_1" fetchGrants={fetch} onRevoke={onRevoke} />);
    await waitFor(() => {
      expect(screen.getByTestId('license-grant-lic_rev')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('license-grant-lic_rev-revoke')).toBeNull();
  });
});
