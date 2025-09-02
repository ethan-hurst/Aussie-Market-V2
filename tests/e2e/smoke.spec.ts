import { test, expect } from '@playwright/test';

test('home page loads and CTA is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Australia's Premier C2C Auction Platform" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start Selling' })).toBeVisible();
});


