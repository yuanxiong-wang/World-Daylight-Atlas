import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';

const london = { id: 'london', name: 'London', country: 'UK', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' };
const utc = (page: import('@playwright/test').Page) => page.locator('[data-testid="utc-clock"]:visible');
const shared = (base: string, date: string, view: '2d-map' | '3d-globe' = '2d-map') => createShareUrl(base, {
  city: london, date: new Date(date), view, layers: { ...DEFAULT_LAYERS, autoRotate: false },
});

test('desktop scrubbing leaves live time and pauses playback', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-06T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-06T12:00:30Z'));
  await page.goto(baseURL!, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '2D Atlas Map', exact: true }).click();
  const slider = page.locator('input[type="range"]').first();
  await slider.fill('720');
  await page.clock.runFor(2000);
  await expect(utc(page)).toHaveText('12:00:00');
  await page.getByRole('button', { name: 'Play Solar Loop', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(utc(page)).toHaveText('12:05:00');
  await slider.fill('721');
  await expect(page.getByRole('button', { name: 'Play Solar Loop', exact: true })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(utc(page)).toHaveText('12:01:00');
});

for (const event of ['visibilitychange', 'atlas-visibility']) {
  test(`live time recovers after backgrounding via ${event}`, async ({ page, baseURL }) => {
    await page.clock.install({ time: new Date('2026-11-06T12:00:30Z') });
    await page.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '2D Atlas Map', exact: true }).click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.setFixedTime(new Date('2026-11-06T12:05:30Z'));
    await page.evaluate(name => {
      delete (document as unknown as { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event(name));
    }, event);
    await expect(utc(page)).toHaveText('12:05:30');
    // A manually selected date must stay frozen through the same lifecycle event.
    await page.locator('input[type="range"]').first().fill('600');
    await page.clock.setFixedTime(new Date('2026-11-06T12:10:30Z'));
    await page.evaluate(name => document.dispatchEvent(new Event(name)), event);
    await expect(utc(page)).toHaveText('10:00:00');
  });
}

test('playback and desktop day steps stay within the supported dates', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(shared(baseURL!, '2100-12-31T23:59:00Z'), { waitUntil: 'domcontentloaded' });
  await page.clock.install();
  await page.getByRole('button', { name: 'Play Solar Loop', exact: true }).click();
  await page.clock.runFor(1100);
  await expect(utc(page)).toHaveText('23:59:59');
  await expect(page.getByText('2100-12-31', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Solar Loop', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+1d', exact: true }).click();
  await expect(page.getByText('2100-12-31', { exact: true })).toBeVisible();
  await page.goto(shared(baseURL!, '1900-01-01T00:00:00Z'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '-1d', exact: true }).click();
  await expect(page.getByText('1900-01-01', { exact: true })).toBeVisible();
});

test('mobile day steps clamp to the same date limits', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [date, button, expected] of [
    ['1900-01-01T00:00:00Z', '−1 day', '1900-01-01T00:00'],
    ['2100-12-31T23:59:00Z', '+1 day', '2100-12-31T23:59'],
  ]) {
    await page.goto(shared(baseURL!, date), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByLabel('Simulation time (UTC)')).toHaveValue(expected);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
});

test('moving the clock reuses the seasonal and daily label textures', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    (window as unknown as { atlasLabelContexts: number }).atlasLabelContexts = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (args[0] === '2d') (window as unknown as { atlasLabelContexts: number }).atlasLabelContexts++;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto(shared(baseURL!, '2026-11-06T12:00:00Z', '3d-globe'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('globe-viewport')).toHaveAttribute('data-rendering', 'running');
  const contexts = () => page.evaluate(() => (window as unknown as { atlasLabelContexts: number }).atlasLabelContexts);
  const before = await contexts();
  await page.keyboard.press('ArrowRight');
  await expect(utc(page)).toHaveText('12:15:00');
  // Only the moving Sun's altitude label may need a new texture.
  expect(await contexts() - before).toBeLessThanOrEqual(1);
});
