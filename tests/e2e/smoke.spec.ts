import { test, expect } from '@playwright/test';
import { ui } from './helpers/ui';

test('home page loads and CTA is visible', async ({ page }) => {
  await page.goto('/');
  await expect(ui.heroTitle(page)).toBeVisible();
  await expect(ui.startSelling(page)).toBeVisible();
});


