import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';
const kyoto = { id: 1857910, name: 'Kyoto', country: 'Japan', admin1: 'Kyoto', latitude: 35.0116, longitude: 135.7681, timezone: 'Asia/Tokyo' };
const porto = { id: 2735943, name: 'Porto', country: 'Portugal', admin1: 'Porto', latitude: 41.1496, longitude: -8.6109, timezone: 'Europe/Lisbon' };
const snapshot = { date: new Date('2026-06-21T04:00Z'), city: { id: 'london', name: 'London', country: 'UK', lat: 51.5, lng: 0, timezone: 'Europe/London' }, view: '3d-globe' as const, layers: { ...DEFAULT_LAYERS } };
for (const mobile of [false, true]) {
  test(`worldwide city search and light readouts on ${mobile ? 'mobile' : 'desktop'}`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.route('https://geocoding-api.open-meteo.com/v1/search?*', route => {
      const name = new URL(route.request().url()).searchParams.get('name');
      return route.fulfill({ json: { results: [name === 'Porto' ? porto : kyoto] } });
    });
    await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: mobile ? 'Cities' : /Cities \(/, exact: mobile }).click();
    await page.getByRole('textbox', { name: 'Search cities' }).fill('Kyoto');
    await page.getByRole('button', { name: 'Kyoto Kyoto, Japan', exact: true }).click();
    if (mobile) {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'City details for Kyoto' }).click();
    }
    const details = mobile ? page.getByRole('dialog') : page.getByTestId('desktop-city-panel');
    await expect(details.getByRole('heading', { name: 'Photography light', exact: true })).toBeVisible();
    await expect(details.getByText('2026-06-21 · Asia/Tokyo · local times', { exact: true })).toBeVisible();
    await expect(details.getByText('Golden hour', { exact: false }).first()).toBeVisible();
    await expect(details.getByText('Blue hour', { exact: false }).first()).toBeVisible();
    if (mobile) {
      await details.getByRole('button', { name: 'Close dialog' }).click();
      await page.getByRole('button', { name: 'Tools', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Compare cities', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox').first()).toHaveValue('open-meteo-1857910');
    await dialog.getByRole('button', { name: 'Search worldwide for city 2' }).click();
    await dialog.getByRole('textbox', { name: 'Search cities' }).fill('Porto');
    await dialog.getByRole('button', { name: 'Porto Porto, Portugal', exact: true }).click();
    await expect(dialog.getByRole('combobox').nth(1)).toHaveValue('open-meteo-2735943');
    await expect(dialog.getByRole('heading', { name: 'Photography light', exact: true })).toHaveCount(2);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'View on globe →' }).nth(1).click();
    if (mobile) await expect(page.getByRole('button', { name: 'City details for Porto' })).toBeVisible();
    else await expect(page.getByTestId('desktop-city-panel').getByRole('heading', { name: 'Porto', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('search failure keeps saved cities usable and supports retry and no matches', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route('https://geocoding-api.open-meteo.com/v1/search?*', route => {
    const name = new URL(route.request().url()).searchParams.get('name');
    if (name === 'Unfindabletown') return route.fulfill({ json: {} });
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 429, json: { error: true } }) : route.fulfill({ json: { results: [kyoto] } });
  });
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Cities', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('textbox', { name: 'Search cities' });
  await input.fill('Kyoto');
  await expect(dialog.getByRole('status')).toHaveText('Search limit reached. Please try again shortly.');
  await dialog.getByRole('button', { name: 'Retry search', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Kyoto Kyoto, Japan', exact: true })).toBeVisible();
  await input.fill('Unfindabletown');
  await expect(dialog.getByRole('status')).toHaveText('No worldwide matches. Try a nearby city or another spelling.');
  await input.clear();
  await expect(dialog.getByRole('button', { name: /Seattle/ })).toBeVisible();
});
