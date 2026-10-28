import { expect, test } from '@playwright/test';

test.describe('RideOps AI demo', () => {
  test('loads the overview with the banner and every page opens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('note', { name: 'Simulation notice' })).toContainText(/not certified for ride safety or dispatch control/i);
    await expect(page.getByRole('heading', { name: 'Crestline Adventure Park' })).toBeVisible();
    for (const [label, heading] of [
      ['Live Monitor', 'Vortex Run'],
      ['Water Slide', 'Typhoon Falls'],
      ['Review Log', 'Review Log'],
      ['Operations', /Operations/],
      ['Business Case', 'Business Case'],
      ['Overview', 'Crestline Adventure Park'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
    await page.getByRole('table').first().getByRole('row', { name: /Vortex Run/ }).click();
    await expect(page).toHaveURL(/live-monitor/);
  });

  test('a restraint concern is flagged, inspected, reviewed and logged', async ({ page }) => {
    await page.goto('/live-monitor');
    await expect(page.getByRole('group', { name: 'Vortex Run seat map' })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Move a restraint' }).click();
    const card = page.locator('article').filter({ hasText: 'Row 4 · Seat 2' }).filter({ has: page.locator('.badge', { hasText: /^Open$/ }) }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const alertId = (await card.locator('.mono').first().textContent())?.trim() ?? '';
    expect(alertId).toMatch(/^ALT-\d+$/);
    await page.getByRole('button', { name: /Row 4 · Seat 2 —/ }).click();
    await expect(page.getByText('Seat · Row 4 · Seat 2')).toBeVisible();
    const byId = page.locator('article').filter({ hasText: alertId }).first();
    await byId.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(byId).toContainText('Acknowledged');
    await byId.getByRole('button', { name: 'Note' }).click();
    await byId.getByLabel('Review note').fill('Checked by hand.');
    await byId.getByRole('button', { name: 'Save note' }).click();
    await expect(byId).toContainText('Checked by hand.');
    await byId.getByRole('button', { name: 'Mark reviewed' }).click();
    // A reviewed flag leaves the open queue and shows as Reviewed in the Review Log.
    await expect(page.locator('article').filter({ hasText: alertId })).toHaveCount(0);
    await page.getByRole('link', { name: 'Review Log', exact: true }).click();
    await expect(page.getByRole('table').first().getByRole('row', { name: /Row 4 · Seat 2/ }).first()).toContainText('Reviewed');
    await page.getByRole('tab', { name: 'Event log' }).click();
    await expect(page.locator('main')).toContainText('marked reviewed');
  });

  test('a blocked camera gives an unknown seat and a sensor disagreement is flagged', async ({ page }) => {
    await page.goto('/live-monitor');
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Block a camera' }).click();
    await expect(page.getByRole('button', { name: /Row 6 · Seat 1 — Occluded/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('combobox', { name: 'Speed' }).selectOption('4');
    await page.getByRole('combobox', { name: 'Scenario' }).selectOption('A');
    // The sensor can only disagree once restraints are down and the seat reads as fine.
    await expect(page.getByText('Restraints down.')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Make the sensor disagree' }).click();
    await expect(page.locator('article', { hasText: 'Camera and sensor disagree' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('water slide shows both cameras and an exit-zone review', async ({ page }) => {
    await page.goto('/water-slide');
    await expect(page.getByRole('img', { name: 'CAM-A simulated entrance camera view' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'CAM-B simulated exit camera view' })).toBeVisible();
    await page.getByRole('button', { name: 'Hold a rider in the exit' }).click();
    await expect(page.locator('article', { hasText: 'Rider still in the exit zone' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main')).toContainText('Exit zone (waiting on a person)');
  });

  test('operations: boarding fills the train and the dispatch what-if responds', async ({ page }) => {
    await page.goto('/operations');
    await expect(page.locator('main')).toContainText('riders / hour');
    await page.getByRole('tab', { name: 'Boarding' }).click();
    await page.getByRole('button', { name: 'Fill the train' }).click();
    await expect(page.locator('main')).toContainText('Why each group went where it did');
    await page.getByRole('tab', { name: 'Maintenance' }).click();
    await page.getByRole('button', { name: 'Close ticket' }).click();
    await expect(page.locator('main')).toContainText('Closed:');
  });

  test('business case and evidence: ROI updates, chain verifies, tamper is caught, export works', async ({ page }) => {
    await page.goto('/business-case');
    await page.getByLabel('Subscription per year ($)').fill('100000');
    await expect(page.locator('main')).toContainText('$100,000');
    await page.goto('/live-monitor');
    await page.waitForTimeout(2500);
    await page.getByRole('link', { name: 'Review Log', exact: true }).click();
    await page.getByRole('tab', { name: 'Event log' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.locator('main')).toContainText('Chain intact');
    await page.getByRole('button', { name: 'Tamper with a record' }).click();
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.locator('main')).toContainText('Chain broken');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON' }).click();
    expect((await download).suggestedFilename()).toMatch(/rideops-events-.*\.json/);
  });

  test('ride selector switches rides and the guided demo starts and resets', async ({ page }) => {
    await page.goto('/live-monitor');
    await page.getByRole('combobox', { name: 'Ride', exact: true }).selectOption('vertigo');
    await expect(page.getByRole('group', { name: 'Vertigo Tower seat map' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ride', exact: true }).selectOption('typhoon');
    await expect(page).toHaveURL(/water-slide/);
    await page.getByRole('combobox', { name: 'Ride', exact: true }).selectOption('phantom');
    await expect(page).toHaveURL(/live-monitor/);
    await expect(page.getByRole('group', { name: 'Phantom Manor seat map' })).toBeVisible();
    await page.getByRole('button', { name: 'Start guided demo' }).click();
    await expect(page.getByRole('banner')).toContainText('Guided 1/7');
    await expect(page.getByRole('group', { name: 'Vortex Run seat map' })).toBeVisible();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.getByRole('banner')).toContainText('Guided 2/7');
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByRole('button', { name: 'Start guided demo' })).toBeVisible();
  });
});
