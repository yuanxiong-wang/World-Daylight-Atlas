import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';
const city = { id: 'london', name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' };
const snapshot = { date: new Date('2024-01-31T12:00Z'), city, view: '3d-globe' as const, layers: { ...DEFAULT_LAYERS } };
const utc = (page: import('@playwright/test').Page) => page.locator('[data-testid="utc-clock"]:visible');

test('keyboard deck steps time, locks selection, and opens a focused city search', async ({ page, baseURL }) => {
  await page.route('https://geocoding-api.open-meteo.com/v1/search?*', route => route.fulfill({ json: {} }));
  await page.goto(createShareUrl(baseURL!, { ...snapshot, view: '2d-map' }), { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('ArrowRight'); await expect(utc(page)).toHaveText('12:15:00');
  await page.keyboard.press('ArrowLeft'); await expect(utc(page)).toHaveText('12:00:00');
  await page.keyboard.press(']'); await expect(page.getByText('2024-02-29', { exact: true })).toBeVisible();
  await page.keyboard.press('['); await expect(page.getByText('2024-01-29', { exact: true })).toBeVisible();
  await page.keyboard.press('Space'); await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.keyboard.press('Space'); await expect(page.getByRole('button', { name: 'Play Solar Loop', exact: true })).toBeVisible();
  await page.keyboard.press('l'); await expect(page.getByRole('button', { name: 'Unlock city', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Search cities worldwide' });
  const input = dialog.getByRole('textbox', { name: 'Search cities' });
  await expect(input).toBeFocused();
  const before = await utc(page).textContent();
  await input.fill('Paris'); await page.keyboard.press('ArrowRight'); await expect(utc(page)).toHaveText(before!);
  await dialog.getByRole('button', { name: 'Paris France', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Unlock London to select a result', exact: true }).click();
  await dialog.getByRole('button', { name: 'Paris France', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('desktop-city-panel').getByRole('heading', { name: 'Paris', exact: true })).toBeVisible();
});

test('query links restore the exact date and inspector, with a shareable coordinate URL', async ({ page, baseURL }) => {
  const query = new URLSearchParams({ lat: String(city.lat), lng: String(city.lng), date: '2024-06-20T20:50:58.360Z' });
  await page.goto(`${baseURL}/?${query}`, { waitUntil: 'domcontentloaded' });
  const inspector = page.getByTestId('city-inspector');
  await expect(inspector.getByRole('heading', { name: 'London', exact: true })).toBeVisible();
  await expect(utc(page)).toHaveText('20:50:58');
  await inspector.getByRole('button', { name: '✕', exact: true }).click();
  await page.getByRole('button', { name: 'Share view', exact: true }).click();
  const link = await page.getByRole('dialog').getByLabel('Coordinate link (opens inspector)', { exact: true }).inputValue();
  const params = new URL(link).searchParams;
  expect(params.get('lat')).toBe(String(city.lat)); expect(params.get('date')).toBe('2024-06-20T20:50:58.360Z');
  expect(params.get('inspector')).toBe('1'); expect(new URL(link).hash).toBe('');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.evaluate(() => {
    history.pushState({}, '', '/?lat=-33.8688&lng=151.2093&date=2026-12-21T12:00:00Z&name=Sydney&timezone=Australia%2FSydney&inspector=0');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('city-inspector')).toHaveCount(0);
  await expect(page.getByTestId('desktop-city-panel').getByRole('heading', { name: 'Sydney', exact: true })).toBeVisible();
  await expect(utc(page)).toHaveText('12:00:00');
});

test('idle drift waits thirty seconds, preserves simulation time, and respects lock and motion preferences', async ({ page, baseURL }) => {
  await page.clock.install();
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  const globe = page.getByTestId('globe-viewport');
  await expect(globe).toHaveAttribute('data-motion', 'manual');
  const time = await utc(page).textContent();
  await page.clock.fastForward(31000);
  await expect(globe).toHaveAttribute('data-motion', 'idle-drift');
  await expect(utc(page)).toHaveText(time!);
  await page.mouse.move(650, 250); await expect(globe).toHaveAttribute('data-motion', 'manual');
  await page.getByRole('button', { name: 'Lock city', exact: true }).click();
  await page.clock.fastForward(31000); await expect(globe).toHaveAttribute('data-motion', 'manual');
  await page.getByRole('button', { name: 'Unlock city', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.fastForward(31000); await expect(globe).toHaveAttribute('data-motion', 'manual');
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Ambient idle drift', exact: false })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Magnetic reticle snapping', exact: false })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Navigation & motion', exact: true })).toHaveCount(0);
});

test('a small drag gently snaps the reticle without changing the city', async ({ page, baseURL }) => {
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  const globe = page.getByTestId('globe-viewport');
  await expect(globe.locator('canvas')).toBeVisible();
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(640, 375, { steps: 5 }); await page.mouse.up();
  await expect(globe).toHaveAttribute('data-motion', 'snapping');
  await expect(page.getByTestId('globe-reticle')).toContainText('0°E meridian');
  await expect(globe).toHaveAttribute('data-motion', 'manual');
  await expect(page.getByTestId('desktop-city-panel').getByRole('heading', { name: 'London', exact: true })).toBeVisible();
});

test('dense visible dots unfold on zoom and can be disabled', async ({ page, baseURL }, info) => {
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  const globe = page.getByTestId('globe-viewport');
  await page.mouse.move(640, 350); await page.mouse.wheel(0, 1400);
  await expect.poll(async () => Number(await globe.getAttribute('data-unfolded-cities'))).toBeGreaterThan(1);
  await expect(globe).toHaveAttribute('data-spiral-settled', 'true');
  await page.screenshot({ path: info.outputPath('spiral-city-clusters.png') });
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Unfold overlapping city dots', exact: false }).uncheck();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(globe).toHaveAttribute('data-unfolded-cities', '0');
  await expect(page.getByRole('button', { name: 'Cities (45)', exact: true })).toBeVisible();
});
