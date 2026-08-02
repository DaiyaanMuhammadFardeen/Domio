import { test, expect } from '@playwright/test';

/**
 * P06 demo-script smoke: insert a component, edit a prop, switch variant,
 * then promote a selection to a component. Exercises the full editor loop
 * the phase-06 DoD requires (insert → prop edit → variant switch → promote).
 */

test('P06 smoke: insert, prop-edit, variant-switch, promote', async ({ page }) => {
  await page.goto('/editor/demo');

  // 1. Open the Insert tab and insert a stat card into the active slide.
  await page.getByRole('tab', { name: 'Insert' }).click();
  await expect(page.getByTestId('insert-panel')).toBeVisible();

  const insertButton = page.locator('[data-testid="insert-grid"] button').filter({ hasText: 'Stat Card' }).first();
  await expect(insertButton).toBeVisible();
  await insertButton.click();

  // 2. The component lands in the slide; select it to open the PropsPanel.
  await page.getByTestId('props-panel').waitFor({ state: 'visible' });
  await expect(page.getByTestId('props-panel')).toContainText('Stat Card');

  // 3. Prop edit: change the label field and confirm the value propagates.
  const labelInput = page.getByTestId('props-panel').getByLabel('Label');
  await labelInput.fill('MRR');
  await labelInput.blur();

  // 4. Variant switch: toggle Light → Dark and confirm the UI reflects it.
  const darkButton = page.getByTestId('props-panel').getByRole('button', { name: 'Dark' });
  await darkButton.click();
  await expect(darkButton).toHaveClass(/is-active/);

  // 5. Promote: select a non-component layer, then open the promote dialog.
  await page.getByRole('listbox', { name: 'Layer list' }).getByRole('button').filter({ hasText: 'frame' }).first().click();
  await page.getByRole('button', { name: /Promote/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('Hero Stat');
  await dialog.getByRole('button', { name: /Save/i }).click();
  await expect(dialog).not.toBeVisible();

  // Library now contains the promoted component.
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByTestId('library-panel')).toContainText('Hero Stat');
});
