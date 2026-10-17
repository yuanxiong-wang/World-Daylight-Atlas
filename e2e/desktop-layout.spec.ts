import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';

for (const viewport of [{ width: 1024, height: 600 }, { width: 1280, height: 720 }, { width: 1512, height: 850 }]) {
  test(`desktop dock and location panel never overlap at ${viewport.width}×${viewport.height}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize(viewport);
    await page.goto(createShareUrl(baseURL!, {
      date: new Date('2026-10-17T01:26:00Z'),
      city: { id: 'london', name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' },
      view: '3d-globe', layers: { ...DEFAULT_LAYERS },
    }), { waitUntil: 'domcontentloaded' });
    const dock = page.getByTestId('desktop-dock'), panel = page.getByTestId('desktop-city-panel');
    const check = async () => {
      const a = (await dock.boundingBox())!, b = (await panel.boundingBox())!;
      expect(a.x + a.width + 12).toBeLessThanOrEqual(b.x);
      expect(a.y).toBeGreaterThanOrEqual(135);
      expect(a.y + a.height).toBeLessThanOrEqual(viewport.height);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height - 15);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await expect(dock).toBeVisible(); await expect(panel).toBeVisible();
    await check();
    await page.screenshot({ path: info.outputPath('desktop-dock-separation.png') });
    await dock.getByRole('button', { name: 'Earth Layers', exact: true }).click(); await check();
    await dock.getByRole('button', { name: 'Cities (45)', exact: true }).click(); await check();
    await dock.getByRole('button', { name: 'Moon', exact: false }).click(); await check();
    await dock.getByRole('button', { name: 'Zen View', exact: true }).click();
    await expect(page.getByTestId('desktop-dock-content')).not.toBeVisible();
    await check();
    await dock.getByRole('button', { name: 'Show Controls', exact: true }).click(); await check();
    // The panel's bottom actions remain reachable by scrolling inside the panel.
    await panel.getByRole('button', { name: '📊 Trajectory Chart', exact: true }).click();
    await page.getByRole('button', { name: '✕', exact: true }).last().click();
    await check();
  });
}
