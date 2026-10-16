import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`scroll-driven tour and exit on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (mobile) await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('button', { name: 'Helix globe tour', exact: true }).click();
    const tour = page.getByRole('region', { name: 'Helix globe tour', exact: true });
    await expect(tour.getByRole('heading', { name: 'Tromsø', exact: true })).toBeVisible();
    await expect(page.getByTestId('globe-viewport').locator('canvas')).toBeVisible();
    await expect(page.getByTestId('desktop-city-panel')).not.toBeVisible();
    await expect(page.getByTestId('mobile-navigation')).toHaveCount(0);
    await tour.getByRole('button', { name: 'Next stop' }).click();
    await expect(tour.getByRole('heading', { name: 'London', exact: true })).toBeVisible();
    const scroll = page.getByTestId('tour-scroll');
    await page.mouse.move(mobile ? 190 : 640, 240);
    await page.mouse.wheel(0, 180);
    await expect.poll(async () => Number(await tour.getByRole('slider').inputValue())).toBeGreaterThan(1);
    await scroll.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.625; });
    await expect.poll(async () => Number(await tour.getByRole('slider').inputValue())).toBeCloseTo(2.5, 1);
    await expect.poll(async () => Number(await page.getByTestId('tour-vortex').evaluate(node => getComputedStyle(node).opacity))).toBeCloseTo(0.45, 2);
    await page.screenshot({ path: info.outputPath('vortex-transit.png') });
    await scroll.focus();
    await page.keyboard.press('End');
    await expect(tour.getByRole('heading', { name: 'Ushuaia', exact: true })).toBeVisible();
    await expect(tour.getByRole('button', { name: 'Next stop' })).toBeDisabled();
    await page.keyboard.press('Home');
    await expect(tour.getByRole('heading', { name: 'Tromsø', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(tour).toHaveCount(0);
    if (mobile) await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
    else await expect(page.getByRole('button', { name: 'Helix globe tour', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}
test('tour respects reduced motion and changing preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Helix globe tour', exact: true }).click();
  await expect(page.getByTestId('tour-vortex')).toHaveCount(0);
  await expect(page.getByText('Reduced motion · city steps', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Next stop' }).click();
  await expect(page.getByRole('heading', { name: 'London', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByTestId('tour-vortex')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exit tour' }).click();
  await expect(page.getByRole('region', { name: 'Helix globe tour' })).toHaveCount(0);
});
