import { test, expect } from '@playwright/test';
import { createShareUrl, readSharedView, DEFAULT_LAYERS } from '../src/utils/viewState';

test.use({ timezoneId: 'Asia/Shanghai' });

test('sharing, calendar, city comparison and ground sky work together', async ({ page, baseURL }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const snapshot = {
    date: new Date('2026-06-21T12:00:00Z'),
    city: { id: 'shanghai', name: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, timezone: 'Asia/Shanghai' },
    view: '2d-map' as const, layers: { ...DEFAULT_LAYERS, showSeasonalPaths: false },
  };
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'World Daylight Atlas' })).toBeVisible();
  await expect(page.locator('[data-testid="device-local-time"]:visible')).toHaveText('Local 20:00:00 GMT+8');

  await page.getByRole('button', { name: 'Share view', exact: true }).click();
  let dialog = page.getByRole('dialog');
  const url = await dialog.getByLabel('View link').inputValue();
  expect(readSharedView(new URL(url).hash)).toEqual(snapshot);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Annual daylight', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Annual daylight · Shanghai' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^2026-/ })).toHaveCount(365);
  await page.screenshot({ path: info.outputPath('annual-daylight.png') });
  await dialog.getByRole('button', { name: /^2026-12-21:/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('2026-12-21', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Compare cities', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox')).toHaveCount(2);
  await dialog.getByRole('button', { name: '+ Add a third city', exact: true }).click();
  await expect(dialog.getByRole('combobox')).toHaveCount(3);
  await expect(dialog.getByRole('img').locator('path')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('compare-cities.png') });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Ground-level sky', exact: true }).click();
  dialog = page.getByRole('dialog');
  const canvas = dialog.locator('canvas');
  await expect(canvas).toBeVisible();
  const heading = dialog.getByRole('slider', { name: /^Heading/ });
  const before = Number(await heading.inputValue());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(heading).toHaveValue(String((before + 5) % 360));
  await dialog.getByRole('checkbox', { name: 'Show seasonal paths' }).uncheck();
  await expect(dialog.getByText('March Equinox', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '+1 hour', exact: true }).click();
  await expect(dialog.getByText('2026-12-21 13:00 UTC', { exact: true })).toBeVisible();
  const colors = await canvas.evaluate(element => {
    const surface = element as HTMLCanvasElement;
    const data = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
    const samples = new Set<string>();
    for (let i = 0; i < data.length; i += 400) samples.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return samples.size;
  });
  expect(colors).toBeGreaterThan(10);
  await page.screenshot({ path: info.outputPath('ground-sky.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('annual calendar fits a narrow screen and returns keyboard focus', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(createShareUrl(baseURL!, {
    date: new Date('2024-02-29T12:00:00Z'),
    city: { id: 'london', name: 'London', country: 'UK', lat: 51.5, lng: 0, timezone: 'Europe/London' },
    view: '2d-map', layers: { ...DEFAULT_LAYERS },
  }), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="device-local-time"]:visible')).toHaveText('Local 20:00:00 GMT+8');
  const trigger = page.getByRole('button', { name: 'Tools', exact: true });
  await trigger.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Annual daylight', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /^2024-/ })).toHaveCount(366);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
