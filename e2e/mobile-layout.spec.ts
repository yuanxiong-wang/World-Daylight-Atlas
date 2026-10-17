import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';

for (const viewport of [
  { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 },
]) {
  test(`globe stays clear and sheets work at ${viewport.width}×${viewport.height}`, async ({ page, baseURL }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto(createShareUrl(baseURL!, {
      date: new Date('2026-06-21T04:00:00Z'),
      city: { id: 'shanghai', name: 'Shanghai', country: 'China', lat: 31.23, lng: 121.47, timezone: 'Asia/Shanghai' },
      view: '3d-globe', layers: { ...DEFAULT_LAYERS },
    }), { waitUntil: 'domcontentloaded' });
    const canvas = page.getByTestId('globe-viewport').locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('desktop-city-panel')).not.toBeVisible();

    const header = (await page.getByTestId('mobile-header').boundingBox())!;
    const nav = (await page.getByTestId('mobile-navigation').boundingBox())!;
    expect(header.height).toBeLessThan(80);
    expect(nav.height).toBeLessThan(125);
    expect(nav.y - header.y - header.height).toBeGreaterThan(viewport.height * 0.5);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: viewport.width / 2, y: (header.y + header.height + nav.y) / 2 });
    expect(hit).toBe('CANVAS');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.mouse.move(viewport.width / 2, (header.y + header.height + nav.y) / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.width / 2 + 35, (header.y + header.height + nav.y) / 2 + 15, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'City details for Shanghai' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('clear-globe.png') });

    await page.getByRole('button', { name: 'Cities', exact: true }).click();
    let sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Choose a city' })).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Search cities' }).fill('Seattle');
    await sheet.getByRole('button', { name: /Seattle/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'City details for Seattle' })).toBeVisible();

    await page.getByRole('button', { name: 'City details for Seattle' }).click();
    sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Seattle', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await sheet.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    sheet = page.getByRole('dialog');
    await sheet.getByRole('checkbox', { name: 'Seasonal solar paths', exact: true }).uncheck();
    await expect(sheet.getByRole('checkbox', { name: 'Seasonal solar paths', exact: true })).not.toBeChecked();
    await sheet.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Navigation & motion', exact: true })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Compare cities', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Compare cities', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}
