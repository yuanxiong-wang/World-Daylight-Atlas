import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 393, height: 852 }, { width: 1194, height: 834 }]) {
  test(`bundled atlas and compact controls at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    // Allow bundled resources only: no fonts, textures, or services at first launch.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/native-app/);
    await expect(page.getByTestId('mobile-header')).toBeVisible();
    await expect(page.getByTestId('mobile-navigation')).toBeVisible();
    await expect(page.getByTestId('desktop-city-panel')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Navigation', exact: true })).toBeHidden();
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Cities', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(page.getByTestId('city-search').getByRole('button')).toHaveCount(45);
    await dialog.getByRole('button', { name: /Seattle/ }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'City details for Seattle' }).click();
    await expect(dialog.getByRole('heading', { name: 'Photography light' })).toBeVisible();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await page.getByRole('button', { name: 'Share view', exact: true }).click();
    await expect(page.getByLabel('View link', { exact: true })).toHaveValue(/^https:\/\/mytest\.ccwu\.cc\//);
    await page.screenshot({ path: `test-results/ios-layout-${viewport.width}.png` });
    expect(errors).toEqual([]);
  });
}
