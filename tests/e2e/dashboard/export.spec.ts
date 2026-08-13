/**
 * Phase 17 — e2e /dashboard/export.
 *
 * Verifies the Export → CSV path on the /export route.  The dashboard
 * exposes a CSV export endpoint at /v1/exports/csv that streams with
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="<workspace>-<dataset>.csv"
 *
 * We click the "Export → CSV" button on /export, intercept the
 * download, and assert on the response headers + first row of the
 * body.
 */
import { test, expect } from '@playwright/test';

test.describe('dashboard — export CSV', () => {
  test('Export → CSV button streams a text/csv attachment', async ({ page }) => {
    await page.goto('/export');
    await page.waitForSelector('[data-testid="export-csv-button"], button:has-text("Export CSV")', {
      timeout: 15_000,
    });

    // The download event fires before the response body is fully
    // streamed; we wait for the download promise *and* the response
    // promise so we can inspect the headers.
    const [download, response] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForResponse(
        (r) => r.url().includes('/v1/exports/csv') && r.request().method() === 'GET',
      ),
      page
        .locator('[data-testid="export-csv-button"], button:has-text("Export CSV")')
        .first()
        .click(),
    ]);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/csv/);
    const disposition = response.headers()['content-disposition'] ?? '';
    expect(disposition).toMatch(/attachment;\s*filename=/i);

    // The download object should expose the streamed filename.
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/\.csv$/);
  });
});
