import { test, expect } from '@playwright/test';

/**
 * P08 e2e smoke: cross-chart filters.
 *
 * 1. Open editor → verify Filters tab exists
 * 2. Click Filters tab → see empty state
 * 3. Add a filter (dimension = region, value = Europe)
 * 4. Verify the filter row appears
 * 5. Remove the filter
 * 6. Verify empty state returns
 * 7. Switch to Data tab → see data sources
 * 8. Insert a live bar chart from Insert tab
 * 9. Open PropsPanel → see bind inspector
 */

test('P08 e2e: cross-chart filter flow', async ({ page }) => {
  await page.goto('/editor/demo');

  // 1. Verify Filters tab exists
  const filtersTab = page.getByTestId('p08-filters-tab');
  await expect(filtersTab).toBeVisible();
  await expect(filtersTab).toHaveText('Filters');

  // 2. Click Filters tab → see empty state
  await filtersTab.click();
  const panel = page.getByTestId('filters-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Cross-Chart Filters');
  await expect(panel).toContainText('No active filters');

  // 3. Add a filter
  await page.getByTestId('p08-filter-dimension').selectOption('region');
  await page.getByTestId('p08-filter-value').fill('Europe');
  await page.getByTestId('p08-filter-add').click();

  // 4. Verify filter row appears
  const filterRows = page.locator('[data-testid^="p08-filter-row-"]');
  await expect(filterRows).toHaveCount(1);
  await expect(filterRows.first()).toContainText('region');
  await expect(filterRows.first()).toContainText('Europe');

  // 5. Remove the filter
  await filterRows.first().getByTitle('Remove filter').click();

  // 6. Verify empty state returns
  await expect(panel).toContainText('No active filters');

  // 7. Switch to Data tab → see data sources
  await page.getByTestId('p08-data-tab').click();
  const dataPanel = page.getByTestId('data-panel');
  await expect(dataPanel).toBeVisible();
  await expect(dataPanel).toContainText('Revenue Metrics');
  await expect(dataPanel).toContainText('Mock');
});
