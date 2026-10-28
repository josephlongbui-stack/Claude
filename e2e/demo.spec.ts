import { expect, test, type Page } from '@playwright/test';

async function skipToEnd(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Skip to next scenario' }).first().click();
}

test.describe('RideOps AI demo', () => {
  test('loads the park overview with the simulation banner and working navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('note', { name: 'Simulation notice' })).toContainText(/not certified for ride safety or dispatch control/i);
    await expect(page.getByRole('heading', { name: 'Park Overview' })).toBeVisible();
    for (const label of ['Live Ride Monitor', 'Water Slide Monitor', 'Smart Boarding', 'Dispatch Analytics', 'Safety Review', 'Predictive Maintenance', 'Workforce & Training', 'Evidence & Reports', 'Ride Configuration', 'Business Impact', 'Model Review Data', 'Pilot & Deployment']) {
      await page.getByRole('link', { name: label, exact: false }).click();
      await expect(page.locator('main')).not.toContainText('Under construction');
    }
    await page.getByRole('link', { name: 'Park Overview' }).click();
    await page.getByRole('combobox', { name: 'Park', exact: true }).selectOption('crestline');
    await page.getByRole('table').first().getByRole('row', { name: /^Vortex Run/ }).click();
    await expect(page).toHaveURL(/live-monitor/);
  });

  test('scenario B flags the staged seat, the inspector shows it and the review updates history', async ({ page }) => {
    await page.goto('/live-monitor');
    await expect(page.getByRole('group', { name: 'Vortex Run seat map' })).toBeVisible();
    await page.getByRole('button', { name: /^B · Potential/ }).click();
    await skipToEnd(page);
    // the scripted review closed the alert; show closed ones
    await page.getByText('show closed').click();
    await expect(page.getByText(/Potential hydraulic lap bar position concern — Row 4 · Seat 2/).first()).toBeVisible();
    await page.getByRole('button', { name: /Row 4 · Seat 2 —/ }).click();
    await expect(page.getByText('Seat inspector · Row 4 · Seat 2')).toBeVisible();
    await expect(page.locator('#seat-inspector')).toContainText('Observation history');
    // inject a fresh concern during a new normal cycle and review it manually
    await page.getByRole('button', { name: /^A · Normal/ }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Restraint concern → R4S2/ }).click();
    const openCard = page.locator('article').filter({ hasText: 'Row 4 · Seat 2' }).filter({ has: page.locator('.badge', { hasText: /^Open$/ }) }).first();
    await expect(openCard).toBeVisible({ timeout: 20_000 });
    const alertId = (await openCard.locator('.mono').first().textContent())?.trim() ?? '';
    expect(alertId).toMatch(/^ALT-\d+$/);
    const card = page.locator('article').filter({ hasText: alertId }).first();
    await card.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(card).toContainText('Acknowledged');
    await card.getByRole('button', { name: 'Note' }).click();
    await card.getByLabel('Review note').fill('Physical check performed by operator.');
    await card.getByRole('button', { name: 'Save note' }).click();
    await expect(card).toContainText('Physical check performed by operator.');
    await card.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(card).toContainText('Reviewed');
    await page.getByRole('link', { name: 'Evidence & Reports' }).click();
    await expect(page.locator('main')).toContainText('marked reviewed');
  });

  test('occlusion injection yields an unknown seat and sensor injection yields a disagreement', async ({ page }) => {
    await page.goto('/live-monitor');
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /Occlusion → R6S1/ }).click();
    await expect(page.getByRole('button', { name: /Row 6 · Seat 1 — Occluded/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Inject disagreement' }).click();
    await expect(page.getByText('disagree · review').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('article', { hasText: 'Sensor disagreement' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('water slide runs the two-camera scenario with an exit-zone review', async ({ page }) => {
    await page.goto('/water-slide');
    await expect(page.getByRole('img', { name: 'CAM-A simulated entrance camera view' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'CAM-B simulated exit camera view' })).toBeVisible();
    await page.getByRole('button', { name: 'Inject exit-zone occupancy' }).click();
    await expect(page.locator('article', { hasText: 'Exit-zone occupancy persists' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main')).toContainText('Exit-zone clearance');
  });

  test('boarding optimizer computes an improved assignment', async ({ page }) => {
    await page.goto('/boarding');
    await page.getByRole('button', { name: 'Generate Better Assignment' }).click();
    await expect(page.locator('main')).toContainText('Optimized — RideOps allocator');
    await expect(page.locator('main')).toContainText('best fit');
  });

  test('dispatch simulator and ROI respond to inputs; evidence verifies and exports', async ({ page }) => {
    await page.goto('/dispatch');
    await expect(page.locator('main')).toContainText('Projected change');
    await page.goto('/business-impact');
    const sub = page.getByLabel('Annual software subscription');
    await sub.fill('100000');
    await expect(page.locator('main')).toContainText('$100,000');
    await page.goto('/live-monitor');
    await page.waitForTimeout(2500);
    await page.goto('/evidence');
    await expect(page.locator('main')).toContainText('Event log');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.locator('main')).toContainText('Chain intact');
    await page.getByRole('button', { name: 'Tamper with a record' }).click();
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.locator('main')).toContainText('Chain broken');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON' }).click();
    expect((await download).suggestedFilename()).toMatch(/rideops-events-.*\.json/);
  });

  test('ride selector switches configuration and the guided demo can be started and reset', async ({ page }) => {
    await page.goto('/live-monitor');
    await page.getByLabel('Ride').selectOption('vertigo');
    await expect(page.getByRole('group', { name: 'Vertigo Tower seat map' })).toBeVisible();
    await expect(page.locator('main')).toContainText('Harness position');
    await page.getByLabel('Ride').selectOption('phantom');
    await expect(page.locator('main')).toContainText('Low-light visibility');
    await page.getByRole('button', { name: 'Start Guided Demo' }).first().click();
    await expect(page.locator('main')).toContainText('Guided demo');
    await expect(page.getByRole('group', { name: 'Vortex Run seat map' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.locator('main')).toContainText('Scenario A');
  });
});
