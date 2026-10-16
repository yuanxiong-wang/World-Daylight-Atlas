import { test, expect } from '@playwright/test';
import { createShareUrl, DEFAULT_LAYERS } from '../src/utils/viewState';

const snapshot = {
  date: new Date('2024-01-01T12:00:00Z'),
  city: { id: 'london', name: 'London', country: 'UK', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' },
  view: '3d-globe' as const, layers: { ...DEFAULT_LAYERS, autoRotate: true },
};
test('globe stops rendering offscreen and under planner dialogs', async ({ page, baseURL }) => {
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  const globe = page.getByTestId('globe-viewport');
  await expect(globe).toHaveAttribute('data-rendering', 'running');
  await globe.evaluate(node => { node.style.display = 'none'; });
  await expect(globe).toHaveAttribute('data-rendering', 'paused');
  await globe.evaluate(node => { node.style.display = ''; });
  await expect(globe).toHaveAttribute('data-rendering', 'running');
  await page.getByRole('button', { name: 'Compare cities', exact: true }).click();
  await expect(globe).toHaveAttribute('data-rendering', 'paused');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(globe).toHaveAttribute('data-rendering', 'running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(globe).toHaveAttribute('data-rendering', 'paused');
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(globe).toHaveAttribute('data-rendering', 'running');
});

test('season buttons jump to the computed event instant', async ({ page, baseURL }) => {
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: 'June Solstice (6/20)', exact: true });
  await expect(button).toHaveAttribute('title', /2024-06-20T20:50:/);
  await button.click();
  await expect(page.locator('[data-testid="utc-clock"]:visible')).toHaveText('20:50:58');
  await expect(page.getByText('2024-06-20', { exact: true })).toBeVisible();
});

test('reduced motion uses stepped playback and disables automatic rotation', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(createShareUrl(baseURL!, snapshot), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const rotation = page.getByRole('checkbox', { name: 'Auto-rotate globe' });
  await expect(rotation).toBeDisabled(); await expect(rotation).not.toBeChecked();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Time', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Reduced motion: playback steps once per second; automatic rotation is off.')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Browser clock makes the absence of an animated playback loop deterministic.
  await page.clock.install();
  await page.getByRole('button', { name: 'Play simulation' }).click();
  const clock = page.locator('[data-testid="utc-clock"]:visible');
  await page.clock.runFor(500);
  await expect(clock).toHaveText('2024-01-01 · 12:00 UTC');
  await page.clock.runFor(600);
  await expect(clock).toHaveText('2024-01-01 · 12:05 UTC');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeVisible();
});
